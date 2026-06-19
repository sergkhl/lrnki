import type {
  AnchorProjectionNode,
  DerivedGraphLayer,
  DerivedGraphNode,
  DifficultyNodeContext,
  EnrichmentNode,
  EnrichmentRunTrace,
  GroundingVerbatimDisposition,
  InferredPrerequisiteEdge,
  PrerequisiteConceptContext,
  PrerequisiteJudgment,
  PrerequisiteJudgmentTrace,
  PublishedConceptEvidenceProfile,
  RescueDisposition
} from "@lrnki/domain-core";
import type {
  DifficultyPort,
  EnrichmentRunStorePort,
  GroundingGenerationPort,
  MissingPrerequisiteProposalPort,
  PrerequisiteJudgmentPort,
  RescueDurabilityJudgmentPort,
  GraphVersionStorePort
} from "@lrnki/ports";
import { createHash, randomUUID } from "node:crypto";
import { assembleEnrichmentNodes, DEFAULT_MINTING_BOUNDS, type EnrichmentMintingBounds, type MintingAnchor } from "./enrichmentNodeMinting";
import { cutWeakEdges, removeCycles, transitiveReduction } from "./prerequisiteDag";
import { applyVerbatimFloorByGrounding } from "./verbatimFloorByGrounding";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.8.0";

export type GraphEnrichmentConfig = {
  // Part of enrichment identity (ADR-0019): changing a knob re-derives the layer.
  enrichmentConfigHash: string;
  // Weak-edge cut floor applied before cycle removal.
  minEdgeConfidence: number;
  // Bounded concurrency for the per-pair judge calls (ADR-0019 reset). Results are
  // collected in deterministic pair order regardless of completion order.
  judgeConcurrency: number;
  // Bound on mention passages passed per node into a pair judgment (R11). The
  // published CEP is already mention-bounded at extraction; this is a further
  // deterministic cap so a pair prompt cannot grow unbounded.
  maxMentionsPerConceptInPair: number;
  // Bounds on the anchor-driven node-minting pass (KTD6, R7).
  mintingBounds: EnrichmentMintingBounds;
};

export const DEFAULT_ENRICHMENT_CONFIG: GraphEnrichmentConfig = {
  enrichmentConfigHash: "intrinsic-difficulty-v3",
  minEdgeConfidence: 0.5,
  judgeConcurrency: 4,
  maxMentionsPerConceptInPair: 6,
  mintingBounds: DEFAULT_MINTING_BOUNDS
};

// Graph Enrichment — the third operation, generalized to NODE + EDGE derivation
// (ADR-0019, U5). The asserted snapshot supplies anchors; enrichment additionally
// RESCUES `source_mentioned` nodes from the member runs' non-core mentions and MINTS
// `llm_grounded` nodes via an explicit anchor-driven proposal pass, so a sparse
// source still yields a usable learner path. Every same-domain pair across anchors ∪
// enrichment nodes is judged; any pair touching a GENERATED (`llm_grounded`) node is
// routed to a CROSS-FAMILY judge (R13) so the DeepSeek self-loop cannot grade its own
// minted output, while anchor/anchor and anchor/source_mentioned pairs stay on the
// validated DeepSeek judge. The symbolic helpers dispose (weak-edge cut -> cycle
// removal -> transitive reduction); intrinsic difficulty scores ALL derived nodes
// from the same evidence contexts. The asserted core is never touched (R5): no enrichment node is ever
// published. Node minting + rescue are OPT-IN — when the proposal/grounding ports are
// omitted the run is anchor-only (the pre-node-minting behavior). Fails the run
// WITHOUT persistence if any pair exhausts the forced-tool retry budget.
export async function runGraphEnrichment(input: {
  enrichmentId: string;
  graphVersionId: string;
  graphStore: GraphVersionStorePort;
  prerequisiteJudge: PrerequisiteJudgmentPort;
  difficulty: DifficultyPort;
  enrichmentStore: EnrichmentRunStorePort;
  config?: GraphEnrichmentConfig;
  // U5/U7 enrichment-node ports. Provide all three to enable rescue + mint + the
  // cross-family generated-node judge; omit them for an anchor-only run.
  missingPrerequisiteProposal?: MissingPrerequisiteProposalPort;
  groundingGeneration?: GroundingGenerationPort;
  generatedPrerequisiteJudge?: PrerequisiteJudgmentPort;
  // Optional measured rescue durability judge (U3). When provided, aggregated
  // `source_mentioned` rescue candidates are durability-judged against their
  // same-domain anchors before becoming derived nodes; omit it to leave rescue
  // unjudged (prior behavior).
  rescueDurabilityJudge?: RescueDurabilityJudgmentPort;
  newNodeId?: () => string;
}): Promise<DerivedGraphLayer> {
  const config = input.config ?? DEFAULT_ENRICHMENT_CONFIG;
  const snapshot = await input.graphStore.getPublishedSnapshot(input.graphVersionId);
  if (!snapshot) {
    throw new Error(`runGraphEnrichment: published version ${input.graphVersionId} not found.`);
  }
  const concepts = snapshot.concepts;
  const newNodeId = input.newNodeId ?? randomUUID;
  const profileByConcept = new Map(snapshot.evidenceProfiles.map((profile) => [profile.conceptId, profile] as const));

  // Anchors: a per-run projection of the asserted snapshot (KTD2). Identity is the
  // frozen conceptId; nothing here mutates the asserted layer (R5).
  const anchorNodes: AnchorProjectionNode[] = concepts.map((concept) => ({
    nodeKind: "anchor",
    derivedNodeId: deterministicUuid(input.enrichmentId, concept.conceptId),
    conceptId: concept.conceptId,
    groundingOrigin: "document_anchored",
    role: "anchor",
    layer: "asserted",
    canonicalLabel: concept.canonicalLabel,
    normalizedLabel: concept.normalizedLabel,
    declaredDomain: concept.declaredDomain,
    aliases: concept.aliases
  }));

  // Step 0 — rescue + mint enrichment nodes (U5), then re-apply the verbatim floor
  // per grounding origin (U6). Only runs when the enrichment-node ports are provided.
  let enrichmentNodes: EnrichmentNode[] = [];
  let groundingDispositions: GroundingVerbatimDisposition[] = [];
  let rescueDispositions: RescueDisposition[] = [];
  if (input.missingPrerequisiteProposal && input.groundingGeneration) {
    const rescueCandidates = await input.enrichmentStore.mentionedNonCoreCandidates(input.graphVersionId);
    const mintingAnchors: MintingAnchor[] = concepts.map((concept) => ({
      conceptId: concept.conceptId,
      canonicalLabel: concept.canonicalLabel,
      normalizedLabel: concept.normalizedLabel,
      declaredDomain: concept.declaredDomain,
      definitionQuotes: (profileByConcept.get(concept.conceptId)?.definitions ?? []).map((passage) => passage.evidenceQuote)
    }));
    const assembled = await assembleEnrichmentNodes({
      anchors: mintingAnchors,
      rescueCandidates,
      proposalPort: input.missingPrerequisiteProposal,
      groundingPort: input.groundingGeneration,
      rescueDurabilityJudge: input.rescueDurabilityJudge,
      bounds: config.mintingBounds,
      newNodeId
    });
    rescueDispositions = assembled.rescueDispositions;
    // The floor verifies source_mentioned passages verbatim against their cited block
    // and records the llm_grounded exemption (R9, AE3). A rescued node whose evidence
    // does not verify is dropped before it can enter the derived layer.
    const blockTextById = new Map<string, string>();
    for (const candidate of rescueCandidates) {
      for (const mention of candidate.mentions) blockTextById.set(mention.sourceBlockId, mention.blockText);
    }
    const floored = applyVerbatimFloorByGrounding({ nodes: [...assembled.rescuedNodes, ...assembled.mintedNodes], blockTextById });
    enrichmentNodes = floored.nodes;
    groundingDispositions = floored.dispositions;
  }

  const allNodes: DerivedGraphNode[] = [...anchorNodes, ...enrichmentNodes];

  // Each derived node reduced to the prerequisite judge's context (R11). Anchors use
  // their published CEP; enrichment nodes use their grounding (generated text for
  // llm_grounded, verbatim mention quotes for source_mentioned). The bare label is
  // never the evidence — an empty context is treated as insufficient upstream.
  const pairingNodes = allNodes.map((node) => ({
    derivedNodeId: node.derivedNodeId,
    declaredDomain: node.declaredDomain,
    groundingOrigin: node.groundingOrigin,
    context: contextOf(node, profileByConcept, config.maxMentionsPerConceptInPair)
  }));
  const difficultyNodes: DifficultyNodeContext[] = pairingNodes.map((node) => ({
    conceptId: node.derivedNodeId,
    canonicalLabel: node.context.canonicalLabel,
    aliases: node.context.aliases,
    declaredDomain: node.declaredDomain,
    groundingOrigin: node.groundingOrigin,
    definitions: node.context.definitions,
    mentions: node.context.mentions
  }));
  type PairingNode = (typeof pairingNodes)[number];

  // Step 1 — every unordered same-domain pair over anchors ∪ enrichment nodes (R12).
  // Cross-domain pairs are never proposed (ADR-0015 Declared-Domain gate). The
  // asserted version stays anchors-only; this union is the DERIVED node space.
  const pairs = sameDomainPairs(pairingNodes);

  // Step 2 — bounded LLM prerequisite judgment per pair (neural proposes). A pair
  // touching a GENERATED node routes cross-family (R13); anchor/anchor and
  // anchor/source_mentioned stay on the validated DeepSeek judge (no regression).
  const generatedJudge = input.generatedPrerequisiteJudge ?? input.prerequisiteJudge;
  const isGenerated = (node: PairingNode) => node.groundingOrigin === "llm_grounded";
  type PairOutcome = { judgment?: PrerequisiteJudgment; trace?: PrerequisiteJudgmentTrace; insufficient?: EnrichmentRunTrace["dispositions"][number] };
  const outcomes = await mapWithConcurrency(pairs, config.judgeConcurrency, async ([a, b]): Promise<PairOutcome> => {
    const hasEvidence = (context: PrerequisiteConceptContext) => context.definitions.length > 0 || context.mentions.length > 0;
    if (!hasEvidence(a.context) || !hasEvidence(b.context)) {
      return { insufficient: { prerequisiteConceptId: a.derivedNodeId, dependentConceptId: b.derivedNodeId, disposition: "insufficient_evidence" } };
    }
    const judge = isGenerated(a) || isGenerated(b) ? generatedJudge : input.prerequisiteJudge;
    const judgeInput = { declaredDomain: a.declaredDomain, a: a.context, b: b.context };
    const judgment = await judge.judge(judgeInput);
    // Record the judge model actually used for this pair (U4): cross-family for any
    // pair touching a generated node, the validated DeepSeek judge otherwise.
    return { judgment, trace: { ...judgeInput, judgeModel: judge.model, judgment } };
  });

  // Collect in deterministic pair order regardless of completion order.
  const judgments: PrerequisiteJudgment[] = [];
  const judgmentTraces: PrerequisiteJudgmentTrace[] = [];
  const insufficientEvidence: EnrichmentRunTrace["dispositions"][number][] = [];
  for (const outcome of outcomes) {
    if (outcome.insufficient) insufficientEvidence.push(outcome.insufficient);
    if (outcome.judgment) judgments.push(outcome.judgment);
    if (outcome.trace) judgmentTraces.push(outcome.trace);
  }

  // Step 3 — map judgments to raw edges. "none" is dropped; "uncertain" is flagged
  // and retained for inspection but kept OUT of the traversable DAG.
  const rawEdges: InferredPrerequisiteEdge[] = judgments
    .filter((judgment) => judgment.outcome !== "none")
    .map((judgment) => ({
      prerequisiteConceptId: judgment.prerequisiteConceptId,
      dependentConceptId: judgment.dependentConceptId,
      predicate: "inferred-prerequisite-of",
      confidence: judgment.confidence,
      uncertain: judgment.outcome === "uncertain",
      provenance: { judgmentRationale: judgment.rationale }
    }));

  // Step 4 — symbolic disposal over CERTAIN edges only (symbolic constrains).
  const uncertainEdges = rawEdges.filter((edge) => edge.uncertain);
  const { kept: strongEdges, cut: weakEdges } = cutWeakEdges(
    rawEdges.filter((edge) => !edge.uncertain),
    config.minEdgeConfidence
  );
  const { edges: acyclicEdges, removed: cycleRemovedEdges } = removeCycles(strongEdges);
  const { edges: reducedEdges, removed: transitiveEdges } = transitiveReduction(acyclicEdges);
  const prerequisiteEdges = [...reducedEdges, ...uncertainEdges];

  // Step 5 — intrinsic difficulty over the reduced DAG. Scores ALL derived node ids
  // — anchors AND enrichment nodes (R12, handoff constraint).
  const difficulties = await input.difficulty.score({ nodes: difficultyNodes, prerequisiteEdges: reducedEdges });

  const layer: DerivedGraphLayer = {
    enrichmentId: input.enrichmentId,
    graphVersionId: input.graphVersionId,
    enrichmentConfigHash: config.enrichmentConfigHash,
    judgeModel: input.prerequisiteJudge.model,
    derivedNodes: allNodes,
    prerequisiteEdges,
    difficulties
  };

  const trace: EnrichmentRunTrace = {
    enrichmentId: input.enrichmentId,
    graphVersionId: input.graphVersionId,
    enrichmentConfigHash: config.enrichmentConfigHash,
    derivedNodes: allNodes,
    judgments: judgmentTraces,
    dispositions: [
      ...insufficientEvidence,
      ...uncertainEdges.map((edge) => disposition(edge, "uncertain")),
      ...weakEdges.map((edge) => disposition(edge, "weak_cut")),
      ...cycleRemovedEdges.map((edge) => disposition(edge, "cycle_removed")),
      ...transitiveEdges.map((edge) => disposition(edge, "transitive_reduction")),
      ...reducedEdges.map((edge) => disposition(edge, "kept"))
    ],
    groundingDispositions,
    rescueDispositions
  };
  await input.enrichmentStore.persist({
    layer,
    artifact: {
      artifactId: `${input.enrichmentId}:enrichment-run`,
      artifactType: "enrichment_run.v2",
      schemaVersion: "2",
      graphVersionId: input.graphVersionId,
      producer: PRODUCER,
      producerVersion: PRODUCER_VERSION,
      configHash: config.enrichmentConfigHash,
      createdAt: new Date().toISOString(),
      payload: trace
    }
  });
  return layer;
}

function disposition(
  edge: InferredPrerequisiteEdge,
  value: EnrichmentRunTrace["dispositions"][number]["disposition"]
): EnrichmentRunTrace["dispositions"][number] {
  return {
    prerequisiteConceptId: edge.prerequisiteConceptId,
    dependentConceptId: edge.dependentConceptId,
    disposition: value
  };
}

// --- Deterministic, model-free helpers -----------------------------------------

function deterministicUuid(...parts: string[]): string {
  const hash = createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 32).split("");
  hash[12] = "4";
  hash[16] = (8 + (Number.parseInt(hash[16], 16) % 4)).toString(16);
  return `${hash.slice(0, 8).join("")}-${hash.slice(8, 12).join("")}-${hash.slice(12, 16).join("")}-${hash.slice(16, 20).join("")}-${hash.slice(20, 32).join("")}`;
}

// Every unordered same-domain pair over the derived node space (R12). Nodes are
// grouped by Declared Domain (ADR-0015) so a cross-domain pair is never proposed;
// both the domain order and the within-domain member order are sorted by stable
// derived-node id so the pair sequence — and therefore the persisted trace — is
// replay-deterministic. The judge decides direction, so within-pair order is moot.
function sameDomainPairs<T extends { derivedNodeId: string; declaredDomain: string }>(nodes: T[]): [T, T][] {
  const byDomain = new Map<string, T[]>();
  for (const node of nodes) {
    const existing = byDomain.get(node.declaredDomain);
    if (existing) existing.push(node);
    else byDomain.set(node.declaredDomain, [node]);
  }
  const pairs: [T, T][] = [];
  for (const [, members] of [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...members].sort((a, b) => a.derivedNodeId.localeCompare(b.derivedNodeId));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        pairs.push([sorted[i], sorted[j]]);
      }
    }
  }
  return pairs;
}

// Reduce a derived node to exactly what the prerequisite judge needs (R11). An anchor
// uses its published CEP (verbatim definition + bounded mention quotes + LABELED
// `defines` assertions). A `source_mentioned` node has
// no definition — only verbatim mention quotes. A `llm_grounded` node uses its
// generated definition/mention text (exempt from the verbatim floor, U6). The bare
// label is never the evidence — an empty context is treated as insufficient upstream.
function contextOf(
  node: DerivedGraphNode,
  profileByConcept: Map<string, PublishedConceptEvidenceProfile>,
  maxMentions: number
): PrerequisiteConceptContext {
  if (node.nodeKind === "anchor") {
    const profile = profileByConcept.get(node.conceptId);
    const publishedAssertions = profile?.assertions ?? [];
    return {
      conceptId: node.derivedNodeId,
      canonicalLabel: node.canonicalLabel,
      aliases: node.aliases,
      definitions: (profile?.definitions ?? []).map((passage) => passage.evidenceQuote),
      mentions: (profile?.mentions ?? []).slice(0, maxMentions).map((passage) => passage.evidenceQuote),
      assertions: publishedAssertions.map((assertion) => ({ type: assertion.type, detail: assertion.literalValue }))
    };
  }
  if (node.groundingOrigin === "source_mentioned") {
    return {
      conceptId: node.derivedNodeId,
      canonicalLabel: node.canonicalLabel,
      aliases: node.aliases,
      definitions: [],
      mentions: node.groundingPassages.slice(0, maxMentions).map((passage) => passage.evidenceQuote),
      assertions: []
    };
  }
  return {
    conceptId: node.derivedNodeId,
    canonicalLabel: node.canonicalLabel,
    aliases: node.aliases,
    definitions: node.groundingBundle.definitions.map((passage) => passage.text),
    mentions: node.groundingBundle.mentions.slice(0, maxMentions).map((passage) => passage.text),
    assertions: []
  };
}

// Map over items with bounded concurrency, preserving INPUT order in the result
// regardless of completion order (deterministic trace for replay). Any rejection
// propagates: a pair whose judge exhausts its forced-tool retry budget throws, so
// the enrichment run fails before persistence and leaves no partial layer.
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

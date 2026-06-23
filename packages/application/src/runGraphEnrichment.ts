import type {
  AnchorProjectionNode,
  DerivedGraphLayer,
  DerivedGraphNode,
  DifficultyNodeContext,
  EnrichmentNode,
  EnrichmentRunTrace,
  GroundingVerbatimDisposition,
  InferredPrerequisiteEdge,
  NodeMergeRecord,
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
  NodeEmbeddingPort,
  NodeMergeAdjudicationPort,
  PrerequisiteJudgmentPort,
  RescueDurabilityJudgmentPort,
  GraphVersionStorePort
} from "@lrnki/ports";
import { createHash, randomUUID } from "node:crypto";
import { deduplicateDerivedNodes, DEFAULT_DEDUP_CONFIG, type DedupConfig, type DedupNodeContext } from "./deduplicateDerivedNodes";
import { assembleEnrichmentNodes, DEFAULT_MINTING_BOUNDS, type EnrichmentMintingBounds, type MintingAnchor } from "./enrichmentNodeMinting";
import { judgeNodeAgainstCandidates } from "./judgeNodeAgainstCandidates";
import { mapWithConcurrency } from "./mapWithConcurrency";
import { cutWeakEdges, removeCycles, transitiveReduction } from "./prerequisiteDag";
import { applyVerbatimFloorByGrounding } from "./verbatimFloorByGrounding";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.8.0";

export type GraphEnrichmentConfig = {
  // Part of enrichment identity (ADR-0019): changing a knob re-derives the layer.
  enrichmentConfigHash: string;
  // Weak-edge cut floor applied before cycle removal.
  minEdgeConfidence: number;
  // Bounded concurrency for the per-NODE batched judge calls (ADR-0019 amended, U5).
  // Bounds concurrent SUBJECTS; each subject runs its routing/chunk calls serially, so
  // at most this many batched calls are ever in flight (R10). Results are collected in
  // deterministic subject-then-candidate order regardless of completion order (R8).
  judgeConcurrency: number;
  // Bound on mention passages passed per node into a judgment (R11). The published CEP
  // is already mention-bounded at extraction; this is a further deterministic cap so a
  // judgment prompt cannot grow unbounded per concept.
  maxMentionsPerConceptInPair: number;
  // Max candidates per batched judge call (U5/KTD3). A subject's same-domain candidate
  // list (within a routing class) is split into deterministic sorted chunks of at most
  // this size, keeping listwise judge quality while staying ~O(n) in the small-graph
  // regime. Tuned in the U7 rule-14 pass against the largest domain.
  maxCandidatesPerBatch: number;
  // Bounds on the anchor-driven node-minting pass (KTD6, R7).
  mintingBounds: EnrichmentMintingBounds;
  // Semantic-dedup knobs (plan U3). Only consulted when both dedup ports are provided;
  // tuned in the U7 rule-14 pass against the largest domain.
  dedup: DedupConfig;
};

export const DEFAULT_ENRICHMENT_CONFIG: GraphEnrichmentConfig = {
  // Bumped from `intrinsic-difficulty-v3` because the derived-layer semantic-dedup
  // sub-stage changes the derivation (ADR-0019 enrichment identity): a re-run produces a
  // new Derived Graph Layer on the collapsed node set.
  enrichmentConfigHash: "dedup-v1",
  minEdgeConfidence: 0.5,
  judgeConcurrency: 4,
  maxMentionsPerConceptInPair: 6,
  maxCandidatesPerBatch: 12,
  mintingBounds: DEFAULT_MINTING_BOUNDS,
  dedup: DEFAULT_DEDUP_CONFIG
};

// Graph Enrichment — the third operation, generalized to NODE + EDGE derivation
// (ADR-0019, amended for per-node batched judging — plan U5). The asserted snapshot
// supplies anchors; enrichment additionally RESCUES `source_mentioned` nodes from the
// member runs' non-core mentions and MINTS `llm_grounded` nodes via an explicit
// anchor-driven proposal pass, so a sparse source still yields a usable learner path.
// Each subject node is judged against its FORWARD same-domain candidates (j > i over the
// stable-id sort) in ONE batched call, covering every unordered same-domain relation
// exactly once — identical coverage to the prior per-pair loop, regrouped from O(n^2)
// calls into ~O(n) (KTD1). Candidates are split by routing class so any pair touching a
// GENERATED (`llm_grounded`) node goes to a CROSS-FAMILY judge (R13) and the DeepSeek
// self-loop never grades its own minted output, while anchor/anchor and
// anchor/source_mentioned stay on the validated DeepSeek judge. The symbolic helpers
// dispose (weak-edge cut -> cycle removal -> transitive reduction); intrinsic difficulty
// scores ALL derived nodes from the same evidence contexts. The asserted core is never
// touched (R5): no enrichment node is ever published. Node minting + rescue are OPT-IN —
// when the proposal/grounding ports are omitted the run is anchor-only. Fails the run
// WITHOUT persistence if any batched call exhausts the forced-tool retry budget.
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
  // Optional semantic-dedup ports (plan U3, AGENTS rule 20). Provide BOTH to enable the
  // dedup sub-stage: the embedding PROPOSES near-duplicate pairs and the cross-family
  // adjudicator DECIDES each merge. Omit either to leave enrichment behavior identical to
  // today (opt-in, like node minting) — this is how the U7 baseline run is produced.
  nodeEmbedding?: NodeEmbeddingPort;
  nodeMergeAdjudicator?: NodeMergeAdjudicationPort;
  // Optional dedup summary hook (R13): the application reports the merge count and any
  // fail-closed events; the worker formats the structured line (no console I/O here).
  onDedupSummary?: (summary: { merges: number; unavailable: number }) => void;
  // Optional per-sub-stage wall-clock hook (U2, KTD5, R1). The application stays free
  // of console I/O: it only measures monotonic elapsed ms around each enrichment
  // sub-stage and reports through this callback; the worker formats the structured line.
  onStageTiming?: (timing: { stage: string; ms: number }) => void;
  newNodeId?: () => string;
}): Promise<DerivedGraphLayer> {
  const config = input.config ?? DEFAULT_ENRICHMENT_CONFIG;
  // Bracket one enrichment sub-stage and report its wall-clock through onStageTiming.
  // Reports on success only; a thrown sub-stage fails the whole run, which the
  // worker-level command timer records as a failed stage (U2).
  const timeStage = async <T>(stage: string, fn: () => Promise<T>): Promise<T> => {
    const startedAt = performance.now();
    const result = await fn();
    input.onStageTiming?.({ stage, ms: Math.max(0, Math.round(performance.now() - startedAt)) });
    return result;
  };
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
    await timeStage("enrichment:rescue-mint", async () => {
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
        proposalPort: input.missingPrerequisiteProposal!,
        groundingPort: input.groundingGeneration!,
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
    });
  }

  const assembledNodes: DerivedGraphNode[] = [...anchorNodes, ...enrichmentNodes];

  // Step 0.5 — semantic deduplication of the derived node set (plan U3, ADR-0012, AGENTS
  // rule 20). Runs BEFORE per-node judging so duplicate nodes never reach the judge and
  // prerequisite chains form on the collapsed set (KTD4). Opt-in: only when both dedup
  // ports are provided. Embeddings PROPOSE within-domain near-duplicate pairs; a
  // cross-family adjudicator DECIDES each merge; raw cosine never merges (R2/R3). Absorbed
  // evidence is threaded into the canonical node's judge context below (R6). Published
  // identity is never touched — an anchor is never absorbed (R7/KTD6).
  let allNodes = assembledNodes;
  let nodeMerges: NodeMergeRecord[] = [];
  let absorbedGroundingByCanonical = new Map<string, string[]>();
  if (input.nodeEmbedding && input.nodeMergeAdjudicator) {
    await timeStage("enrichment:dedup", async () => {
      // Reduce each node to its dedup context from the SAME contextOf reduction the judge
      // uses (label + verbatim definition/mention quotes), without absorbed grounding yet.
      const dedupContext = new Map<string, DedupNodeContext>(
        assembledNodes.map((node) => {
          const context = contextOf(node, profileByConcept, config.maxMentionsPerConceptInPair);
          return [node.derivedNodeId, { label: context.canonicalLabel, aliases: context.aliases, evidence: [...context.definitions, ...context.mentions] }];
        })
      );
      let unavailable = 0;
      const result = await deduplicateDerivedNodes({
        nodes: assembledNodes,
        contextByNodeId: dedupContext,
        embedding: input.nodeEmbedding,
        adjudicator: input.nodeMergeAdjudicator,
        config: config.dedup,
        onUnavailable: () => {
          unavailable += 1;
        }
      });
      allNodes = result.nodes;
      nodeMerges = result.merges;
      absorbedGroundingByCanonical = result.absorbedGroundingByCanonical;
      input.onDedupSummary?.({ merges: nodeMerges.length, unavailable });
    });
  }

  // Each derived node reduced to the prerequisite judge's context (R11). Anchors use
  // their published CEP; enrichment nodes use their grounding (generated text for
  // llm_grounded, verbatim mention quotes for source_mentioned). The bare label is
  // never the evidence — an empty context is treated as insufficient upstream. A
  // canonical node also carries its absorbed nodes' evidence (R6).
  const pairingNodes = allNodes.map((node) => ({
    derivedNodeId: node.derivedNodeId,
    declaredDomain: node.declaredDomain,
    groundingOrigin: node.groundingOrigin,
    context: contextOf(node, profileByConcept, config.maxMentionsPerConceptInPair, absorbedGroundingByCanonical.get(node.derivedNodeId))
  }));
  const difficultyNodes: DifficultyNodeContext[] = pairingNodes.map((node) => ({
    derivedNodeId: node.derivedNodeId,
    canonicalLabel: node.context.canonicalLabel,
    aliases: node.context.aliases,
    declaredDomain: node.declaredDomain,
    groundingOrigin: node.groundingOrigin,
    definitions: node.context.definitions,
    mentions: node.context.mentions
  }));
  // Step 1 — group anchors ∪ enrichment nodes by Declared Domain (ADR-0015 keeps pairs
  // same-domain), and for each subject select its FORWARD candidates over the stable-id
  // sort. The union of forward batches covers every unordered same-domain relation
  // exactly once (KTD1) — the asserted version stays anchors-only; this union is the
  // DERIVED node space.
  const subjectsWithCandidates = forwardCandidatesByDomain(pairingNodes);

  // Step 2 — per-node batched prerequisite judgment (neural proposes). Each subject is
  // judged against its candidates in one batched call per routing class + chunk; the
  // cross-family judge handles any generated-touching candidate (R13). Concurrency is
  // bounded across subjects (R10) and results are collected in deterministic
  // subject-then-candidate order (R8). The per-node unit is the incremental-growth
  // primitive (R7, KTD6).
  const generatedJudge = input.generatedPrerequisiteJudge ?? input.prerequisiteJudge;
  const nodeResults = await timeStage("enrichment:judging", () =>
    mapWithConcurrency(subjectsWithCandidates, config.judgeConcurrency, ({ subject, candidates }) =>
      judgeNodeAgainstCandidates({
        declaredDomain: subject.declaredDomain,
        subject,
        candidates,
        prerequisiteJudge: input.prerequisiteJudge,
        generatedPrerequisiteJudge: generatedJudge,
        maxCandidatesPerBatch: config.maxCandidatesPerBatch
      })
    )
  );

  // Collect in deterministic subject order; each subject's results are already in
  // candidate order (R8).
  const judgments: PrerequisiteJudgment[] = [];
  const judgmentTraces: PrerequisiteJudgmentTrace[] = [];
  const insufficientEvidence: EnrichmentRunTrace["dispositions"][number][] = [];
  for (const result of nodeResults) {
    judgments.push(...result.judgments);
    judgmentTraces.push(...result.traces);
    insufficientEvidence.push(...result.insufficient);
  }

  // Step 3 — map judgments to raw edges. "none" is dropped; "uncertain" is flagged
  // and retained for inspection but kept OUT of the traversable DAG.
  const rawEdges: InferredPrerequisiteEdge[] = judgments
    .filter((judgment) => judgment.outcome !== "none")
    .map((judgment) => ({
      prerequisiteDerivedNodeId: judgment.prerequisiteDerivedNodeId,
      dependentDerivedNodeId: judgment.dependentDerivedNodeId,
      predicate: "inferred-prerequisite-of",
      confidence: judgment.confidence,
      uncertain: judgment.outcome === "uncertain",
      provenance: { judgmentRationale: judgment.rationale }
    }));

  // Step 4 — symbolic disposal over CERTAIN edges only (symbolic constrains). Pure and
  // fast, but bracketed so its share of the run is visible in the timing split (U2).
  const disposal = await timeStage("enrichment:symbolic-disposal", async () => {
    const uncertainEdges = rawEdges.filter((edge) => edge.uncertain);
    const { kept: strongEdges, cut: weakEdges } = cutWeakEdges(
      rawEdges.filter((edge) => !edge.uncertain),
      config.minEdgeConfidence
    );
    const { edges: acyclicEdges, removed: cycleRemovedEdges } = removeCycles(strongEdges);
    const { edges: reducedEdges, removed: transitiveEdges } = transitiveReduction(acyclicEdges);
    return { uncertainEdges, weakEdges, cycleRemovedEdges, reducedEdges, transitiveEdges };
  });
  const { uncertainEdges, weakEdges, cycleRemovedEdges, reducedEdges, transitiveEdges } = disposal;
  const prerequisiteEdges = [...reducedEdges, ...uncertainEdges];

  // Step 5 — intrinsic difficulty over the reduced DAG. Scores ALL derived node ids
  // — anchors AND enrichment nodes (R12, handoff constraint).
  const difficulties = await timeStage("enrichment:difficulty", () =>
    input.difficulty.score({ nodes: difficultyNodes, prerequisiteEdges: reducedEdges })
  );

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
    rescueDispositions,
    nodeMerges
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
    prerequisiteDerivedNodeId: edge.prerequisiteDerivedNodeId,
    dependentDerivedNodeId: edge.dependentDerivedNodeId,
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

// For each subject node, its FORWARD same-domain candidates over the derived node space
// (KTD1). Nodes are grouped by Declared Domain (ADR-0015) so a cross-domain pair is never
// proposed; both the domain order and the within-domain member order are sorted by stable
// derived-node id, so subject `i`'s candidates are exactly the higher-id nodes `j > i`.
// The union of these forward batches covers every unordered same-domain relation exactly
// once, and the subject/candidate sequence is replay-deterministic (R8). The judge
// decides direction, so within-pair order is moot.
function forwardCandidatesByDomain<T extends { derivedNodeId: string; declaredDomain: string }>(
  nodes: T[]
): { subject: T; candidates: T[] }[] {
  const byDomain = new Map<string, T[]>();
  for (const node of nodes) {
    const existing = byDomain.get(node.declaredDomain);
    if (existing) existing.push(node);
    else byDomain.set(node.declaredDomain, [node]);
  }
  const subjects: { subject: T; candidates: T[] }[] = [];
  for (const [, members] of [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sorted = [...members].sort((a, b) => a.derivedNodeId.localeCompare(b.derivedNodeId));
    for (let i = 0; i < sorted.length; i++) {
      subjects.push({ subject: sorted[i], candidates: sorted.slice(i + 1) });
    }
  }
  return subjects;
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
  maxMentions: number,
  // Absorbed nodes' evidence (R6, KTD5): when this canonical node absorbed near-duplicate
  // nodes during dedup, their verbatim quotes are appended to its mentions so the judge
  // sees the unioned evidence. Undefined for a node that absorbed nothing (or when dedup
  // did not run).
  absorbedGrounding?: string[]
): PrerequisiteConceptContext {
  const withAbsorbed = (mentions: string[]): string[] =>
    absorbedGrounding && absorbedGrounding.length ? [...mentions, ...absorbedGrounding] : mentions;
  if (node.nodeKind === "anchor") {
    const profile = profileByConcept.get(node.conceptId);
    const publishedAssertions = profile?.assertions ?? [];
    return {
      derivedNodeId: node.derivedNodeId,
      canonicalLabel: node.canonicalLabel,
      aliases: node.aliases,
      definitions: (profile?.definitions ?? []).map((passage) => passage.evidenceQuote),
      mentions: withAbsorbed((profile?.mentions ?? []).slice(0, maxMentions).map((passage) => passage.evidenceQuote)),
      assertions: publishedAssertions.map((assertion) => ({ type: assertion.type, detail: assertion.literalValue }))
    };
  }
  if (node.groundingOrigin === "source_mentioned") {
    return {
      derivedNodeId: node.derivedNodeId,
      canonicalLabel: node.canonicalLabel,
      aliases: node.aliases,
      definitions: [],
      mentions: withAbsorbed(node.groundingPassages.slice(0, maxMentions).map((passage) => passage.evidenceQuote)),
      assertions: []
    };
  }
  return {
    derivedNodeId: node.derivedNodeId,
    canonicalLabel: node.canonicalLabel,
    aliases: node.aliases,
    definitions: node.groundingBundle.definitions.map((passage) => passage.text),
    mentions: withAbsorbed(node.groundingBundle.mentions.slice(0, maxMentions).map((passage) => passage.text)),
    assertions: []
  };
}


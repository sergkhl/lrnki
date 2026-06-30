import type {
  AnchorProjectionNode,
  DefinitionPassageDisposition,
  DerivedGraphLayer,
  DerivedGraphNode,
  DifficultyNodeContext,
  EnrichmentNode,
  EnrichmentRunTrace,
  GroundingVerbatimDisposition,
  InferredPrerequisiteEdge,
  MintingDisposition,
  NodeEvidenceExclusion,
  NodeMergeRecord,
  PrerequisiteConceptContext,
  PublishedConceptEvidenceProfile,
  RescueDisposition
} from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { runWithOperationTag } from "@lrnki/domain-core/operation-tag-context";
import type {
  DifficultyPort,
  EnrichmentRunStorePort,
  GroundingGenerationPort,
  MintingDurabilityJudgmentPort,
  MissingPrerequisiteProposalPort,
  NodeEmbeddingPort,
  NodeMergeAdjudicationPort,
  PrerequisiteOrderingPort,
  RescueDurabilityJudgmentPort,
  DefinitionPassageQualityJudgmentPort,
  RunProgressReporterPort,
  GraphVersionStorePort
} from "@lrnki/ports";
import { createHash, randomUUID } from "node:crypto";
import { bracketStage, NON_LLM_STAGES, noopRunProgressReporter } from "./runProgressReporter";
import { deduplicateDerivedNodes, DEFAULT_DEDUP_CONFIG, type DedupConfig, type DedupNodeContext } from "./deduplicateDerivedNodes";
import { assembleEnrichmentNodes, DEFAULT_MINTING_BOUNDS, type EnrichmentMintingBounds, type MintingAnchor } from "./enrichmentNodeMinting";
import { transitiveReduction } from "./prerequisiteDag";
import { applyVerbatimFloorByGrounding } from "./verbatimFloorByGrounding";
import { applyRescuedDefinitionQualityJudge } from "./applyRescuedDefinitionQualityJudge";
import { deriveConsensusOrdering } from "./deriveConsensusOrdering";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.8.0";

export type GraphEnrichmentConfig = {
  // Part of enrichment identity (ADR-0019): changing a knob re-derives the layer.
  enrichmentConfigHash: string;
  // K — the number of independent ordering DRAWS per Declared Domain (D1/D8). MoE
  // inference is non-deterministic (ADR-0028), so one draw is one sample from a
  // distribution; the boundary draws K times on the SAME input and tallies a per-pair
  // directional vote. Calibrated in the U6 rule-14 pass, never assumed (D8).
  orderingSampleCount: number;
  // The minority-vote fraction at which a pair's prerequisite DIRECTION is judged
  // genuinely contested and routed to `uncertain` (D3/D6). A pair is contested when
  // `min(forward, reverse) / K >= directionContestMinorityFraction`. A FRACTION of K (not a
  // binary "any reverse") so a single stray flip at large K does not route a robust pair to
  // `uncertain` (risk note). Calibrated in U6 (D8).
  directionContestMinorityFraction: number;
  // Weak-edge cut floor applied to the consensus certain candidates. Because consensus
  // confidence is `max(f,r)/K` (an agreement fraction, D4/KTD2), this floor doubles as the
  // PRESENCE QUORUM (D5): an edge present in too few draws scores below it and becomes
  // `weak_cut`. Recalibrated in U6 against agreement-scale confidence (KTD2).
  minEdgeConfidence: number;
  // Bound on mention passages passed per node into the ordering prompt (R11). The
  // published CEP is already mention-bounded at extraction; this is a further
  // deterministic cap so the prompt cannot grow unbounded per concept.
  maxMentionsPerConceptInPair: number;
  // Token-budget guard for the ONE whole-set ordering call per domain (KTD6, R16). A
  // deterministic character-count proxy for the assembled prompt; if a single domain's
  // rendered node set + evidence exceeds this, the run FAILS CLOSED without persisting a
  // partial layer (no chunking, no DAG merging). The proxy is intentionally coarse — the
  // fail-LOUD behavior is the contract; the concrete threshold is tuned against the
  // chosen model's context window in U7.
  maxDomainPromptChars: number;
  // Bounds on the anchor-driven node-minting pass (KTD6, R7).
  mintingBounds: EnrichmentMintingBounds;
  // Semantic-dedup knobs (plan U3). Only consulted when both dedup ports are provided;
  // tuned in the U7 rule-14 pass against the largest domain.
  dedup: DedupConfig;
};

export const DEFAULT_ENRICHMENT_CONFIG: GraphEnrichmentConfig = {
  // Load-bearing enrichment identity (ADR-0019): changing the ordering BEHAVIOR
  // re-derives the layer. Unversioned `kind` name, consistent with the abolished `.vN`
  // convention (KTD7) — K-sampling supersedes single-draw whole-set ordering.
  enrichmentConfigHash: "k-sample-ordering",
  // CALIBRATED in the U6 rule-14 pass against real K=8 gpt-oss-120b draws over the Rust +
  // economics fixtures (D8; tmp/2026-06-24-k-sample-ordering-rule14/). K=8 is the
  // probe-validated draw count. The contest fraction 0.1 catches a genuine 7:1 directional
  // flip at K=8 (min/K = 0.125 ≥ 0.1 → `uncertain`) while scaling with K — a single stray
  // reverse at K≥16 (≤0.0625) stays committed, so a robust pair is not routed to `uncertain`.
  orderingSampleCount: 8,
  directionContestMinorityFraction: 0.1,
  // Now gates an AGREEMENT fraction (max(f,r)/K), not a 0.85-scale self-report — so 0.5
  // means "present in at least half the draws". Recalibrated in U6 (KTD2).
  minEdgeConfidence: 0.5,
  maxMentionsPerConceptInPair: 6,
  // ~100k tokens at a coarse 4-chars/token proxy: comfortably inside the non-DeepSeek
  // ordering candidates' context windows, while small same-domain sets (rule 3) stay far
  // below it. Re-tuned against the committed model in U7.
  maxDomainPromptChars: 400000,
  mintingBounds: DEFAULT_MINTING_BOUNDS,
  dedup: DEFAULT_DEDUP_CONFIG
};

// Graph Enrichment — the third operation, generalized to NODE + EDGE derivation
// (ADR-0019, amended for whole-set ordering — plan U4). The asserted snapshot supplies
// anchors; enrichment additionally RESCUES `source_mentioned` nodes from the member runs'
// non-core mentions and MINTS `llm_grounded` nodes via an explicit anchor-driven proposal
// pass, so a sparse source still yields a usable learner path. The deduplicated derived
// node set is grouped by Declared Domain (ADR-0015), and each domain is ordered by
// K-SAMPLING the whole-set call: the boundary draws the directed-DAG ordering K times on
// the SAME input (bounded concurrency) and tallies a per-pair DIRECTIONAL VOTE, because MoE
// inference is non-deterministic and one draw is one sample from a distribution (ADR-0028,
// D1/D2). `deriveConsensusOrdering` owns the deterministic consensus envelope: ordinal
// endpoint resolution, per-pair tallying, direction-contest routing, weak-cut before cycle
// routing, and trace construction. The symbolic helpers then transitively reduce the
// CERTAIN edges; intrinsic difficulty scores ALL
// derived nodes from the same evidence contexts. The asserted core is never touched (R5):
// no enrichment node is ever published. Node minting + rescue are OPT-IN — when the
// proposal/grounding ports are omitted the run is anchor-only. Fails the run WITHOUT
// persistence if any ordering call exhausts the forced-tool retry budget, if an edge
// cites an ordinal outside the judged set (rule 6), or if a domain blows the token budget
// (R16, KTD6) — no partial layer is ever persisted.
export async function runGraphEnrichment(input: {
  enrichmentId: string;
  graphVersionId: string;
  graphStore: GraphVersionStorePort;
  prerequisiteOrdering: PrerequisiteOrderingPort;
  difficulty: DifficultyPort;
  enrichmentStore: EnrichmentRunStorePort;
  config?: GraphEnrichmentConfig;
  // U5/U7 enrichment-node ports. Provide both to enable rescue + mint; omit them for an
  // anchor-only run.
  missingPrerequisiteProposal?: MissingPrerequisiteProposalPort;
  groundingGeneration?: GroundingGenerationPort;
  // Optional measured rescue durability judge (U3). When provided, aggregated
  // `source_mentioned` rescue candidates are durability-judged against their
  // same-domain anchors before becoming derived nodes; omit it to leave rescue
  // unjudged (prior behavior).
  rescueDurabilityJudge?: RescueDurabilityJudgmentPort;
  // Optional rescue-seam Definition-Passage quality judge (plan 2026-06-26-001 U3). When
  // provided, the `definition`-typed grounding passages of verbatim-floored
  // `source_mentioned` nodes are meaning-judged before they become learner-facing study
  // items; hollow definition passages are dropped (the node stays mention-only), failing
  // CLOSED = preserve on judge-unavailable. Omit it to leave rescued definitions unjudged
  // (prior behavior). Same `kg-independent-judge` meaning judge as the extraction-time core
  // gate — no new alias.
  rescuedDefinitionQualityJudge?: DefinitionPassageQualityJudgmentPort;
  // Optional measured minting durability judge. When provided, each reserved
  // assumed-prerequisite proposal is judged before generated grounding is created;
  // omit it to preserve prior minting behavior.
  mintingDurabilityJudge?: MintingDurabilityJudgmentPort;
  // Optional semantic-dedup ports (plan U3, AGENTS rule 20). Provide BOTH to enable the
  // dedup sub-stage: the embedding PROPOSES near-duplicate pairs and the cross-family
  // adjudicator DECIDES each merge. Omit either to leave enrichment behavior identical to
  // today (opt-in, like node minting) — this is how the U7 baseline run is produced.
  nodeEmbedding?: NodeEmbeddingPort;
  nodeMergeAdjudicator?: NodeMergeAdjudicationPort;
  // Optional dedup summary hook (R13): the application reports the merge count and any
  // fail-closed events; the worker formats the structured line (no console I/O here).
  onDedupSummary?: (summary: { merges: number; unavailable: number }) => void;
  // Optional minting durability summary hook. Reports recorded decision counts for
  // operator visibility without coupling the application layer to console output.
  onMintingSummary?: (summary: { accepted: number; dropped: number; unavailable: number }) => void;
  // Optional K-sampling ordering summary hook (U5): the K used and the committed /
  // direction-contested / weak-cut / cycle-routed edge counts, for operator visibility. The
  // application stays free of console I/O; the worker formats the structured line.
  onOrderingSummary?: (summary: { k: number; committed: number; contested: number; weakCut: number; cycleRouted: number }) => void;
  // Run-progress reporter seam (ADR-0029). Supersedes the old onStageTiming stdout
  // callback: per-stage wall-clock now lives in the durable operation_run_stages
  // timeline. Absent → no-op (anchor-only/test runs behave unchanged).
  reporter?: RunProgressReporterPort;
  newNodeId?: () => string;
}): Promise<DerivedGraphLayer> {
  const config = input.config ?? DEFAULT_ENRICHMENT_CONFIG;
  const reporter = input.reporter ?? noopRunProgressReporter;
  const operationId = input.enrichmentId;
  return runWithOperationTag(operationId, async () => {
  // Bracket each enrichment sub-stage onto the durable timeline; a thrown stage marks
  // the operation failed before propagating, so a failed enrichment leaves a readable
  // timeline — no partial layer is ever persisted.
  const runStage = bracketStage(reporter, "enrichment", operationId);
  await reporter.beginOperation({ operationType: "enrichment", operationId });
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
  let rescuedDefinitionDispositions: DefinitionPassageDisposition[] = [];
  let mintingDispositions: MintingDisposition[] = [];
  if (input.missingPrerequisiteProposal && input.groundingGeneration) {
    // No coarse `rescue-mint` bracket: assembleEnrichmentNodes brackets each inner LLM
    // call onto its fine STAGE_TAGS name (U1), so wall-clock joins the cost the calls
    // already self-tag. The surrounding candidate fetch + verbatim floor are deterministic
    // and LLM-free — they need no stage row (they carry no spend to join).
    const rescueCandidates = await input.enrichmentStore.nonCoreRescueCandidates(input.graphVersionId);
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
      mintingDurabilityJudge: input.mintingDurabilityJudge,
      bounds: config.mintingBounds,
      newNodeId,
      stage: runStage
    });
    rescueDispositions = assembled.rescueDispositions;
    mintingDispositions = assembled.mintingDispositions;
    input.onMintingSummary?.({
      accepted: mintingDispositions.filter((disposition) => disposition.disposition === "accepted").length,
      dropped: mintingDispositions.filter((disposition) => disposition.disposition === "dropped").length,
      unavailable: mintingDispositions.filter((disposition) => disposition.disposition === "kept_judge_unavailable").length
    });
    // The floor verifies source_mentioned passages verbatim against their cited block
    // and records the llm_grounded exemption (R9, AE3). A rescued node whose evidence
    // does not verify is dropped before it can enter the derived layer.
    const blockTextById = new Map<string, string>();
    for (const candidate of rescueCandidates) {
      for (const definition of candidate.definitions) blockTextById.set(definition.sourceBlockId, definition.blockText);
      for (const mention of candidate.mentions) blockTextById.set(mention.sourceBlockId, mention.blockText);
    }
    const floored = applyVerbatimFloorByGrounding({ nodes: [...assembled.rescuedNodes, ...assembled.mintedNodes], blockTextById });
    groundingDispositions = floored.dispositions;
    // Rescue-seam Definition-Passage quality gate (plan 2026-06-26-001 U3). Runs over the
    // VERIFIED floored nodes — exactly the rescued `definition`-typed passages that reach
    // study items — and drops hollow ones so a mis-picked optional definition never
    // surfaces as a learner-facing definition. Its own fine stage tag so the added judging
    // cost joins the enrichment operation (ADR-0029). Opt-in: only when the judge is wired.
    if (input.rescuedDefinitionQualityJudge) {
      const judge = input.rescuedDefinitionQualityJudge;
      const rescuedJudged = await runStage(STAGE_TAGS.rescueDefinitionQuality, () =>
        applyRescuedDefinitionQualityJudge({ nodes: floored.nodes, judge })
      );
      enrichmentNodes = rescuedJudged.nodes;
      rescuedDefinitionDispositions = rescuedJudged.dispositions;
    } else {
      enrichmentNodes = floored.nodes;
    }
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
    // No coarse `dedup` bracket: deduplicateDerivedNodes brackets its two phases onto the
    // fine `node-embedding` / `node-merge-adjudication` names (U2), so wall-clock joins the
    // cost the embedding + adjudication calls already self-tag. Building the dedup context
    // is deterministic and LLM-free — no stage row.
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
      },
      stage: runStage
    });
    allNodes = result.nodes;
    nodeMerges = result.merges;
    absorbedGroundingByCanonical = result.absorbedGroundingByCanonical;
    input.onDedupSummary?.({ merges: nodeMerges.length, unavailable });
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
  // Step 1 — group EVIDENCED nodes by Declared Domain (ADR-0015 keeps ordering
  // same-domain). A node with no definition/mention evidence cannot ground a judgment, so
  // it is EXCLUDED from the ordering input and recorded ONCE (R4) — not once per pair.
  const nodeExclusions: NodeEvidenceExclusion[] = [];
  const byDomain = new Map<string, typeof pairingNodes>();
  for (const node of pairingNodes) {
    if (!hasEvidence(node.context)) {
      nodeExclusions.push({ derivedNodeId: node.derivedNodeId, declaredDomain: node.declaredDomain, reason: "insufficient_evidence" });
      continue;
    }
    const existing = byDomain.get(node.declaredDomain);
    if (existing) existing.push(node);
    else byDomain.set(node.declaredDomain, [node]);
  }

  const K = Math.max(1, Math.trunc(config.orderingSampleCount));
  const {
    orderings: orderingTraces,
    certainEdges,
    uncertainEdges,
    weakEdges
  } = await runStage(STAGE_TAGS.prerequisiteOrdering, () =>
    deriveConsensusOrdering({
      domains: [...byDomain.entries()].map(([declaredDomain, members]) => ({
        declaredDomain,
        nodes: members.map((node) => node.context)
      })),
      prerequisiteOrdering: input.prerequisiteOrdering,
      orderingSampleCount: config.orderingSampleCount,
      directionContestMinorityFraction: config.directionContestMinorityFraction,
      minEdgeConfidence: config.minEdgeConfidence,
      maxDomainPromptChars: config.maxDomainPromptChars
    })
  );

  // Step 3 — symbolic reduction over the acyclic CERTAIN edges (symbolic constrains). Pure
  // and fast, but bracketed so its share of the run is visible in the timing split (U2). The
  // weak-edge cut already ran per domain BEFORE cycle-routing (KTD5); no cycle removal here —
  // acyclicity is enforced upstream by cycle-routing (KTD3).
  const disposal = await runStage(NON_LLM_STAGES.symbolicDisposal, async () => {
    const { edges: reducedEdges, removed: transitiveEdges } = transitiveReduction(certainEdges);
    return { reducedEdges, transitiveEdges };
  });
  const { reducedEdges, transitiveEdges } = disposal;

  // Ordering summary (U5): committed certain edges (post-reduction DAG), direction-contested
  // and cycle-routed counts from the per-domain traces, and the weak-cut count — for operator
  // visibility. The application only reports; the worker formats the structured log line.
  input.onOrderingSummary?.({
    k: K,
    committed: reducedEdges.length,
    contested: orderingTraces.reduce((sum, trace) => sum + trace.pairVotes.filter((vote) => vote.classification === "direction_contested").length, 0),
    weakCut: weakEdges.length,
    cycleRouted: orderingTraces.reduce((sum, trace) => sum + trace.cycleRoutedEdges.length, 0)
  });
  const prerequisiteEdges = [...reducedEdges, ...uncertainEdges];

  // Step 5 — intrinsic difficulty over the reduced DAG. Scores ALL derived node ids
  // — anchors AND enrichment nodes (R12, handoff constraint).
  const difficulties = await runStage(STAGE_TAGS.intrinsicDifficulty, () =>
    input.difficulty.score({ nodes: difficultyNodes, prerequisiteEdges: reducedEdges })
  );

  const layer: DerivedGraphLayer = {
    enrichmentId: input.enrichmentId,
    graphVersionId: input.graphVersionId,
    enrichmentConfigHash: config.enrichmentConfigHash,
    judgeModel: input.prerequisiteOrdering.model,
    derivedNodes: allNodes,
    prerequisiteEdges,
    difficulties
  };

  const trace: EnrichmentRunTrace = {
    enrichmentId: input.enrichmentId,
    graphVersionId: input.graphVersionId,
    enrichmentConfigHash: config.enrichmentConfigHash,
    derivedNodes: allNodes,
    orderings: orderingTraces,
    nodeExclusions,
    dispositions: [
      ...uncertainEdges.map((edge) => disposition(edge, "uncertain")),
      ...weakEdges.map((edge) => disposition(edge, "weak_cut")),
      ...transitiveEdges.map((edge) => disposition(edge, "transitive_reduction")),
      ...reducedEdges.map((edge) => disposition(edge, "kept"))
    ],
    groundingDispositions,
    rescueDispositions,
    rescuedDefinitionDispositions,
    mintingDispositions,
    nodeMerges
  };
  await runStage(NON_LLM_STAGES.persist, () =>
    input.enrichmentStore.persist({
      layer,
      artifact: {
        artifactId: `${input.enrichmentId}:enrichment-run`,
        artifactType: "enrichment_run",
        graphVersionId: input.graphVersionId,
        producer: PRODUCER,
        producerVersion: PRODUCER_VERSION,
        configHash: config.enrichmentConfigHash,
        createdAt: new Date().toISOString(),
        payload: trace
      }
    })
  );
  await reporter.completeOperation({ operationType: "enrichment", operationId, status: "succeeded" });
  return layer;
  });
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

// A node carries evidence to ground a judgment when it has at least one definition or
// mention quote (R11). The bare label is never the evidence — an evidence-free node is
// excluded from the ordering input and recorded once (R4).
const hasEvidence = (context: PrerequisiteConceptContext): boolean =>
  context.definitions.length > 0 || context.mentions.length > 0;

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

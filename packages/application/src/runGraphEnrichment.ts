import type {
  AnchorProjectionNode,
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
  PrerequisiteOrderingTrace,
  PublishedConceptEvidenceProfile,
  RescueDisposition,
  WholeSetOrdering
} from "@lrnki/domain-core";
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
  GraphVersionStorePort
} from "@lrnki/ports";
import { createHash, randomUUID } from "node:crypto";
import { deduplicateDerivedNodes, DEFAULT_DEDUP_CONFIG, type DedupConfig, type DedupNodeContext } from "./deduplicateDerivedNodes";
import { assembleEnrichmentNodes, DEFAULT_MINTING_BOUNDS, type EnrichmentMintingBounds, type MintingAnchor } from "./enrichmentNodeMinting";
import { cutWeakEdges, findCycleEdges, transitiveReduction } from "./prerequisiteDag";
import { applyVerbatimFloorByGrounding } from "./verbatimFloorByGrounding";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.8.0";

export type GraphEnrichmentConfig = {
  // Part of enrichment identity (ADR-0019): changing a knob re-derives the layer.
  enrichmentConfigHash: string;
  // Weak-edge cut floor applied to the certain edges before transitive reduction.
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
  // Bumped from `minting-durability-v1` because whole-set ordering replaces per-pair /
  // per-node-batched judging, re-deriving the prerequisite DAG.
  enrichmentConfigHash: "whole-set-ordering-v1",
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
// node set is grouped by Declared Domain (ADR-0015), and each domain is ordered in ONE
// whole-set call that returns a directed prerequisite DAG over ALL its evidenced nodes —
// globally self-consistent by construction (KTD2). The application boundary owns every
// PROVABLE guarantee (rules 16/19): it maps edge labels → ids fail-closed (KTD3, R9),
// verifies acyclicity, issues AT MOST ONE corrective re-prompt naming a stubborn cycle
// (R10), and routes any still-cyclic edges WHOLESALE to `uncertain` (kept + flagged +
// path-excluded, never dropped — R11/KTD4). The symbolic helpers then dispose over the
// CERTAIN edges (weak-edge cut -> transitive reduction); intrinsic difficulty scores ALL
// derived nodes from the same evidence contexts. The asserted core is never touched (R5):
// no enrichment node is ever published. Node minting + rescue are OPT-IN — when the
// proposal/grounding ports are omitted the run is anchor-only. Fails the run WITHOUT
// persistence if any ordering call exhausts the forced-tool retry budget, if an edge
// cites a label outside the judged set (rule 6), or if a domain blows the token budget
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
  let mintingDispositions: MintingDisposition[] = [];
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
        mintingDurabilityJudge: input.mintingDurabilityJudge,
        bounds: config.mintingBounds,
        newNodeId
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

  // Step 2 — ONE whole-set ordering call per domain (neural proposes the directed DAG),
  // then the deterministic envelope (rules 16/19). Domains are processed in sorted order,
  // and each domain's nodes are sorted by stable id, so the persisted trace + edge order
  // is replay-deterministic. For each domain: token-budget guard (R16), order, map labels
  // → ids fail-closed (R9), verify acyclicity, issue at most one corrective re-prompt
  // (R10), route still-cyclic edges wholesale to `uncertain` (R11).
  const orderingTraces: PrerequisiteOrderingTrace[] = [];
  const certainEdges: InferredPrerequisiteEdge[] = [];
  const uncertainEdges: InferredPrerequisiteEdge[] = [];
  await timeStage("enrichment:ordering", async () => {
    for (const [declaredDomain, members] of [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const sorted = [...members].sort((a, b) => a.derivedNodeId.localeCompare(b.derivedNodeId));
      // A singleton (or empty) domain has no possible relation: no ordering call, empty trace.
      if (sorted.length < 2) {
        orderingTraces.push({ declaredDomain, judgeModel: input.prerequisiteOrdering.model, nodeCount: sorted.length, assertedEdges: [], reprompted: false, cycleRoutedEdges: [] });
        continue;
      }
      const contexts = sorted.map((node) => node.context);

      // KTD6/R16 token-budget guard: a coarse char proxy for the assembled prompt; fail
      // closed (no partial layer) when one domain would blow the budget. No chunking.
      const promptChars = estimatePromptChars(declaredDomain, contexts);
      if (promptChars > config.maxDomainPromptChars) {
        throw new Error(`runGraphEnrichment: domain "${declaredDomain}" assembled ordering prompt (~${promptChars} chars) exceeds the budget (${config.maxDomainPromptChars}); failing closed without a partial layer (R16).`);
      }

      // Canonical labels are unique within a domain after dedup (KTD3), so label → id is
      // well-defined. Matching is case-insensitive + trimmed; an edge endpoint matching no
      // node, or naming one concept as its own prerequisite, is rejected fail-closed (rule 6).
      const idByLabel = new Map<string, string>(sorted.map((node) => [normalizeLabel(node.context.canonicalLabel), node.derivedNodeId]));
      const mapOrdering = (ordering: WholeSetOrdering): InferredPrerequisiteEdge[] =>
        ordering.edges.map((edge) => {
          const prerequisiteDerivedNodeId = idByLabel.get(normalizeLabel(edge.prerequisiteLabel));
          const dependentDerivedNodeId = idByLabel.get(normalizeLabel(edge.dependentLabel));
          if (!prerequisiteDerivedNodeId || !dependentDerivedNodeId) {
            throw new Error(`runGraphEnrichment: ordering edge cites a label not in domain "${declaredDomain}" ("${edge.prerequisiteLabel}" → "${edge.dependentLabel}"); failing closed (rule 6).`);
          }
          if (prerequisiteDerivedNodeId === dependentDerivedNodeId) {
            throw new Error(`runGraphEnrichment: ordering edge names one concept as its own prerequisite in domain "${declaredDomain}" ("${edge.prerequisiteLabel}"); failing closed (rule 6).`);
          }
          return { prerequisiteDerivedNodeId, dependentDerivedNodeId, predicate: "inferred-prerequisite-of" as const, confidence: edge.confidence, uncertain: false, provenance: { judgmentRationale: edge.rationale } };
        });

      let edges = mapOrdering(await input.prerequisiteOrdering.order({ declaredDomain, nodes: contexts }));
      let reprompted = false;
      const cycleRoutedEdges: { prerequisiteDerivedNodeId: string; dependentDerivedNodeId: string }[] = [];

      // Acyclicity envelope: at most ONE corrective re-prompt naming the first cycle (R10).
      const firstCycle = findCycleEdges(edges);
      if (firstCycle) {
        reprompted = true;
        edges = mapOrdering(await input.prerequisiteOrdering.order({ declaredDomain, nodes: contexts, correction: { cyclePath: cyclePathLabels(firstCycle, sorted) } }));
        // Route any STILL-cyclic edges wholesale to `uncertain` (kept + flagged, never
        // dropped — R11/KTD4). Iterate so the CERTAIN set is provably acyclic for the DAG:
        // each surviving cycle's edges flip to uncertain until none remain.
        for (;;) {
          const cycle = findCycleEdges(edges.filter((edge) => !edge.uncertain));
          if (!cycle) break;
          const cycleKeys = new Set(cycle.map(edgeId));
          edges = edges.map((edge) => (cycleKeys.has(edgeId(edge)) ? { ...edge, uncertain: true } : edge));
          for (const edge of cycle) cycleRoutedEdges.push({ prerequisiteDerivedNodeId: edge.prerequisiteDerivedNodeId, dependentDerivedNodeId: edge.dependentDerivedNodeId });
        }
      }

      for (const edge of edges) (edge.uncertain ? uncertainEdges : certainEdges).push(edge);
      orderingTraces.push({
        declaredDomain,
        judgeModel: input.prerequisiteOrdering.model,
        nodeCount: sorted.length,
        assertedEdges: edges.map((edge) => ({ prerequisiteDerivedNodeId: edge.prerequisiteDerivedNodeId, dependentDerivedNodeId: edge.dependentDerivedNodeId, confidence: edge.confidence, rationale: edge.provenance.judgmentRationale })),
        reprompted,
        cycleRoutedEdges
      });
    }
  });

  // Step 3 — symbolic disposal over CERTAIN edges only (symbolic constrains). Pure and
  // fast, but bracketed so its share of the run is visible in the timing split (U2). No
  // cycle removal here — acyclicity is already enforced upstream by cycle-routing (KTD4).
  const disposal = await timeStage("enrichment:symbolic-disposal", async () => {
    const { kept: strongEdges, cut: weakEdges } = cutWeakEdges(certainEdges, config.minEdgeConfidence);
    const { edges: reducedEdges, removed: transitiveEdges } = transitiveReduction(strongEdges);
    return { weakEdges, reducedEdges, transitiveEdges };
  });
  const { weakEdges, reducedEdges, transitiveEdges } = disposal;
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
    mintingDispositions,
    nodeMerges
  };
  await input.enrichmentStore.persist({
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

// A node carries evidence to ground a judgment when it has at least one definition or
// mention quote (R11). The bare label is never the evidence — an evidence-free node is
// excluded from the ordering input and recorded once (R4).
const hasEvidence = (context: PrerequisiteConceptContext): boolean =>
  context.definitions.length > 0 || context.mentions.length > 0;

// Canonical-label matching for the edge label → id mapping (KTD3): trimmed,
// case-insensitive. Labels are unique within a Declared Domain after dedup, so this is
// well-defined; an unmatched edge endpoint fails closed in the boundary (rule 6).
const normalizeLabel = (label: string): string => label.trim().toLowerCase();

// Stable directed-edge key for cycle-routing set membership.
const edgeId = (edge: Pick<InferredPrerequisiteEdge, "prerequisiteDerivedNodeId" | "dependentDerivedNodeId">): string =>
  `${edge.prerequisiteDerivedNodeId}->${edge.dependentDerivedNodeId}`;

// Coarse char proxy for the assembled whole-set ordering prompt of one domain (KTD6,
// R16). Not a tokenizer — a deterministic upper-bound-ish estimate over the rendered node
// evidence; the fail-LOUD budget guard is the contract, the exact threshold is tuned in U7.
function estimatePromptChars(declaredDomain: string, contexts: PrerequisiteConceptContext[]): number {
  let chars = declaredDomain.length;
  for (const context of contexts) {
    chars += context.canonicalLabel.length;
    for (const alias of context.aliases) chars += alias.length;
    for (const definition of context.definitions) chars += definition.length;
    for (const mention of context.mentions) chars += mention.length;
    for (const assertion of context.assertions) chars += assertion.type.length + assertion.detail.length;
  }
  return chars;
}

// Render one cycle (ordered edge list `a→b→…→x→a` from findCycleEdges) as a canonical-
// label path for the corrective re-prompt (R10). Ids fall back to themselves if a label
// is somehow missing, so the re-prompt is always framed even on a defensive edge case.
function cyclePathLabels(
  cycle: InferredPrerequisiteEdge[],
  nodes: { derivedNodeId: string; context: PrerequisiteConceptContext }[]
): string[] {
  const labelById = new Map(nodes.map((node) => [node.derivedNodeId, node.context.canonicalLabel]));
  const path = [labelById.get(cycle[0].prerequisiteDerivedNodeId) ?? cycle[0].prerequisiteDerivedNodeId];
  for (const edge of cycle) path.push(labelById.get(edge.dependentDerivedNodeId) ?? edge.dependentDerivedNodeId);
  return path;
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

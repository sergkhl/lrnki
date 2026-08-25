import type {
  AnchorProjectionNode,
  DefinitionPassageDisposition,
  DerivedGraphLayer,
  DerivedGraphNode,
  EnrichmentNode,
  GroundingAdmissionDisposition,
  GroundingVerbatimDisposition,
  MintingDisposition,
  NodeMergeRecord,
  RescueDisposition
} from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type {
  DifficultyPort,
  EnrichmentRunStorePort,
  MintingDurabilityJudgmentPort,
  MissingPrerequisiteProposalPort,
  NodeEmbeddingPort,
  NodeMergeAdjudicationPort,
  PrerequisiteOrderingPort,
  RescueDurabilityJudgmentPort,
  RescuedNodeLabelingPort,
  DefinitionPassageQualityJudgmentPort,
  RunProgressReporterPort,
  GraphVersionStorePort
} from "@lrnki/ports";
import { createHash, randomUUID } from "node:crypto";
import { noopRunProgressReporter, runInstrumentedOperation } from "./runProgressReporter";
import {
  createDerivedGraphLayerCompletion,
  DEFAULT_DERIVED_GRAPH_COMPLETION_CONFIG,
  derivedNodeJudgmentContext,
  type DerivedGraphCompletionConfig
} from "./completeDerivedGraphLayer";
import { deduplicateDerivedNodes, DEFAULT_DEDUP_CONFIG, type DedupConfig, type DedupNodeContext } from "./deduplicateDerivedNodes";
import { assembleEnrichmentNodes, DEFAULT_MINTING_BOUNDS, type EnrichmentMintingBounds, type MintingAnchor } from "./enrichmentNodeMinting";
import { applyVerbatimFloorByGrounding } from "./verbatimFloorByGrounding";
import { applyRescuedDefinitionQualityJudge } from "./applyRescuedDefinitionQualityJudge";
import {
  DEFAULT_SOURCE_LESS_GROUNDING_ADMISSION_POLICY,
  type SourceLessGroundingAdmission,
  type SourceLessGroundingAdmissionPolicy
} from "./sourceLessGroundingAdmission";

// The shared completion fields (config authority in completeDerivedGraphLayer.ts) plus
// Graph Enrichment's producer-specific knobs.
export type GraphEnrichmentConfig = DerivedGraphCompletionConfig & {
  // K for the comparative difficulty BANDING draws per Declared Domain (ADR-0024).
  // Band consensus needs fewer draws than per-edge direction votes: bands are 5
  // coarse buckets, not O(n²) directed decisions. Consumed at composition time —
  // the wired DifficultyPort is created with this knob.
  difficultySampleCount: number;
  // Bounds on the anchor-driven node-minting pass (KTD6, R7).
  mintingBounds: EnrichmentMintingBounds;
  // The complete policy used by the structurally paired prerequisite-admission dependency.
  // Shared with Synthetic Topic Generation; execution-only widths are removed by the hash owner.
  sourceLessGroundingAdmission: SourceLessGroundingAdmissionPolicy;
  // Semantic-dedup knobs (plan U3). Only consulted when both dedup ports are provided;
  // tuned in the U7 rule-14 pass against the largest domain.
  dedup: DedupConfig;
};

export const DEFAULT_ENRICHMENT_CONFIG: GraphEnrichmentConfig = {
  // Load-bearing enrichment identity (ADR-0019): changing enrichment BEHAVIOR
  // re-derives the layer. Unversioned `kind` name, consistent with the abolished `.vN`
  // convention (KTD7) — comparative banded difficulty supersedes the fused pointwise
  // judge, which itself superseded single-draw whole-set ordering ("k-sample-ordering").
  enrichmentConfigHash: "banded-difficulty",
  ...DEFAULT_DERIVED_GRAPH_COMPLETION_CONFIG,
  difficultySampleCount: 5,
  mintingBounds: DEFAULT_MINTING_BOUNDS,
  sourceLessGroundingAdmission: DEFAULT_SOURCE_LESS_GROUNDING_ADMISSION_POLICY,
  dedup: DEFAULT_DEDUP_CONFIG
};

type GraphEnrichmentMintingDependencies =
  | {
      missingPrerequisiteProposal?: undefined;
      mintingDurabilityJudge?: undefined;
      sourceLessGroundingAdmission?: undefined;
    }
  | {
      missingPrerequisiteProposal: MissingPrerequisiteProposalPort;
      mintingDurabilityJudge: MintingDurabilityJudgmentPort;
      sourceLessGroundingAdmission: SourceLessGroundingAdmission;
    };

// Graph Enrichment — the third operation, generalized to NODE + EDGE derivation
// (ADR-0019, amended for whole-set ordering — plan U4). The asserted snapshot supplies
// anchors; enrichment additionally RESCUES `source_mentioned` nodes from the member runs'
// non-core mentions and MINTS `llm_grounded` nodes via an explicit anchor-driven proposal
// pass, so a sparse source still yields a usable learner path. The deduplicated derived
// Source-mentioned rescue is independent from LLM-grounded minting so the learner-knowledge
// policy can retain cited prerequisites without invoking any source-less producer. The node set
// is grouped by Declared Domain (ADR-0015), and each domain is ordered by
// K-SAMPLING the whole-set call: the boundary draws the directed-DAG ordering K times on
// the SAME input (bounded concurrency) and tallies a per-pair DIRECTIONAL VOTE, because MoE
// inference is non-deterministic and one draw is one sample from a distribution (ADR-0028,
// D1/D2). `deriveConsensusOrdering` owns the deterministic consensus envelope: ordinal
// endpoint resolution, per-pair tallying, direction-contest routing, weak-cut before cycle
// routing, and trace construction. The symbolic helpers then transitively reduce the
// CERTAIN edges; intrinsic difficulty scores ALL
// derived nodes from the same evidence contexts. The asserted core is never touched (R5):
// no enrichment node is ever published. Node minting + rescue are OPT-IN — when the
// paired proposal/durability/admission dependencies are omitted the run is anchor-only. Fails
// the run WITHOUT persistence if any ordering call exhausts the forced-tool retry budget, if an edge
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
  // Explicit production availability for source-backed rescue. When omitted, the legacy direct
  // application seam keeps rescue coupled to an enabled minting tuple for existing callers.
  sourceMentionedNodesAvailable?: boolean;
  // The proposal path is structurally paired with its durability judge and the finished
  // admission module below. Either all three dependencies are present or the operation is
  // anchor-only; direct grounding is not a Graph Enrichment dependency any more.
  // Optional measured rescue durability judge (U3). When provided, aggregated
  // `source_mentioned` rescue candidates are durability-judged against their
  // same-domain anchors before becoming derived nodes; omit it to leave rescue
  // unjudged (prior behavior).
  rescueDurabilityJudge?: RescueDurabilityJudgmentPort;
  // Optional measured Rescued-Node Canonical Labeling judge (TODO #1). When provided, each
  // KEPT durable rescued node is re-named to a concept-shaped label before it enters the
  // derived layer; omit it to leave rescued sentence-shaped labels as-is (prior behavior).
  rescuedNodeLabelingJudge?: RescuedNodeLabelingPort;
  // Optional rescue-seam Definition-Passage quality judge (plan 2026-06-26-001 U3). When
  // provided, the `definition`-typed grounding passages of verbatim-floored
  // `source_mentioned` nodes are meaning-judged before they become learner-facing study
  // items; non-defining passages leave the definition role (wrong-subject evidence stays
  // as a mention; structural hollows drop), failing
  // CLOSED = preserve on judge-unavailable. Omit it to leave rescued definitions unjudged
  // (prior behavior). Same `kg-independent-judge` meaning judge as the extraction-time core
  // gate — no new alias.
  rescuedDefinitionQualityJudge?: DefinitionPassageQualityJudgmentPort;
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
} & GraphEnrichmentMintingDependencies): Promise<DerivedGraphLayer> {
  const mintingDependencyCount = [
    input.missingPrerequisiteProposal,
    input.mintingDurabilityJudge,
    input.sourceLessGroundingAdmission
  ].filter(Boolean).length;
  if (mintingDependencyCount !== 0 && mintingDependencyCount !== 3) {
    throw new Error("runGraphEnrichment requires prerequisite proposal, minting durability, and Source-less Grounding Admission together.");
  }
  const mintingEnabled = mintingDependencyCount === 3;
  const sourceMentionedNodesAvailable = input.sourceMentionedNodesAvailable ?? mintingEnabled;
  const config = input.config ?? DEFAULT_ENRICHMENT_CONFIG;
  const reporter = input.reporter ?? noopRunProgressReporter;
  const operationId = input.enrichmentId;
  return runInstrumentedOperation(reporter, "enrichment", operationId, async (runStage) => {
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
    let groundingAdmissionDispositions: GroundingAdmissionDisposition[] = [];
    if (sourceMentionedNodesAvailable || mintingEnabled) {
      // No coarse `rescue-mint` bracket: assembleEnrichmentNodes brackets each inner LLM
      // call onto its fine STAGE_TAGS name (U1), so wall-clock joins the cost the calls
      // already self-tag. The surrounding candidate fetch + verbatim floor are deterministic
      // and LLM-free — they need no stage row (they carry no spend to join).
      const rescueCandidates = sourceMentionedNodesAvailable
        ? await input.enrichmentStore.nonCoreRescueCandidates(input.graphVersionId)
        : [];
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
        rescueDurabilityJudge: input.rescueDurabilityJudge,
        rescuedNodeLabelingJudge: input.rescuedNodeLabelingJudge,
        bounds: config.mintingBounds,
        newNodeId,
        stage: runStage,
        ...(mintingEnabled
          ? {
              proposalPort: input.missingPrerequisiteProposal!,
              sourceLessGroundingAdmission: input.sourceLessGroundingAdmission!,
              mintingDurabilityJudge: input.mintingDurabilityJudge!
            }
          : {})
      } as Parameters<typeof assembleEnrichmentNodes>[0]);
      rescueDispositions = assembled.rescueDispositions;
      mintingDispositions = assembled.mintingDispositions;
      groundingAdmissionDispositions = assembled.groundingAdmissionDispositions;
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
          const context = derivedNodeJudgmentContext(node, profileByConcept, config.maxMentionsPerConceptInPair);
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

    // The shared Derived Graph Layer completion owns the back half from here (plan
    // 2026-07-11-001, KTD1/KTD2): judgment contexts, evidence-free exclusions, K-sampled
    // consensus ordering, transitive reduction, intrinsic difficulty, common trace
    // dispositions, structural validation, and the single atomic persistence — bracketed
    // onto THIS operation's timeline via runStage (KTD6).
    const completion = createDerivedGraphLayerCompletion({
      prerequisiteOrdering: input.prerequisiteOrdering,
      difficulty: input.difficulty,
      enrichmentStore: input.enrichmentStore
    });
    return completion.complete({
      enrichmentId: input.enrichmentId,
      nodes: allNodes,
      config,
      stage: runStage,
      contribution: {
        kind: "source_grounded",
        graphVersionId: input.graphVersionId,
        evidenceProfiles: snapshot.evidenceProfiles,
        absorbedGroundingByCanonical,
        groundingDispositions,
        rescueDispositions,
        rescuedDefinitionDispositions,
        mintingDispositions,
        groundingAdmissionDispositions,
        nodeMerges,
        onOrderingSummary: input.onOrderingSummary
      }
    });
  });
}

// --- Deterministic, model-free helpers -----------------------------------------

function deterministicUuid(...parts: string[]): string {
  const hash = createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 32).split("");
  hash[12] = "4";
  hash[16] = (8 + (Number.parseInt(hash[16], 16) % 4)).toString(16);
  return `${hash.slice(0, 8).join("")}-${hash.slice(8, 12).join("")}-${hash.slice(12, 16).join("")}-${hash.slice(16, 20).join("")}-${hash.slice(20, 32).join("")}`;
}

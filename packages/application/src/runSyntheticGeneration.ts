import type {
  DerivedGraphLayer,
  DerivedGraphNode,
  DifficultyNodeContext,
  EnrichmentRunTrace,
  GroundingVerbatimDisposition,
  LlmGroundedEnrichmentNode,
  PrerequisiteConceptContext,
  SynthesizedConcept,
  SyntheticProbeDisposition
} from "@lrnki/domain-core";
import { normalizeConceptLabel, STAGE_TAGS } from "@lrnki/domain-core";
import { runWithOperationTag } from "@lrnki/domain-core/operation-tag-context";
import type {
  ConceptSetSynthesisPort,
  DifficultyPort,
  EnrichmentRunStorePort,
  GroundingGenerationPort,
  KnowledgeBoundaryProbePort,
  NodeEmbeddingPort,
  PrerequisiteOrderingPort,
  RunProgressReporterPort
} from "@lrnki/ports";
import { randomUUID } from "node:crypto";
import { bracketStage, NON_LLM_STAGES, noopRunProgressReporter } from "./runProgressReporter";
import { deriveConsensusOrdering } from "./deriveConsensusOrdering";
import { transitiveReduction } from "./prerequisiteDag";
import { applyVerbatimFloorByGrounding } from "./verbatimFloorByGrounding";
import { mapWithConcurrency } from "./mapWithConcurrency";
import {
  DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG,
  probeKnowledgeBoundary,
  type KnowledgeBoundaryProbeConfig
} from "./knowledgeBoundaryProbe";

const PRODUCER = "@lrnki/application";
const PRODUCER_VERSION = "0.8.0";

export type SyntheticGenerationConfig = {
  // Part of the derived-layer identity, like enrichmentConfigHash for Graph Enrichment.
  enrichmentConfigHash: string;
  // The knowledge-boundary probe knobs (K, per-concept draw concurrency, agreement
  // threshold). Calibrated by real-use inspection in U8, never assumed (ADR-0013).
  probe: KnowledgeBoundaryProbeConfig;
  // Bounded fan-out ACROSS concepts for the probe stage (each concept itself fans K
  // draws inside probeKnowledgeBoundary) and for the grounding stage.
  conceptConcurrency: number;
  // Ordering knobs — reused from Graph Enrichment (deriveConsensusOrdering). Synthetic
  // sets are small and single-domain, so the ordering budget is generous.
  orderingSampleCount: number;
  directionContestMinorityFraction: number;
  minEdgeConfidence: number;
  maxDomainPromptChars: number;
  // Deterministic cap on mention passages fed per node into the ordering prompt.
  maxMentionsPerConceptInPair: number;
};

export const DEFAULT_SYNTHETIC_GENERATION_CONFIG: SyntheticGenerationConfig = {
  enrichmentConfigHash: "synthetic-topic-generation",
  probe: DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG,
  conceptConcurrency: 4,
  // Reuse the calibrated Graph Enrichment ordering defaults (K=8 gpt-oss-120b draws).
  orderingSampleCount: 8,
  directionContestMinorityFraction: 0.1,
  minEdgeConfidence: 0.5,
  maxDomainPromptChars: 400000,
  maxMentionsPerConceptInPair: 6
};

// Synthetic topic generation — the SECOND pipeline arm (ADR-0019 amended, plan
// 2026-06-30-001). A sibling to runGraphEnrichment with a different SOURCE-LESS front half
// (synthesize → probe → ground) that assembles the same DerivedGraphLayer artifact, then
// hands off to the identical reused back half (ordering, difficulty). The asserted graph
// is never touched and no graph version is read: the layer's `graphVersionId` is NULL
// (KTD2, R4). Every trusted node is an `llm_grounded` `synthetic_primary` node with a
// generated Grounding Bundle recording `not_applicable_by_grounding` — no node claims
// source-verbatim provenance (R3, AE3).
//
// A concept the knowledge-boundary probe scores `boundary` is held out of the trusted
// surface as an `uncertain` disposition: retained in the run trace, inspectable, never a
// node (R8, AE2). The future `web_grounded` retrieval branch replaces this boundary route
// at the same seam (KTD5, R12) — it would ground the boundary concept via retrieval
// instead of dropping it. Fails the operation WITHOUT persistence if any stage exhausts
// its forced-tool budget or a domain blows the ordering token budget (no partial layer).
export async function runSyntheticGeneration(input: {
  enrichmentId: string;
  topic: string;
  declaredDomain: string;
  conceptSetSynthesis: ConceptSetSynthesisPort;
  knowledgeBoundaryProbe: KnowledgeBoundaryProbePort;
  embedding: NodeEmbeddingPort;
  groundingGeneration: GroundingGenerationPort;
  prerequisiteOrdering: PrerequisiteOrderingPort;
  difficulty: DifficultyPort;
  enrichmentStore: EnrichmentRunStorePort;
  config?: SyntheticGenerationConfig;
  reporter?: RunProgressReporterPort;
  // Optional operator-visibility hook: counts of core/boundary concepts and derived edges.
  onSummary?: (summary: { concepts: number; core: number; boundary: number; nodes: number; committedEdges: number; uncertainEdges: number }) => void;
  newNodeId?: () => string;
}): Promise<DerivedGraphLayer> {
  const config = input.config ?? DEFAULT_SYNTHETIC_GENERATION_CONFIG;
  const reporter = input.reporter ?? noopRunProgressReporter;
  const operationId = input.enrichmentId;
  const declaredDomain = input.declaredDomain;
  const newNodeId = input.newNodeId ?? randomUUID;

  return runWithOperationTag(operationId, async () => {
    // The synthetic operation persists a DerivedGraphLayer through the enrichment store, so
    // its timeline rides the `enrichment` operation type; its own fine STAGE_TAGS
    // (concept-set-synthesis, knowledge-boundary-probe, grounding-generation, ...) keep the
    // cost split separable in spend (ADR-0029). A thrown stage leaves a readable failed
    // timeline and never persists a partial layer.
    const runStage = bracketStage(reporter, "enrichment", operationId);
    await reporter.beginOperation({ operationType: "enrichment", operationId });

    // Stage 1 — synthesize the concept set from topic + Declared Domain alone (R1, R2).
    const synthesized = await runStage(STAGE_TAGS.conceptSetSynthesis, () =>
      input.conceptSetSynthesis.synthesize({ topic: input.topic, declaredDomain })
    );
    // Deterministic, deduplicated concept order: drop empty/duplicate normalized labels so
    // two synthesized surface forms never mint two nodes for one concept.
    const concepts = dedupeConcepts(synthesized);

    // Stage 2 — knowledge-boundary probe per concept (R6, R7). Each concept fans K draws
    // inside probeKnowledgeBoundary; concepts fan out with bounded concurrency.
    const verdicts = await runStage(STAGE_TAGS.knowledgeBoundaryProbe, () =>
      mapWithConcurrency(concepts, config.conceptConcurrency, (concept) =>
        probeKnowledgeBoundary({
          conceptLabel: concept.canonicalLabel,
          declaredDomain,
          probe: input.knowledgeBoundaryProbe,
          embedding: input.embedding,
          config: config.probe
        }).then((verdict) => ({ concept, verdict }))
      ), concepts.length
    );

    // Stage 3 — for each `core_knowledge` concept generate a Grounding Bundle and assemble a
    // `synthetic_primary` `llm_grounded` node (AE1); a `boundary` concept is recorded as an
    // uncertain disposition and NEVER becomes a node (AE2, KTD5). Grounding is anchor-less:
    // scaffoldedAnchors is empty and the topic carries the context (KTD3).
    const coreVerdicts = verdicts.filter((entry) => entry.verdict.disposition === "core_knowledge");
    const coreNodeIdByConceptKey = new Map<string, string>(
      coreVerdicts.map((entry) => [entry.concept.conceptKey, newNodeId()] as const)
    );
    const groundedNodes = await runStage(STAGE_TAGS.groundingGeneration, () =>
      mapWithConcurrency(coreVerdicts, config.conceptConcurrency, async (entry): Promise<LlmGroundedEnrichmentNode> => {
        const derivedNodeId = coreNodeIdByConceptKey.get(entry.concept.conceptKey)!;
        const groundingBundle = await input.groundingGeneration.generate({
          derivedNodeId,
          declaredDomain,
          nodeLabel: entry.concept.canonicalLabel,
          scaffoldedAnchors: [],
          topic: input.topic
        });
        return {
          nodeKind: "enrichment",
          derivedNodeId,
          groundingOrigin: "llm_grounded",
          // No mintingReason: a synthetic_primary node is a first-class topic concept, not a
          // prerequisite minted to fill a source gap (KTD3).
          role: "synthetic_primary",
          layer: "derived",
          canonicalLabel: entry.concept.canonicalLabel,
          normalizedLabel: normalizeConceptLabel(entry.concept.canonicalLabel),
          declaredDomain,
          aliases: entry.concept.aliases,
          groundingBundle
        };
      })
    );

    // Verbatim floor by grounding: every synthetic node is `llm_grounded`, so the floor
    // exempts it and RECORDS the `not_applicable_by_grounding` disposition — never silent
    // (R3, AE3). No source blocks exist, so blockTextById is empty.
    const floored = applyVerbatimFloorByGrounding({ nodes: groundedNodes, blockTextById: new Map() });
    const derivedNodes: DerivedGraphNode[] = floored.nodes;
    const groundingDispositions: GroundingVerbatimDisposition[] = floored.dispositions;

    // The probe trace records BOTH branches for inspection (R8): core concepts carry their
    // node id; boundary concepts carry null (uncertain disposition, held out).
    const syntheticProbeDispositions: SyntheticProbeDisposition[] = verdicts.map((entry) => ({
      conceptKey: entry.concept.conceptKey,
      canonicalLabel: entry.concept.canonicalLabel,
      declaredDomain,
      disposition: entry.verdict.disposition,
      agreementScore: entry.verdict.agreementScore,
      rationale: entry.verdict.rationale,
      derivedNodeId: entry.verdict.disposition === "core_knowledge"
        ? coreNodeIdByConceptKey.get(entry.concept.conceptKey) ?? null
        : null
    }));

    // Stage 4 — prerequisite ordering over the assembled trusted node set (R5). Reuses the
    // K-sampled consensus envelope; a synthetic layer is single-domain by construction.
    const orderingContexts: PrerequisiteConceptContext[] = derivedNodes.map((node) => contextOf(node, config.maxMentionsPerConceptInPair));
    const {
      orderings: orderingTraces,
      certainEdges,
      uncertainEdges,
      weakEdges
    } = await runStage(STAGE_TAGS.prerequisiteOrdering, () =>
      deriveConsensusOrdering({
        domains: orderingContexts.length > 0 ? [{ declaredDomain, nodes: orderingContexts }] : [],
        prerequisiteOrdering: input.prerequisiteOrdering,
        orderingSampleCount: config.orderingSampleCount,
        directionContestMinorityFraction: config.directionContestMinorityFraction,
        minEdgeConfidence: config.minEdgeConfidence,
        maxDomainPromptChars: config.maxDomainPromptChars
      })
    );

    const { reducedEdges, transitiveEdges } = await runStage(NON_LLM_STAGES.symbolicDisposal, async () => {
      const { edges, removed } = transitiveReduction(certainEdges);
      return { reducedEdges: edges, transitiveEdges: removed };
    });
    const prerequisiteEdges = [...reducedEdges, ...uncertainEdges];

    // Stage 5 — intrinsic difficulty over every synthetic node (R5), from the same grounding
    // contexts the ordering used.
    const difficultyNodes: DifficultyNodeContext[] = derivedNodes.map((node) => {
      const context = contextOf(node, config.maxMentionsPerConceptInPair);
      return {
        derivedNodeId: node.derivedNodeId,
        canonicalLabel: context.canonicalLabel,
        aliases: context.aliases,
        declaredDomain,
        groundingOrigin: node.groundingOrigin,
        definitions: context.definitions,
        mentions: context.mentions
      };
    });
    const difficulties = await runStage(STAGE_TAGS.intrinsicDifficulty, () =>
      input.difficulty.score({ nodes: difficultyNodes, prerequisiteEdges: reducedEdges })
    );

    input.onSummary?.({
      concepts: concepts.length,
      core: coreVerdicts.length,
      boundary: verdicts.length - coreVerdicts.length,
      nodes: derivedNodes.length,
      committedEdges: reducedEdges.length,
      uncertainEdges: uncertainEdges.length
    });

    const layer: DerivedGraphLayer = {
      enrichmentId: input.enrichmentId,
      graphVersionId: null,
      enrichmentConfigHash: config.enrichmentConfigHash,
      judgeModel: input.prerequisiteOrdering.model,
      derivedNodes,
      prerequisiteEdges,
      difficulties
    };

    const trace: EnrichmentRunTrace = {
      enrichmentId: input.enrichmentId,
      graphVersionId: null,
      enrichmentConfigHash: config.enrichmentConfigHash,
      derivedNodes,
      orderings: orderingTraces,
      nodeExclusions: [],
      dispositions: [
        ...uncertainEdges.map((edge) => ({ prerequisiteDerivedNodeId: edge.prerequisiteDerivedNodeId, dependentDerivedNodeId: edge.dependentDerivedNodeId, disposition: "uncertain" as const })),
        ...weakEdges.map((edge) => ({ prerequisiteDerivedNodeId: edge.prerequisiteDerivedNodeId, dependentDerivedNodeId: edge.dependentDerivedNodeId, disposition: "weak_cut" as const })),
        ...transitiveEdges.map((edge) => ({ prerequisiteDerivedNodeId: edge.prerequisiteDerivedNodeId, dependentDerivedNodeId: edge.dependentDerivedNodeId, disposition: "transitive_reduction" as const })),
        ...reducedEdges.map((edge) => ({ prerequisiteDerivedNodeId: edge.prerequisiteDerivedNodeId, dependentDerivedNodeId: edge.dependentDerivedNodeId, disposition: "kept" as const }))
      ],
      groundingDispositions,
      rescueDispositions: [],
      rescuedDefinitionDispositions: [],
      mintingDispositions: [],
      nodeMerges: [],
      syntheticProbeDispositions
    };

    await runStage(NON_LLM_STAGES.persist, () =>
      input.enrichmentStore.persist({
        layer,
        artifact: {
          artifactId: `${input.enrichmentId}:enrichment-run`,
          artifactType: "enrichment_run",
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

// Drop empty/duplicate normalized labels, preserving first-seen order, so two synthesized
// surface forms of one concept never mint two nodes.
function dedupeConcepts(concepts: SynthesizedConcept[]): SynthesizedConcept[] {
  const seen = new Set<string>();
  const kept: SynthesizedConcept[] = [];
  for (const concept of concepts) {
    const normalized = normalizeConceptLabel(concept.canonicalLabel);
    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    kept.push(concept);
  }
  return kept;
}

// Reduce a synthetic node to the ordering/difficulty context. Every synthetic node is
// `llm_grounded`, so its evidence is the generated bundle's definition/mention text (the
// bare label is never the evidence).
function contextOf(node: DerivedGraphNode, maxMentions: number): PrerequisiteConceptContext {
  if (node.nodeKind !== "enrichment" || node.groundingOrigin !== "llm_grounded") {
    // A synthetic layer holds only llm_grounded enrichment nodes; anything else is a
    // programming error upstream.
    return { derivedNodeId: node.derivedNodeId, canonicalLabel: node.canonicalLabel, aliases: node.aliases, definitions: [], mentions: [], assertions: [] };
  }
  return {
    derivedNodeId: node.derivedNodeId,
    canonicalLabel: node.canonicalLabel,
    aliases: node.aliases,
    definitions: node.groundingBundle.definitions.map((passage) => passage.text),
    mentions: node.groundingBundle.mentions.slice(0, maxMentions).map((passage) => passage.text),
    assertions: []
  };
}

import type {
  DerivedGraphLayer,
  DerivedGraphNode,
  GroundingVerbatimDisposition,
  LlmGroundedEnrichmentNode,
  SynthesizedConcept,
  SyntheticProbeDisposition
} from "@lrnki/domain-core";
import { normalizeConceptLabel, STAGE_TAGS } from "@lrnki/domain-core";
import type {
  ConceptSetSynthesisPort,
  DeclaredDomainInferencePort,
  DifficultyPort,
  EnrichmentRunStorePort,
  GroundingGenerationPort,
  KnowledgeBoundaryProbePort,
  NodeEmbeddingPort,
  PrerequisiteOrderingPort,
  RunProgressReporterPort
} from "@lrnki/ports";
import { randomUUID } from "node:crypto";
import { noopRunProgressReporter, runInstrumentedOperation } from "./runProgressReporter";
import {
  createDerivedGraphLayerCompletion,
  DEFAULT_DERIVED_GRAPH_COMPLETION_CONFIG,
  type DerivedGraphCompletionConfig
} from "./completeDerivedGraphLayer";
import { applyVerbatimFloorByGrounding } from "./verbatimFloorByGrounding";
import { mapWithConcurrency } from "./mapWithConcurrency";
import {
  DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG,
  probeKnowledgeBoundary,
  type KnowledgeBoundaryProbeConfig
} from "./knowledgeBoundaryProbe";

// The shared completion fields (config authority in completeDerivedGraphLayer.ts) plus
// the synthetic front half's producer-specific knobs. The flat runtime shape and field
// names are unchanged, so the operation's config-hash identity is stable (plan
// 2026-07-11-001 AE6).
export type SyntheticGenerationConfig = DerivedGraphCompletionConfig & {
  // The knowledge-boundary probe knobs (K, per-concept draw concurrency, agreement
  // threshold). Calibrated by real-use inspection in U8, never assumed (ADR-0013).
  probe: KnowledgeBoundaryProbeConfig;
  // Bounded fan-out ACROSS concepts for the probe stage (each concept itself fans K
  // draws inside probeKnowledgeBoundary) and for the grounding stage.
  conceptConcurrency: number;
};

export const DEFAULT_SYNTHETIC_GENERATION_CONFIG: SyntheticGenerationConfig = {
  enrichmentConfigHash: "synthetic-topic-generation",
  // The shared calibrated completion defaults (K=8 gpt-oss-120b ordering draws).
  // Synthetic sets are small and single-domain, so the ordering budget is generous.
  ...DEFAULT_DERIVED_GRAPH_COMPLETION_CONFIG,
  probe: DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG,
  conceptConcurrency: 4
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
  declaredDomain?: string | null;
  declaredDomainInference?: DeclaredDomainInferencePort;
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
  onDeclaredDomain?: (declaredDomain: string) => Promise<void>;
  newNodeId?: () => string;
}): Promise<DerivedGraphLayer> {
  const config = input.config ?? DEFAULT_SYNTHETIC_GENERATION_CONFIG;
  const reporter = input.reporter ?? noopRunProgressReporter;
  const operationId = input.enrichmentId;
  const newNodeId = input.newNodeId ?? randomUUID;

  return runInstrumentedOperation(reporter, "enrichment", operationId, async (runStage) => {
    // The synthetic operation persists a DerivedGraphLayer through the enrichment store, so
    // its timeline rides the `enrichment` operation type; its own fine STAGE_TAGS
    // (concept-set-synthesis, knowledge-boundary-probe, grounding-generation, ...) keep the
    // cost split separable in spend (ADR-0029).

    const declaredDomain = await resolveDeclaredDomain(input, runStage);

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

    // The shared Derived Graph Layer completion owns the back half from here (plan
    // 2026-07-11-001, KTD1/KTD2): judgment contexts from the generated bundles, K-sampled
    // consensus ordering (a synthetic layer is single-domain by construction), transitive
    // reduction, intrinsic difficulty, common trace dispositions, structural validation,
    // and the single atomic persistence — bracketed onto THIS operation's timeline via
    // runStage (KTD6). The combined summary hook keeps its post-difficulty,
    // pre-persistence position.
    const completion = createDerivedGraphLayerCompletion({
      prerequisiteOrdering: input.prerequisiteOrdering,
      difficulty: input.difficulty,
      enrichmentStore: input.enrichmentStore
    });
    return completion.complete({
      enrichmentId: input.enrichmentId,
      nodes: derivedNodes,
      config,
      stage: runStage,
      contribution: {
        kind: "synthetic",
        graphVersionId: null,
        groundingDispositions,
        syntheticProbeDispositions,
        frontHalfCounts: {
          concepts: concepts.length,
          core: coreVerdicts.length,
          boundary: verdicts.length - coreVerdicts.length
        },
        onSummary: input.onSummary
      }
    });
  });
}

async function resolveDeclaredDomain(
  input: {
    topic: string;
    declaredDomain?: string | null;
    declaredDomainInference?: DeclaredDomainInferencePort;
    onDeclaredDomain?: (declaredDomain: string) => Promise<void>;
  },
  runStage: (stage: string, fn: () => Promise<{ declaredDomain: string }>) => Promise<{ declaredDomain: string }>
): Promise<string> {
  const existing = input.declaredDomain?.trim();
  if (existing) return existing;
  if (!input.declaredDomainInference) {
    throw new Error("Declared Domain inference port is required when declaredDomain is missing.");
  }
  const inferred = await runStage(STAGE_TAGS.declaredDomainInference, () => input.declaredDomainInference!.infer({ topic: input.topic }));
  const declaredDomain = inferred.declaredDomain.trim();
  if (!declaredDomain) throw new Error("Declared Domain inference returned an empty domain.");
  await input.onDeclaredDomain?.(declaredDomain);
  return declaredDomain;
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


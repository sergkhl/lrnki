import type {
  DerivedGraphLayer,
  DerivedGraphNode,
  GroundingVerbatimDisposition,
  LlmGroundedEnrichmentNode,
  SynthesizedConcept,
  SyntheticProbeDisposition
} from "@lrnki/domain-core";
import { normalizeConceptLabel } from "@lrnki/domain-core";
import type {
  ConceptSetSynthesisPort,
  DeclaredDomainInferencePort,
  DifficultyPort,
  EnrichmentRunStorePort,
  PrerequisiteOrderingPort,
  RunProgressReporterPort
} from "@lrnki/ports";
import { randomUUID } from "node:crypto";
import {
  createDerivedGraphLayerCompletion,
  DEFAULT_DERIVED_GRAPH_COMPLETION_CONFIG,
  type DerivedGraphCompletionConfig
} from "./completeDerivedGraphLayer";
import {
  DEFAULT_SOURCE_LESS_GROUNDING_ADMISSION_POLICY,
  type GroundingAdmissionOutcome,
  type SourceLessGroundingAdmission,
  type SourceLessGroundingAdmissionPolicy
} from "./sourceLessGroundingAdmission";
import { noopRunProgressReporter, runInstrumentedOperation } from "./runProgressReporter";
import { applyVerbatimFloorByGrounding } from "./verbatimFloorByGrounding";
import { SYNTHETIC_GENERATION_STAGE_GROUP } from "./topicExpeditionStageProfile";

// The completion behavior plus the one canonical admission policy identity. The admission module
// binds and executes this policy; the operation config retains the same value so the immutable
// Derived Graph Layer hash identifies every behavioral decision that admitted its source-less
// grounding. Execution-only widths are removed mechanically by the infrastructure hash builder.
export type SyntheticGenerationConfig = DerivedGraphCompletionConfig & {
  sourceLessGroundingAdmission: SourceLessGroundingAdmissionPolicy;
};

export const DEFAULT_SYNTHETIC_GENERATION_CONFIG: SyntheticGenerationConfig = {
  enrichmentConfigHash: "synthetic-topic-generation",
  ...DEFAULT_DERIVED_GRAPH_COMPLETION_CONFIG,
  sourceLessGroundingAdmission: DEFAULT_SOURCE_LESS_GROUNDING_ADMISSION_POLICY
};

// Synthetic Topic Generation owns topic/domain resolution, concept identity, Derived Graph Layer
// assembly, completion, and persistence. Every source-less concept crosses one finished admission
// interface; probe, grounding, draft-blind claim verification, selective retries, and their neural
// dependencies are deliberately absent from this caller.
export async function runSyntheticGeneration(input: {
  enrichmentId: string;
  topic: string;
  declaredDomain?: string | null;
  declaredDomainInference?: DeclaredDomainInferencePort;
  conceptSetSynthesis: ConceptSetSynthesisPort;
  sourceLessGroundingAdmission: SourceLessGroundingAdmission;
  prerequisiteOrdering: PrerequisiteOrderingPort;
  difficulty: DifficultyPort;
  enrichmentStore: EnrichmentRunStorePort;
  config?: SyntheticGenerationConfig;
  reporter?: RunProgressReporterPort;
  onSummary?: (summary: {
    concepts: number;
    core: number;
    boundary: number;
    nodes: number;
    committedEdges: number;
    uncertainEdges: number;
  }) => void;
  onDeclaredDomain?: (declaredDomain: string) => Promise<void>;
  newNodeId?: () => string;
}): Promise<DerivedGraphLayer> {
  const config = input.config ?? DEFAULT_SYNTHETIC_GENERATION_CONFIG;
  const reporter = input.reporter ?? noopRunProgressReporter;
  const operationId = input.enrichmentId;
  const newNodeId = input.newNodeId ?? randomUUID;

  return runInstrumentedOperation(reporter, "enrichment", operationId, async (runStage) => {
    const declaredDomain = await resolveDeclaredDomain(input, runStage);

    const synthesized = await runStage(SYNTHETIC_GENERATION_STAGE_GROUP.conceptSetSynthesis.stage, () =>
      input.conceptSetSynthesis.synthesize({ topic: input.topic, declaredDomain })
    );
    const concepts = dedupeConcepts(synthesized);
    const outcomes = await input.sourceLessGroundingAdmission.forOperation(runStage).admitBatch(
      concepts.map((concept) => ({
        candidateKey: concept.conceptKey,
        canonicalLabel: concept.canonicalLabel,
        declaredDomain,
        context: { kind: "originating_topic", topic: input.topic }
      }))
    );
    assertOutcomeCorrelation(concepts, outcomes);

    const rejected = outcomes.filter((outcome) => outcome.disposition === "rejected");
    if (rejected.length > 0) {
      throw new Error(
        `Source-less Grounding Admission rejected Synthetic Topic Generation: ${rejected
          .map((outcome) => `${outcome.candidateKey}: ${outcome.rationale}`)
          .join("; ")}`
      );
    }

    const conceptByKey = new Map(concepts.map((concept) => [concept.conceptKey, concept] as const));
    const nodeIdByKey = new Map<string, string>();
    const groundedNodes: LlmGroundedEnrichmentNode[] = [];
    for (const outcome of outcomes) {
      if (outcome.disposition !== "admitted") continue;
      const concept = conceptByKey.get(outcome.candidateKey)!;
      const derivedNodeId = newNodeId();
      nodeIdByKey.set(outcome.candidateKey, derivedNodeId);
      groundedNodes.push({
        nodeKind: "enrichment",
        derivedNodeId,
        groundingOrigin: "llm_grounded",
        role: "synthetic_primary",
        layer: "derived",
        canonicalLabel: concept.canonicalLabel,
        normalizedLabel: normalizeConceptLabel(concept.canonicalLabel),
        declaredDomain,
        aliases: concept.aliases,
        groundingBundle: outcome.bundle
      });
    }

    const floored = applyVerbatimFloorByGrounding({ nodes: groundedNodes, blockTextById: new Map() });
    const derivedNodes: DerivedGraphNode[] = floored.nodes;
    const groundingDispositions: GroundingVerbatimDisposition[] = floored.dispositions;
    const syntheticProbeDispositions: SyntheticProbeDisposition[] = outcomes.map((outcome) => ({
      conceptKey: outcome.candidateKey,
      canonicalLabel: conceptByKey.get(outcome.candidateKey)!.canonicalLabel,
      declaredDomain,
      disposition: outcome.disposition === "admitted" ? "core_knowledge" : "boundary",
      agreementScore: outcome.probe.agreementScore,
      rationale: outcome.probe.rationale,
      derivedNodeId: outcome.disposition === "admitted" ? nodeIdByKey.get(outcome.candidateKey)! : null
    }));
    const admittedCount = groundedNodes.length;

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
          core: admittedCount,
          boundary: outcomes.length - admittedCount
        },
        onSummary: input.onSummary
      }
    });
  });
}

function assertOutcomeCorrelation(
  concepts: readonly SynthesizedConcept[],
  outcomes: readonly GroundingAdmissionOutcome[]
): void {
  if (outcomes.length !== concepts.length) {
    throw new Error(`Source-less Grounding Admission returned ${outcomes.length} outcomes for ${concepts.length} Synthetic candidates.`);
  }
  for (let index = 0; index < concepts.length; index += 1) {
    if (outcomes[index].candidateKey !== concepts[index].conceptKey) {
      throw new Error(`Source-less Grounding Admission perturbed Synthetic candidate order at index ${index}.`);
    }
  }
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
  const inferred = await runStage(SYNTHETIC_GENERATION_STAGE_GROUP.declaredDomainInference.stage, () =>
    input.declaredDomainInference!.infer({ topic: input.topic })
  );
  const declaredDomain = inferred.declaredDomain.trim();
  if (!declaredDomain) throw new Error("Declared Domain inference returned an empty domain.");
  await input.onDeclaredDomain?.(declaredDomain);
  return declaredDomain;
}

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

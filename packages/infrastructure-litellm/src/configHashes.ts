import type { GraphEnrichmentConfig, ScaffoldGenerationConfig, SyntheticGenerationConfig } from "@lrnki/application";
import { STAGE_TAGS, type StageTag } from "@lrnki/domain-core";
import type { OperationType } from "@lrnki/ports";
import { admissionDecisionsDescriptor, admissionLabelJudgmentDescriptor, conceptDiscoveryDescriptor, coreSelectionDescriptor, definitionEntailmentDescriptor, definitionPassageQualityDescriptor, evidenceProfileExtractionDescriptor } from "./extractionAdapters";
import { mintingDurabilityDescriptor, prerequisiteOrderingDescriptor, rescuedNodeLabelingDescriptor, rescueDurabilityDescriptor } from "./enrichmentAdapters";
import { nodeMergeAdjudicationDescriptor, NODE_EMBEDDING_MODEL } from "./dedupAdapters";
import { missingPrerequisiteProposalDescriptor } from "./missingPrerequisiteProposalAdapters";
import {
  claimFactualityChallengeDescriptor,
  claimFactualityJudgmentDescriptor,
  claimVerificationAnsweringDescriptor,
  claimVerificationQuestionPlanningDescriptor,
  groundingGenerationDescriptor,
} from "./groundingGenerationAdapters";
import { intrinsicDifficultyBandingDescriptor, intrinsicDifficultyComparisonDescriptor } from "./intrinsicDifficultyAdapters";
import { conceptSetSynthesisDescriptor, knowledgeBoundaryProbeDescriptor } from "./syntheticGenerationAdapters";
import { declaredDomainInferenceDescriptor } from "./domainInferenceAdapters";
import { conceptLessonGenerationDescriptor } from "./conceptLessonGenerationAdapters";
import { layerPurposeGenerationDescriptor } from "./layerPurposeGenerationAdapters";
import { conceptLessonRedundancyJudgmentDescriptor } from "./conceptLessonRedundancyAdapters";
import { impostorKeyVerificationDescriptor, matchingAssignmentVerificationDescriptor, optionSelectKeyVerificationDescriptor, studyImpostorGenerationDescriptor, studyItemBlueprintDescriptor, studyMatchingGenerationDescriptor, studyOptionSelectGenerationDescriptor } from "./studyItemGenerationAdapters";
import { scaffoldContentGenerationDescriptor, scaffoldOutlineGenerationDescriptor } from "./learnerScaffoldGenerationAdapters";
import { scaffoldContentCongruenceDescriptor } from "./scaffoldContentCongruenceAdapters";
import { discoveryCoverageAuditDescriptor } from "./discoveryCoverageAuditAdapters";
import { operationConfigHash } from "./operationConfigHash";
import type { AnyNeuralStageDescriptor } from "./forcedToolStage";

// ONE closed operation-centric registry of every Neural Operation (plan 2026-07-16-004 KTD7,
// ADR-0034). Each entry owns its operation-config seed, the Operation Timeline arm its stages run
// under, its runtime forced-tool descriptor set, and the embedding stages it runs that are not
// forced-tool descriptors. Every operation hash, the deduplicated all-descriptor inventory for
// schema-shape checks, and the descriptor↔timeline completeness tests derive from this registry —
// there is no second manually maintained descriptor list.

export type NeuralOperationRegistryEntry = {
  // Human-stable prefix of the operation's derived config hash.
  configSeed: string;
  // The Operation Timeline operation_type this operation's stages attribute under. Graph
  // Enrichment and Synthetic Topic Generation are separate neural operations that BOTH map to
  // `enrichment`; completeness checks union entries by timeline type.
  timelineType: OperationType;
  descriptors: readonly AnyNeuralStageDescriptor[];
  // LLM spend stages the operation runs through the embedding client rather than a forced-tool
  // descriptor (they still carry the ambient operation tag, so they join the cost report).
  embeddingStages: readonly StageTag[];
};

export const neuralOperationRegistry = {
  extraction: {
    configSeed: "source-extraction",
    timelineType: "extraction",
    descriptors: [
      conceptDiscoveryDescriptor,
      admissionDecisionsDescriptor,
      coreSelectionDescriptor,
      evidenceProfileExtractionDescriptor,
      definitionEntailmentDescriptor,
      definitionPassageQualityDescriptor(),
      admissionLabelJudgmentDescriptor
    ],
    embeddingStages: []
  },
  graphEnrichment: {
    configSeed: "graph-enrichment",
    timelineType: "enrichment",
    descriptors: [
      prerequisiteOrderingDescriptor,
      missingPrerequisiteProposalDescriptor,
      knowledgeBoundaryProbeDescriptor,
      groundingGenerationDescriptor,
      claimVerificationQuestionPlanningDescriptor,
      claimVerificationAnsweringDescriptor,
      claimFactualityJudgmentDescriptor,
      claimFactualityChallengeDescriptor,
      rescueDurabilityDescriptor,
      rescuedNodeLabelingDescriptor,
      mintingDurabilityDescriptor,
      nodeMergeAdjudicationDescriptor,
      definitionPassageQualityDescriptor(STAGE_TAGS.rescueDefinitionQuality),
      intrinsicDifficultyBandingDescriptor,
      intrinsicDifficultyComparisonDescriptor
    ],
    embeddingStages: [STAGE_TAGS.nodeEmbedding]
  },
  syntheticTopicGeneration: {
    configSeed: "synthetic-topic-generation",
    timelineType: "enrichment",
    descriptors: [
      declaredDomainInferenceDescriptor,
      conceptSetSynthesisDescriptor,
      knowledgeBoundaryProbeDescriptor,
      groundingGenerationDescriptor,
      claimVerificationQuestionPlanningDescriptor,
      claimVerificationAnsweringDescriptor,
      claimFactualityJudgmentDescriptor,
      claimFactualityChallengeDescriptor,
      prerequisiteOrderingDescriptor,
      intrinsicDifficultyBandingDescriptor,
      intrinsicDifficultyComparisonDescriptor
    ],
    embeddingStages: [STAGE_TAGS.nodeEmbedding]
  },
  studyItemBank: {
    configSeed: "study-item-bank",
    timelineType: "study_items",
    descriptors: [
      layerPurposeGenerationDescriptor,
      conceptLessonGenerationDescriptor,
      conceptLessonRedundancyJudgmentDescriptor,
      studyItemBlueprintDescriptor,
      studyOptionSelectGenerationDescriptor,
      studyImpostorGenerationDescriptor,
      studyMatchingGenerationDescriptor,
      optionSelectKeyVerificationDescriptor,
      impostorKeyVerificationDescriptor,
      matchingAssignmentVerificationDescriptor
    ],
    embeddingStages: []
  },
  // The five Scaffold runtime descriptors (KTD7): outline, Knowledge-Boundary Probe, Grounding
  // Generation, content, and the generation-time congruence re-pick. The probe's K-answer
  // agreement embeds through the embedding client under the scaffold operation tag.
  scaffoldGeneration: {
    configSeed: "learner-scaffold-generation",
    timelineType: "scaffold",
    descriptors: [
      scaffoldOutlineGenerationDescriptor,
      knowledgeBoundaryProbeDescriptor,
      groundingGenerationDescriptor,
      scaffoldContentGenerationDescriptor,
      scaffoldContentCongruenceDescriptor
    ],
    embeddingStages: [STAGE_TAGS.nodeEmbedding]
  }
} as const satisfies Record<string, NeuralOperationRegistryEntry>;

export type NeuralOperationName = keyof typeof neuralOperationRegistry;

// Measurement-only descriptors (ADR-0013/0028 instruments) claimed in the Operation Timeline
// catalog purely to name their owning pipeline arm: their calls carry NO operation_id, so they
// never join an operation's cost report and never contribute to an operation config hash.
// `scaffold-content-congruence` is NOT here — its descriptor genuinely runs inside the scaffold
// operation (the re-pick) and is registered there; the standing audit merely reuses it.
export const measurementNeuralStageDescriptors: readonly { descriptor: AnyNeuralStageDescriptor; claimedTimelineType: OperationType }[] = [
  { descriptor: discoveryCoverageAuditDescriptor as AnyNeuralStageDescriptor, claimedTimelineType: "extraction" }
];

// Deduplicated (by stage config identity) inventory of every registered runtime descriptor, for
// wire-schema shape checks that must sweep everything an operation can send to a model. The
// widening annotation erases the entries' concrete descriptor tuple types (proven assignable by
// the `satisfies` clause above) so flatMap unifies on the existential descriptor type.
const registryEntries: readonly NeuralOperationRegistryEntry[] = Object.values(neuralOperationRegistry);
export const allNeuralOperationDescriptors: readonly AnyNeuralStageDescriptor[] = dedupeDescriptors(
  registryEntries.flatMap((entry) => entry.descriptors)
);

export function extractionConfigHash(): string {
  const entry = neuralOperationRegistry.extraction;
  return operationConfigHash(entry.configSeed, entry.descriptors);
}

export function graphEnrichmentConfigHash(config: GraphEnrichmentConfig): string {
  const entry = neuralOperationRegistry.graphEnrichment;
  return operationConfigHash(entry.configSeed, entry.descriptors, {
    ...graphEnrichmentBehaviorConfig(config),
    nodeEmbeddingModel: NODE_EMBEDDING_MODEL
  }, {
    additionalModels: [NODE_EMBEDDING_MODEL]
  });
}

export function syntheticGenerationConfigHash(config: SyntheticGenerationConfig): string {
  const entry = neuralOperationRegistry.syntheticTopicGeneration;
  return operationConfigHash(entry.configSeed, entry.descriptors, {
    ...syntheticBehaviorConfig(config),
    nodeEmbeddingModel: NODE_EMBEDDING_MODEL
  }, {
    additionalModels: [NODE_EMBEDDING_MODEL]
  });
}

export function studyItemBankConfigHash(): string {
  const entry = neuralOperationRegistry.studyItemBank;
  return operationConfigHash(entry.configSeed, entry.descriptors);
}

// The complete Scaffold operation identity (KTD7): all five runtime descriptors plus the
// application behavior knobs and the embedding model the probe agreement uses. Persisted on
// every scaffold operation_runs row at operation start — including a direct-reference attempt
// that opens no neural stage.
export function scaffoldGenerationConfigHash(config: ScaffoldGenerationConfig): string {
  const entry = neuralOperationRegistry.scaffoldGeneration;
  return operationConfigHash(entry.configSeed, entry.descriptors, {
    ...config,
    nodeEmbeddingModel: NODE_EMBEDDING_MODEL
  }, {
    additionalModels: [NODE_EMBEDDING_MODEL]
  });
}

export function withGraphEnrichmentConfigHash(config: GraphEnrichmentConfig): GraphEnrichmentConfig {
  return { ...config, enrichmentConfigHash: graphEnrichmentConfigHash(config) };
}

export function withSyntheticGenerationConfigHash(config: SyntheticGenerationConfig): SyntheticGenerationConfig {
  return { ...config, enrichmentConfigHash: syntheticGenerationConfigHash(config) };
}

function withoutEnrichmentConfigHash<T extends { enrichmentConfigHash: string }>(config: T): Omit<T, "enrichmentConfigHash"> {
  const { enrichmentConfigHash: _hash, ...rest } = config;
  void _hash;
  return rest;
}

// Admission candidate fan-out and the per-concept probe draw width alter scheduling,
// never the prompts, samples, thresholds, or artifact semantics. Keeping them out of
// the operation identity lets execution tuning reuse the same Derived Graph Layer
// behavioral identity while every neural-policy knob remains hashed (ADR-0019).
function graphEnrichmentBehaviorConfig(config: GraphEnrichmentConfig) {
  const { sourceLessGroundingAdmission, ...behavior } = withoutEnrichmentConfigHash(config);
  return {
    ...behavior,
    sourceLessGroundingAdmission: sourceLessGroundingAdmissionBehavior(sourceLessGroundingAdmission)
  };
}

function syntheticBehaviorConfig(config: SyntheticGenerationConfig) {
  const {
    sourceLessGroundingAdmission,
    ...behavior
  } = withoutEnrichmentConfigHash(config);
  return {
    ...behavior,
    sourceLessGroundingAdmission: sourceLessGroundingAdmissionBehavior(sourceLessGroundingAdmission)
  };
}

function sourceLessGroundingAdmissionBehavior(
  sourceLessGroundingAdmission: SyntheticGenerationConfig["sourceLessGroundingAdmission"]
) {
  const {
    candidateConcurrency: _candidateConcurrency,
    verificationConcurrency: _verificationConcurrency,
    probe,
    ...admissionBehavior
  } = sourceLessGroundingAdmission;
  const { probeConcurrency: _probeConcurrency, ...probeBehavior } = probe;
  void _candidateConcurrency;
  void _verificationConcurrency;
  void _probeConcurrency;
  return {
    ...admissionBehavior,
    probe: probeBehavior
  };
}

// Two registry entries may hold the same descriptor value when operations reuse a deep module, or
// distinct instances of one parameterized factory; identity here is the (promptPath, stageTag,
// modelOverride) triple that also keys `stageConfigHash`'s inputs per prompt file.
function dedupeDescriptors(descriptors: readonly AnyNeuralStageDescriptor[]): AnyNeuralStageDescriptor[] {
  const seen = new Map<string, AnyNeuralStageDescriptor>();
  for (const descriptor of descriptors) {
    const key = `${descriptor.promptPath}\0${descriptor.stageTag}\0${descriptor.modelOverride ?? ""}`;
    if (!seen.has(key)) seen.set(key, descriptor);
  }
  return [...seen.values()];
}

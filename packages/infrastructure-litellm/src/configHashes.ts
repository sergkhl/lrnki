import {
  ADMISSION_LABEL_NON_CONCEPT_POLICY,
  DEFINITION_PASSAGE_DISPOSITION_POLICY,
  RESCUE_CARRIER_ADMISSION_POLICY,
  SOURCE_CITATION_MATCH_CLASSIFICATION_POLICY,
  SOURCE_LESSON_EXTRACTIVE_ADMISSION_POLICY,
  SOURCE_LESSON_PASSAGE_ROLE_POLICY,
  SOURCE_MATERIAL_CLAIM_SUPPORT_ACCEPTANCE_DRAWS,
  SOURCE_OPTION_EXACT_REFERENCE_ADMISSION_POLICY,
  type ConceptCanonicalizationMode,
  type ConceptCanonicalizationConfig,
  type GraphEnrichmentConfig,
  type ScaffoldGenerationConfig,
  type SyntheticGenerationConfig
} from "@lrnki/application";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { admissionDecisionsDescriptor, admissionLabelJudgmentDescriptor, conceptDiscoveryDescriptor, coreSelectionDescriptor, DEFINITION_PASSAGE_ROLE_SUPPORT_POLICY, definitionEntailmentDescriptor, definitionPassageQualityDescriptor, definitionPassageRoleSupportDescriptor, evidenceProfileExtractionDescriptor, rescueCarrierAdmissionJudgmentDescriptor } from "./extractionAdapters";
import { mintingDurabilityDescriptor, prerequisiteOrderingDescriptor, rescuedNodeLabelingDescriptor, rescueDurabilityDescriptor } from "./enrichmentAdapters";
import {
  NODE_MERGE_CONSENSUS_POLICY,
  GENERATED_NODE_JUDGE_MODEL,
  nodeMergeAdjudicationDescriptor,
  nodeMergeDirectionalSupportDescriptor,
  NODE_EMBEDDING_MODEL
} from "./dedupAdapters";
import { missingPrerequisiteProposalDescriptor } from "./missingPrerequisiteProposalAdapters";
import {
  claimFactualityChallengeDescriptor,
  claimFactualityJudgmentDescriptor,
  claimVerificationAnsweringDescriptor,
  claimVerificationQuestionPlanningDescriptor,
  groundingGenerationDescriptor
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
import { sourceMaterialClaimSupportDescriptor } from "./sourceMaterialClaimSupportAdapters";
import { operationConfigHash } from "./operationConfigHash";
import { withModelOverride, type AnyNeuralStageDescriptor } from "./forcedToolStage";

// ONE closed configuration registry of every Neural Operation (ADR-0034). It owns descriptor
// membership and mechanical configuration hashes only. Operation-to-stage membership belongs to
// the application Operation Timeline catalog and is deliberately absent here.

export type TopicExpeditionModelRouting = Readonly<{
  generation: string;
  independentJudge: string;
  prerequisiteOrdering: string;
}>;

export function effectiveSyntheticTopicGenerationDescriptors(
  routing?: TopicExpeditionModelRouting
): readonly AnyNeuralStageDescriptor[] {
  return [
    withModelOverride(declaredDomainInferenceDescriptor, routing?.generation),
    conceptSetSynthesisDescriptor,
    knowledgeBoundaryProbeDescriptor,
    groundingGenerationDescriptor,
    claimVerificationQuestionPlanningDescriptor,
    claimVerificationAnsweringDescriptor,
    claimFactualityJudgmentDescriptor,
    claimFactualityChallengeDescriptor,
    withModelOverride(prerequisiteOrderingDescriptor, routing?.prerequisiteOrdering),
    intrinsicDifficultyBandingDescriptor,
    intrinsicDifficultyComparisonDescriptor
  ];
}

export function effectiveStudyItemBankDescriptors(
  routing?: TopicExpeditionModelRouting
): readonly AnyNeuralStageDescriptor[] {
  return [
    withModelOverride(layerPurposeGenerationDescriptor, routing?.generation),
    withModelOverride(conceptLessonGenerationDescriptor, routing?.generation),
    withModelOverride(conceptLessonRedundancyJudgmentDescriptor, routing?.independentJudge),
    withModelOverride(studyItemBlueprintDescriptor, routing?.generation),
    withModelOverride(studyOptionSelectGenerationDescriptor, routing?.generation),
    withModelOverride(studyImpostorGenerationDescriptor, routing?.generation),
    withModelOverride(studyMatchingGenerationDescriptor, routing?.generation),
    sourceMaterialClaimSupportDescriptor,
    withModelOverride(optionSelectKeyVerificationDescriptor, routing?.independentJudge),
    withModelOverride(impostorKeyVerificationDescriptor, routing?.independentJudge),
    withModelOverride(matchingAssignmentVerificationDescriptor, routing?.independentJudge)
  ];
}

export type NeuralOperationRegistryEntry = {
  // Human-stable prefix of the operation's derived config hash.
  configSeed: string;
  descriptors: readonly AnyNeuralStageDescriptor[];
};

export const neuralOperationRegistry = {
  extraction: {
    configSeed: "source-extraction",
    descriptors: [
      conceptDiscoveryDescriptor,
      admissionDecisionsDescriptor,
      coreSelectionDescriptor,
      evidenceProfileExtractionDescriptor,
      definitionEntailmentDescriptor,
      definitionPassageQualityDescriptor(),
      definitionPassageRoleSupportDescriptor(),
      admissionLabelJudgmentDescriptor
    ]
  },
  conceptCanonicalization: {
    configSeed: "concept-canonicalization",
    descriptors: [nodeMergeAdjudicationDescriptor]
  },
  graphEnrichment: {
    configSeed: "graph-enrichment",
    descriptors: [
      prerequisiteOrderingDescriptor,
      missingPrerequisiteProposalDescriptor,
      knowledgeBoundaryProbeDescriptor,
      groundingGenerationDescriptor,
      claimVerificationQuestionPlanningDescriptor,
      claimVerificationAnsweringDescriptor,
      claimFactualityJudgmentDescriptor,
      claimFactualityChallengeDescriptor,
      rescueCarrierAdmissionJudgmentDescriptor,
      rescueDurabilityDescriptor,
      rescuedNodeLabelingDescriptor,
      mintingDurabilityDescriptor,
      nodeMergeAdjudicationDescriptor,
      nodeMergeDirectionalSupportDescriptor,
      withModelOverride(nodeMergeAdjudicationDescriptor, GENERATED_NODE_JUDGE_MODEL),
      definitionPassageQualityDescriptor(STAGE_TAGS.rescueDefinitionQuality),
      definitionPassageRoleSupportDescriptor(STAGE_TAGS.rescueDefinitionQuality),
      intrinsicDifficultyBandingDescriptor,
      intrinsicDifficultyComparisonDescriptor
    ]
  },
  syntheticTopicGeneration: {
    configSeed: "synthetic-topic-generation",
    descriptors: effectiveSyntheticTopicGenerationDescriptors()
  },
  studyItemBank: {
    configSeed: "study-item-bank",
    descriptors: effectiveStudyItemBankDescriptors()
  },
  // The complete Scaffold runtime descriptor family: outline, shared source-less admission,
  // generated content, congruence, and one-shot Answer-Key Verification. The probe's K-answer
  // agreement embeds through the embedding client under the scaffold operation tag.
  scaffoldGeneration: {
    configSeed: "learner-scaffold-generation",
    descriptors: [
      scaffoldOutlineGenerationDescriptor,
      knowledgeBoundaryProbeDescriptor,
      groundingGenerationDescriptor,
      claimVerificationQuestionPlanningDescriptor,
      claimVerificationAnsweringDescriptor,
      claimFactualityJudgmentDescriptor,
      claimFactualityChallengeDescriptor,
      scaffoldContentGenerationDescriptor,
      scaffoldContentCongruenceDescriptor,
      optionSelectKeyVerificationDescriptor
    ]
  }
} as const satisfies Record<string, NeuralOperationRegistryEntry>;

export type NeuralOperationName = keyof typeof neuralOperationRegistry;

// Measurement-only descriptors (ADR-0013/0028 instruments) carry no operation id, never join an
// Operation Timeline, and never contribute to an operation config hash.
// `scaffold-content-congruence` is NOT here — its descriptor genuinely runs inside the scaffold
// operation (the re-pick) and is registered there; the standing audit merely reuses it.
export const measurementNeuralStageDescriptors: readonly AnyNeuralStageDescriptor[] = [
  discoveryCoverageAuditDescriptor as AnyNeuralStageDescriptor
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
  return operationConfigHash(entry.configSeed, entry.descriptors, {
    admissionLabelNonConceptPolicy: ADMISSION_LABEL_NON_CONCEPT_POLICY,
    definitionPassageDispositionPolicy: DEFINITION_PASSAGE_DISPOSITION_POLICY,
    definitionPassageRoleSupportPolicy: DEFINITION_PASSAGE_ROLE_SUPPORT_POLICY
  });
}

export function conceptCanonicalizationConfigHash(input: {
  mode: ConceptCanonicalizationMode;
  config: ConceptCanonicalizationConfig;
}): string {
  const entry = neuralOperationRegistry.conceptCanonicalization;
  const { adjudicationConcurrency: _adjudicationConcurrency, ...behavior } = input.config;
  void _adjudicationConcurrency;
  return operationConfigHash(
    entry.configSeed,
    entry.descriptors,
    {
      mode: input.mode,
      ...behavior,
      nodeEmbeddingModel: NODE_EMBEDDING_MODEL
    },
    { additionalModels: [NODE_EMBEDDING_MODEL] }
  );
}

export function graphEnrichmentConfigHash(config: GraphEnrichmentConfig): string {
  const entry = neuralOperationRegistry.graphEnrichment;
  return operationConfigHash(entry.configSeed, entry.descriptors, {
    ...graphEnrichmentBehaviorConfig(config),
    definitionPassageDispositionPolicy: DEFINITION_PASSAGE_DISPOSITION_POLICY,
    definitionPassageRoleSupportPolicy: DEFINITION_PASSAGE_ROLE_SUPPORT_POLICY,
    rescueCarrierAdmissionPolicy: RESCUE_CARRIER_ADMISSION_POLICY,
    nodeMergeConsensusPolicy: NODE_MERGE_CONSENSUS_POLICY,
    nodeEmbeddingModel: NODE_EMBEDDING_MODEL
  }, {
    additionalModels: [NODE_EMBEDDING_MODEL]
  });
}

export function syntheticGenerationConfigHash(
  config: SyntheticGenerationConfig,
  routing?: TopicExpeditionModelRouting
): string {
  const entry = neuralOperationRegistry.syntheticTopicGeneration;
  return operationConfigHash(entry.configSeed, effectiveSyntheticTopicGenerationDescriptors(routing), {
    ...syntheticBehaviorConfig(config),
    nodeEmbeddingModel: NODE_EMBEDDING_MODEL
  }, {
    additionalModels: [NODE_EMBEDDING_MODEL]
  });
}

export function studyItemBankConfigHash(routing?: TopicExpeditionModelRouting): string {
  const entry = neuralOperationRegistry.studyItemBank;
  return operationConfigHash(entry.configSeed, effectiveStudyItemBankDescriptors(routing), {
    sourceCitationMatchClassificationPolicy: SOURCE_CITATION_MATCH_CLASSIFICATION_POLICY,
    sourceLessonExtractiveAdmissionPolicy: SOURCE_LESSON_EXTRACTIVE_ADMISSION_POLICY,
    sourceLessonPassageRolePolicy: SOURCE_LESSON_PASSAGE_ROLE_POLICY,
    sourceOptionExactReferenceAdmissionPolicy: SOURCE_OPTION_EXACT_REFERENCE_ADMISSION_POLICY,
    sourceMaterialClaimSupportAcceptanceDraws: SOURCE_MATERIAL_CLAIM_SUPPORT_ACCEPTANCE_DRAWS
  });
}

// The complete Scaffold operation identity (KTD7): every runtime descriptor plus the application
// behavior knobs and the embedding model the probe agreement uses. Execution-only fan-out widths
// are excluded through the same shared admission projection as the other two consumers. Persisted on
// every scaffold operation_runs row at operation start — including a direct-reference attempt
// that opens no neural stage.
export function scaffoldGenerationConfigHash(config: ScaffoldGenerationConfig): string {
  const entry = neuralOperationRegistry.scaffoldGeneration;
  const { sourceLessGroundingAdmission, ...scaffoldBehavior } = config;
  return operationConfigHash(entry.configSeed, entry.descriptors, {
    ...scaffoldBehavior,
    sourceLessGroundingAdmission: sourceLessGroundingAdmissionBehavior(sourceLessGroundingAdmission),
    nodeEmbeddingModel: NODE_EMBEDDING_MODEL
  }, {
    additionalModels: [NODE_EMBEDDING_MODEL]
  });
}

export function withGraphEnrichmentConfigHash(config: GraphEnrichmentConfig): GraphEnrichmentConfig {
  return { ...config, enrichmentConfigHash: graphEnrichmentConfigHash(config) };
}

export function withSyntheticGenerationConfigHash(
  config: SyntheticGenerationConfig,
  routing?: TopicExpeditionModelRouting
): SyntheticGenerationConfig {
  return { ...config, enrichmentConfigHash: syntheticGenerationConfigHash(config, routing) };
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
    verificationExecution: _verificationExecution,
    probe,
    ...admissionBehavior
  } = sourceLessGroundingAdmission;
  const { probeConcurrency: _probeConcurrency, ...probeBehavior } = probe;
  void _candidateConcurrency;
  void _verificationExecution;
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

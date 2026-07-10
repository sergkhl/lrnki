import type { GraphEnrichmentConfig, SyntheticGenerationConfig } from "@lrnki/application";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { admissionDecisionsDescriptor, admissionLabelJudgmentDescriptor, conceptDiscoveryDescriptor, coreSelectionDescriptor, definitionEntailmentDescriptor, definitionPassageQualityDescriptor, evidenceProfileExtractionDescriptor } from "./extractionAdapters";
import { mintingDurabilityDescriptor, prerequisiteOrderingDescriptor, rescuedNodeLabelingDescriptor, rescueDurabilityDescriptor } from "./enrichmentAdapters";
import { nodeMergeAdjudicationDescriptor, NODE_EMBEDDING_MODEL } from "./dedupAdapters";
import { missingPrerequisiteProposalDescriptor } from "./missingPrerequisiteProposalAdapters";
import { groundingGenerationDescriptor } from "./groundingGenerationAdapters";
import { intrinsicDifficultyBandingDescriptor, intrinsicDifficultyComparisonDescriptor } from "./intrinsicDifficultyAdapters";
import { conceptSetSynthesisDescriptor, knowledgeBoundaryProbeDescriptor } from "./syntheticGenerationAdapters";
import { declaredDomainInferenceDescriptor } from "./domainInferenceAdapters";
import { conceptLessonGenerationDescriptor } from "./conceptLessonGenerationAdapters";
import { layerPurposeGenerationDescriptor } from "./layerPurposeGenerationAdapters";
import { conceptLessonRedundancyJudgmentDescriptor } from "./conceptLessonRedundancyAdapters";
import { impostorLieValidityJudgmentDescriptor, studyImpostorGenerationDescriptor, studyItemBlueprintDescriptor, studyMatchingGenerationDescriptor, studyOptionSelectGenerationDescriptor } from "./studyItemGenerationAdapters";
import { operationConfigHash } from "./operationConfigHash";
import type { AnyNeuralStageDescriptor } from "./forcedToolStage";

const EXTRACTION_CONFIG_SEED = "source-extraction";
const GRAPH_ENRICHMENT_CONFIG_SEED = "graph-enrichment";
const SYNTHETIC_GENERATION_CONFIG_SEED = "synthetic-topic-generation";
const STUDY_ITEM_BANK_CONFIG_SEED = "study-item-bank";

export const extractionNeuralStageDescriptors = [
  conceptDiscoveryDescriptor,
  admissionDecisionsDescriptor,
  coreSelectionDescriptor,
  evidenceProfileExtractionDescriptor,
  definitionEntailmentDescriptor,
  definitionPassageQualityDescriptor(),
  admissionLabelJudgmentDescriptor
] as const;

export const graphEnrichmentNeuralStageDescriptors = [
  prerequisiteOrderingDescriptor,
  missingPrerequisiteProposalDescriptor,
  groundingGenerationDescriptor,
  rescueDurabilityDescriptor,
  rescuedNodeLabelingDescriptor,
  mintingDurabilityDescriptor,
  nodeMergeAdjudicationDescriptor,
  definitionPassageQualityDescriptor(STAGE_TAGS.rescueDefinitionQuality),
  intrinsicDifficultyBandingDescriptor,
  intrinsicDifficultyComparisonDescriptor
] as const;

export const syntheticGenerationNeuralStageDescriptors = [
  declaredDomainInferenceDescriptor,
  conceptSetSynthesisDescriptor,
  knowledgeBoundaryProbeDescriptor,
  groundingGenerationDescriptor,
  prerequisiteOrderingDescriptor,
  intrinsicDifficultyBandingDescriptor,
  intrinsicDifficultyComparisonDescriptor
] as const;

export const studyItemBankNeuralStageDescriptors = [
  layerPurposeGenerationDescriptor,
  conceptLessonGenerationDescriptor,
  conceptLessonRedundancyJudgmentDescriptor,
  studyItemBlueprintDescriptor,
  studyOptionSelectGenerationDescriptor,
  studyImpostorGenerationDescriptor,
  studyMatchingGenerationDescriptor,
  impostorLieValidityJudgmentDescriptor
] as const;

export function extractionConfigHash(): string {
  return operationConfigHash(EXTRACTION_CONFIG_SEED, descriptors(extractionNeuralStageDescriptors));
}

export function graphEnrichmentConfigHash(config: GraphEnrichmentConfig): string {
  return operationConfigHash(GRAPH_ENRICHMENT_CONFIG_SEED, descriptors(graphEnrichmentNeuralStageDescriptors), {
    ...withoutEnrichmentConfigHash(config),
    nodeEmbeddingModel: NODE_EMBEDDING_MODEL
  });
}

export function syntheticGenerationConfigHash(config: SyntheticGenerationConfig): string {
  return operationConfigHash(SYNTHETIC_GENERATION_CONFIG_SEED, descriptors(syntheticGenerationNeuralStageDescriptors), {
    ...withoutEnrichmentConfigHash(config),
    nodeEmbeddingModel: NODE_EMBEDDING_MODEL
  });
}

export function studyItemBankConfigHash(): string {
  return operationConfigHash(STUDY_ITEM_BANK_CONFIG_SEED, descriptors(studyItemBankNeuralStageDescriptors));
}

export function withGraphEnrichmentConfigHash(config: GraphEnrichmentConfig): GraphEnrichmentConfig {
  return { ...config, enrichmentConfigHash: graphEnrichmentConfigHash(config) };
}

export function withSyntheticGenerationConfigHash(config: SyntheticGenerationConfig): SyntheticGenerationConfig {
  return { ...config, enrichmentConfigHash: syntheticGenerationConfigHash(config) };
}

function withoutEnrichmentConfigHash<T extends { enrichmentConfigHash: string }>(config: T): Omit<T, "enrichmentConfigHash"> {
  const { enrichmentConfigHash: _hash, ...rest } = config;
  return rest;
}

function descriptors(
  value: readonly AnyNeuralStageDescriptor[]
): readonly AnyNeuralStageDescriptor[] {
  return value;
}

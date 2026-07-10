import { STAGE_TAGS, isStageTag, type StageTag } from "@lrnki/domain-core";
import type { OperationType } from "@lrnki/ports";

export type OperationTimelineStageKind = "llm" | "non_llm" | "unknown";

export const NON_LLM_STAGES = {
  documentLoad: "document-load",
  persist: "persist",
  load: "load",
  refine: "refine",
  symbolicDisposal: "symbolic-disposal"
} as const;

export type NonLlmStage = (typeof NON_LLM_STAGES)[keyof typeof NON_LLM_STAGES];

type OperationTimelineStageDescriptor = {
  stage: string;
  kind: Exclude<OperationTimelineStageKind, "unknown">;
};

const llm = (stage: StageTag): OperationTimelineStageDescriptor => ({ stage, kind: "llm" });
const nonLlm = (stage: NonLlmStage): OperationTimelineStageDescriptor => ({ stage, kind: "non_llm" });

export const OPERATION_TIMELINE_CATALOG: Record<OperationType, readonly OperationTimelineStageDescriptor[]> = {
  extraction: [
    llm(STAGE_TAGS.conceptDiscovery),
    llm(STAGE_TAGS.admission),
    llm(STAGE_TAGS.admissionLabelJudge),
    llm(STAGE_TAGS.cepExtraction),
    llm(STAGE_TAGS.definitionPassageQuality),
    llm(STAGE_TAGS.assertionEntailment),
    nonLlm(NON_LLM_STAGES.persist)
  ],
  minting: [
    nonLlm(NON_LLM_STAGES.load),
    nonLlm(NON_LLM_STAGES.refine),
    nonLlm(NON_LLM_STAGES.persist)
  ],
  enrichment: [
    llm(STAGE_TAGS.declaredDomainInference),
    llm(STAGE_TAGS.conceptSetSynthesis),
    llm(STAGE_TAGS.knowledgeBoundaryProbe),
    llm(STAGE_TAGS.prerequisiteOrdering),
    llm(STAGE_TAGS.rescueDurability),
    llm(STAGE_TAGS.rescuedNodeLabeling),
    llm(STAGE_TAGS.rescueDefinitionQuality),
    llm(STAGE_TAGS.mintingDurability),
    llm(STAGE_TAGS.missingPrerequisiteProposal),
    llm(STAGE_TAGS.groundingGeneration),
    llm(STAGE_TAGS.intrinsicDifficulty),
    llm(STAGE_TAGS.nodeEmbedding),
    llm(STAGE_TAGS.nodeMergeAdjudication),
    nonLlm(NON_LLM_STAGES.symbolicDisposal),
    nonLlm(NON_LLM_STAGES.persist)
  ],
  study_items: [
    nonLlm(NON_LLM_STAGES.load),
    llm(STAGE_TAGS.layerPurposeGeneration),
    llm(STAGE_TAGS.conceptLessonGeneration),
    llm(STAGE_TAGS.lessonRedundancyJudgment),
    llm(STAGE_TAGS.studyItemBlueprint),
    llm(STAGE_TAGS.studyItemGeneration),
    llm(STAGE_TAGS.matchingGeneration),
    llm(STAGE_TAGS.impostorGeneration),
    llm(STAGE_TAGS.impostorLieValidityJudgment),
    nonLlm(NON_LLM_STAGES.persist)
  ]
} as const;

const knownNonLlmStages = new Set<string>(Object.values(NON_LLM_STAGES));
const ownedStagesByOperation = new Map<OperationType, ReadonlySet<string>>(
  Object.entries(OPERATION_TIMELINE_CATALOG).map(([operationType, stages]) => [
    operationType as OperationType,
    new Set(stages.map((descriptor) => descriptor.stage))
  ])
);

export const isLlmStage = isStageTag;

export function operationTimelineStageKind(stage: string): OperationTimelineStageKind {
  if (isLlmStage(stage)) return "llm";
  if (knownNonLlmStages.has(stage)) return "non_llm";
  return "unknown";
}

export function stageBelongsToOperation(stage: string, operationType: OperationType): boolean {
  return ownedStagesByOperation.get(operationType)?.has(stage) ?? false;
}

export function spendStageBelongsToOperation(stage: string, operationType: OperationType): boolean {
  return isLlmStage(stage) && stageBelongsToOperation(stage, operationType);
}

export function operationTimelineLlmSpendStageTags(): readonly StageTag[] {
  return Object.values(STAGE_TAGS);
}

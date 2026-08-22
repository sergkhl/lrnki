import { STAGE_TAGS, type StageTag } from "@lrnki/domain-core";

// The broad Operation Timeline catalog owns every stage an operation type may emit. This narrower
// profile owns the conceptual flow of one Topic Expedition across its Synthetic Generation and
// Study Item Bank phases. Producer groups are exported so the producers use these exact
// descriptors instead of keeping a second list of stage literals.
export type TopicExpeditionPhase = "enrichment" | "study_items";

// `conditional` means the producer can omit the aggregate timeline bracket when no work for that
// conceptual stage exists. `repeatable` means one operation can emit more than one bracket row for
// the stage. `concurrencyGroup` names stages whose brackets are allowed to overlap.
export type GenerationStageDescriptor = Readonly<{
  phase: TopicExpeditionPhase;
  stage: StageTag;
  conditional: boolean;
  repeatable: boolean;
  concurrencyGroup: string;
}>;

const generationStage = (
  phase: TopicExpeditionPhase,
  stage: StageTag,
  conditional: boolean,
  repeatable: boolean,
  concurrencyGroup: string
): GenerationStageDescriptor => ({ phase, stage, conditional, repeatable, concurrencyGroup });

export const SYNTHETIC_GENERATION_STAGE_GROUP = {
  declaredDomainInference: generationStage(
    "enrichment",
    STAGE_TAGS.declaredDomainInference,
    true,
    false,
    "declared-domain-inference"
  ),
  conceptSetSynthesis: generationStage(
    "enrichment",
    STAGE_TAGS.conceptSetSynthesis,
    false,
    false,
    "concept-set-synthesis"
  )
} as const;

export const SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP = {
  knowledgeBoundaryProbe: generationStage(
    "enrichment",
    STAGE_TAGS.knowledgeBoundaryProbe,
    false,
    false,
    "knowledge-boundary-probe"
  ),
  groundingGeneration: generationStage(
    "enrichment",
    STAGE_TAGS.groundingGeneration,
    true,
    false,
    "grounding-generation"
  ),
  verificationQuestionPlanning: generationStage(
    "enrichment",
    STAGE_TAGS.groundingVerificationQuestionPlanning,
    true,
    true,
    "claim-verification-pipeline"
  ),
  verificationAnswering: generationStage(
    "enrichment",
    STAGE_TAGS.groundingVerificationAnswering,
    true,
    true,
    "claim-verification-pipeline"
  ),
  factualityJudgment: generationStage(
    "enrichment",
    STAGE_TAGS.groundingFactualityRevision,
    true,
    true,
    "claim-verification-pipeline"
  )
} as const;

export const DERIVED_GRAPH_COMPLETION_STAGE_GROUP = {
  prerequisiteOrdering: generationStage(
    "enrichment",
    STAGE_TAGS.prerequisiteOrdering,
    false,
    false,
    "derived-graph-completion-parallel"
  ),
  intrinsicDifficulty: generationStage(
    "enrichment",
    STAGE_TAGS.intrinsicDifficulty,
    false,
    false,
    "derived-graph-completion-parallel"
  )
} as const;

export const STUDY_ITEM_BANK_STAGE_GROUP = {
  layerPurposeGeneration: generationStage(
    "study_items",
    STAGE_TAGS.layerPurposeGeneration,
    true,
    false,
    "study-item-bank-purpose"
  ),
  conceptLessonGeneration: generationStage(
    "study_items",
    STAGE_TAGS.conceptLessonGeneration,
    false,
    false,
    "concept-lesson-pipeline"
  ),
  lessonRedundancyJudgment: generationStage(
    "study_items",
    STAGE_TAGS.lessonRedundancyJudgment,
    true,
    false,
    "concept-lesson-pipeline"
  ),
  studyItemBlueprint: generationStage(
    "study_items",
    STAGE_TAGS.studyItemBlueprint,
    false,
    false,
    "study-item-blueprint"
  ),
  optionSelectGeneration: generationStage(
    "study_items",
    STAGE_TAGS.studyItemGeneration,
    true,
    false,
    "activity-family-pipelines"
  ),
  matchingGeneration: generationStage(
    "study_items",
    STAGE_TAGS.matchingGeneration,
    true,
    false,
    "activity-family-pipelines"
  ),
  impostorGeneration: generationStage(
    "study_items",
    STAGE_TAGS.impostorGeneration,
    true,
    false,
    "activity-family-pipelines"
  ),
  optionSelectKeyVerification: generationStage(
    "study_items",
    STAGE_TAGS.optionSelectKeyVerification,
    true,
    false,
    "activity-family-pipelines"
  ),
  impostorKeyVerification: generationStage(
    "study_items",
    STAGE_TAGS.impostorKeyVerification,
    true,
    false,
    "activity-family-pipelines"
  ),
  matchingAssignmentVerification: generationStage(
    "study_items",
    STAGE_TAGS.matchingAssignmentVerification,
    true,
    false,
    "activity-family-pipelines"
  )
} as const;

export const TOPIC_EXPEDITION_PRODUCER_STAGE_GROUPS = {
  syntheticGeneration: SYNTHETIC_GENERATION_STAGE_GROUP,
  sourceLessGroundingAdmission: SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP,
  derivedGraphCompletion: DERIVED_GRAPH_COMPLETION_STAGE_GROUP,
  studyItemBank: STUDY_ITEM_BANK_STAGE_GROUP
} as const;

const groupStages = (
  group: Readonly<Record<string, GenerationStageDescriptor>>
): readonly GenerationStageDescriptor[] => Object.values(group);

export const TOPIC_EXPEDITION_STAGE_PROFILE: Readonly<
  Record<TopicExpeditionPhase, readonly GenerationStageDescriptor[]>
> = {
  enrichment: [
    ...groupStages(SYNTHETIC_GENERATION_STAGE_GROUP),
    ...groupStages(SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP),
    ...groupStages(DERIVED_GRAPH_COMPLETION_STAGE_GROUP)
  ],
  study_items: groupStages(STUDY_ITEM_BANK_STAGE_GROUP)
};

export const TOPIC_EXPEDITION_STAGE_TOTAL =
  TOPIC_EXPEDITION_STAGE_PROFILE.enrichment.length
  + TOPIC_EXPEDITION_STAGE_PROFILE.study_items.length;

import { STAGE_TAGS } from "@lrnki/domain-core";
import type { OperationTimelineDetail } from "@lrnki/ports";

export const EXPECTED_TOPIC_GENERATION_STAGES = [
  STAGE_TAGS.declaredDomainInference,
  STAGE_TAGS.conceptSetSynthesis,
  STAGE_TAGS.knowledgeBoundaryProbe,
  STAGE_TAGS.groundingGeneration,
  STAGE_TAGS.prerequisiteOrdering,
  STAGE_TAGS.intrinsicDifficulty,
  STAGE_TAGS.conceptLessonGeneration,
  STAGE_TAGS.studyItemBlueprint,
  STAGE_TAGS.studyItemGeneration,
  STAGE_TAGS.matchingGeneration,
  STAGE_TAGS.impostorGeneration
] as const;

const STUDY_ITEM_STAGE_OFFSET = EXPECTED_TOPIC_GENERATION_STAGES.indexOf(STAGE_TAGS.conceptLessonGeneration);
const ENRICHMENT_STAGE_SET = new Set<string>(EXPECTED_TOPIC_GENERATION_STAGES.slice(0, STUDY_ITEM_STAGE_OFFSET));
const STUDY_ITEM_STAGE_SET = new Set<string>(EXPECTED_TOPIC_GENERATION_STAGES.slice(STUDY_ITEM_STAGE_OFFSET));

export type TopicGenerationProgressCard = {
  completed: number;
  total: number;
  fraction: number | null;
  indeterminate: boolean;
};

export function generationProgress(timeline: OperationTimelineDetail | undefined): TopicGenerationProgressCard {
  const total = EXPECTED_TOPIC_GENERATION_STAGES.length;
  if (!timeline) return { completed: 0, total, fraction: null, indeterminate: true };

  const stageSet = timeline.summary.operationType === "study_items" ? STUDY_ITEM_STAGE_SET : ENRICHMENT_STAGE_SET;
  const offset = timeline.summary.operationType === "study_items" ? STUDY_ITEM_STAGE_OFFSET : 0;
  const completedInTimeline = timeline.stages.filter((stage) => stageSet.has(stage.stage) && stage.endedAt && stage.ok !== false).length;
  const completed = Math.min(total, Math.max(0, offset + completedInTimeline));
  const currentStage = timeline.stages.find((stage) => !stage.endedAt)?.stage ?? timeline.stages.at(-1)?.stage ?? null;
  const indeterminate = currentStage !== null && !stageSet.has(currentStage) && timeline.summary.status === "running";
  return {
    completed,
    total,
    fraction: indeterminate ? null : completed / total,
    indeterminate
  };
}

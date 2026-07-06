import { STAGE_TAGS } from "@lrnki/domain-core";
import type { LearnerExpedition, OperationTimelineDetail } from "@lrnki/ports";

// `generating` with no operation id means nobody is working the row — it is queued
// (or transiently released for retry), so the card shows a waiting state instead of a
// Scouting progress surface that never moves.
export function isQueuedExpedition(expedition: Pick<LearnerExpedition, "status" | "currentOperationId">): boolean {
  return expedition.status === "generating" && !expedition.currentOperationId;
}

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
  // A succeeded phase counts as its full stage span regardless of which conditional
  // stages actually appeared (domain inference is skipped on retry; matching/impostor
  // when the blueprint admits none) — so the bar reaches its phase boundary and 100%
  // at success instead of capping below it. Mid-run skew from an absent stage stays ≤1.
  const phaseComplete = timeline.summary.status === "succeeded";
  const completedInTimeline = phaseComplete
    ? stageSet.size
    : timeline.stages.filter((stage) => stageSet.has(stage.stage) && stage.endedAt && stage.ok !== false).length;
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

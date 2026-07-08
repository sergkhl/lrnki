import assert from "node:assert/strict";
import test from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { OperationTimelineDetail } from "@lrnki/ports";
import { EXPECTED_TOPIC_GENERATION_STAGES, generationProgress, isQueuedExpedition } from "./generationProgress";

test("generationProgress counts completed expected stages against the fixed denominator", () => {
  const progress = generationProgress(timeline({
    stages: [
      closed(STAGE_TAGS.conceptSetSynthesis),
      closed(STAGE_TAGS.knowledgeBoundaryProbe),
      closed(STAGE_TAGS.groundingGeneration),
      closed(STAGE_TAGS.prerequisiteOrdering),
      open(STAGE_TAGS.intrinsicDifficulty)
    ]
  }));
  assert.equal(progress.completed, 4);
  assert.equal(progress.total, EXPECTED_TOPIC_GENERATION_STAGES.length);
  assert.equal(progress.fraction, 4 / EXPECTED_TOPIC_GENERATION_STAGES.length);
});

test("generationProgress offsets study-item timelines after synthetic stages", () => {
  const progress = generationProgress(timeline({
    operationType: "study_items",
    stages: [
      closed(STAGE_TAGS.conceptLessonGeneration),
      closed(STAGE_TAGS.studyItemBlueprint),
      open(STAGE_TAGS.studyItemGeneration)
    ]
  }));
  assert.equal(progress.completed, 8);
  assert.equal(progress.total, EXPECTED_TOPIC_GENERATION_STAGES.length);
});

test("generationProgress signals indeterminate for a running unexpected current stage", () => {
  const progress = generationProgress(timeline({ stages: [open("future-stage")] }));
  assert.equal(progress.completed, 0);
  assert.equal(progress.fraction, null);
  assert.equal(progress.indeterminate, true);
});

test("generationProgress clamps a finished expected sequence to one", () => {
  const progress = generationProgress(timeline({
    operationType: "study_items",
    status: "succeeded",
    stages: [
      closed(STAGE_TAGS.conceptLessonGeneration),
      closed(STAGE_TAGS.studyItemBlueprint),
      closed(STAGE_TAGS.studyItemGeneration),
      closed(STAGE_TAGS.matchingGeneration),
      closed(STAGE_TAGS.impostorGeneration)
    ]
  }));
  assert.equal(progress.completed, progress.total);
  assert.equal(progress.fraction, 1);
});

function timeline(input: {
  operationType?: OperationTimelineDetail["summary"]["operationType"];
  status?: OperationTimelineDetail["summary"]["status"];
  stages: OperationTimelineDetail["stages"];
}): OperationTimelineDetail {
  return {
    summary: {
      operationRunId: "run-1",
      operationType: input.operationType ?? "enrichment",
      operationId: "op-1",
      status: input.status ?? "running",
      currentStage: input.stages.find((stage) => !stage.endedAt)?.stage ?? null,
      progressDone: null,
      progressTotal: null,
      lastProgressAt: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: null,
      elapsedMs: 0,
      stageCount: input.stages.length
    },
    stages: input.stages
  };
}

function closed(stage: string): OperationTimelineDetail["stages"][number] {
  return { stage, startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:01.000Z", durationMs: 1000, ok: true, progressDone: null, progressTotal: null, errorDetail: null };
}

function open(stage: string): OperationTimelineDetail["stages"][number] {
  return { stage, startedAt: "2026-01-01T00:00:00.000Z", endedAt: null, durationMs: null, ok: null, progressDone: null, progressTotal: null, errorDetail: null };
}

test("a succeeded study_items timeline with absent conditional stages still reaches 11/11", () => {
  const progress = generationProgress(timeline({
    operationType: "study_items",
    status: "succeeded",
    stages: [
      closed(STAGE_TAGS.conceptLessonGeneration),
      closed(STAGE_TAGS.studyItemBlueprint),
      closed(STAGE_TAGS.studyItemGeneration)
      // matching/impostor absent: the blueprint admitted none
    ]
  }));
  assert.equal(progress.completed, progress.total);
  assert.equal(progress.fraction, 1);
});

test("a succeeded enrichment timeline with domain inference skipped reaches its phase boundary (6/11)", () => {
  const progress = generationProgress(timeline({
    status: "succeeded",
    stages: [
      closed(STAGE_TAGS.conceptSetSynthesis),
      closed(STAGE_TAGS.knowledgeBoundaryProbe),
      closed(STAGE_TAGS.groundingGeneration),
      closed(STAGE_TAGS.prerequisiteOrdering),
      closed(STAGE_TAGS.intrinsicDifficulty)
    ]
  }));
  assert.equal(progress.completed, 6);
});

test("isQueuedExpedition: generating + no operation id is queued; claimed or terminal rows are not", () => {
  assert.equal(isQueuedExpedition({ status: "generating", currentOperationId: null }), true);
  assert.equal(isQueuedExpedition({ status: "generating", currentOperationId: "op-1" }), false);
  assert.equal(isQueuedExpedition({ status: "ready", currentOperationId: null }), false);
  assert.equal(isQueuedExpedition({ status: "failed", currentOperationId: null }), false);
});

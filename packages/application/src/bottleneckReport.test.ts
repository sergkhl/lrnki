import assert from "node:assert/strict";
import test from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type {
  OperationTimelineDetail,
  OperationTimelineReadPort,
  StageSpend,
  StageSpendReadPort
} from "@lrnki/ports";
import { bottleneckReport } from "./bottleneckReport";

// Deterministic tests over fake ports and a canned spend payload (rule 11): the join
// is a deterministic transform; no model judgment is asserted.

function timelineRead(detail: OperationTimelineDetail | undefined): OperationTimelineReadPort {
  return {
    async listOperationTimelines() { return detail ? [detail.summary] : []; },
    async getOperationTimeline() { return detail; }
  };
}

function spendRead(spend: StageSpend[] | (() => never)): StageSpendReadPort {
  return {
    async readStageSpend() {
      if (typeof spend === "function") return spend();
      return spend;
    }
  };
}

function detailWith(stages: OperationTimelineDetail["stages"]): OperationTimelineDetail {
  return {
    summary: {
      operationRunId: "or-1",
      operationType: "extraction",
      operationId: "op-1",
      status: "succeeded",
      currentStage: null,
      progressDone: null,
      progressTotal: null,
      lastProgressAt: null,
      startedAt: "2026-06-25T00:00:00.000Z",
      completedAt: "2026-06-25T00:05:00.000Z",
      elapsedMs: 300000,
      stageCount: stages.length
    },
    stages
  };
}

function stage(name: string, durationMs: number | null): OperationTimelineDetail["stages"][number] {
  return { stage: name, startedAt: "2026-06-25T00:00:00.000Z", endedAt: durationMs === null ? null : "2026-06-25T00:01:00.000Z", durationMs, ok: durationMs === null ? null : true, progressDone: null, progressTotal: null };
}

test("joins per-stage wall-clock from the timeline with cost from spend on the stage key", async () => {
  const detail = detailWith([stage(STAGE_TAGS.conceptDiscovery, 1000), stage(STAGE_TAGS.cepExtraction, 5000)]);
  const spend: StageSpend[] = [
    { tag: STAGE_TAGS.conceptDiscovery, logCount: 1, totalSpend: 0.01 },
    { tag: STAGE_TAGS.cepExtraction, logCount: 20, totalSpend: 0.5 }
  ];
  const report = await bottleneckReport({ operationId: "op-1", timelineRead: timelineRead(detail), stageSpendRead: spendRead(spend) });
  assert.ok(report);
  assert.equal(report.costAvailable, true);
  const cep = report.stages.find((s) => s.stage === STAGE_TAGS.cepExtraction);
  assert.deepEqual(cep, { stage: STAGE_TAGS.cepExtraction, isLlmStage: true, wallClockMs: 5000, calls: 20, costUsd: 0.5 });
});

test("a non-LLM stage appears with its wall-clock and absent cost", async () => {
  const detail = detailWith([stage("persist", 800)]);
  const report = await bottleneckReport({ operationId: "op-1", timelineRead: timelineRead(detail), stageSpendRead: spendRead([]) });
  const persist = report?.stages.find((s) => s.stage === "persist");
  assert.deepEqual(persist, { stage: "persist", isLlmStage: false, wallClockMs: 800, calls: null, costUsd: null });
});

test("a spend STAGE_TAG with no timeline stage still appears (folded sub-stage cost, e.g. label judge)", async () => {
  const detail = detailWith([stage(STAGE_TAGS.admission, 3000)]);
  const spend: StageSpend[] = [
    { tag: STAGE_TAGS.admission, logCount: 2, totalSpend: 0.2 },
    { tag: STAGE_TAGS.admissionLabelJudge, logCount: 2, totalSpend: 0.05 }
  ];
  const report = await bottleneckReport({ operationId: "op-1", timelineRead: timelineRead(detail), stageSpendRead: spendRead(spend) });
  const judge = report?.stages.find((s) => s.stage === STAGE_TAGS.admissionLabelJudge);
  assert.deepEqual(judge, { stage: STAGE_TAGS.admissionLabelJudge, isLlmStage: true, wallClockMs: null, calls: 2, costUsd: 0.05 });
});

test("when LiteLLM /spend/tags is unavailable the report still renders wall-clock and marks cost unavailable", async () => {
  const detail = detailWith([stage(STAGE_TAGS.cepExtraction, 5000)]);
  const report = await bottleneckReport({
    operationId: "op-1",
    timelineRead: timelineRead(detail),
    stageSpendRead: spendRead(() => { throw new Error("LiteLLM down"); })
  });
  assert.ok(report);
  assert.equal(report.costAvailable, false);
  const cep = report.stages.find((s) => s.stage === STAGE_TAGS.cepExtraction);
  assert.equal(cep?.wallClockMs, 5000);
  assert.equal(cep?.calls, null);
  assert.equal(cep?.costUsd, null);
});

test("returns undefined for an unknown operation id", async () => {
  const report = await bottleneckReport({ operationId: "missing", timelineRead: timelineRead(undefined), stageSpendRead: spendRead([]) });
  assert.equal(report, undefined);
});

import assert from "node:assert/strict";
import test from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type {
  JourneyLineage,
  JourneyLineageReadPort,
  OperationStageSpend,
  OperationStageSpendReadPort,
  OperationTimelineDetail,
  OperationTimelineReadPort,
  OperationType
} from "@lrnki/ports";
import { costTimingReport } from "./costTimingReport";
import { NON_LLM_STAGES } from "./runProgressReporter";

function detail(operationId: string, operationType: OperationType, stages: Array<[string, number | null]>): OperationTimelineDetail {
  return {
    summary: {
      operationRunId: `${operationType}-${operationId}`,
      operationType,
      operationId,
      status: "succeeded",
      currentStage: null,
      progressDone: null,
      progressTotal: null,
      lastProgressAt: null,
      startedAt: "2026-06-25T00:00:00.000Z",
      completedAt: "2026-06-25T00:01:00.000Z",
      elapsedMs: 60000,
      stageCount: stages.length,
      configHash: null
    },
    stages: stages.map(([stage, durationMs]) => ({
      stage,
      startedAt: "2026-06-25T00:00:00.000Z",
      endedAt: durationMs === null ? null : "2026-06-25T00:01:00.000Z",
      durationMs,
      ok: durationMs === null ? null : true,
      progressDone: null,
      progressTotal: null,
      errorDetail: null
    }))
  };
}

function ports(options: {
  details: OperationTimelineDetail[];
  spend?: OperationStageSpend[] | Error;
  lineage?: JourneyLineage;
}) {
  const timelineRead: OperationTimelineReadPort = {
    async listOperationTimelines() { return options.details.map((row) => row.summary); },
    async getOperationTimeline(operationId, operationType) {
      return options.details.find((row) =>
        row.summary.operationId === operationId &&
        (!operationType || row.summary.operationType === operationType)
      );
    }
  };
  const operationStageSpendRead: OperationStageSpendReadPort = {
    async readOperationStageSpend() {
      if (options.spend instanceof Error) throw options.spend;
      return options.spend ?? [];
    }
  };
  const journeyLineageRead: JourneyLineageReadPort = {
    async resolveJourney() { return options.lineage; },
    async resolveJourneyDisplay() { return []; }
  };
  return { timelineRead, operationStageSpendRead, journeyLineageRead };
}

test("operation scope joins operation-scoped spend and includes tokens", async () => {
  const dependencies = ports({
    details: [detail("run-1", "extraction", [[STAGE_TAGS.admission, 3000]])],
    spend: [{ operationId: "run-1", stage: STAGE_TAGS.admission, logCount: 2, totalSpend: 0.2, estimatedSpend: 0, totalTokens: 1200 }]
  });
  const report = await costTimingReport({ scope: { operationId: "run-1" }, ...dependencies });
  assert.equal(report?.scope, "operation");
  assert.deepEqual(report?.operations[0].stages[0], {
    stage: STAGE_TAGS.admission,
    isLlmStage: true,
    stageKind: "llm",
    wallClockMs: 3000,
    calls: 2,
    costUsd: 0.2,
    costEstimated: false,
    tokens: 1200
  });
  assert.deepEqual(report?.total, { wallClockMs: 3000, calls: 2, costUsd: 0.2, costEstimated: false, tokens: 1200 });
});

test("operation scope can disambiguate operation types that share one id", async () => {
  const dependencies = ports({
    details: [
      detail("enr-1", "enrichment", [[STAGE_TAGS.prerequisiteOrdering, 4000]]),
      detail("enr-1", "study_items", [
        [STAGE_TAGS.conceptLessonGeneration, 1000],
        [STAGE_TAGS.studyItemGeneration, 5000],
        [STAGE_TAGS.impostorGeneration, 2000]
      ])
    ],
    spend: [
      { operationId: "enr-1", stage: STAGE_TAGS.prerequisiteOrdering, logCount: 3, totalSpend: 0.3, estimatedSpend: 0, totalTokens: 300 },
      { operationId: "enr-1", stage: STAGE_TAGS.conceptLessonGeneration, logCount: 1, totalSpend: 0.1, estimatedSpend: 0, totalTokens: 100 },
      { operationId: "enr-1", stage: STAGE_TAGS.studyItemGeneration, logCount: 4, totalSpend: 0.4, estimatedSpend: 0, totalTokens: 400 },
      { operationId: "enr-1", stage: STAGE_TAGS.impostorGeneration, logCount: 5, totalSpend: 0.5, estimatedSpend: 0, totalTokens: 500 }
    ]
  });
  const report = await costTimingReport({
    scope: { operationId: "enr-1", operationType: "study_items" },
    ...dependencies
  });
  assert.equal(report?.operations[0].operationType, "study_items");
  assert.deepEqual(report?.operations[0].subtotal, { wallClockMs: 8000, calls: 10, costUsd: 1, costEstimated: false, tokens: 1000 });
  assert.deepEqual(report?.operations[0].stages.map((row) => row.stage), [
    STAGE_TAGS.conceptLessonGeneration,
    STAGE_TAGS.studyItemGeneration,
    STAGE_TAGS.impostorGeneration
  ]);
  assert.ok(!report?.operations[0].stages.some((row) => row.stage === STAGE_TAGS.prerequisiteOrdering));
});

test("journey scope rolls up two extraction runs, minting, enrichment, and study items", async () => {
  const dependencies = ports({
    lineage: { enrichmentId: "enr-1", graphVersionId: "gv-1", extractionRunIds: ["run-a", "run-b"] },
    details: [
      detail("run-a", "extraction", [[STAGE_TAGS.admission, 1000]]),
      detail("run-b", "extraction", [[STAGE_TAGS.admission, 2000]]),
      detail("gv-1", "minting", [[NON_LLM_STAGES.persist, 300]]),
      detail("enr-1", "enrichment", [[STAGE_TAGS.prerequisiteOrdering, 4000]]),
      detail("enr-1", "study_items", [
        [STAGE_TAGS.conceptLessonGeneration, 1000],
        [STAGE_TAGS.studyItemGeneration, 5000],
        [STAGE_TAGS.impostorGeneration, 2000]
      ])
    ],
    spend: [
      { operationId: "run-a", stage: STAGE_TAGS.admission, logCount: 1, totalSpend: 0.1, estimatedSpend: 0, totalTokens: 100 },
      { operationId: "run-b", stage: STAGE_TAGS.admission, logCount: 2, totalSpend: 0.2, estimatedSpend: 0, totalTokens: 200 },
      { operationId: "enr-1", stage: STAGE_TAGS.prerequisiteOrdering, logCount: 3, totalSpend: 0.3, estimatedSpend: 0, totalTokens: 300 },
      { operationId: "enr-1", stage: STAGE_TAGS.conceptLessonGeneration, logCount: 1, totalSpend: 0.1, estimatedSpend: 0, totalTokens: 100 },
      { operationId: "enr-1", stage: STAGE_TAGS.studyItemGeneration, logCount: 4, totalSpend: 0.4, estimatedSpend: 0, totalTokens: 400 },
      { operationId: "enr-1", stage: STAGE_TAGS.impostorGeneration, logCount: 5, totalSpend: 0.5, estimatedSpend: 0, totalTokens: 500 }
    ]
  });
  const report = await costTimingReport({ scope: { journeyAnchorEnrichmentId: "enr-1" }, ...dependencies });
  assert.equal(report?.operations.length, 5);
  assert.deepEqual(report?.total, { wallClockMs: 15300, calls: 16, costUsd: 1.6, costEstimated: false, tokens: 1600 });
  assert.deepEqual(report?.operations.find((row) => row.operationType === "minting")?.subtotal, {
    wallClockMs: 300,
    calls: 0,
    costUsd: 0,
    costEstimated: false,
    tokens: 0
  });
  assert.equal(report?.operations.find((row) => row.operationType === "enrichment")?.subtotal.costUsd, 0.3);
  assert.deepEqual(report?.operations.find((row) => row.operationType === "study_items")?.subtotal, {
    wallClockMs: 8000,
    calls: 10,
    costUsd: 1,
    costEstimated: false,
    tokens: 1000
  });
});

test("cost-source failure preserves wall-clock and marks cost totals unavailable", async () => {
  const dependencies = ports({
    lineage: { enrichmentId: "enr-1", graphVersionId: "gv-1", extractionRunIds: [] },
    details: [
      detail("gv-1", "minting", [[NON_LLM_STAGES.persist, 300]]),
      detail("enr-1", "enrichment", [[STAGE_TAGS.prerequisiteOrdering, 4000]]),
      detail("enr-1", "study_items", [
        [STAGE_TAGS.conceptLessonGeneration, 1000],
        [STAGE_TAGS.studyItemGeneration, 5000],
        [STAGE_TAGS.impostorGeneration, 2000]
      ])
    ],
    spend: new Error("LiteLLM down")
  });
  const report = await costTimingReport({ scope: { journeyAnchorEnrichmentId: "enr-1" }, ...dependencies });
  assert.equal(report?.costAvailable, false);
  assert.equal(report?.total.wallClockMs, 12300);
  assert.equal(report?.total.costUsd, null);
  assert.ok(report?.operations.every((row) => row.subtotal.calls === null && row.subtotal.tokens === null));
  assert.deepEqual(report?.operations.find((row) => row.operationType === "study_items")?.stages, [
    { stage: STAGE_TAGS.conceptLessonGeneration, isLlmStage: true, stageKind: "llm", wallClockMs: 1000, calls: null, costUsd: null, costEstimated: false, tokens: null },
    { stage: STAGE_TAGS.studyItemGeneration, isLlmStage: true, stageKind: "llm", wallClockMs: 5000, calls: null, costUsd: null, costEstimated: false, tokens: null },
    { stage: STAGE_TAGS.impostorGeneration, isLlmStage: true, stageKind: "llm", wallClockMs: 2000, calls: null, costUsd: null, costEstimated: false, tokens: null }
  ]);
});

test("non-LLM wall-clock rows and duplicate timeline rows keep current aggregation semantics", async () => {
  const dependencies = ports({
    details: [detail("gv-1", "minting", [
      [NON_LLM_STAGES.load, 120],
      [NON_LLM_STAGES.refine, 200],
      [NON_LLM_STAGES.refine, 50],
      [NON_LLM_STAGES.persist, 30]
    ])],
    spend: [
      { operationId: "gv-1", stage: NON_LLM_STAGES.persist, logCount: 9, totalSpend: 9, estimatedSpend: 0, totalTokens: 9000 }
    ]
  });
  const report = await costTimingReport({
    scope: { operationId: "gv-1", operationType: "minting" },
    ...dependencies
  });
  assert.deepEqual(report?.operations[0].stages, [
    { stage: NON_LLM_STAGES.load, isLlmStage: false, stageKind: "non_llm", wallClockMs: 120, calls: null, costUsd: null, costEstimated: false, tokens: null },
    { stage: NON_LLM_STAGES.refine, isLlmStage: false, stageKind: "non_llm", wallClockMs: 250, calls: null, costUsd: null, costEstimated: false, tokens: null },
    { stage: NON_LLM_STAGES.persist, isLlmStage: false, stageKind: "non_llm", wallClockMs: 30, calls: null, costUsd: null, costEstimated: false, tokens: null }
  ]);
  assert.deepEqual(report?.operations[0].subtotal, { wallClockMs: 400, calls: 0, costUsd: 0, costEstimated: false, tokens: 0 });
});

test("unknown timeline stage remains visible and does not receive unrelated spend", async () => {
  const dependencies = ports({
    details: [detail("enr-1", "enrichment", [["unexpected-stage", 777]])],
    spend: [
      { operationId: "enr-1", stage: "unexpected-stage", logCount: 99, totalSpend: 9.9, estimatedSpend: 0, totalTokens: 9900 },
      { operationId: "enr-1", stage: STAGE_TAGS.studyItemGeneration, logCount: 4, totalSpend: 0.4, estimatedSpend: 0, totalTokens: 400 }
    ]
  });
  const report = await costTimingReport({
    scope: { operationId: "enr-1", operationType: "enrichment" },
    ...dependencies
  });
  assert.deepEqual(report?.operations[0].stages, [
    { stage: "unexpected-stage", isLlmStage: false, stageKind: "unknown", wallClockMs: 777, calls: null, costUsd: null, costEstimated: false, tokens: null }
  ]);
  assert.deepEqual(report?.operations[0].subtotal, { wallClockMs: 777, calls: 0, costUsd: 0, costEstimated: false, tokens: 0 });
});

test("BYOK estimated spend joins the displayed cost and marks the row estimated", async () => {
  const dependencies = ports({
    details: [detail("run-1", "extraction", [[STAGE_TAGS.admission, 3000], [STAGE_TAGS.admissionLabelJudge, 1000]])],
    spend: [
      // Zero provider-billed spend with a usage-derived estimate (OpenRouter BYOK).
      { operationId: "run-1", stage: STAGE_TAGS.admission, logCount: 2, totalSpend: 0, estimatedSpend: 0.05, totalTokens: 1200 },
      { operationId: "run-1", stage: STAGE_TAGS.admissionLabelJudge, logCount: 1, totalSpend: 0.1, estimatedSpend: 0, totalTokens: 100 }
    ]
  });
  const report = await costTimingReport({ scope: { operationId: "run-1" }, ...dependencies });
  const admission = report?.operations[0].stages.find((row) => row.stage === STAGE_TAGS.admission);
  assert.equal(admission?.costUsd, 0.05);
  assert.equal(admission?.costEstimated, true);
  const judge = report?.operations[0].stages.find((row) => row.stage === STAGE_TAGS.admissionLabelJudge);
  assert.equal(judge?.costUsd, 0.1);
  assert.equal(judge?.costEstimated, false);
  assert.equal(report?.total.costUsd, 0.05 + 0.1);
  assert.equal(report?.total.costEstimated, true);
});

test("returns undefined for unknown operation and journey anchors", async () => {
  const dependencies = ports({ details: [] });
  assert.equal(await costTimingReport({ scope: { operationId: "missing" }, ...dependencies }), undefined);
  assert.equal(await costTimingReport({ scope: { journeyAnchorEnrichmentId: "missing" }, ...dependencies }), undefined);
});

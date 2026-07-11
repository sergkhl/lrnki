import assert from "node:assert/strict";
import test from "node:test";
import type { OperationJourney } from "@lrnki/application";
import type { OperationStageSpend, OperationTimelineDetail, OperationType } from "@lrnki/ports";
import {
  initialExpandedOperationIds,
  parseJourneySortParams,
  operationCost,
  sortOperationSteps,
  windowJourneys
} from "./operationJourneyView";

function detail(
  operationId: string,
  operationType: OperationType,
  input: Partial<OperationTimelineDetail["summary"]> = {}
): OperationTimelineDetail {
  return {
    summary: {
      operationRunId: input.operationRunId ?? `${operationType}-${operationId}`,
      operationId,
      operationType,
      status: input.status ?? "succeeded",
      currentStage: null,
      progressDone: null,
      progressTotal: null,
      lastProgressAt: null,
      startedAt: input.startedAt ?? "2026-07-08T00:00:00.000Z",
      completedAt: input.completedAt ?? "2026-07-08T00:00:01.000Z",
      elapsedMs: input.elapsedMs ?? 1000,
      stageCount: 0
    },
    stages: []
  };
}

function journey(input: {
  enrichmentId: string;
  status?: OperationJourney["status"];
  startedAt: string;
  elapsedMs: number;
  members?: OperationTimelineDetail[];
}): OperationJourney {
  return {
    enrichmentId: input.enrichmentId,
    display: { enrichmentId: input.enrichmentId, kind: "document", title: input.enrichmentId },
    members: input.members ?? [detail(input.enrichmentId, "enrichment")],
    status: input.status ?? "succeeded",
    startedAt: input.startedAt,
    completedAt: input.status === "running" ? null : new Date(Date.parse(input.startedAt) + input.elapsedMs).toISOString(),
    elapsedMs: input.elapsedMs
  };
}

test("parseJourneySortParams defaults to started desc and a 20 journey limit", () => {
  assert.deepEqual(parseJourneySortParams({}), { sort: "started", dir: "desc", limit: 20 });
  assert.deepEqual(parseJourneySortParams({ sort: "duration", dir: "asc", limit: "2" }), {
    sort: "duration",
    dir: "asc",
    limit: 2
  });
  assert.deepEqual(parseJourneySortParams({ sort: "unknown", dir: "sideways", limit: "-1" }), {
    sort: "started",
    dir: "desc",
    limit: 20
  });
});

test("windowJourneys keeps running journeys unwindowed and sorts finished journeys by duration", () => {
  const journeys = [
    journey({ enrichmentId: "active-a", status: "running", startedAt: "2026-07-08T00:00:00.000Z", elapsedMs: 60000 }),
    journey({ enrichmentId: "slow", startedAt: "2026-07-08T00:01:00.000Z", elapsedMs: 30000 }),
    journey({ enrichmentId: "fast", startedAt: "2026-07-08T00:02:00.000Z", elapsedMs: 5000 }),
    journey({ enrichmentId: "active-b", status: "running", startedAt: "2026-07-08T00:03:00.000Z", elapsedMs: 1000 })
  ];

  const window = windowJourneys(journeys, { rows: [], costAvailable: false }, { sort: "duration", dir: "asc", limit: 1 });

  assert.deepEqual(window.active.map((row) => row.enrichmentId), ["active-a", "active-b"]);
  assert.deepEqual(window.finished.map((row) => row.enrichmentId), ["fast"]);
  assert.equal(window.hiddenFinishedCount, 1);
});

test("windowJourneys sorts by cost using the operation ownership catalog", () => {
  const spend: OperationStageSpend[] = [
    { operationId: "cheap", stage: "concept-discovery", logCount: 1, totalSpend: 0.1, estimatedSpend: 0, totalTokens: 100 },
    { operationId: "expensive", stage: "concept-discovery", logCount: 2, totalSpend: 0.3, estimatedSpend: 0, totalTokens: 200 },
    { operationId: "expensive", stage: "study-item-generation", logCount: 99, totalSpend: 9, estimatedSpend: 0, totalTokens: 9000 }
  ];
  const journeys = [
    journey({ enrichmentId: "cheap", startedAt: "2026-07-08T00:00:00.000Z", elapsedMs: 1000, members: [detail("cheap", "extraction")] }),
    journey({ enrichmentId: "expensive", startedAt: "2026-07-08T00:01:00.000Z", elapsedMs: 1000, members: [detail("expensive", "extraction")] })
  ];

  const window = windowJourneys(journeys, { rows: spend, costAvailable: true }, { sort: "cost", dir: "desc", limit: 20 });

  assert.deepEqual(window.finished.map((row) => row.enrichmentId), ["expensive", "cheap"]);
  assert.deepEqual(operationCost("expensive", "extraction", { rows: spend, costAvailable: true }), {
    calls: 2,
    costUsd: 0.3,
    tokens: 200,
    estimated: false
  });
});

test("cost unavailable degrades to wall-clock-only operation summaries", () => {
  assert.equal(operationCost("run-1", "extraction", {
    rows: [{ operationId: "run-1", stage: "concept-discovery", logCount: 1, totalSpend: 0.1, estimatedSpend: 0, totalTokens: 100 }],
    costAvailable: false
  }), null);
});

test("initialExpandedOperationIds includes only running operations by run id", () => {
  const runningExtraction = detail("same-id", "extraction", { operationRunId: "run-a", status: "running" });
  const finishedEnrichment = detail("same-id", "enrichment", { operationRunId: "run-b", status: "succeeded" });
  const runningUngrouped = detail("other-id", "minting", { operationRunId: "run-c", status: "running" });

  assert.deepEqual(
    initialExpandedOperationIds({
      journeys: [
        journey({
          enrichmentId: "journey",
          status: "running",
          startedAt: "2026-07-08T00:00:00.000Z",
          elapsedMs: 1000,
          members: [runningExtraction, finishedEnrichment]
        })
      ],
      ungrouped: [runningUngrouped]
    }),
    ["run-a", "run-c"]
  );
});

test("sortOperationSteps defaults to lineage order", () => {
  const operations = [
    detail("later", "enrichment", { operationRunId: "run-2" }),
    detail("earlier", "extraction", { operationRunId: "run-1" })
  ];

  assert.deepEqual(
    sortOperationSteps(operations, { rows: [], costAvailable: false }, { sort: "lineage", dir: "desc" }).map(
      (operation) => operation.summary.operationRunId
    ),
    ["run-2", "run-1"]
  );
});

test("sortOperationSteps sorts duration asc and desc", () => {
  const operations = [
    detail("slow", "extraction", { elapsedMs: 5000 }),
    detail("fast", "minting", { elapsedMs: 1000 }),
    detail("medium", "enrichment", { elapsedMs: 3000 })
  ];

  assert.deepEqual(
    sortOperationSteps(operations, { rows: [], costAvailable: false }, { sort: "duration", dir: "asc" }).map(
      (operation) => operation.summary.operationId
    ),
    ["fast", "medium", "slow"]
  );
  assert.deepEqual(
    sortOperationSteps(operations, { rows: [], costAvailable: false }, { sort: "duration", dir: "desc" }).map(
      (operation) => operation.summary.operationId
    ),
    ["slow", "medium", "fast"]
  );
});

test("sortOperationSteps sorts cost asc and desc when spend is available", () => {
  const operations = [
    detail("middle", "extraction"),
    detail("cheap", "extraction"),
    detail("expensive", "extraction")
  ];
  const spend: OperationStageSpend[] = [
    { operationId: "cheap", stage: "concept-discovery", logCount: 1, totalSpend: 0.1, estimatedSpend: 0, totalTokens: 100 },
    { operationId: "middle", stage: "concept-discovery", logCount: 2, totalSpend: 0.2, estimatedSpend: 0, totalTokens: 200 },
    { operationId: "expensive", stage: "concept-discovery", logCount: 3, totalSpend: 0.3, estimatedSpend: 0, totalTokens: 300 }
  ];

  assert.deepEqual(
    sortOperationSteps(operations, { rows: spend, costAvailable: true }, { sort: "cost", dir: "asc" }).map(
      (operation) => operation.summary.operationId
    ),
    ["cheap", "middle", "expensive"]
  );
  assert.deepEqual(
    sortOperationSteps(operations, { rows: spend, costAvailable: true }, { sort: "cost", dir: "desc" }).map(
      (operation) => operation.summary.operationId
    ),
    ["expensive", "middle", "cheap"]
  );
});

test("sortOperationSteps keeps lineage when cost-derived sort is unavailable", () => {
  const operations = [
    detail("expensive", "extraction"),
    detail("cheap", "extraction")
  ];
  const spend: OperationStageSpend[] = [
    { operationId: "cheap", stage: "concept-discovery", logCount: 1, totalSpend: 0.1, estimatedSpend: 0, totalTokens: 100 },
    { operationId: "expensive", stage: "concept-discovery", logCount: 3, totalSpend: 0.3, estimatedSpend: 0, totalTokens: 300 }
  ];

  assert.deepEqual(
    sortOperationSteps(operations, { rows: spend, costAvailable: false }, { sort: "cost", dir: "asc" }).map(
      (operation) => operation.summary.operationId
    ),
    ["expensive", "cheap"]
  );
});

test("sortOperationSteps uses lineage then operation id as stable tie breakers", () => {
  const operations = [
    detail("b-id", "extraction", { operationRunId: "run-b", elapsedMs: 1000 }),
    detail("a-id", "extraction", { operationRunId: "run-a", elapsedMs: 1000 })
  ];

  assert.deepEqual(
    sortOperationSteps(operations, { rows: [], costAvailable: false }, { sort: "duration", dir: "asc" }).map(
      (operation) => operation.summary.operationId
    ),
    ["b-id", "a-id"]
  );
});

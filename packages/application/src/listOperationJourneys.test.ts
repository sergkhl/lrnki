import assert from "node:assert/strict";
import test from "node:test";
import type {
  JourneyDisplay,
  JourneyLineage,
  JourneyLineageReadPort,
  OperationTimelineDetail,
  OperationTimelineReadPort,
  OperationTimelineSummary,
  OperationType
} from "@lrnki/ports";
import { listOperationJourneys } from "./listOperationJourneys";

function detail(input: {
  operationId: string;
  operationType: OperationType;
  status?: OperationTimelineSummary["status"];
  startedAt: string;
  completedAt?: string | null;
}): OperationTimelineDetail {
  const status = input.status ?? "succeeded";
  const completedAt = input.completedAt === undefined
    ? (status === "running" ? null : new Date(Date.parse(input.startedAt) + 1000).toISOString())
    : input.completedAt;
  return {
    summary: {
      operationRunId: `${input.operationType}-${input.operationId}`,
      operationType: input.operationType,
      operationId: input.operationId,
      status,
      currentStage: status === "running" ? "stage-a" : null,
      progressDone: status === "running" ? 1 : null,
      progressTotal: status === "running" ? 3 : null,
      lastProgressAt: input.startedAt,
      startedAt: input.startedAt,
      completedAt,
      elapsedMs: completedAt ? Date.parse(completedAt) - Date.parse(input.startedAt) : 0,
      stageCount: 0,
      configHash: null
    },
    stages: []
  };
}

function ports(input: {
  details: OperationTimelineDetail[];
  lineages: JourneyLineage[];
  displays?: JourneyDisplay[];
}) {
  const timelineRead: OperationTimelineReadPort = {
    async listOperationTimelines() {
      return input.details.map((row) => row.summary);
    },
    async getOperationTimeline(operationId, operationType) {
      return input.details.find((row) =>
        row.summary.operationId === operationId &&
        (!operationType || row.summary.operationType === operationType)
      );
    }
  };
  const journeyLineageRead: JourneyLineageReadPort = {
    async resolveJourney(enrichmentId) {
      return input.lineages.find((row) => row.enrichmentId === enrichmentId);
    },
    async resolveJourneyDisplay(enrichmentIds) {
      return (input.displays ?? []).filter((row) => enrichmentIds.includes(row.enrichmentId));
    }
  };
  return { timelineRead, journeyLineageRead };
}

test("groups multi-source document journeys, shared enrichment study-items ids, and ungrouped leftovers", async () => {
  const result = await listOperationJourneys({
    ...ports({
      details: [
        detail({ operationId: "run-a", operationType: "extraction", startedAt: "2026-07-08T00:00:00.000Z", completedAt: "2026-07-08T00:00:02.000Z" }),
        detail({ operationId: "run-b", operationType: "extraction", startedAt: "2026-07-08T00:01:00.000Z", completedAt: "2026-07-08T00:01:02.000Z" }),
        detail({ operationId: "graph-1", operationType: "minting", startedAt: "2026-07-08T00:02:00.000Z", completedAt: "2026-07-08T00:02:03.000Z" }),
        detail({ operationId: "enr-1", operationType: "enrichment", startedAt: "2026-07-08T00:03:00.000Z", completedAt: "2026-07-08T00:03:04.000Z" }),
        detail({ operationId: "enr-1", operationType: "study_items", startedAt: "2026-07-08T00:04:00.000Z", completedAt: "2026-07-08T00:04:05.000Z" }),
        detail({ operationId: "loose", operationType: "extraction", startedAt: "2026-07-08T00:05:00.000Z" })
      ],
      lineages: [{ enrichmentId: "enr-1", graphVersionId: "graph-1", extractionRunIds: ["run-a", "run-b"] }],
      displays: [{ enrichmentId: "enr-1", kind: "document", title: "Rust ownership, Rust lifetimes" }]
    }),
    now: new Date("2026-07-08T00:10:00.000Z")
  });

  assert.equal(result.journeys.length, 1);
  assert.deepEqual(result.journeys[0]?.display, {
    enrichmentId: "enr-1",
    kind: "document",
    title: "Rust ownership, Rust lifetimes"
  });
  assert.deepEqual(
    result.journeys[0]?.members.map((member) => `${member.summary.operationType}:${member.summary.operationId}`),
    ["extraction:run-a", "extraction:run-b", "minting:graph-1", "enrichment:enr-1", "study_items:enr-1"]
  );
  assert.equal(result.journeys[0]?.status, "succeeded");
  assert.equal(result.journeys[0]?.startedAt, "2026-07-08T00:00:00.000Z");
  assert.equal(result.journeys[0]?.completedAt, "2026-07-08T00:04:05.000Z");
  assert.equal(result.journeys[0]?.elapsedMs, 245000);
  assert.deepEqual(result.ungrouped.map((row) => row.summary.operationId), ["loose"]);
});

test("groups synthetic journeys without a graph version and derives running duration", async () => {
  const result = await listOperationJourneys({
    ...ports({
      details: [
        detail({ operationId: "enr-topic", operationType: "enrichment", status: "running", startedAt: "2026-07-08T00:00:00.000Z" }),
        detail({ operationId: "enr-topic", operationType: "study_items", startedAt: "2026-07-08T00:00:10.000Z", completedAt: "2026-07-08T00:00:20.000Z" })
      ],
      lineages: [{ enrichmentId: "enr-topic", graphVersionId: null, extractionRunIds: [] }],
      displays: [{ enrichmentId: "enr-topic", kind: "synthetic", title: "Binary search" }]
    }),
    now: new Date("2026-07-08T00:01:00.000Z")
  });

  assert.equal(result.journeys[0]?.display.kind, "synthetic");
  assert.equal(result.journeys[0]?.display.title, "Binary search");
  assert.equal(result.journeys[0]?.status, "running");
  assert.equal(result.journeys[0]?.completedAt, null);
  assert.equal(result.journeys[0]?.elapsedMs, 60000);
  assert.deepEqual(
    result.journeys[0]?.members.map((member) => member.summary.operationType),
    ["enrichment", "study_items"]
  );
});

test("failed member makes the whole journey failed", async () => {
  const result = await listOperationJourneys({
    ...ports({
      details: [
        detail({ operationId: "run-a", operationType: "extraction", status: "failed", startedAt: "2026-07-08T00:00:00.000Z", completedAt: "2026-07-08T00:00:10.000Z" }),
        detail({ operationId: "graph-1", operationType: "minting", startedAt: "2026-07-08T00:00:15.000Z", completedAt: "2026-07-08T00:00:20.000Z" }),
        detail({ operationId: "enr-1", operationType: "enrichment", startedAt: "2026-07-08T00:00:25.000Z", completedAt: "2026-07-08T00:00:30.000Z" })
      ],
      lineages: [{ enrichmentId: "enr-1", graphVersionId: "graph-1", extractionRunIds: ["run-a"] }]
    }),
    now: new Date("2026-07-08T00:01:00.000Z")
  });

  assert.equal(result.journeys[0]?.status, "failed");
  assert.equal(result.journeys[0]?.elapsedMs, 30000);
});

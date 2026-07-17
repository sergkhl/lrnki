import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { OperationJourney } from "@lrnki/application";
import type { OperationTimelineDetail } from "@lrnki/ports";
import { OperationsTimelineView } from "./OperationsTimelineView";

function operation(status: OperationTimelineDetail["summary"]["status"]): OperationTimelineDetail {
  return {
    summary: {
      operationRunId: "extraction-op-1",
      operationId: "op-1",
      operationType: "extraction",
      status,
      currentStage: null,
      progressDone: null,
      progressTotal: null,
      lastProgressAt: null,
      startedAt: "2026-07-08T00:00:00.000Z",
      completedAt: status === "running" ? null : "2026-07-08T00:00:01.000Z",
      elapsedMs: 1000,
      stageCount: 0,
      configHash: null
    },
    stages: []
  };
}

function journey(member: OperationTimelineDetail): OperationJourney {
  return {
    enrichmentId: "journey-1",
    display: { enrichmentId: "journey-1", kind: "document", title: "Journey One" },
    members: [member],
    status: member.summary.status,
    startedAt: member.summary.startedAt,
    completedAt: member.summary.completedAt,
    elapsedMs: member.summary.elapsedMs
  };
}

test("OperationsTimelineView emits step table headers without operation expand links", () => {
  const member = operation("succeeded");
  const row = journey(member);
  const html = renderToStaticMarkup(
    <OperationsTimelineView
      operationJourneys={{ journeys: [row], ungrouped: [] }}
      spend={{ rows: [], costAvailable: false }}
      window={{ active: [], finished: [row], hiddenFinishedCount: 0 }}
      sortParams={{ sort: "started", dir: "desc", limit: 10 }}
      runningCount={0}
      failedCount={0}
      stalledCount={0}
    />
  );

  assert.match(html, /Operation/);
  assert.match(html, /Status/);
  assert.match(html, /Duration/);
  assert.doesNotMatch(html, /expand=/);
  assert.doesNotMatch(html, /query/);
});

test("OperationsTimelineView renders running operation stages open initially", () => {
  const member = operation("running");
  const row = journey(member);
  const html = renderToStaticMarkup(
    <OperationsTimelineView
      operationJourneys={{ journeys: [row], ungrouped: [] }}
      spend={{ rows: [], costAvailable: false }}
      window={{ active: [row], finished: [], hiddenFinishedCount: 0 }}
      sortParams={{ sort: "started", dir: "desc", limit: 10 }}
      runningCount={1}
      failedCount={0}
      stalledCount={0}
    />
  );

  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /No stage rows yet/);
});

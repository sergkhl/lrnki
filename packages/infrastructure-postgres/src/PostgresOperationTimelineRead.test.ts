import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createDatabaseClient } from "./db";
import { PostgresOperationTimelineRead } from "./PostgresOperationTimelineRead";
import { PostgresRunProgressReporter } from "./PostgresRunProgressReporter";

// Integration tests against a live PostgreSQL with the single initial migration
// applied. Skipped when DATABASE_URL is absent so the unit suite stays hermetic.
const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

maybe("stitches a parent + its ordered stage rows into one detail with per-stage durations", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    const read = new PostgresOperationTimelineRead(sql);
    const operationId = randomUUID();
    await reporter.beginOperation({ operationType: "extraction", operationId });
    await reporter.enterStage({ operationType: "extraction", operationId, stage: "concept-discovery" });
    await reporter.completeStage({ operationType: "extraction", operationId, stage: "concept-discovery", ok: true });
    await reporter.enterStage({ operationType: "extraction", operationId, stage: "admission" });
    await reporter.completeStage({ operationType: "extraction", operationId, stage: "admission", ok: true });
    await reporter.completeOperation({ operationType: "extraction", operationId, status: "succeeded" });

    const detail = await read.getOperationTimeline(operationId);
    assert.ok(detail);
    assert.equal(detail.summary.status, "succeeded");
    assert.equal(detail.summary.operationType, "extraction");
    assert.equal(detail.summary.stageCount, 2);
    assert.ok(detail.summary.elapsedMs >= 0);
    assert.deepEqual(detail.stages.map((s) => s.stage), ["concept-discovery", "admission"]);
    for (const stage of detail.stages) {
      assert.equal(stage.ok, true);
      assert.ok(stage.endedAt !== null);
      assert.ok(stage.durationMs !== null && stage.durationMs >= 0);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
});

maybe("an in-flight operation renders the open stage as current with null duration, not complete", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    const read = new PostgresOperationTimelineRead(sql);
    const operationId = randomUUID();
    await reporter.beginOperation({ operationType: "enrichment", operationId });
    await reporter.enterStage({ operationType: "enrichment", operationId, stage: "prerequisite-ordering", total: 10 });
    await reporter.recordProgress({ operationType: "enrichment", operationId, stage: "prerequisite-ordering", done: 4 });

    const detail = await read.getOperationTimeline(operationId);
    assert.ok(detail);
    assert.equal(detail.summary.status, "running");
    assert.equal(detail.summary.currentStage, "prerequisite-ordering");
    assert.equal(detail.summary.completedAt, null);
    assert.equal(detail.summary.progressDone, 4);
    assert.equal(detail.summary.progressTotal, 10);
    const open = detail.stages.find((s) => s.stage === "prerequisite-ordering");
    assert.equal(open?.endedAt, null);
    assert.equal(open?.durationMs, null);
    assert.equal(open?.ok, null);
    assert.equal(open?.progressDone, 4);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

maybe("a not-found operation id returns undefined (not an error)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const read = new PostgresOperationTimelineRead(sql);
    assert.equal(await read.getOperationTimeline(randomUUID()), undefined);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

maybe("a running row written by the reporter appears in the list before any stage completes", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    const read = new PostgresOperationTimelineRead(sql);
    const operationId = randomUUID();
    await reporter.beginOperation({ operationType: "extraction", operationId });

    const list = await read.listOperationTimelines();
    const mine = list.find((s) => s.operationId === operationId);
    assert.ok(mine, "the running operation appears in the list");
    assert.equal(mine.status, "running");
    assert.equal(mine.stageCount, 0);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";
import { createDatabaseClient } from "./db";
import { PostgresRunProgressReporter } from "./PostgresRunProgressReporter";

// Integration tests against a live PostgreSQL with the single initial migration
// applied. Skipped when DATABASE_URL is absent so the unit suite stays hermetic.
const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

maybe("beginOperation commits a running parent row visible to a SEPARATE connection (KTD3 autocommit)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const other = createDatabaseClient(databaseUrl);
  try {
    const operationId = randomUUID();
    await new PostgresRunProgressReporter(sql).beginOperation({ operationType: "extraction", operationId });

    // A different connection sees `running` before any stage completes — the
    // load-bearing mid-run-visibility property the old single-INSERT-at-end lacked.
    const rows = await other<{ status: string; current_stage: string | null; completed_at: string | null }[]>`
      SELECT status, current_stage, completed_at FROM operation_runs WHERE operation_id = ${operationId}`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "running");
    assert.equal(rows[0].current_stage, null);
    assert.equal(rows[0].completed_at, null);
  } finally {
    await sql.end({ timeout: 5 });
    await other.end({ timeout: 5 });
  }
});

maybe("beginOperation is idempotent-tolerant: a re-begin leaves one running row", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    const operationId = randomUUID();
    await reporter.beginOperation({ operationType: "enrichment", operationId });
    await reporter.beginOperation({ operationType: "enrichment", operationId });
    const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM operation_runs WHERE operation_id = ${operationId}`;
    assert.equal(count, 1);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

maybe("enterStage → recordProgress×N → completeStage(ok:true) yields a closed child row with progress_done = N", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    const operationId = randomUUID();
    await reporter.beginOperation({ operationType: "extraction", operationId });
    await reporter.enterStage({ operationId, stage: "cep-extraction", total: 3 });
    await reporter.recordProgress({ operationId, stage: "cep-extraction", done: 1 });
    await reporter.recordProgress({ operationId, stage: "cep-extraction", done: 2 });
    await reporter.recordProgress({ operationId, stage: "cep-extraction", done: 3 });
    await reporter.completeStage({ operationId, stage: "cep-extraction", ok: true });

    const stages = await sql<{ started_at: string; ended_at: string | null; ok: boolean | null; progress_done: number | null; progress_total: number | null }[]>`
      SELECT s.started_at, s.ended_at, s.ok, s.progress_done, s.progress_total
      FROM operation_run_stages s JOIN operation_runs r ON r.operation_run_id = s.operation_run_id
      WHERE r.operation_id = ${operationId} AND s.stage = 'cep-extraction'`;
    assert.equal(stages.length, 1);
    assert.ok(new Date(stages[0].started_at) <= new Date(stages[0].ended_at!), "started_at <= ended_at");
    assert.equal(stages[0].ok, true);
    assert.equal(stages[0].progress_done, 3);
    assert.equal(stages[0].progress_total, 3);

    // The parent heartbeat mirrors the open stage's cumulative count.
    const [{ progress_done, current_stage }] = await sql<{ progress_done: number | null; current_stage: string | null }[]>`
      SELECT progress_done, current_stage FROM operation_runs WHERE operation_id = ${operationId}`;
    assert.equal(progress_done, 3);
    assert.equal(current_stage, "cep-extraction");
  } finally {
    await sql.end({ timeout: 5 });
  }
});

maybe("recordProgress advances last_progress_at monotonically across calls", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    const operationId = randomUUID();
    await reporter.beginOperation({ operationType: "extraction", operationId });
    await reporter.enterStage({ operationId, stage: "admission", total: 2 });
    await reporter.recordProgress({ operationId, stage: "admission", done: 1 });
    const [{ last_progress_at: t1 }] = await sql<{ last_progress_at: string }[]>`SELECT last_progress_at FROM operation_runs WHERE operation_id = ${operationId}`;
    await sleep(5);
    await reporter.recordProgress({ operationId, stage: "admission", done: 2 });
    const [{ last_progress_at: t2 }] = await sql<{ last_progress_at: string }[]>`SELECT last_progress_at FROM operation_runs WHERE operation_id = ${operationId}`;
    assert.ok(new Date(t2) > new Date(t1), `expected ${t2} > ${t1}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

maybe("completeStage(ok:false) then completeOperation('failed') leaves a readable failed parent with the failed stage row intact", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    const operationId = randomUUID();
    await reporter.beginOperation({ operationType: "extraction", operationId });
    await reporter.enterStage({ operationId, stage: "cep-extraction" });
    await reporter.completeStage({ operationId, stage: "cep-extraction", ok: false });
    await reporter.completeOperation({ operationId, status: "failed" });

    const [{ status, completed_at }] = await sql<{ status: string; completed_at: string | null }[]>`
      SELECT status, completed_at FROM operation_runs WHERE operation_id = ${operationId}`;
    assert.equal(status, "failed");
    assert.ok(completed_at !== null);
    const [{ ok }] = await sql<{ ok: boolean | null }[]>`
      SELECT s.ok FROM operation_run_stages s JOIN operation_runs r ON r.operation_run_id = s.operation_run_id
      WHERE r.operation_id = ${operationId} AND s.stage = 'cep-extraction'`;
    assert.equal(ok, false);
  } finally {
    await sql.end({ timeout: 5 });
  }
});

maybe("two stages in sequence produce two child rows with independently recoverable durations (R5 join shape)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    const operationId = randomUUID();
    await reporter.beginOperation({ operationType: "extraction", operationId });
    await reporter.enterStage({ operationId, stage: "concept-discovery" });
    await sleep(3);
    await reporter.completeStage({ operationId, stage: "concept-discovery", ok: true });
    await reporter.enterStage({ operationId, stage: "admission" });
    await sleep(3);
    await reporter.completeStage({ operationId, stage: "admission", ok: true });
    await reporter.completeOperation({ operationId, status: "succeeded" });

    const rows = await sql<{ stage: string; duration_ms: number }[]>`
      SELECT s.stage, (EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) * 1000)::int AS duration_ms
      FROM operation_run_stages s JOIN operation_runs r ON r.operation_run_id = s.operation_run_id
      WHERE r.operation_id = ${operationId}
      ORDER BY s.started_at`;
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.stage), ["concept-discovery", "admission"]);
    for (const row of rows) assert.ok(row.duration_ms >= 0, "each stage has a recoverable non-negative duration");
  } finally {
    await sql.end({ timeout: 5 });
  }
});

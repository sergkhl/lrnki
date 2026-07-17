import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";
import type { StageErrorDetail } from "@lrnki/ports";
import { createDatabaseClient } from "./db";
import { PostgresOperationTimelineRead } from "./PostgresOperationTimelineRead";
import { PostgresRunProgressReporter } from "./PostgresRunProgressReporter";
import { purgeOperationRun } from "./testSupport";

// Integration tests against a live PostgreSQL with the single initial migration
// applied. Skipped when DATABASE_URL is absent so the unit suite stays hermetic.
// Each test purges the operation_runs it commits (see purgeOperationRun) so the
// shared dev DB the Admin Lab reads is left exactly as it was found.
const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

maybe("beginOperation commits a running parent row visible to a SEPARATE connection (KTD3 autocommit)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const other = createDatabaseClient(databaseUrl);
  const operationId = randomUUID();
  try {
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
    await purgeOperationRun(sql, operationId);
    await sql.end({ timeout: 5 });
    await other.end({ timeout: 5 });
  }
});

maybe("beginOperation is idempotent-tolerant: a re-begin leaves one running row", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const operationId = randomUUID();
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    await reporter.beginOperation({ operationType: "enrichment", operationId });
    await reporter.beginOperation({ operationType: "enrichment", operationId });
    const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM operation_runs WHERE operation_id = ${operationId}`;
    assert.equal(count, 1);
  } finally {
    await purgeOperationRun(sql, operationId);
    await sql.end({ timeout: 5 });
  }
});

maybe("enterStage → recordProgress×N → completeStage(ok:true) yields a closed child row with progress_done = N", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const operationId = randomUUID();
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    await reporter.beginOperation({ operationType: "extraction", operationId });
    await reporter.enterStage({ operationType: "extraction", operationId, stage: "cep-extraction", total: 3 });
    await reporter.recordProgress({ operationType: "extraction", operationId, stage: "cep-extraction", done: 1 });
    await reporter.recordProgress({ operationType: "extraction", operationId, stage: "cep-extraction", done: 2 });
    await reporter.recordProgress({ operationType: "extraction", operationId, stage: "cep-extraction", done: 3 });
    await reporter.completeStage({ operationType: "extraction", operationId, stage: "cep-extraction", ok: true });

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
    await purgeOperationRun(sql, operationId);
    await sql.end({ timeout: 5 });
  }
});

maybe("recordProgress advances last_progress_at monotonically across calls", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const operationId = randomUUID();
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    await reporter.beginOperation({ operationType: "extraction", operationId });
    await reporter.enterStage({ operationType: "extraction", operationId, stage: "admission", total: 2 });
    await reporter.recordProgress({ operationType: "extraction", operationId, stage: "admission", done: 1 });
    const [{ last_progress_at: t1 }] = await sql<{ last_progress_at: string }[]>`SELECT last_progress_at FROM operation_runs WHERE operation_id = ${operationId}`;
    await sleep(5);
    await reporter.recordProgress({ operationType: "extraction", operationId, stage: "admission", done: 2 });
    const [{ last_progress_at: t2 }] = await sql<{ last_progress_at: string }[]>`SELECT last_progress_at FROM operation_runs WHERE operation_id = ${operationId}`;
    assert.ok(new Date(t2) > new Date(t1), `expected ${t2} > ${t1}`);
  } finally {
    await purgeOperationRun(sql, operationId);
    await sql.end({ timeout: 5 });
  }
});

maybe("completeStage(ok:false) then completeOperation('failed') leaves a readable failed parent with the failed stage row intact", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const operationId = randomUUID();
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    await reporter.beginOperation({ operationType: "extraction", operationId });
    await reporter.enterStage({ operationType: "extraction", operationId, stage: "cep-extraction" });
    await reporter.completeStage({ operationType: "extraction", operationId, stage: "cep-extraction", ok: false });
    await reporter.completeOperation({ operationType: "extraction", operationId, status: "failed" });

    const [{ status, completed_at }] = await sql<{ status: string; completed_at: string | null }[]>`
      SELECT status, completed_at FROM operation_runs WHERE operation_id = ${operationId}`;
    assert.equal(status, "failed");
    assert.ok(completed_at !== null);
    const [{ ok }] = await sql<{ ok: boolean | null }[]>`
      SELECT s.ok FROM operation_run_stages s JOIN operation_runs r ON r.operation_run_id = s.operation_run_id
      WHERE r.operation_id = ${operationId} AND s.stage = 'cep-extraction'`;
    assert.equal(ok, false);
  } finally {
    await purgeOperationRun(sql, operationId);
    await sql.end({ timeout: 5 });
  }
});

maybe("a failing completeStage persists error_detail that round-trips through the timeline read", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const operationId = randomUUID();
  const errorDetail: StageErrorDetail = {
    kind: "forced_tool_exhaustion",
    message: 'Forced tool call "submit_concept_candidates" failed after 3 attempt(s): schema',
    toolName: "submit_concept_candidates",
    model: "kg-extraction",
    attempts: [
      { attempt: 0, kind: "schema_invalid", schemaIssuePaths: ["candidates.0.candidateKey"], redactedSnippet: '{"candidates":[{"candidateKey":""}]}' },
      { attempt: 1, kind: "http", status: 429 },
      { attempt: 2, kind: "schema_invalid", schemaIssuePaths: ["candidates.0.candidateKey"] }
    ]
  };
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    await reporter.beginOperation({ operationType: "extraction", operationId });
    await reporter.enterStage({ operationType: "extraction", operationId, stage: "concept-discovery" });
    await reporter.completeStage({ operationType: "extraction", operationId, stage: "concept-discovery", ok: false, errorDetail });
    await reporter.completeOperation({ operationType: "extraction", operationId, status: "failed" });

    const detail = await new PostgresOperationTimelineRead(sql).getOperationTimeline(operationId, "extraction");
    assert.ok(detail);
    const stage = detail.stages.find((s) => s.stage === "concept-discovery")!;
    assert.equal(stage.ok, false);
    // jsonb round-trips the structured detail verbatim (paths + redacted snippet preserved).
    assert.deepEqual(stage.errorDetail, errorDetail);
  } finally {
    await purgeOperationRun(sql, operationId);
    await sql.end({ timeout: 5 });
  }
});

maybe("a successful completeStage stores a null error_detail", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const operationId = randomUUID();
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    await reporter.beginOperation({ operationType: "extraction", operationId });
    await reporter.enterStage({ operationType: "extraction", operationId, stage: "admission" });
    await reporter.completeStage({ operationType: "extraction", operationId, stage: "admission", ok: true });

    const detail = await new PostgresOperationTimelineRead(sql).getOperationTimeline(operationId, "extraction");
    assert.equal(detail?.stages.find((s) => s.stage === "admission")?.errorDetail, null);
  } finally {
    await purgeOperationRun(sql, operationId);
    await sql.end({ timeout: 5 });
  }
});

// Regression: `study_items` reuses the enrichmentId as its operationId, so two
// operation_runs share one operation_id. Every reporter method must scope by the full
// (operation_type, operation_id) natural key — a method that matched operation_id alone
// would, in enterStage, emit one stage row per parent under a single bound id and self-
// collide on the primary key, and in completeStage/completeOperation would cross-write the
// other operation. This drives both operations through their full lifecycle on one id.
maybe("two operations sharing one operation_id (enrichment + study_items) never collide or cross-write", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const operationId = randomUUID();
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    // Enrichment runs first and completes.
    await reporter.beginOperation({ operationType: "enrichment", operationId });
    await reporter.enterStage({ operationType: "enrichment", operationId, stage: "prerequisite-ordering" });
    await reporter.completeStage({ operationType: "enrichment", operationId, stage: "prerequisite-ordering", ok: true });
    await reporter.completeOperation({ operationType: "enrichment", operationId, status: "succeeded" });
    // study_items then runs under the SAME operation_id — the collision case.
    await reporter.beginOperation({ operationType: "study_items", operationId });
    await reporter.enterStage({ operationType: "study_items", operationId, stage: "study-item-generation" });
    await reporter.completeStage({ operationType: "study_items", operationId, stage: "study-item-generation", ok: true });
    await reporter.completeOperation({ operationType: "study_items", operationId, status: "succeeded" });

    // Each operation has exactly one parent and exactly its own one stage row.
    const parents = await sql<{ operation_type: string; status: string; current_stage: string | null }[]>`
      SELECT operation_type, status, current_stage FROM operation_runs WHERE operation_id = ${operationId} ORDER BY operation_type`;
    assert.equal(parents.length, 2);
    assert.deepEqual(parents.map((p) => p.operation_type), ["enrichment", "study_items"]);
    assert.ok(parents.every((p) => p.status === "succeeded"), "neither operation cross-wrote the other's status");

    const stages = await sql<{ operation_type: string; stage: string; ok: boolean | null }[]>`
      SELECT r.operation_type, s.stage, s.ok
      FROM operation_run_stages s JOIN operation_runs r ON r.operation_run_id = s.operation_run_id
      WHERE r.operation_id = ${operationId} ORDER BY r.operation_type, s.stage`;
    assert.equal(stages.length, 2, "exactly one stage row per operation — no PK self-collision, no duplicate");
    assert.deepEqual(
      stages.map((row) => `${row.operation_type}/${row.stage}`),
      ["enrichment/prerequisite-ordering", "study_items/study-item-generation"]
    );
    assert.ok(stages.every((row) => row.ok === true));
  } finally {
    // One purge by operation_id removes both shared-id parents and their stages.
    await purgeOperationRun(sql, operationId);
    await sql.end({ timeout: 5 });
  }
});

maybe("failStaleOperations marks only stale running operation rows failed", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const staleOperationId = randomUUID();
  const freshOperationId = randomUUID();
  const completedOperationId = randomUUID();
  try {
    await sql`
      INSERT INTO operation_runs (operation_run_id, operation_type, operation_id, status, started_at, last_progress_at, completed_at)
      VALUES
        (${randomUUID()}, 'enrichment', ${staleOperationId}, 'running', now() - interval '10 minutes', now() - interval '10 minutes', null),
        (${randomUUID()}, 'enrichment', ${freshOperationId}, 'running', now(), now(), null),
        (${randomUUID()}, 'enrichment', ${completedOperationId}, 'succeeded', now() - interval '10 minutes', now() - interval '10 minutes', now() - interval '9 minutes')`;

    const reaped = await new PostgresRunProgressReporter(sql).failStaleOperations({
      staleBefore: new Date(Date.now() - 120000)
    });

    assert.ok(reaped >= 1);
    const rows = await sql<{ operation_id: string; status: string; completed_at: string | null }[]>`
      SELECT operation_id::text, status, completed_at
      FROM operation_runs
      WHERE operation_id IN (${staleOperationId}, ${freshOperationId}, ${completedOperationId})
      ORDER BY operation_id::text`;
    const byId = new Map(rows.map((row) => [row.operation_id, row]));
    assert.equal(byId.get(staleOperationId)?.status, "failed");
    assert.ok(byId.get(staleOperationId)?.completed_at);
    assert.equal(byId.get(freshOperationId)?.status, "running");
    assert.equal(byId.get(freshOperationId)?.completed_at, null);
    assert.equal(byId.get(completedOperationId)?.status, "succeeded");
  } finally {
    await purgeOperationRun(sql, staleOperationId);
    await purgeOperationRun(sql, freshOperationId);
    await purgeOperationRun(sql, completedOperationId);
    await sql.end({ timeout: 5 });
  }
});

// KTD7 (plan 2026-07-16-004 U3): the scaffold operation's config identity is REQUIRED at begin
// (DB CHECK) — a scaffold attempt has no artifact row of its own to carry provenance.
maybe("the database rejects a scaffold operation begun without a config hash", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const operationId = randomUUID();
  try {
    await assert.rejects(
      () => new PostgresRunProgressReporter(sql).beginOperation({ operationType: "scaffold", operationId }),
      /check|config_hash/i
    );
    const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM operation_runs WHERE operation_id = ${operationId}`;
    assert.equal(count, 0, "the rejected begin persisted no row");
  } finally {
    await purgeOperationRun(sql, operationId);
    await sql.end({ timeout: 5 });
  }
});

maybe("a no-stage scaffold operation records its config hash at begin and succeeds; separate attempts each keep their own hash", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const firstAttemptId = randomUUID();
  const secondAttemptId = randomUUID();
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    // Direct-reference reuse: begin → complete with ZERO stages (no neural call happens).
    await reporter.beginOperation({ operationType: "scaffold", operationId: firstAttemptId, configHash: "learner-scaffold-generation-aaa111" });
    await reporter.completeOperation({ operationType: "scaffold", operationId: firstAttemptId, status: "succeeded" });
    // A later attempt (fresh operation id) under a changed config keeps its own identity.
    await reporter.beginOperation({ operationType: "scaffold", operationId: secondAttemptId, configHash: "learner-scaffold-generation-bbb222" });
    // A racing re-begin with a different hash must NOT overwrite the attempt's recorded identity.
    await reporter.beginOperation({ operationType: "scaffold", operationId: secondAttemptId, configHash: "learner-scaffold-generation-ccc333" });
    await reporter.completeOperation({ operationType: "scaffold", operationId: secondAttemptId, status: "failed" });

    const read = new PostgresOperationTimelineRead(sql);
    const first = await read.getOperationTimeline(firstAttemptId, "scaffold");
    assert.equal(first?.summary.status, "succeeded");
    assert.equal(first?.summary.configHash, "learner-scaffold-generation-aaa111");
    assert.equal(first?.summary.stageCount, 0);
    assert.deepEqual(first?.stages, []);
    const second = await read.getOperationTimeline(secondAttemptId, "scaffold");
    assert.equal(second?.summary.configHash, "learner-scaffold-generation-bbb222");
    // The hash also rides the list read the Admin Lab polls.
    const summaries = await read.listOperationTimelines();
    assert.equal(summaries.find((summary) => summary.operationId === firstAttemptId)?.configHash, "learner-scaffold-generation-aaa111");
  } finally {
    await purgeOperationRun(sql, firstAttemptId);
    await purgeOperationRun(sql, secondAttemptId);
    await sql.end({ timeout: 5 });
  }
});

maybe("non-scaffold operations keep a null config hash (their identities live on artifact rows)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const operationId = randomUUID();
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    await reporter.beginOperation({ operationType: "enrichment", operationId });
    await reporter.completeOperation({ operationType: "enrichment", operationId, status: "succeeded" });
    const detail = await new PostgresOperationTimelineRead(sql).getOperationTimeline(operationId, "enrichment");
    assert.equal(detail?.summary.configHash, null);
  } finally {
    await purgeOperationRun(sql, operationId);
    await sql.end({ timeout: 5 });
  }
});

maybe("two stages in sequence produce two child rows with independently recoverable durations (R5 join shape)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const operationId = randomUUID();
  try {
    const reporter = new PostgresRunProgressReporter(sql);
    await reporter.beginOperation({ operationType: "extraction", operationId });
    await reporter.enterStage({ operationType: "extraction", operationId, stage: "concept-discovery" });
    await sleep(3);
    await reporter.completeStage({ operationType: "extraction", operationId, stage: "concept-discovery", ok: true });
    await reporter.enterStage({ operationType: "extraction", operationId, stage: "admission" });
    await sleep(3);
    await reporter.completeStage({ operationType: "extraction", operationId, stage: "admission", ok: true });
    await reporter.completeOperation({ operationType: "extraction", operationId, status: "succeeded" });

    const rows = await sql<{ stage: string; duration_ms: number }[]>`
      SELECT s.stage, (EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) * 1000)::int AS duration_ms
      FROM operation_run_stages s JOIN operation_runs r ON r.operation_run_id = s.operation_run_id
      WHERE r.operation_id = ${operationId}
      ORDER BY s.started_at`;
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.stage), ["concept-discovery", "admission"]);
    for (const row of rows) assert.ok(row.duration_ms >= 0, "each stage has a recoverable non-negative duration");
  } finally {
    await purgeOperationRun(sql, operationId);
    await sql.end({ timeout: 5 });
  }
});

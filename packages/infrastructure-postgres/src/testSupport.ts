import type { Sql } from "postgres";

// Test-only cleanup for the reporter's autocommit rows. The live integration tests
// for PostgresRunProgressReporter / PostgresOperationTimelineRead write committed
// operation_runs (+ child operation_run_stages) into the shared dev DB, which the
// Admin Lab reads. Each test must purge what it created so no orphaned "running"
// row survives to surface as a phantom stalled/failed operation in the operator UI.
//
// The FK operation_run_stages.operation_run_id → operation_runs is NO ACTION (no
// cascade), so child stage rows are deleted before their parents. Scoping by
// operation_id also cleans the shared-id case where two parents share one id.
// The four learner-state tables FK to `learners` (plan 2026-07-07-005, R1), so an
// integration test that writes verdicts / responses / lesson-reads / expeditions must
// first register the learner. Idempotent placeholder insert — the PIN is irrelevant to
// state-table tests.
// Every learner ref a suite has created, so its `after` hook can delete exactly those rows
// (plan 2026-07-07-007, R2) — no pattern deletes, and junk stops accumulating in the shared
// dev DB. Populated by `seedLearner` and by explicit `trackLearner` for registry `create`
// paths that bypass the seed helper. Per-file (node runs each test file in its own process).
const trackedLearnerRefs = new Set<string>();

export async function seedLearner(sql: Sql, learnerRef: string): Promise<string> {
  await sql`
    INSERT INTO learners (learner_ref, display_name, pin_hash)
    VALUES (${learnerRef}, ${learnerRef}, 'test-pin-hash')
    ON CONFLICT (learner_ref) DO NOTHING`;
  trackedLearnerRefs.add(learnerRef);
  return learnerRef;
}

// Record a learner ref created outside `seedLearner` (e.g. a registry `create`) so the
// suite's cleanup deletes it too. Returns the ref for inline use.
export function trackLearner(learnerRef: string): string {
  trackedLearnerRefs.add(learnerRef);
  return learnerRef;
}

// FK-ordered delete of one learner and all five learner-state tables that reference it
// (plan 2026-07-07-007, R2/KTD1 ordering). Children first, then the `learners` row.
export async function deleteLearner(sql: Sql, learnerRef: string): Promise<void> {
  await sql`DELETE FROM learner_expeditions WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM response_log WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM calibration_verdicts WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM lesson_reads WHERE learner_state_ref = ${learnerRef}`;
  await sql`DELETE FROM learner_awards WHERE learner_ref = ${learnerRef}`;
  await sql`DELETE FROM learners WHERE learner_ref = ${learnerRef}`;
}

// A suite's `after` hook: delete every learner it created (AE2 — the `learners` row count is
// unchanged by the run). Opens its own short-lived client because per-test clients are ended.
export async function cleanupTrackedLearners(databaseUrl: string | undefined): Promise<void> {
  if (!databaseUrl || trackedLearnerRefs.size === 0) return;
  const { createDatabaseClient } = await import("./db");
  const sql = createDatabaseClient(databaseUrl);
  try {
    for (const learnerRef of trackedLearnerRefs) await deleteLearner(sql, learnerRef);
    trackedLearnerRefs.clear();
  } finally {
    await sql.end();
  }
}

export async function purgeOperationRun(sql: Sql, operationId: string): Promise<void> {
  await sql`
    DELETE FROM operation_run_stages s
    USING operation_runs r
    WHERE s.operation_run_id = r.operation_run_id AND r.operation_id = ${operationId}`;
  await sql`DELETE FROM operation_runs WHERE operation_id = ${operationId}`;
}

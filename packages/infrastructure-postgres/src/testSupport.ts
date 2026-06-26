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
export async function purgeOperationRun(sql: Sql, operationId: string): Promise<void> {
  await sql`
    DELETE FROM operation_run_stages s
    USING operation_runs r
    WHERE s.operation_run_id = r.operation_run_id AND r.operation_id = ${operationId}`;
  await sql`DELETE FROM operation_runs WHERE operation_id = ${operationId}`;
}

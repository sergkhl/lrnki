import { randomUUID } from "node:crypto";
import { requireAmbientOperationTimelineStageOwnership } from "@lrnki/domain-core/operation-context";
import type { OperationType, RunProgressReporterPort, StageErrorDetail } from "@lrnki/ports";
import type { Sql } from "postgres";

// Incremental, AUTOCOMMIT timeline reporter (KTD3, R1, R3). THE load-bearing
// property: each method runs as a SINGLE statement on the injected `sql` handle,
// never wrapped in `sql.begin` and NEVER enlisted in an operation's terminal
// `persist` transaction. So the parent `running` row is visible the instant
// `beginOperation` commits — a polling client sees `running` mid-run instead of
// "no row, then a finished one" — and an in-flight or crashed run still leaves a
// readable timeline (a stale `last_progress_at` is the "hung run" signal).
//
// The parent is found by the full `(operation_type, operation_id)` natural key —
// the same key `beginOperation` conflicts on. `operation_id` is NOT unique on its
// own: `study_items` deliberately reuses the enrichmentId (ADR-0017 split), so a
// run that scoped by `operation_id` alone would match BOTH the enrichment and the
// study_items parent and, in `enterStage`, emit one stage row per parent under a
// single bound id — a primary-key self-collision. Each multi-write method folds
// its writes into one CTE statement so atomicity holds without a multi-statement
// transaction.
export class PostgresRunProgressReporter implements RunProgressReporterPort {
  constructor(private readonly sql: Sql) {}

  // Insert the parent `running` row at entry. Idempotent-tolerant: a re-begin for
  // the same operation leaves the existing row (including its config_hash) untouched.
  // The DB CHECK requires config_hash for canonicalization and scaffold rows.
  async beginOperation(input: { operationType: OperationType; operationId: string; configHash?: string }): Promise<void> {
    await this.sql`
      INSERT INTO operation_runs (operation_run_id, operation_type, operation_id, status, config_hash, started_at, last_progress_at)
      VALUES (${randomUUID()}, ${input.operationType}, ${input.operationId}, 'running', ${input.configHash ?? null}, now(), now())
      ON CONFLICT (operation_type, operation_id) DO NOTHING`;
  }

  // Open a stage: set the parent's current_stage and reset its per-stage progress
  // counters, then insert the child stage row — one CTE statement.
  async enterStage(input: { operationType: OperationType; operationId: string; stage: string; total?: number }): Promise<void> {
    requireAmbientOperationTimelineStageOwnership(input);
    await this.sql`
      WITH parent AS (
        UPDATE operation_runs
        SET current_stage = ${input.stage},
            progress_done = NULL,
            progress_total = ${input.total ?? null},
            last_progress_at = now()
        WHERE operation_type = ${input.operationType} AND operation_id = ${input.operationId}
        RETURNING operation_run_id
      )
      INSERT INTO operation_run_stages (operation_run_stage_id, operation_run_id, stage, started_at, progress_total)
      SELECT ${randomUUID()}, parent.operation_run_id, ${input.stage}, now(), ${input.total ?? null}
      FROM parent`;
  }

  // Heartbeat (R3): advance the cumulative item count and last_progress_at on both
  // the parent and the currently-open child row for this stage. Monotonic by the
  // caller's contract (done only increases within a stage).
  async recordProgress(input: { operationType: OperationType; operationId: string; stage: string; done: number }): Promise<void> {
    requireAmbientOperationTimelineStageOwnership(input);
    await this.sql`
      WITH parent AS (
        UPDATE operation_runs
        SET progress_done = ${input.done}, last_progress_at = now()
        WHERE operation_type = ${input.operationType} AND operation_id = ${input.operationId}
        RETURNING operation_run_id
      )
      UPDATE operation_run_stages s
      SET progress_done = ${input.done}
      FROM parent
      WHERE s.operation_run_id = parent.operation_run_id
        AND s.stage = ${input.stage}
        AND s.ended_at IS NULL`;
  }

  // Close the open child row for this stage. A failing close also persists the redacted
  // `error_detail` so the operator timeline can show WHY (ADR-0006 fail-closed, inspectable);
  // an ok close clears it. Still one statement on the autocommit handle.
  async completeStage(input: { operationType: OperationType; operationId: string; stage: string; ok: boolean; errorDetail?: StageErrorDetail }): Promise<void> {
    requireAmbientOperationTimelineStageOwnership(input);
    await this.sql`
      UPDATE operation_run_stages s
      SET ended_at = now(), ok = ${input.ok}, error_detail = ${input.errorDetail ? this.sql.json(input.errorDetail as unknown as Parameters<Sql["json"]>[0]) : null}
      FROM operation_runs r
      WHERE s.operation_run_id = r.operation_run_id
        AND r.operation_type = ${input.operationType}
        AND r.operation_id = ${input.operationId}
        AND s.stage = ${input.stage}
        AND s.ended_at IS NULL`;
  }

  // Liveness heartbeat: bump only last_progress_at, and only while the run is open —
  // a touch that raced the terminal write must not resurrect a completed run's
  // freshness. Driven on an interval by runInstrumentedOperation so a single long
  // LLM call cannot make a healthy run look stale-reclaimable.
  async touch(input: { operationType: OperationType; operationId: string }): Promise<void> {
    await this.sql`
      UPDATE operation_runs
      SET last_progress_at = now()
      WHERE operation_type = ${input.operationType}
        AND operation_id = ${input.operationId}
        AND completed_at IS NULL`;
  }

  // Set the parent's terminal status + completed_at.
  async completeOperation(input: { operationType: OperationType; operationId: string; status: "succeeded" | "failed" }): Promise<void> {
    await this.sql`
      UPDATE operation_runs
      SET status = ${input.status}, completed_at = now(), last_progress_at = now()
      WHERE operation_type = ${input.operationType} AND operation_id = ${input.operationId}`;
  }

  // Reap orphaned `running` rows whose heartbeat aged past the shared stale window.
  // This only marks the operation timeline; expedition retry/claim semantics remain
  // owned by PostgresLearnerExpeditionStore.
  async failStaleOperations(input: { staleBefore: Date }): Promise<number> {
    const rows = await this.sql<{ operation_run_id: string }[]>`
      UPDATE operation_runs
      SET status = 'failed',
          completed_at = now(),
          last_progress_at = now()
      WHERE status = 'running'
        AND COALESCE(last_progress_at, started_at) < ${input.staleBefore}
      RETURNING operation_run_id`;
    return rows.length;
  }
}

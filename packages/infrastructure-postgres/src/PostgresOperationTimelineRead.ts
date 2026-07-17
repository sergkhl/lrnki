import type {
  OperationTimelineDetail,
  OperationTimelineReadPort,
  OperationTimelineStage,
  OperationTimelineSummary,
  OperationType,
  StageErrorDetail
} from "@lrnki/ports";
import type { Sql } from "postgres";

// Postgres-backed Operation Timeline read model (R4, ADR-0027). Serves the Admin Lab
// live progress view: pure read over operation_runs + operation_run_stages, no
// adaptation compute. Wall-clock is computed in SQL from the persisted timestamps
// (elapsed = COALESCE(completed_at, now()) - started_at; per-stage = ended_at -
// started_at, NULL while open). Returns finished models or `undefined`-for-not-found;
// real DB errors propagate (ADR-0027 decision 5).

type SummaryRow = {
  operation_run_id: string;
  operation_type: OperationType;
  operation_id: string;
  status: OperationTimelineSummary["status"];
  current_stage: string | null;
  progress_done: number | null;
  progress_total: number | null;
  last_progress_at: string | null;
  started_at: string;
  completed_at: string | null;
  elapsed_ms: number;
  stage_count: number;
  config_hash: string | null;
};

type StageRow = {
  stage: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  ok: boolean | null;
  progress_done: number | null;
  progress_total: number | null;
  error_detail: StageErrorDetail | null;
};

const summaryColumns = (sql: Sql) => sql`
  r.operation_run_id, r.operation_type, r.operation_id, r.status, r.current_stage,
  r.progress_done, r.progress_total, r.last_progress_at, r.started_at, r.completed_at, r.config_hash,
  (EXTRACT(EPOCH FROM (COALESCE(r.completed_at, now()) - r.started_at)) * 1000)::bigint AS elapsed_ms,
  (SELECT count(*) FROM operation_run_stages s WHERE s.operation_run_id = r.operation_run_id)::int AS stage_count`;

export class PostgresOperationTimelineRead implements OperationTimelineReadPort {
  constructor(private readonly sql: Sql) {}

  async listOperationTimelines(): Promise<OperationTimelineSummary[]> {
    const sql = this.sql;
    const rows = await sql<SummaryRow[]>`
      SELECT ${summaryColumns(sql)}
      FROM operation_runs r
      ORDER BY r.started_at DESC`;
    return rows.map(toSummary);
  }

  async getOperationTimeline(operationId: string, operationType?: OperationType): Promise<OperationTimelineDetail | undefined> {
    const sql = this.sql;
    const headers = await sql<SummaryRow[]>`
      SELECT ${summaryColumns(sql)}
      FROM operation_runs r
      WHERE r.operation_id = ${operationId}
        ${operationType ? sql`AND r.operation_type = ${operationType}` : sql``}
      ORDER BY r.started_at DESC
      LIMIT 1`;
    const header = headers[0];
    if (!header) return undefined;

    const stages = await sql<StageRow[]>`
      SELECT s.stage, s.started_at, s.ended_at,
        CASE WHEN s.ended_at IS NULL THEN NULL
             ELSE (EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) * 1000)::bigint END AS duration_ms,
        s.ok, s.progress_done, s.progress_total, s.error_detail
      FROM operation_run_stages s
      JOIN operation_runs r ON r.operation_run_id = s.operation_run_id
      WHERE r.operation_id = ${operationId}
        ${operationType ? sql`AND r.operation_type = ${operationType}` : sql``}
      ORDER BY s.started_at ASC`;

    return { summary: toSummary(header), stages: stages.map(toStage) };
  }
}

function toSummary(row: SummaryRow): OperationTimelineSummary {
  return {
    operationRunId: row.operation_run_id,
    operationType: row.operation_type,
    operationId: row.operation_id,
    status: row.status,
    currentStage: row.current_stage,
    progressDone: row.progress_done,
    progressTotal: row.progress_total,
    lastProgressAt: row.last_progress_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    elapsedMs: Number(row.elapsed_ms),
    stageCount: Number(row.stage_count),
    configHash: row.config_hash
  };
}

function toStage(row: StageRow): OperationTimelineStage {
  return {
    stage: row.stage,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    ok: row.ok,
    progressDone: row.progress_done,
    progressTotal: row.progress_total,
    errorDetail: row.error_detail
  };
}

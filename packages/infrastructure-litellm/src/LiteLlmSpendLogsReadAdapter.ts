import { STAGE_TAGS } from "@lrnki/domain-core";
import type { OperationStageSpend, OperationStageSpendReadPort } from "@lrnki/ports";
import postgres, { type Sql } from "postgres";

type SpendLogAggregateRow = {
  operation_id: string;
  stage: string;
  log_count: number | string;
  total_spend: number | string | null;
  total_tokens: number | string | null;
};

export class LiteLlmSpendLogsReadAdapter implements OperationStageSpendReadPort {
  private readonly sql: Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 2 });
  }

  async readOperationStageSpend(operationIds: string[]): Promise<OperationStageSpend[]> {
    if (operationIds.length === 0) return [];
    const sql = this.sql;
    const stageTags = Object.values(STAGE_TAGS);
    const rows = await sql<SpendLogAggregateRow[]>`
      SELECT operation_tag.value AS operation_id,
             stage_tag.value AS stage,
             count(*)::int AS log_count,
             COALESCE(sum(log.spend), 0) AS total_spend,
             COALESCE(sum(log.total_tokens), 0)::bigint AS total_tokens
      FROM "LiteLLM_SpendLogs" log
      JOIN LATERAL jsonb_array_elements_text(COALESCE(log.request_tags, '[]'::jsonb))
        AS operation_tag(value) ON operation_tag.value IN ${sql(operationIds)}
      JOIN LATERAL jsonb_array_elements_text(COALESCE(log.request_tags, '[]'::jsonb))
        AS stage_tag(value) ON stage_tag.value IN ${sql(stageTags)}
      GROUP BY operation_tag.value, stage_tag.value
      ORDER BY operation_tag.value, stage_tag.value`;
    return shapeOperationStageSpend(rows);
  }

  async end(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

export function shapeOperationStageSpend(rows: SpendLogAggregateRow[]): OperationStageSpend[] {
  return rows.map((row) => ({
    operationId: row.operation_id,
    stage: row.stage,
    logCount: Number(row.log_count),
    totalSpend: Number(row.total_spend ?? 0),
    totalTokens: Number(row.total_tokens ?? 0)
  }));
}

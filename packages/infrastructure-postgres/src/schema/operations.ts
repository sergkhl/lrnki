import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const operationRuns = pgTable(
  "operation_runs",
  {
    operationRunId: uuid("operation_run_id").primaryKey().notNull(),
    operationType: text("operation_type").notNull(),
    operationId: uuid("operation_id").notNull(),
    status: text("status").notNull(),
    currentStage: text("current_stage"),
    progressDone: integer("progress_done"),
    progressTotal: integer("progress_total"),
    lastProgressAt: timestamp("last_progress_at", { withTimezone: true, mode: "string" }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    configHash: text("config_hash"),
  },
  (table) => [
    unique("operation_runs_operation_type_operation_id_key").on(
      table.operationType,
      table.operationId,
    ),
    check(
      "operation_runs_operation_type_check",
      sql`operation_type IN ('extraction', 'canonicalization', 'minting', 'enrichment', 'study_items', 'scaffold')`,
    ),
    check("operation_runs_status_check", sql`status IN ('running', 'succeeded', 'failed')`),
    check(
      "operation_runs_check",
      sql`operation_type NOT IN ('canonicalization', 'scaffold') OR config_hash IS NOT NULL`,
    ),
  ],
);

export const operationRunStages = pgTable(
  "operation_run_stages",
  {
    operationRunStageId: uuid("operation_run_stage_id").primaryKey().notNull(),
    operationRunId: uuid("operation_run_id").notNull(),
    stage: text("stage").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "string" }),
    ok: boolean("ok"),
    progressDone: integer("progress_done"),
    progressTotal: integer("progress_total"),
    errorDetail: jsonb("error_detail"),
  },
  (table) => [
    foreignKey({
      columns: [table.operationRunId],
      foreignColumns: [operationRuns.operationRunId],
      name: "operation_run_stages_operation_run_id_fkey",
    }),
    index("operation_run_stages_run_idx").on(table.operationRunId),
  ],
);

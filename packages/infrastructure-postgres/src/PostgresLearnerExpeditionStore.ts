import type {
  LearnerExpedition,
  LearnerExpeditionKind,
  LearnerExpeditionStatus,
  LearnerExpeditionStorePort,
  NewLearnerExpedition,
  OperationType
} from "@lrnki/ports";
import type { Sql } from "postgres";

export class PostgresLearnerExpeditionStore implements LearnerExpeditionStorePort {
  constructor(private readonly sql: Sql) {}

  async upsert(expedition: NewLearnerExpedition): Promise<void> {
    await this.sql.begin(async (tx) => {
      if (expedition.active) {
        await tx`UPDATE learner_expeditions SET active = false, updated_at = now() WHERE learner_state_ref = ${expedition.learnerStateRef}`;
      }
      if (expedition.enrichmentId) {
        await tx`
          INSERT INTO learner_expeditions (
            learner_expedition_id, learner_state_ref, kind, title, declared_domain, status,
            current_operation_id, current_operation_type, enrichment_id,
            active, failure_message
          )
          VALUES (
            ${expedition.learnerExpeditionId}, ${expedition.learnerStateRef}, ${expedition.kind},
            ${expedition.title}, ${expedition.declaredDomain}, ${expedition.status},
            ${expedition.currentOperationId ?? null}, ${expedition.currentOperationType ?? null},
            ${expedition.enrichmentId},
            ${expedition.active ?? false}, ${expedition.failureMessage ?? null}
          )
          ON CONFLICT (learner_state_ref, enrichment_id) WHERE enrichment_id IS NOT NULL DO UPDATE SET
            kind = EXCLUDED.kind,
            title = EXCLUDED.title,
            declared_domain = EXCLUDED.declared_domain,
            status = EXCLUDED.status,
            current_operation_id = EXCLUDED.current_operation_id,
            current_operation_type = EXCLUDED.current_operation_type,
            active = EXCLUDED.active,
            failure_message = EXCLUDED.failure_message,
            updated_at = now()`;
      } else {
        await tx`
          INSERT INTO learner_expeditions (
            learner_expedition_id, learner_state_ref, kind, title, declared_domain, status,
            current_operation_id, current_operation_type, enrichment_id,
            active, failure_message
          )
          VALUES (
            ${expedition.learnerExpeditionId}, ${expedition.learnerStateRef}, ${expedition.kind},
            ${expedition.title}, ${expedition.declaredDomain}, ${expedition.status},
            ${expedition.currentOperationId ?? null}, ${expedition.currentOperationType ?? null},
            null,
            ${expedition.active ?? false}, ${expedition.failureMessage ?? null}
          )
          ON CONFLICT (learner_expedition_id) DO UPDATE SET
            learner_state_ref = EXCLUDED.learner_state_ref,
            kind = EXCLUDED.kind,
            title = EXCLUDED.title,
            declared_domain = EXCLUDED.declared_domain,
            status = EXCLUDED.status,
            current_operation_id = EXCLUDED.current_operation_id,
            current_operation_type = EXCLUDED.current_operation_type,
            active = EXCLUDED.active,
            failure_message = EXCLUDED.failure_message,
            updated_at = now()`;
      }
    });
  }

  async listForLearner(learnerStateRef: string): Promise<LearnerExpedition[]> {
    const rows = await this.sql<LearnerExpeditionRow[]>`
      SELECT ${learnerExpeditionColumns(this.sql)}
      FROM learner_expeditions
      WHERE learner_state_ref = ${learnerStateRef}
      ORDER BY active DESC, created_at DESC`;
    return rows.map(toLearnerExpedition);
  }

  async getForLearner(input: { learnerStateRef: string; learnerExpeditionId: string }): Promise<LearnerExpedition | undefined> {
    const rows = await this.sql<LearnerExpeditionRow[]>`
      SELECT ${learnerExpeditionColumns(this.sql)}
      FROM learner_expeditions
      WHERE learner_state_ref = ${input.learnerStateRef} AND learner_expedition_id = ${input.learnerExpeditionId}
      LIMIT 1`;
    return rows[0] ? toLearnerExpedition(rows[0]) : undefined;
  }

  async getByEnrichment(input: { learnerStateRef: string; enrichmentId: string }): Promise<LearnerExpedition | undefined> {
    const rows = await this.sql<LearnerExpeditionRow[]>`
      SELECT ${learnerExpeditionColumns(this.sql)}
      FROM learner_expeditions
      WHERE learner_state_ref = ${input.learnerStateRef} AND enrichment_id = ${input.enrichmentId}
      ORDER BY created_at DESC
      LIMIT 1`;
    return rows[0] ? toLearnerExpedition(rows[0]) : undefined;
  }

  async setActive(input: { learnerStateRef: string; learnerExpeditionId: string }): Promise<void> {
    await this.sql.begin(async (tx) => {
      const target = await tx<{ learner_expedition_id: string }[]>`
        SELECT learner_expedition_id
        FROM learner_expeditions
        WHERE learner_state_ref = ${input.learnerStateRef} AND learner_expedition_id = ${input.learnerExpeditionId}
        LIMIT 1`;
      if (target.length === 0) return;
      await tx`
        UPDATE learner_expeditions
        SET active = false, updated_at = now()
        WHERE learner_state_ref = ${input.learnerStateRef} AND learner_expedition_id <> ${input.learnerExpeditionId}`;
      await tx`
        UPDATE learner_expeditions
        SET active = true, updated_at = now()
        WHERE learner_state_ref = ${input.learnerStateRef} AND learner_expedition_id = ${input.learnerExpeditionId}`;
    });
  }

  async claimNextGenerating(input: { staleBefore: Date; maxAttempts: number }): Promise<LearnerExpedition | undefined> {
    const rows = await this.sql<LearnerExpeditionRow[]>`
      WITH candidate AS (
        SELECT le.learner_expedition_id
        FROM learner_expeditions le
        LEFT JOIN operation_runs opr
          ON opr.operation_id = le.current_operation_id
         AND opr.operation_type = le.current_operation_type
        WHERE le.status = 'generating'
          AND le.generation_attempts < ${input.maxAttempts}
          AND (
            le.current_operation_id IS NULL
            OR (
              le.claimed_at < ${input.staleBefore}
              AND COALESCE(opr.last_progress_at, le.updated_at) < ${input.staleBefore}
            )
          )
        ORDER BY le.created_at ASC
        LIMIT 1
        FOR UPDATE OF le SKIP LOCKED
      )
      UPDATE learner_expeditions le
      SET claimed_at = now(),
          generation_attempts = le.generation_attempts + 1,
          updated_at = now()
      FROM candidate
      WHERE le.learner_expedition_id = candidate.learner_expedition_id
      RETURNING ${learnerExpeditionColumnsFromAlias(this.sql, this.sql`le`)}`;
    return rows[0] ? toLearnerExpedition(rows[0]) : undefined;
  }

  async failExhaustedGenerating(input: { staleBefore: Date; maxAttempts: number; failureMessage: string }): Promise<number> {
    const rows = await this.sql<{ learner_expedition_id: string }[]>`
      UPDATE learner_expeditions le
      SET status = 'failed',
          failure_message = ${input.failureMessage},
          claimed_at = null,
          updated_at = now()
      WHERE le.status = 'generating'
        AND le.generation_attempts >= ${input.maxAttempts}
        AND (
          le.current_operation_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM operation_runs opr
            WHERE opr.operation_id = le.current_operation_id
              AND opr.operation_type = le.current_operation_type
              AND le.claimed_at < ${input.staleBefore}
              AND opr.last_progress_at < ${input.staleBefore}
          )
        )
      RETURNING le.learner_expedition_id`;
    return rows.length;
  }

  async resetGeneration(input: { learnerStateRef: string; learnerExpeditionId: string }): Promise<void> {
    await this.sql.begin(async (tx) => {
      const target = await tx<{ learner_expedition_id: string }[]>`
        SELECT learner_expedition_id
        FROM learner_expeditions
        WHERE learner_state_ref = ${input.learnerStateRef} AND learner_expedition_id = ${input.learnerExpeditionId}
        LIMIT 1`;
      if (target.length === 0) return;
      await tx`
        UPDATE learner_expeditions
        SET active = false, updated_at = now()
        WHERE learner_state_ref = ${input.learnerStateRef}
          AND learner_expedition_id <> ${input.learnerExpeditionId}`;
      await tx`
        UPDATE learner_expeditions
        SET status = 'generating',
            current_operation_id = null,
            current_operation_type = null,
            failure_message = null,
            generation_attempts = 0,
            claimed_at = null,
            active = true,
            updated_at = now()
        WHERE learner_state_ref = ${input.learnerStateRef}
          AND learner_expedition_id = ${input.learnerExpeditionId}`;
    });
  }

  async updateProgress(input: {
    learnerExpeditionId: string;
    status?: LearnerExpeditionStatus;
    currentOperationId?: string | null;
    currentOperationType?: OperationType | null;
    enrichmentId?: string | null;
    declaredDomain?: string | null;
    failureMessage?: string | null;
  }): Promise<void> {
    await this.sql`
      UPDATE learner_expeditions
      SET
        status = COALESCE(${input.status ?? null}, status),
        current_operation_id = ${input.currentOperationId === undefined ? this.sql`current_operation_id` : input.currentOperationId},
        current_operation_type = ${input.currentOperationType === undefined ? this.sql`current_operation_type` : input.currentOperationType},
        enrichment_id = ${input.enrichmentId === undefined ? this.sql`enrichment_id` : input.enrichmentId},
        declared_domain = ${input.declaredDomain === undefined ? this.sql`declared_domain` : input.declaredDomain},
        failure_message = ${input.failureMessage === undefined ? this.sql`failure_message` : input.failureMessage},
        updated_at = now()
      WHERE learner_expedition_id = ${input.learnerExpeditionId}`;
  }
}

const learnerExpeditionColumns = (sql: Sql) => sql`
  learner_expedition_id, learner_state_ref, kind, title, declared_domain, status,
  current_operation_id, current_operation_type, enrichment_id,
  active, failure_message, generation_attempts, claimed_at, created_at, updated_at`;

const learnerExpeditionColumnsFromAlias = (sql: Sql, alias: ReturnType<Sql>) => sql`
  ${alias}.learner_expedition_id, ${alias}.learner_state_ref, ${alias}.kind, ${alias}.title,
  ${alias}.declared_domain, ${alias}.status, ${alias}.current_operation_id, ${alias}.current_operation_type,
  ${alias}.enrichment_id, ${alias}.active, ${alias}.failure_message, ${alias}.generation_attempts,
  ${alias}.claimed_at, ${alias}.created_at, ${alias}.updated_at`;

function toLearnerExpedition(row: LearnerExpeditionRow): LearnerExpedition {
  return {
    learnerExpeditionId: row.learner_expedition_id,
    learnerStateRef: row.learner_state_ref,
    kind: row.kind as LearnerExpeditionKind,
    title: row.title,
    declaredDomain: row.declared_domain,
    status: row.status as LearnerExpeditionStatus,
    currentOperationId: row.current_operation_id,
    currentOperationType: row.current_operation_type as OperationType | null,
    enrichmentId: row.enrichment_id,
    active: row.active,
    failureMessage: row.failure_message,
    generationAttempts: row.generation_attempts,
    claimedAt: row.claimed_at ? new Date(row.claimed_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

type LearnerExpeditionRow = {
  learner_expedition_id: string;
  learner_state_ref: string;
  kind: string;
  title: string;
  declared_domain: string | null;
  status: string;
  current_operation_id: string | null;
  current_operation_type: string | null;
  enrichment_id: string | null;
  active: boolean;
  failure_message: string | null;
  generation_attempts: number;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

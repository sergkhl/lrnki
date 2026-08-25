import { randomUUID } from "node:crypto";
import type {
  ClaimedLearnerExpedition,
  LearnerExpedition,
  LearnerExpeditionKind,
  LearnerExpeditionStatus,
  LearnerExpeditionStorePort,
  NewLearnerExpedition,
  OperationType,
  SourceExpeditionAssetExpectation,
  SourceExpeditionStorePort
} from "@lrnki/ports";
import type { Sql, TransactionSql } from "postgres";

export class PostgresLearnerExpeditionStore implements LearnerExpeditionStorePort, SourceExpeditionStorePort {
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
            asset_set_identity, active, failure_message
          )
          VALUES (
            ${expedition.learnerExpeditionId}, ${expedition.learnerStateRef}, ${expedition.kind},
            ${expedition.title}, ${expedition.declaredDomain}, ${expedition.status},
            ${expedition.currentOperationId ?? null}, ${expedition.currentOperationType ?? null},
            ${expedition.enrichmentId},
            ${expedition.assetSetIdentity ?? null}, ${expedition.active ?? false},
            ${expedition.failureMessage ?? null}
          )
          ON CONFLICT (learner_state_ref, enrichment_id) WHERE enrichment_id IS NOT NULL DO UPDATE SET
            kind = EXCLUDED.kind,
            title = EXCLUDED.title,
            declared_domain = EXCLUDED.declared_domain,
            status = EXCLUDED.status,
            current_operation_id = EXCLUDED.current_operation_id,
            current_operation_type = EXCLUDED.current_operation_type,
            asset_set_identity = EXCLUDED.asset_set_identity,
            active = EXCLUDED.active,
            failure_message = EXCLUDED.failure_message,
            updated_at = now()`;
      } else {
        await tx`
          INSERT INTO learner_expeditions (
            learner_expedition_id, learner_state_ref, kind, title, declared_domain, status,
            current_operation_id, current_operation_type, enrichment_id,
            asset_set_identity, active, failure_message
          )
          VALUES (
            ${expedition.learnerExpeditionId}, ${expedition.learnerStateRef}, ${expedition.kind},
            ${expedition.title}, ${expedition.declaredDomain}, ${expedition.status},
            ${expedition.currentOperationId ?? null}, ${expedition.currentOperationType ?? null},
            null,
            ${expedition.assetSetIdentity ?? null}, ${expedition.active ?? false},
            ${expedition.failureMessage ?? null}
          )
          ON CONFLICT (learner_expedition_id) DO UPDATE SET
            learner_state_ref = EXCLUDED.learner_state_ref,
            kind = EXCLUDED.kind,
            title = EXCLUDED.title,
            declared_domain = EXCLUDED.declared_domain,
            status = EXCLUDED.status,
            current_operation_id = EXCLUDED.current_operation_id,
            current_operation_type = EXCLUDED.current_operation_type,
            asset_set_identity = EXCLUDED.asset_set_identity,
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

  async adoptSourceExpedition(input: {
    learnerExpeditionId: string;
    learnerStateRef: string;
    enrichmentId: string;
    title: string;
    declaredDomain: string;
    expectedAssets: SourceExpeditionAssetExpectation;
  }): Promise<
    | { adopted: true; learnerExpeditionId: string }
    | { adopted: false; refused: "asset_set_changed" }
  > {
    return this.sql.begin(async (tx) => {
      if (!await currentSourceExpeditionAssetsMatch(tx, input.enrichmentId, input.expectedAssets)) {
        return { adopted: false as const, refused: "asset_set_changed" as const };
      }
      await tx`
        UPDATE learner_expeditions
        SET active = false, updated_at = now()
        WHERE learner_state_ref = ${input.learnerStateRef}`;
      const rows = await tx<{ learner_expedition_id: string }[]>`
        INSERT INTO learner_expeditions (
          learner_expedition_id, learner_state_ref, kind, title, declared_domain, status,
          current_operation_id, current_operation_type, enrichment_id, asset_set_identity,
          active, failure_message, generation_attempts, claimed_at
        ) VALUES (
          ${input.learnerExpeditionId}, ${input.learnerStateRef}, 'source', ${input.title},
          ${input.declaredDomain}, 'ready', null, null, ${input.enrichmentId},
          ${input.expectedAssets.assetSetIdentity}, true, null, 0, null
        )
        ON CONFLICT (learner_state_ref, enrichment_id) WHERE enrichment_id IS NOT NULL DO UPDATE SET
          kind = 'source',
          title = EXCLUDED.title,
          declared_domain = EXCLUDED.declared_domain,
          status = 'ready',
          current_operation_id = null,
          current_operation_type = null,
          asset_set_identity = EXCLUDED.asset_set_identity,
          active = true,
          failure_message = null,
          generation_attempts = 0,
          claimed_at = null,
          updated_at = now()
        RETURNING learner_expedition_id`;
      return { adopted: true as const, learnerExpeditionId: rows[0].learner_expedition_id };
    });
  }

  async activateSourceExpedition(input: {
    learnerStateRef: string;
    learnerExpeditionId: string;
    enrichmentId: string;
    expectedAssets: SourceExpeditionAssetExpectation;
  }): Promise<
    | { activated: true }
    | { activated: false; refused: "not_found" | "asset_set_changed" }
  > {
    return this.sql.begin(async (tx) => {
      const targets = await tx<{ asset_set_identity: string | null }[]>`
        SELECT asset_set_identity
        FROM learner_expeditions
        WHERE learner_state_ref = ${input.learnerStateRef}
          AND learner_expedition_id = ${input.learnerExpeditionId}
          AND enrichment_id = ${input.enrichmentId}
          AND kind = 'source'
          AND status = 'ready'
        FOR UPDATE`;
      if (!targets[0]) return { activated: false as const, refused: "not_found" as const };
      if (targets[0].asset_set_identity !== input.expectedAssets.assetSetIdentity ||
          !await currentSourceExpeditionAssetsMatch(tx, input.enrichmentId, input.expectedAssets)) {
        return { activated: false as const, refused: "asset_set_changed" as const };
      }
      await tx`
        UPDATE learner_expeditions
        SET active = false, updated_at = now()
        WHERE learner_state_ref = ${input.learnerStateRef}
          AND learner_expedition_id <> ${input.learnerExpeditionId}`;
      await tx`
        UPDATE learner_expeditions
        SET active = true, updated_at = now()
        WHERE learner_state_ref = ${input.learnerStateRef}
          AND learner_expedition_id = ${input.learnerExpeditionId}`;
      return { activated: true as const };
    });
  }

  // ONE staleness predicate, shared verbatim by claim and fail-exhausted (only the
  // attempts comparison differs). A row is dead — reclaimable or failable — when it
  // was never claimed, or its claim aged past the stale window AND its operation
  // heartbeat did too. COALESCE covers the crash window where an operation id is set
  // but the operation_runs row was never inserted: the expedition's own updated_at
  // stands in for the missing heartbeat, so no row is permanently untouchable.
  // claimed_at alone (not `current_operation_id IS NULL`) gates re-claims: the claim
  // atomically replaces the operation id with a fresh fence, while a transiently-released
  // row clears it but keeps claimed_at as natural backoff.
  private generatingStaleness(staleBefore: Date) {
    return this.sql`
      le.kind = 'topic'
      AND le.status = 'generating'
      AND (
        le.claimed_at IS NULL
        OR (
          le.claimed_at < ${staleBefore}
          AND COALESCE(opr.last_progress_at, le.updated_at) < ${staleBefore}
        )
      )`;
  }

  async claimNextGenerating(input: { staleBefore: Date; maxAttempts: number }): Promise<ClaimedLearnerExpedition | undefined> {
    // The enrichment operation id is also the fencing token. Installing it in the
    // claim statement removes the ambiguous claim-with-null crash/race window.
    const token = randomUUID();
    const rows = await this.sql<LearnerExpeditionRow[]>`
      WITH candidate AS (
        SELECT le.learner_expedition_id
        FROM learner_expeditions le
        LEFT JOIN operation_runs opr
          ON opr.operation_id = le.current_operation_id
         AND opr.operation_type = le.current_operation_type
        WHERE ${this.generatingStaleness(input.staleBefore)}
          AND le.generation_attempts < ${input.maxAttempts}
        ORDER BY le.created_at ASC
        LIMIT 1
        FOR UPDATE OF le SKIP LOCKED
      )
      UPDATE learner_expeditions le
      SET claimed_at = now(),
          generation_attempts = le.generation_attempts + 1,
          current_operation_id = ${token},
          current_operation_type = 'enrichment',
          updated_at = now()
      FROM candidate
      WHERE le.learner_expedition_id = candidate.learner_expedition_id
      RETURNING ${learnerExpeditionColumnsFromAlias(this.sql, this.sql`le`)}`;
    if (!rows[0]) return undefined;
    return toClaimedLearnerExpedition(rows[0]);
  }

  async failExhaustedGenerating(input: { staleBefore: Date; maxAttempts: number; failureMessage: string }): Promise<number> {
    const rows = await this.sql<{ learner_expedition_id: string }[]>`
      WITH candidate AS (
        SELECT le.learner_expedition_id
        FROM learner_expeditions le
        LEFT JOIN operation_runs opr
          ON opr.operation_id = le.current_operation_id
         AND opr.operation_type = le.current_operation_type
        WHERE ${this.generatingStaleness(input.staleBefore)}
          AND le.generation_attempts >= ${input.maxAttempts}
        FOR UPDATE OF le SKIP LOCKED
      )
      UPDATE learner_expeditions le
      SET status = 'failed',
          failure_message = ${input.failureMessage},
          claimed_at = null,
          updated_at = now()
      FROM candidate
      WHERE le.learner_expedition_id = candidate.learner_expedition_id
      RETURNING le.learner_expedition_id`;
    return rows.length;
  }

  async resetGeneration(input: { learnerStateRef: string; learnerExpeditionId: string }): Promise<void> {
    await this.sql.begin(async (tx) => {
      // Failed rows only: a Retry that races a completed generation must not flip a
      // `ready` expedition back to `generating` and regenerate it.
      const target = await tx<{ learner_expedition_id: string }[]>`
        SELECT learner_expedition_id
        FROM learner_expeditions
        WHERE learner_state_ref = ${input.learnerStateRef}
          AND learner_expedition_id = ${input.learnerExpeditionId}
          AND status = 'failed'
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
    expectedOperationId: string | null;
    status?: LearnerExpeditionStatus;
    currentOperationId?: string | null;
    currentOperationType?: OperationType | null;
    enrichmentId?: string | null;
    declaredDomain?: string | null;
    failureMessage?: string | null;
  }): Promise<number> {
    const rows = await this.sql<{ learner_expedition_id: string }[]>`
      UPDATE learner_expeditions
      SET
        status = COALESCE(${input.status ?? null}, status),
        current_operation_id = ${input.currentOperationId === undefined ? this.sql`current_operation_id` : input.currentOperationId},
        current_operation_type = ${input.currentOperationType === undefined ? this.sql`current_operation_type` : input.currentOperationType},
        enrichment_id = ${input.enrichmentId === undefined ? this.sql`enrichment_id` : input.enrichmentId},
        declared_domain = ${input.declaredDomain === undefined ? this.sql`declared_domain` : input.declaredDomain},
        failure_message = ${input.failureMessage === undefined ? this.sql`failure_message` : input.failureMessage},
        updated_at = now()
      WHERE learner_expedition_id = ${input.learnerExpeditionId}
        AND current_operation_id IS NOT DISTINCT FROM ${input.expectedOperationId}
      RETURNING learner_expedition_id`;
    return rows.length;
  }
}

function toClaimedLearnerExpedition(row: LearnerExpeditionRow): ClaimedLearnerExpedition {
  const expedition = toLearnerExpedition(row);
  if (!expedition.currentOperationId || expedition.currentOperationType !== "enrichment") {
    throw new Error(`Claimed expedition ${expedition.learnerExpeditionId} has no enrichment operation token.`);
  }
  return {
    ...expedition,
    currentOperationId: expedition.currentOperationId,
    currentOperationType: expedition.currentOperationType
  };
}

const learnerExpeditionColumns = (sql: Sql) => sql`
  learner_expedition_id, learner_state_ref, kind, title, declared_domain, status,
  current_operation_id, current_operation_type, enrichment_id,
  asset_set_identity, active, failure_message, generation_attempts, claimed_at, created_at, updated_at`;

const learnerExpeditionColumnsFromAlias = (sql: Sql, alias: ReturnType<Sql>) => sql`
  ${alias}.learner_expedition_id, ${alias}.learner_state_ref, ${alias}.kind, ${alias}.title,
  ${alias}.declared_domain, ${alias}.status, ${alias}.current_operation_id, ${alias}.current_operation_type,
  ${alias}.enrichment_id, ${alias}.asset_set_identity, ${alias}.active, ${alias}.failure_message,
  ${alias}.generation_attempts,
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
    assetSetIdentity: row.asset_set_identity,
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
  asset_set_identity: string | null;
  active: boolean;
  failure_message: string | null;
  generation_attempts: number;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

// One persistence-level race check shared by Source Expedition adoption/activation and direct
// exact-reference Support Path publication. Qualification snapshots only the learner-visible
// floored trail. Extra current inspection assets (off-trail lessons/options and held-out families)
// neither grant readiness nor invalidate it; every expected visible id must still be current.
export async function currentSourceExpeditionAssetsMatch(
  tx: Sql | TransactionSql,
  enrichmentId: string,
  expected: SourceExpeditionAssetExpectation
): Promise<boolean> {
  const enrichments = await tx<{ enrichment_id: string }[]>`
    SELECT enrichment_id
    FROM graph_enrichments
    WHERE enrichment_id = ${enrichmentId}
      AND graph_version_id IS NOT NULL
      AND status = 'succeeded'
    FOR SHARE`;
  if (!enrichments[0]) return false;

  const lessonRows = await tx<{ concept_lesson_id: string }[]>`
    SELECT concept_lesson_id
    FROM concept_lessons
    WHERE enrichment_id = ${enrichmentId} AND superseded_at IS NULL
    ORDER BY concept_lesson_id
    FOR SHARE`;
  const itemRows = await tx<{ study_item_id: string }[]>`
    SELECT study_item_id
    FROM study_items
    WHERE enrichment_id = ${enrichmentId}
      AND item_type = 'option_select'
      AND superseded_at IS NULL
    ORDER BY study_item_id
    FOR SHARE`;
  const expectedLessonIds = new Set(expected.currentConceptLessonIds);
  const expectedItemIds = new Set(expected.currentStudyItemIds);
  return sameIds(
    lessonRows
      .map((row) => row.concept_lesson_id)
      .filter((conceptLessonId) => expectedLessonIds.has(conceptLessonId)),
    expected.currentConceptLessonIds
  ) && sameIds(
    itemRows
      .map((row) => row.study_item_id)
      .filter((studyItemId) => expectedItemIds.has(studyItemId)),
    expected.currentStudyItemIds
  );
}

function sameIds(actual: string[], expected: string[]): boolean {
  const sortedExpected = [...expected].sort((left, right) => left.localeCompare(right));
  return actual.length === sortedExpected.length &&
    actual.every((value, index) => value === sortedExpected[index]);
}

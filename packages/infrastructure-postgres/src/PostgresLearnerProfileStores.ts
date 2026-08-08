import type { LearnerAward, LearnerAwardsStorePort, LearnerProfile, LearnerProfileReadPort } from "@lrnki/ports";
import type { Sql } from "postgres";

type JsonParam = Parameters<Sql["json"]>[0];

// Read-only projection of Better Auth's `user` table (ADR-0041). Better Auth owns every write
// to it — account creation, the explorer rename, deletion — so this class has no create, update,
// or delete method and must never grow one: a second way to mint an identity is exactly what
// adopting the framework removed. `user` is a reserved word in SQL, so it is always quoted.
export class PostgresLearnerProfileRead implements LearnerProfileReadPort {
  constructor(private readonly sql: Sql) {}

  async list(): Promise<LearnerProfile[]> {
    const rows = await this.sql<LearnerProfileRow[]>`
      SELECT id, name, created_at FROM "user" ORDER BY created_at ASC`;
    return rows.map(hydrateProfile);
  }

  // The union of learner refs that appear in ANY of the three evidence tables (R4/KTD2). One
  // indexed distinct-union read replaces the per-learner projection cost for dormant learners.
  async listRefsWithStudyEvidence(): Promise<string[]> {
    const rows = await this.sql<{ learner_state_ref: string }[]>`
      SELECT learner_state_ref FROM response_log
      UNION
      SELECT learner_state_ref FROM lesson_reads
      UNION
      SELECT learner_state_ref FROM calibration_verdicts`;
    return rows.map((row) => row.learner_state_ref);
  }
}

// Durable award persistence (R8). `record` is idempotent on the
// (learner_ref, award_type, dedupe_key) UNIQUE: a repeat write returns no row, so the
// caller learns the award already existed and never double-counts. Reads feed board
// flair; `listForLearners` batches the whole cohort in one query.
export class PostgresLearnerAwardsStore implements LearnerAwardsStorePort {
  constructor(private readonly sql: Sql) {}

  async record(input: {
    awardId: string;
    learnerRef: string;
    awardType: LearnerAward["awardType"];
    dedupeKey: string;
    context: Record<string, unknown>;
  }): Promise<{ recorded: boolean }> {
    const rows = await this.sql<{ award_id: string }[]>`
      INSERT INTO learner_awards (award_id, learner_ref, award_type, dedupe_key, context)
      VALUES (${input.awardId}, ${input.learnerRef}, ${input.awardType}, ${input.dedupeKey}, ${this.sql.json(input.context as JsonParam)})
      ON CONFLICT (learner_ref, award_type, dedupe_key) DO NOTHING
      RETURNING award_id`;
    return { recorded: rows.length > 0 };
  }

  async listForLearner(learnerRef: string): Promise<LearnerAward[]> {
    const rows = await this.sql<LearnerAwardRow[]>`
      SELECT award_id, learner_ref, award_type, dedupe_key, context, created_at
      FROM learner_awards WHERE learner_ref = ${learnerRef} ORDER BY created_at DESC`;
    return rows.map(hydrateAward);
  }

  async listForLearners(learnerRefs: string[]): Promise<LearnerAward[]> {
    if (learnerRefs.length === 0) return [];
    const rows = await this.sql<LearnerAwardRow[]>`
      SELECT award_id, learner_ref, award_type, dedupe_key, context, created_at
      FROM learner_awards WHERE learner_ref IN ${this.sql(learnerRefs)} ORDER BY created_at DESC`;
    return rows.map(hydrateAward);
  }
}

type LearnerProfileRow = { id: string; name: string; created_at: string };
type LearnerAwardRow = {
  award_id: string;
  learner_ref: string;
  award_type: LearnerAward["awardType"];
  dedupe_key: string;
  context: Record<string, unknown>;
  created_at: string;
};

function hydrateProfile(row: LearnerProfileRow): LearnerProfile {
  return {
    learnerRef: row.id,
    displayName: row.name,
    createdAt: new Date(row.created_at).toISOString()
  };
}

function hydrateAward(row: LearnerAwardRow): LearnerAward {
  return {
    awardId: row.award_id,
    learnerRef: row.learner_ref,
    awardType: row.award_type,
    dedupeKey: row.dedupe_key,
    context: row.context,
    createdAt: new Date(row.created_at).toISOString()
  };
}

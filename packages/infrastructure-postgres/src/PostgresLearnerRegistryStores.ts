import type { Learner, LearnerAward, LearnerAwardsStorePort, LearnerStorePort } from "@lrnki/ports";
import type { Sql } from "postgres";

type JsonParam = Parameters<Sql["json"]>[0];

// Learner Registry persistence (plan 2026-07-07-005, R1/R2). `create` inserts the row
// and reports whether it landed: `ON CONFLICT DO NOTHING` on the `learner_ref` primary
// key makes a duplicate ref a no-op, which the gate reads as "name taken" (KTD8 keeps
// PIN comparison in the use-case; this store only persists the hash). Reads feed the
// picker; the store never hashes.
export class PostgresLearnerStore implements LearnerStorePort {
  constructor(private readonly sql: Sql) {}

  async create(input: { learnerRef: string; displayName: string; pinHash: string }): Promise<{ created: boolean }> {
    const rows = await this.sql<{ learner_ref: string }[]>`
      INSERT INTO learners (learner_ref, display_name, pin_hash)
      VALUES (${input.learnerRef}, ${input.displayName}, ${input.pinHash})
      ON CONFLICT (learner_ref) DO NOTHING
      RETURNING learner_ref`;
    return { created: rows.length > 0 };
  }

  async get(learnerRef: string): Promise<Learner | undefined> {
    const rows = await this.sql<LearnerRow[]>`
      SELECT learner_ref, display_name, pin_hash, created_at
      FROM learners WHERE learner_ref = ${learnerRef} LIMIT 1`;
    return rows.length > 0 ? hydrateLearner(rows[0]) : undefined;
  }

  async list(): Promise<Learner[]> {
    const rows = await this.sql<LearnerRow[]>`
      SELECT learner_ref, display_name, pin_hash, created_at
      FROM learners ORDER BY created_at ASC`;
    return rows.map(hydrateLearner);
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

type LearnerRow = { learner_ref: string; display_name: string; pin_hash: string; created_at: string };
type LearnerAwardRow = {
  award_id: string;
  learner_ref: string;
  award_type: LearnerAward["awardType"];
  dedupe_key: string;
  context: Record<string, unknown>;
  created_at: string;
};

function hydrateLearner(row: LearnerRow): Learner {
  return {
    learnerRef: row.learner_ref,
    displayName: row.display_name,
    pinHash: row.pin_hash,
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

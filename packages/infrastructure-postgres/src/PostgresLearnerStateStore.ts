import {
  emptyLearnerStateV1,
  parseLearnerStateV1,
  type BoardLearnerState,
  type LearnerStateStore,
  type LearnerStateV1,
  type StateCommit,
  type StateRead
} from "@lrnki/learner-runtime/runtime";
import type { Sql } from "postgres";

type JourneyRow = {
  state: unknown;
  state_version: bigint | number | string;
};

type JsonParameter = Parameters<Sql["json"]>[0];

function stateVersion(value: bigint | number | string): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

function loadedState(row: JourneyRow | undefined): LearnerStateV1 {
  return row ? parseLearnerStateV1(row.state) : emptyLearnerStateV1();
}

// The Postgres adapter is deliberately outside @lrnki/learner-runtime. It serializes one
// learner by locking the Better Auth identity first (which also closes the concurrent-first-
// insert race), then locks the aggregate row, invokes the synchronous pure transition once,
// validates the proposed document, and performs one version increment.
export class PostgresLearnerStateStore implements LearnerStateStore {
  constructor(private readonly sql: Sql) {}

  async read(learnerRef: string): Promise<StateRead> {
    const [row] = await this.sql<
      Array<{
        learner_ref: string;
        state: unknown | null;
        state_version: bigint | number | string | null;
      }>
    >`
      SELECT u.id AS learner_ref, journey.state, journey.state_version
      FROM "user" u
      LEFT JOIN learner_journey_state journey ON journey.learner_ref = u.id
      WHERE u.id = ${learnerRef}`;
    if (!row) return { found: false };
    return row.state === null
      ? { found: true, state: emptyLearnerStateV1(), stateVersion: 0n }
      : {
          found: true,
          state: parseLearnerStateV1(row.state),
          stateVersion: stateVersion(row.state_version ?? 0)
        };
  }

  async transact<Result>(
    learnerRef: string,
    transition: (
      current: Readonly<LearnerStateV1>
    ) => { next: LearnerStateV1; result: Result }
  ): Promise<StateCommit<Result>> {
    return this.sql.begin(async (tx): Promise<StateCommit<Result>> => {
      const [identity] = await tx<Array<{ id: string }>>`
        SELECT id FROM "user" WHERE id = ${learnerRef} FOR UPDATE`;
      if (!identity) return { found: false };

      const [row] = await tx<JourneyRow[]>`
        SELECT state, state_version
        FROM learner_journey_state
        WHERE learner_ref = ${learnerRef}
        FOR UPDATE`;
      const current = loadedState(row);
      const currentVersion = row ? stateVersion(row.state_version) : 0n;
      const transitioned = transition(current);
      if (transitioned.next === current) {
        return {
          found: true,
          committed: false,
          state: current,
          stateVersion: currentVersion,
          result: transitioned.result
        };
      }

      const next = parseLearnerStateV1(transitioned.next);
      let nextVersion: bigint;
      if (row) {
        const [updated] = await tx<Array<{ state_version: bigint | number | string }>>`
          UPDATE learner_journey_state
          SET state = ${tx.json(next as JsonParameter)},
              state_version = state_version + 1,
              updated_at = now()
          WHERE learner_ref = ${learnerRef}
          RETURNING state_version`;
        if (!updated) throw new Error(`learner aggregate ${learnerRef} disappeared while locked`);
        nextVersion = stateVersion(updated.state_version);
      } else {
        const [inserted] = await tx<Array<{ state_version: bigint | number | string }>>`
          INSERT INTO learner_journey_state (learner_ref, state, state_version)
          VALUES (${learnerRef}, ${tx.json(next as JsonParameter)}, 1)
          RETURNING state_version`;
        if (!inserted) throw new Error(`learner aggregate ${learnerRef} was not inserted`);
        nextVersion = stateVersion(inserted.state_version);
      }
      return {
        found: true,
        committed: true,
        state: next,
        stateVersion: nextVersion,
        result: transitioned.result
      };
    });
  }

  async listBoardCohort(): Promise<BoardLearnerState[]> {
    const rows = await this.sql<
      Array<{
        learner_ref: string;
        display_name: string;
        state: unknown | null;
        state_version: bigint | number | string | null;
      }>
    >`
      SELECT
        u.id AS learner_ref,
        u.name AS display_name,
        journey.state,
        journey.state_version
      FROM "user" u
      LEFT JOIN learner_journey_state journey ON journey.learner_ref = u.id
      ORDER BY u.id ASC`;
    return rows.map((row) => ({
      learnerRef: row.learner_ref,
      displayName: row.display_name,
      state: row.state === null
        ? emptyLearnerStateV1()
        : parseLearnerStateV1(row.state),
      stateVersion: row.state === null
        ? 0n
        : stateVersion(row.state_version ?? 0)
    }));
  }
}

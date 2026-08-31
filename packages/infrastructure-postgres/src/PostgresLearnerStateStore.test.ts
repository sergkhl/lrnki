import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { loadQualifiedCatalogOrThrow } from "@lrnki/learner-runtime/content-node";
import {
  createLearnerRuntime,
  emptyLearnerStateV1,
  type LearnerStateV1
} from "@lrnki/learner-runtime/runtime";

import { createDatabaseClient } from "./db";
import { PostgresLearnerStateStore } from "./PostgresLearnerStateStore";
import {
  cleanupTrackedLearners,
  seedLearner
} from "./testSupport";

const databaseUrl = process.env.TEST_DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

after(() => cleanupTrackedLearners(databaseUrl));

function nextWithAward(
  current: Readonly<LearnerStateV1>,
  suffix: string
): LearnerStateV1 {
  const next = structuredClone(current);
  next.awards.push({
    type: "weekly_podium",
    dedupeKey: `2026-W${suffix}`,
    weekKey: `2026-W${suffix}`,
    rank: 1,
    points: 5,
    awardedAt: "2026-08-31T12:00:00.000Z"
  });
  return next;
}

maybe("missing identities are never created and existing zero-state users stay lazy", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const store = new PostgresLearnerStateStore(sql);
    const missingRef = `missing-${randomUUID()}`;
    assert.deepEqual(await store.read(missingRef), { found: false });
    let invoked = 0;
    const missingCommit = await store.transact(missingRef, (current) => {
      invoked += 1;
      return { next: nextWithAward(current, "01"), result: "unexpected" };
    });
    assert.deepEqual(missingCommit, { found: false });
    assert.equal(invoked, 0);

    const learnerRef = await seedLearner(sql, `journey-lazy-${randomUUID()}`);
    const empty = await store.read(learnerRef);
    assert.equal(empty.found, true);
    assert.equal(empty.stateVersion, 0n);
    assert.deepEqual(empty.state, emptyLearnerStateV1());
    const [{ count }] = await sql<Array<{ count: number }>>`
      SELECT count(*)::integer AS count
      FROM learner_journey_state
      WHERE learner_ref = ${learnerRef}`;
    assert.equal(count, 0, "a read does not materialize an empty aggregate");

    const cohort = await store.listBoardCohort();
    const zero = cohort.find((candidate) => candidate.learnerRef === learnerRef);
    assert.ok(zero, "the Better Auth user is included even without an aggregate row");
    assert.equal(zero.stateVersion, 0n);
    assert.deepEqual(zero.state, emptyLearnerStateV1());
  } finally {
    await sql.end();
  }
});

maybe("first write, subsequent write, and semantic no-op own exact version increments", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const learnerRef = await seedLearner(sql, `journey-version-${randomUUID()}`);
    const store = new PostgresLearnerStateStore(sql);
    const first = await store.transact(learnerRef, (current) => ({
      next: nextWithAward(current, "11"),
      result: "first"
    }));
    assert.equal(first.found, true);
    assert.equal(first.committed, true);
    assert.equal(first.stateVersion, 1n);
    assert.equal(first.result, "first");

    const second = await store.transact(learnerRef, (current) => ({
      next: nextWithAward(current, "12"),
      result: "second"
    }));
    assert.equal(second.found, true);
    assert.equal(second.committed, true);
    assert.equal(second.stateVersion, 2n);
    assert.equal(second.state.awards.length, 2);

    const noOp = await store.transact(learnerRef, (current) => ({
      next: current as LearnerStateV1,
      result: "same"
    }));
    assert.equal(noOp.found, true);
    assert.equal(noOp.committed, false);
    assert.equal(noOp.stateVersion, 2n);
    const loaded = await store.read(learnerRef);
    assert.equal(loaded.found, true);
    assert.equal(loaded.stateVersion, 2n);
  } finally {
    await sql.end();
  }
});

maybe("concurrent first writes lock the identity and preserve both transitions", async () => {
  const control = createDatabaseClient(databaseUrl);
  const sqlA = createDatabaseClient(databaseUrl);
  const sqlB = createDatabaseClient(databaseUrl);
  try {
    const learnerRef = await seedLearner(control, `journey-race-${randomUUID()}`);
    const storeA = new PostgresLearnerStateStore(sqlA);
    const storeB = new PostgresLearnerStateStore(sqlB);
    let callsA = 0;
    let callsB = 0;
    const [first, second] = await Promise.all([
      storeA.transact(learnerRef, (current) => {
        callsA += 1;
        return { next: nextWithAward(current, "21"), result: "A" };
      }),
      storeB.transact(learnerRef, (current) => {
        callsB += 1;
        return { next: nextWithAward(current, "22"), result: "B" };
      })
    ]);
    assert.equal(callsA, 1);
    assert.equal(callsB, 1);
    assert.equal(first.found, true);
    assert.equal(second.found, true);
    assert.deepEqual(
      [first.stateVersion, second.stateVersion].sort((left, right) => Number(left - right)),
      [1n, 2n]
    );
    const loaded = await new PostgresLearnerStateStore(control).read(learnerRef);
    assert.equal(loaded.found, true);
    assert.equal(loaded.stateVersion, 2n);
    assert.deepEqual(
      loaded.state.awards.map((award) => award.dedupeKey).sort(),
      ["2026-W21", "2026-W22"]
    );
  } finally {
    await Promise.all([control.end(), sqlA.end(), sqlB.end()]);
  }
});

maybe("two runtime instances over Postgres reject one stale same-learner command without loss", async () => {
  const control = createDatabaseClient(databaseUrl);
  const sqlA = createDatabaseClient(databaseUrl);
  const sqlB = createDatabaseClient(databaseUrl);
  try {
    const learnerRef = await seedLearner(control, `journey-runtime-race-${randomUUID()}`);
    const catalog = await loadQualifiedCatalogOrThrow(
      fileURLToPath(new URL("../../../content/", import.meta.url))
    );
    const runtimeA = createLearnerRuntime({
      catalog,
      stateStore: new PostgresLearnerStateStore(sqlA),
      now: () => new Date("2026-08-31T12:00:00.000Z")
    });
    const runtimeB = createLearnerRuntime({
      catalog,
      stateStore: new PostgresLearnerStateStore(sqlB),
      now: () => new Date("2026-08-31T12:00:00.000Z")
    });
    const [first, second] = await Promise.all([
      runtimeA.dispatch(learnerRef, {
        requestId: "postgres-race-a",
        expectedStateVersion: 0n,
        command: { kind: "adopt_expedition", expeditionKey: "critical-thinking" }
      }),
      runtimeB.dispatch(learnerRef, {
        requestId: "postgres-race-b",
        expectedStateVersion: 0n,
        command: { kind: "adopt_expedition", expeditionKey: "critical-thinking" }
      })
    ]);
    assert.deepEqual([first.status, second.status].sort(), ["applied", "stale"]);
    const loaded = await new PostgresLearnerStateStore(control).read(learnerRef);
    assert.equal(loaded.found, true);
    assert.equal(loaded.stateVersion, 1n);
    assert.ok(loaded.state.expeditions["critical-thinking"]);
    assert.equal(loaded.state.commandReceipts.length, 1);
  } finally {
    await Promise.all([control.end(), sqlA.end(), sqlB.end()]);
  }
});

maybe("transition exceptions and invalid proposed state roll back completely", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const learnerRef = await seedLearner(sql, `journey-rollback-${randomUUID()}`);
    const store = new PostgresLearnerStateStore(sql);
    await assert.rejects(
      () => store.transact(learnerRef, () => {
        throw new Error("transition failed");
      }),
      /transition failed/
    );
    let loaded = await store.read(learnerRef);
    assert.equal(loaded.found, true);
    assert.equal(loaded.stateVersion, 0n);

    await assert.rejects(
      () => store.transact(learnerRef, (current) => ({
        next: { ...structuredClone(current), schemaVersion: 2 } as never,
        result: "invalid"
      })),
      /Invalid input/
    );
    loaded = await store.read(learnerRef);
    assert.equal(loaded.found, true);
    assert.equal(loaded.stateVersion, 0n);
    const [{ count }] = await sql<Array<{ count: number }>>`
      SELECT count(*)::integer AS count
      FROM learner_journey_state
      WHERE learner_ref = ${learnerRef}`;
    assert.equal(count, 0);
  } finally {
    await sql.end();
  }
});

maybe("loaded JSON is parsed fail-closed and Better Auth deletion cascades the aggregate", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const store = new PostgresLearnerStateStore(sql);
    const corruptRef = await seedLearner(sql, `journey-corrupt-${randomUUID()}`);
    await sql`
      INSERT INTO learner_journey_state (learner_ref, state, state_version)
      VALUES (${corruptRef}, '{"schemaVersion":99}'::jsonb, 4)`;
    await assert.rejects(() => store.read(corruptRef), /Invalid input/);
    await sql`DELETE FROM learner_journey_state WHERE learner_ref = ${corruptRef}`;

    const cascadeRef = await seedLearner(sql, `journey-cascade-${randomUUID()}`);
    const committed = await store.transact(cascadeRef, (current) => ({
      next: nextWithAward(current, "31"),
      result: true
    }));
    assert.equal(committed.found, true);
    await sql`DELETE FROM "user" WHERE id = ${cascadeRef}`;
    const [{ count }] = await sql<Array<{ count: number }>>`
      SELECT count(*)::integer AS count
      FROM learner_journey_state
      WHERE learner_ref = ${cascadeRef}`;
    assert.equal(count, 0);
    assert.deepEqual(await store.read(cascadeRef), { found: false });
  } finally {
    await sql.end();
  }
});

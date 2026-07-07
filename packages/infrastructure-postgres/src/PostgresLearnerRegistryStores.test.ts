import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createDatabaseClient } from "./db";
import { PostgresLearnerAwardsStore, PostgresLearnerStore } from "./PostgresLearnerRegistryStores";

// Integration tests against a live PostgreSQL with the single initial migration applied.
// Skipped when DATABASE_URL is absent so the unit suite stays hermetic.
const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

maybe("create is unique-at-insert: a second create for the same ref is a no-op (R1/AE1)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const store = new PostgresLearnerStore(sql);
    const ref = `Alex-${randomUUID()}`;
    assert.deepEqual(await store.create({ learnerRef: ref, displayName: "Alex", pinHash: "hash-a" }), { created: true });
    assert.deepEqual(await store.create({ learnerRef: ref, displayName: "Alex", pinHash: "hash-b" }), { created: false });
    const learner = await store.get(ref);
    assert.equal(learner?.pinHash, "hash-a", "the first registration wins; the second never overwrites");
  } finally {
    await sql.end();
  }
});

maybe("record is idempotent on (learner, type, dedupe_key): re-award is a no-op (R8/AE5)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const learners = new PostgresLearnerStore(sql);
    const awards = new PostgresLearnerAwardsStore(sql);
    const ref = `Alex-${randomUUID()}`;
    await learners.create({ learnerRef: ref, displayName: "Alex", pinHash: "hash" });

    const first = await awards.record({ awardId: randomUUID(), learnerRef: ref, awardType: "weekly_podium", dedupeKey: "2026-W27", context: { rank: 1 } });
    const again = await awards.record({ awardId: randomUUID(), learnerRef: ref, awardType: "weekly_podium", dedupeKey: "2026-W27", context: { rank: 1 } });
    assert.deepEqual([first.recorded, again.recorded], [true, false]);

    const listed = await awards.listForLearner(ref);
    assert.equal(listed.length, 1, "the re-award never duplicated the row");
    assert.deepEqual(listed[0].context, { rank: 1 });

    const win = await awards.record({ awardId: randomUUID(), learnerRef: ref, awardType: "duel_win", dedupeKey: randomUUID(), context: {} });
    assert.equal(win.recorded, true, "a different type/dedupe is a distinct award");
    assert.equal((await awards.listForLearners([ref])).length, 2);
  } finally {
    await sql.end();
  }
});

maybe("a learner-state write requires a registry row (the R1 FK)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const ghost = `ghost-${randomUUID()}`;
    await assert.rejects(
      () => sql`INSERT INTO calibration_verdicts (learner_state_ref, derived_node_id, verdict) VALUES (${ghost}, ${randomUUID()}, 'known')`,
      /foreign key/i
    );
  } finally {
    await sql.end();
  }
});

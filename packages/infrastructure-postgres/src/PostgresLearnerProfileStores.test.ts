import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { createDatabaseClient } from "./db";
import { PostgresLearnerAwardsStore, PostgresLearnerProfileRead } from "./PostgresLearnerProfileStores";
import { cleanupTrackedLearners, seedLearner } from "./testSupport";

// Integration tests against a live PostgreSQL with the single initial migration applied.
// Skipped when TEST_DATABASE_URL is absent so the unit suite stays hermetic.
const databaseUrl = process.env.TEST_DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

// These suites seed `user` rows; track each ref so the cleanup deletes exactly those and the
// isolated test DB is unchanged (R2/AE2).
after(() => cleanupTrackedLearners(databaseUrl));

maybe("the profile read projects a Better Auth user as (learnerRef, displayName)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const ref = await seedLearner(sql, `Alex-${randomUUID()}`);
    const listed = await new PostgresLearnerProfileRead(sql).list();
    const found = listed.find((profile) => profile.learnerRef === ref);
    assert.ok(found, "the seeded identity is visible to the projection");
    assert.equal(found.displayName, ref, "displayName comes from `user.name`, the single owner");
  } finally {
    await sql.end();
  }
});

maybe("record is idempotent on (learner, type, dedupe_key): re-award is a no-op (R8/AE5)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const awards = new PostgresLearnerAwardsStore(sql);
    const ref = await seedLearner(sql, `Alex-${randomUUID()}`);

    const first = await awards.record({ awardId: randomUUID(), learnerRef: ref, awardType: "weekly_podium", dedupeKey: "2026-W27", context: { rank: 1 } });
    const again = await awards.record({ awardId: randomUUID(), learnerRef: ref, awardType: "weekly_podium", dedupeKey: "2026-W27", context: { rank: 1 } });
    assert.deepEqual([first.recorded, again.recorded], [true, false]);

    const listed = await awards.listForLearner(ref);
    assert.equal(listed.length, 1, "the re-award never duplicated the row");
    assert.deepEqual(listed[0].context, { rank: 1 });

    const win = await awards.record({ awardId: randomUUID(), learnerRef: ref, awardType: "weekly_podium", dedupeKey: randomUUID(), context: {} });
    assert.equal(win.recorded, true, "a different type/dedupe is a distinct award");
    assert.equal((await awards.listForLearners([ref])).length, 2);
  } finally {
    await sql.end();
  }
});

maybe("a learner-state write requires an identity row (the ADR-0041 FK into `user`)", async () => {
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

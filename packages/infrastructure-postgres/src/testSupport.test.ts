import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { createDatabaseClient } from "./db";
import {
  cleanupReservedLearners,
  cleanupTrackedLearners,
  reservedLearnerEmails,
  seedLearner
} from "./testSupport";

const databaseUrl = process.env.TEST_DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;
after(() => cleanupTrackedLearners(databaseUrl));

maybe("deleting a Better Auth user cascades the complete learner aggregate", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const learnerRef = await seedLearner(sql, `cascade-${randomUUID()}`);
    await sql`
      INSERT INTO learner_journey_state (learner_ref, state, state_version)
      VALUES (${learnerRef}, ${sql.json({ schemaVersion: 1, activeExpeditionKey: null, expeditions: {}, awards: [], commandReceipts: [] })}, 0)`;
    await sql`DELETE FROM "user" WHERE id = ${learnerRef}`;
    const [{ count }] = await sql<Array<{ count: number }>>`
      SELECT count(*)::integer AS count FROM learner_journey_state WHERE learner_ref = ${learnerRef}`;
    assert.equal(count, 0);
  } finally {
    await sql.end();
  }
});

maybe("reserved real-use cleanup accepts only exact run-owned addresses", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const runId = randomUUID().replaceAll("-", "");
  try {
    const emails = reservedLearnerEmails(runId);
    for (const [role, email] of Object.entries(emails)) {
      await seedLearner(sql, `reserved-${role}-${randomUUID()}`, email);
    }
    assert.deepEqual(
      (await cleanupReservedLearners(sql, Object.values(emails))).sort(),
      Object.values(emails).sort()
    );
    await assert.rejects(cleanupReservedLearners(sql, ["realuse-phone-%@realuse.invalid"]), /non-reserved/);
    assert.throws(() => reservedLearnerEmails("bad-id!"), /Invalid real-use run id/);
  } finally {
    await sql.end();
  }
});

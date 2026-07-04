import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createDatabaseClient } from "./db";
import { PostgresLearnerExpeditionStore } from "./PostgresLearnerExpeditionStore";

const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

maybe("learner expeditions round-trip and stay scoped per learner", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const store = new PostgresLearnerExpeditionStore(sql);
    const learnerOne = randomUUID();
    const learnerTwo = randomUUID();
    await store.upsert({
      learnerExpeditionId: randomUUID(),
      learnerStateRef: learnerOne,
      kind: "topic",
      title: "Rust ownership",
      declaredDomain: "software engineering",
      status: "charting"
    });
    await store.upsert({
      learnerExpeditionId: randomUUID(),
      learnerStateRef: learnerTwo,
      kind: "topic",
      title: "Jazz harmony",
      declaredDomain: "music",
      status: "charting"
    });

    const rows = await store.listForLearner(learnerOne);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].learnerStateRef, learnerOne);
    assert.equal(rows[0].title, "Rust ownership");
  } finally {
    await sql.end();
  }
});

maybe("setActive leaves one active expedition per learner", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const store = new PostgresLearnerExpeditionStore(sql);
    const learnerStateRef = randomUUID();
    const first = randomUUID();
    const second = randomUUID();
    await store.upsert({
      learnerExpeditionId: first,
      learnerStateRef,
      kind: "topic",
      title: "First",
      declaredDomain: "test",
      status: "charting",
      active: true
    });
    await store.upsert({
      learnerExpeditionId: second,
      learnerStateRef,
      kind: "topic",
      title: "Second",
      declaredDomain: "test",
      status: "charting",
      active: true
    });

    const rows = await store.listForLearner(learnerStateRef);
    assert.deepEqual(rows.filter((row) => row.active).map((row) => row.learnerExpeditionId), [second]);

    await store.setActive({ learnerStateRef, learnerExpeditionId: first });
    const updated = await store.listForLearner(learnerStateRef);
    assert.deepEqual(updated.filter((row) => row.active).map((row) => row.learnerExpeditionId), [first]);
  } finally {
    await sql.end();
  }
});

maybe("learner expedition kind CHECK rejects the removed source kind", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    await assert.rejects(
      () => sql`
        INSERT INTO learner_expeditions (learner_expedition_id, learner_state_ref, kind, title, declared_domain, status)
        VALUES (${randomUUID()}, ${randomUUID()}, 'source', 'Removed source door', 'test', 'charting')`,
      /learner_expeditions_kind_check/
    );
  } finally {
    await sql.end();
  }
});

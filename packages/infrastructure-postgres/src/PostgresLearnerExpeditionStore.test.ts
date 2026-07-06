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
      status: "generating"
    });
    await store.upsert({
      learnerExpeditionId: randomUUID(),
      learnerStateRef: learnerTwo,
      kind: "topic",
      title: "Jazz harmony",
      declaredDomain: "music",
      status: "generating"
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
      status: "generating",
      active: true
    });
    await store.upsert({
      learnerExpeditionId: second,
      learnerStateRef,
      kind: "topic",
      title: "Second",
      declaredDomain: "test",
      status: "generating",
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
        VALUES (${randomUUID()}, ${randomUUID()}, 'source', 'Removed source door', 'test', 'generating')`,
      /learner_expeditions_kind_check/
    );
  } finally {
    await sql.end();
  }
});

maybe("claimNextGenerating claims fresh rows and increments attempts", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const store = new PostgresLearnerExpeditionStore(sql);
    await removePriorClaimFixtures(sql);
    const learnerStateRef = randomUUID();
    const learnerExpeditionId = randomUUID();
    await store.upsert({
      learnerExpeditionId,
      learnerStateRef,
      kind: "topic",
      title: "DB claim fresh fixture",
      declaredDomain: null,
      status: "generating"
    });
    await sql`
      UPDATE learner_expeditions
      SET created_at = now() - interval '100 years'
      WHERE learner_expedition_id = ${learnerExpeditionId}`;

    const claimed = await store.claimNextGenerating({ staleBefore: new Date(Date.now() - 120000), maxAttempts: 3 });

    assert.equal(claimed?.learnerExpeditionId, learnerExpeditionId);
    assert.equal(claimed?.generationAttempts, 1);
    assert.ok(claimed?.claimedAt);
  } finally {
    await sql.end();
  }
});

async function removePriorClaimFixtures(sql: ReturnType<typeof createDatabaseClient>) {
  await sql`
    DELETE FROM learner_expeditions
    WHERE title IN ('DB claim fresh fixture', 'DB claim stale fixture')
       OR (title = 'Game Theory' AND created_at < now() - interval '1 day')`;
}

maybe("claimNextGenerating relaunches stale operation heartbeats and failExhaustedGenerating enforces the budget", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const store = new PostgresLearnerExpeditionStore(sql);
    await removePriorClaimFixtures(sql);
    const learnerStateRef = randomUUID();
    const learnerExpeditionId = randomUUID();
    const operationId = randomUUID();
    await store.upsert({
      learnerExpeditionId,
      learnerStateRef,
      kind: "topic",
      title: "DB claim stale fixture",
      declaredDomain: "game theory",
      status: "generating",
      currentOperationId: operationId,
      currentOperationType: "enrichment"
    });
    await sql`
      INSERT INTO operation_runs (operation_run_id, operation_type, operation_id, status, last_progress_at)
      VALUES (${randomUUID()}, 'enrichment', ${operationId}, 'running', now() - interval '10 minutes')`;
    await sql`
      UPDATE learner_expeditions
      SET claimed_at = now() - interval '10 minutes', generation_attempts = 2, created_at = now() - interval '100 years'
      WHERE learner_expedition_id = ${learnerExpeditionId}`;

    const claimed = await store.claimNextGenerating({ staleBefore: new Date(Date.now() - 120000), maxAttempts: 3 });
    assert.equal(claimed?.generationAttempts, 3);
    // The claim fences the row by clearing its operation id.
    assert.equal(claimed?.currentOperationId, null);

    // Age both the claim and the row's own heartbeat stand-in past the stale window.
    await sql`
      UPDATE learner_expeditions
      SET claimed_at = now() - interval '10 minutes', updated_at = now() - interval '10 minutes'
      WHERE learner_expedition_id = ${learnerExpeditionId}`;
    const failed = await store.failExhaustedGenerating({
      staleBefore: new Date(Date.now() - 120000),
      maxAttempts: 3,
      failureMessage: "Scouting stopped after repeated launch attempts. Try again."
    });
    assert.ok(failed >= 1);
    const rows = await store.listForLearner(learnerStateRef);
    assert.equal(rows[0].status, "failed");
  } finally {
    await sql.end();
  }
});

maybe("resetGeneration restores a manual retry budget", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const store = new PostgresLearnerExpeditionStore(sql);
    const learnerStateRef = randomUUID();
    const activeExpeditionId = randomUUID();
    const learnerExpeditionId = randomUUID();
    await store.upsert({
      learnerExpeditionId: activeExpeditionId,
      learnerStateRef,
      kind: "topic",
      title: "Already active",
      declaredDomain: "test",
      status: "generating",
      active: true
    });
    await store.upsert({
      learnerExpeditionId,
      learnerStateRef,
      kind: "topic",
      title: "Game Theory",
      declaredDomain: "game theory",
      status: "failed",
      failureMessage: "stopped",
      active: false
    });
    await sql`
      UPDATE learner_expeditions
      SET generation_attempts = 3, claimed_at = now(), current_operation_id = ${randomUUID()}, current_operation_type = 'enrichment'
      WHERE learner_expedition_id = ${learnerExpeditionId}`;

    await store.resetGeneration({ learnerStateRef, learnerExpeditionId });

    const rows = await store.listForLearner(learnerStateRef);
    assert.equal(rows[0].status, "generating");
    assert.equal(rows[0].generationAttempts, 0);
    assert.equal(rows[0].claimedAt, null);
    assert.equal(rows[0].currentOperationId, null);
    assert.equal(rows[0].learnerExpeditionId, learnerExpeditionId);
    assert.deepEqual(rows.filter((row) => row.active).map((row) => row.learnerExpeditionId), [learnerExpeditionId]);
  } finally {
    await sql.end();
  }
});

maybe("resetGeneration leaves active expedition unchanged when the retry target is missing", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const store = new PostgresLearnerExpeditionStore(sql);
    const learnerStateRef = randomUUID();
    const activeExpeditionId = randomUUID();
    await store.upsert({
      learnerExpeditionId: activeExpeditionId,
      learnerStateRef,
      kind: "topic",
      title: "Already active",
      declaredDomain: "test",
      status: "generating",
      active: true
    });

    await store.resetGeneration({ learnerStateRef, learnerExpeditionId: randomUUID() });

    const rows = await store.listForLearner(learnerStateRef);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].learnerExpeditionId, activeExpeditionId);
    assert.equal(rows[0].active, true);
    assert.equal(rows[0].status, "generating");
  } finally {
    await sql.end();
  }
});

maybe("a crash-window row (operation id set, no operation_runs row) is reclaimable below the budget and failable at it", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const store = new PostgresLearnerExpeditionStore(sql);
    await removePriorClaimFixtures(sql);
    const learnerStateRef = randomUUID();
    const learnerExpeditionId = randomUUID();
    await store.upsert({
      learnerExpeditionId,
      learnerStateRef,
      kind: "topic",
      title: "DB claim stale fixture",
      declaredDomain: null,
      status: "generating",
      currentOperationId: randomUUID(), // no matching operation_runs row: the crash window
      currentOperationType: "enrichment"
    });
    await sql`
      UPDATE learner_expeditions
      SET claimed_at = now() - interval '10 minutes', updated_at = now() - interval '10 minutes',
          generation_attempts = 1, created_at = now() - interval '100 years'
      WHERE learner_expedition_id = ${learnerExpeditionId}`;

    const claimed = await store.claimNextGenerating({ staleBefore: new Date(Date.now() - 120000), maxAttempts: 3 });
    assert.equal(claimed?.learnerExpeditionId, learnerExpeditionId);
    assert.equal(claimed?.generationAttempts, 2);

    await sql`
      UPDATE learner_expeditions
      SET claimed_at = now() - interval '10 minutes', updated_at = now() - interval '10 minutes',
          generation_attempts = 3, current_operation_id = ${randomUUID()}, current_operation_type = 'enrichment'
      WHERE learner_expedition_id = ${learnerExpeditionId}`;
    const failed = await store.failExhaustedGenerating({
      staleBefore: new Date(Date.now() - 120000),
      maxAttempts: 3,
      failureMessage: "budget spent"
    });
    assert.ok(failed >= 1);
    const rows = await store.listForLearner(learnerStateRef);
    assert.equal(rows[0].status, "failed");
  } finally {
    await sql.end();
  }
});

maybe("updateProgress is fenced: a write expecting a lost operation id affects 0 rows", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const store = new PostgresLearnerExpeditionStore(sql);
    const learnerStateRef = randomUUID();
    const learnerExpeditionId = randomUUID();
    await store.upsert({
      learnerExpeditionId,
      learnerStateRef,
      kind: "topic",
      title: "Fenced write fixture",
      declaredDomain: null,
      status: "generating"
    });

    // First write installs the run's fence token (claim left the operation id null).
    const installed = await store.updateProgress({
      learnerExpeditionId,
      expectedOperationId: null,
      currentOperationId: "11111111-1111-4111-8111-111111111111",
      currentOperationType: "enrichment"
    });
    assert.equal(installed, 1);

    // A competing claim clears the operation id — the old worker's fenced write is a no-op.
    await sql`
      UPDATE learner_expeditions SET current_operation_id = null, current_operation_type = null
      WHERE learner_expedition_id = ${learnerExpeditionId}`;
    const stale = await store.updateProgress({
      learnerExpeditionId,
      expectedOperationId: "11111111-1111-4111-8111-111111111111",
      status: "ready"
    });
    assert.equal(stale, 0);
    const rows = await store.listForLearner(learnerStateRef);
    assert.equal(rows[0].status, "generating");
  } finally {
    await sql.end();
  }
});

maybe("resetGeneration leaves non-failed expeditions untouched (only failed rows are retryable)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const store = new PostgresLearnerExpeditionStore(sql);
    const learnerStateRef = randomUUID();
    const learnerExpeditionId = randomUUID();
    await store.upsert({
      learnerExpeditionId,
      learnerStateRef,
      kind: "topic",
      title: "Reset immune fixture",
      declaredDomain: null,
      status: "generating"
    });
    await sql`
      UPDATE learner_expeditions
      SET generation_attempts = 2, claimed_at = now()
      WHERE learner_expedition_id = ${learnerExpeditionId}`;

    await store.resetGeneration({ learnerStateRef, learnerExpeditionId });

    const rows = await store.listForLearner(learnerStateRef);
    assert.equal(rows[0].status, "generating");
    assert.equal(rows[0].generationAttempts, 2);
    assert.notEqual(rows[0].claimedAt, null);
  } finally {
    await sql.end();
  }
});

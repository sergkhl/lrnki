import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { createDatabaseClient } from "./db";
import {
  cleanupReservedLearners,
  deleteLearner,
  reservedLearnerRefs,
  seedLearner
} from "./testSupport";

// Integration tests for the durable real-use gate teardown (plan 2026-07-15-001 U1). Skipped when
// TEST_DATABASE_URL is absent so the hermetic suite stays green; the explicit Verification Contract
// command loads `.env` and MUST execute these. The initial migration is the deletion-graph
// authority (AGENTS.md) — scenario 1 populates every learner-owned FK family so a missing table
// (the recall_challenges / learner_sessions drift this unit fixed) fails loudly.
const databaseUrl = process.env.TEST_DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;
const runIdChars = () => randomUUID().replace(/-/g, ""); // 32 hex chars — a valid [0-9a-z]{6,40} run id

// Every learner ref any test seeds, so `after` deletes exactly those and the isolated test DB is
// left byte-for-byte unchanged. deleteLearner is idempotent, so double-cleanup is safe.
const seeded = new Set<string>();
after(async () => {
  if (!databaseUrl || seeded.size === 0) return;
  const sql = createDatabaseClient(databaseUrl);
  try {
    for (const ref of seeded) await deleteLearner(sql, ref);
  } finally {
    await sql.end();
  }
});

// A coherent (enrichment_id, derived_node_id, study_item_id) triple from an existing shared
// enrichment. Real learner state points at shared graph rows exactly this way; the test seeds
// learner-owned rows referencing them, deletes the learner, and proves the SHARED rows survive.
async function fetchGraphTriple(sql: ReturnType<typeof createDatabaseClient>) {
  const [row] = await sql<{ study_item_id: string; enrichment_id: string; derived_node_id: string }[]>`
    SELECT study_item_id, enrichment_id, derived_node_id
    FROM study_items WHERE superseded_at IS NULL LIMIT 1`;
  return row ?? null;
}

maybe("deleteLearner removes every learner-owned FK family and leaves shared graph rows intact", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const triple = await fetchGraphTriple(sql);
    assert.ok(triple, "needs at least one ready enrichment with a study item (the real-use precondition)");
    const { study_item_id, enrichment_id, derived_node_id } = triple;

    const ref = `realuse-probe-${runIdChars()}`;
    seeded.add(ref);
    await seedLearner(sql, ref);

    // One row in every table that FKs to `learners`, plus the cascading children.
    await sql`INSERT INTO learner_sessions (token_hash, learner_ref) VALUES (${randomUUID()}, ${ref})`;
    await sql`INSERT INTO learner_awards (award_id, learner_ref, award_type, dedupe_key, context)
              VALUES (${randomUUID()}, ${ref}, 'weekly_podium', ${runIdChars()}, ${sql.json({ rank: 1 })})`;
    await sql`INSERT INTO learner_expeditions (learner_expedition_id, learner_state_ref, kind, title, status)
              VALUES (${randomUUID()}, ${ref}, 'topic', 'probe', 'generating')`;
    await sql`INSERT INTO calibration_verdicts (learner_state_ref, derived_node_id, verdict)
              VALUES (${ref}, ${derived_node_id}, 'known')`;
    await sql`INSERT INTO lesson_reads (learner_state_ref, derived_node_id) VALUES (${ref}, ${derived_node_id})`;

    const detourId = randomUUID();
    await sql`INSERT INTO learner_scaffold_detours
                (detour_id, learner_state_ref, enrichment_id, parent_derived_node_id, term, normalized_term, status)
              VALUES (${detourId}, ${ref}, ${enrichment_id}, ${derived_node_id}, 'Term', 'term', 'ready')`;
    const stepId = randomUUID();
    await sql`INSERT INTO learner_scaffold_steps (scaffold_step_id, detour_id, ordinal, kind, payload)
              VALUES (${stepId}, ${detourId}, 0, 'generated', ${sql.json({ microLesson: "x" })})`;

    // A neutral response row (study_item + node) AND a scaffold response row (step) — the scaffold
    // row is why response_log must be deleted before the detour/steps it references.
    await sql`INSERT INTO response_log
                (response_id, learner_state_ref, study_item_id, derived_node_id, signal_type, judged_outcome, graded_score, response_source, attempt_seq)
              VALUES (${randomUUID()}, ${ref}, ${study_item_id}, ${derived_node_id}, 'graded', 'correct', 1, 'human', 1)`;
    await sql`INSERT INTO response_log
                (response_id, learner_state_ref, scaffold_step_id, signal_type, judged_outcome, graded_score, response_source, attempt_seq)
              VALUES (${randomUUID()}, ${ref}, ${stepId}, 'graded', 'incorrect', 0, 'human', 2)`;

    const challengeId = randomUUID();
    await sql`INSERT INTO recall_challenges
                (challenge_id, learner_state_ref, enrichment_id, scope_kind, scope_anchor_derived_node_id, status)
              VALUES (${challengeId}, ${ref}, ${enrichment_id}, 'enrichment', ${derived_node_id}, 'active')`;
    await sql`INSERT INTO recall_challenge_lineup (challenge_id, lineup_index, study_item_id, derived_node_id)
              VALUES (${challengeId}, 0, ${study_item_id}, ${derived_node_id})`;
    await sql`INSERT INTO recall_challenge_events (event_id, challenge_id, seq, kind, operation_ref)
              VALUES (${randomUUID()}, ${challengeId}, 1, 'abandon', ${randomUUID()})`;

    await deleteLearner(sql, ref);

    // Every learner-owned table is empty for this ref, including the cascaded challenge children.
    for (const [table, col] of [
      ["learners", "learner_ref"], ["learner_sessions", "learner_ref"], ["learner_awards", "learner_ref"],
      ["learner_expeditions", "learner_state_ref"], ["calibration_verdicts", "learner_state_ref"],
      ["lesson_reads", "learner_state_ref"], ["learner_scaffold_detours", "learner_state_ref"],
      ["response_log", "learner_state_ref"], ["recall_challenges", "learner_state_ref"]
    ] as const) {
      const [{ n }] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM ${sql(table)} WHERE ${sql(col)} = ${ref}`;
      assert.equal(n, 0, `${table} should have no rows for the deleted learner`);
    }
    const [{ n: steps }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM learner_scaffold_steps WHERE detour_id = ${detourId}`;
    const [{ n: lineup }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM recall_challenge_lineup WHERE challenge_id = ${challengeId}`;
    const [{ n: events }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM recall_challenge_events WHERE challenge_id = ${challengeId}`;
    assert.deepEqual([steps, lineup, events], [0, 0, 0], "cascaded children removed");

    // The shared graph rows the learner referenced are untouched.
    const [{ n: item }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM study_items WHERE study_item_id = ${study_item_id}`;
    const [{ n: enr }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM graph_enrichments WHERE enrichment_id = ${enrichment_id}`;
    assert.deepEqual([item, enr], [1, 1], "shared enrichment and study item survive learner deletion");
    seeded.delete(ref);
  } finally {
    await sql.end();
  }
});

maybe("cleanupReservedLearners removes only the exact reserved refs and preserves unrelated data", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const runId = runIdChars();
    const refs = reservedLearnerRefs(runId);
    for (const ref of Object.values(refs)) {
      seeded.add(ref);
      await seedLearner(sql, ref);
    }
    const unrelated = `realuse-probe-${runIdChars()}`; // reserved-shaped but a DIFFERENT run
    seeded.add(unrelated);
    await seedLearner(sql, unrelated);
    // Snapshot identities, not a global count: other test files legitimately create shared
    // enrichments concurrently under Node's test runner.
    const enrichmentsBefore = await sql<{ enrichment_id: string }[]>`SELECT enrichment_id FROM graph_enrichments`;

    const deleted = await cleanupReservedLearners(sql, [refs.probe, refs.phone, refs.desktop]);
    assert.deepEqual(deleted.sort(), [refs.desktop, refs.phone, refs.probe].sort());

    for (const ref of Object.values(refs)) {
      const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM learners WHERE learner_ref = ${ref}`;
      assert.equal(n, 0);
      seeded.delete(ref);
    }
    const [{ n: unrel }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM learners WHERE learner_ref = ${unrelated}`;
    assert.equal(unrel, 1, "an unrelated (different-run) reserved learner is NOT deleted");
    if (enrichmentsBefore.length > 0) {
      const [{ n: preserved }] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM graph_enrichments
        WHERE enrichment_id IN ${sql(enrichmentsBefore.map((row) => row.enrichment_id))}`;
      assert.equal(preserved, enrichmentsBefore.length, "every pre-existing shared enrichment is untouched");
    }
  } finally {
    await sql.end();
  }
});

maybe("cleanupReservedLearners rejects unsafe input before issuing any SQL", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const runId = runIdChars();
    const { phone } = reservedLearnerRefs(runId);
    seeded.add(phone);
    await seedLearner(sql, phone);

    await assert.rejects(cleanupReservedLearners(sql, []), /no learner refs/);
    await assert.rejects(cleanupReservedLearners(sql, [phone, phone]), /duplicate/);
    await assert.rejects(cleanupReservedLearners(sql, ["realuse-phone"]), /non-reserved/); // no run id
    await assert.rejects(cleanupReservedLearners(sql, ["not-reserved"]), /non-reserved/);
    await assert.rejects(cleanupReservedLearners(sql, [`realuse-admin-${runId}`]), /non-reserved/); // role not allowed
    await assert.rejects(cleanupReservedLearners(sql, [`realuse-phone-${runId}%`]), /non-reserved/); // wildcard-shaped
    assert.throws(() => reservedLearnerRefs("bad-id!"), /Invalid real-use run id/);

    // The one valid learner in a rejected mixed list was never deleted (validation precedes SQL).
    await assert.rejects(cleanupReservedLearners(sql, [phone, "realuse-phone-%"]), /non-reserved/);
    const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM learners WHERE learner_ref = ${phone}`;
    assert.equal(n, 1, "a valid ref in a rejected batch is not touched");
  } finally {
    await sql.end();
  }
});

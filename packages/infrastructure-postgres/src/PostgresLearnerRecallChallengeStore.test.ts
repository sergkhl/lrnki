import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import type { OptionSelectItem } from "@lrnki/domain-core";
import { createDatabaseClient } from "./db";
import { PostgresLearnerRecallChallengeStore } from "./PostgresLearnerRecallChallengeStore";
import { PostgresStudyItemBankStore } from "./PostgresLearnerLoopStores";
import { cleanupTrackedLearners, seedLearner } from "./testSupport";

// Integration tests against a live PostgreSQL with the recall challenge tables applied.
// Skipped when TEST_DATABASE_URL is absent so the unit suite stays hermetic.
const databaseUrl = process.env.TEST_DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

after(async () => {
  // Challenges FK to learners; delete them before the shared learner cleanup.
  if (databaseUrl && seededLearners.length > 0) {
    const sql = createDatabaseClient(databaseUrl);
    try {
      for (const learner of seededLearners) {
        await sql`DELETE FROM recall_challenges WHERE learner_state_ref = ${learner}`;
      }
    } finally {
      await sql.end();
    }
  }
  await cleanupTrackedLearners(databaseUrl);
});

const seededLearners: string[] = [];

type Sql = ReturnType<typeof createDatabaseClient>;

// Seed the minimum substrate a challenge attaches to: a published graph version, an enrichment,
// two derived nodes, and one current option-select Study Item per node.
async function seedSubstrate(sql: Sql): Promise<{ enrichmentId: string; nodeIds: string[]; itemIds: string[] }> {
  const graphVersionId = randomUUID();
  await sql`
    INSERT INTO graph_versions (graph_version_id, base_graph_version_id, status, refinement_config_hash, published_at)
    VALUES (${graphVersionId}, NULL, 'published', 'test', now())`;
  const enrichmentId = randomUUID();
  await sql`
    INSERT INTO graph_enrichments (enrichment_id, graph_version_id, enrichment_config_hash, status, judge_model, difficulty_method, completed_at)
    VALUES (${enrichmentId}, ${graphVersionId}, 'test', 'succeeded', 'j', 'd', now())`;
  const nodeIds: string[] = [];
  for (const label of ["Alpha", "Beta"]) {
    const conceptId = randomUUID();
    await sql`
      INSERT INTO concepts (concept_id, iri, normalized_label, declared_domain)
      VALUES (${conceptId}, ${`urn:lrnki:concept:${conceptId}`}, ${`${label.toLowerCase()}-${conceptId}`}, 'software engineering')`;
    const derivedNodeId = randomUUID();
    await sql`
      INSERT INTO derived_graph_nodes (derived_node_id, enrichment_id, node_kind, concept_id, grounding_origin, role, canonical_label, normalized_label, declared_domain, aliases)
      VALUES (${derivedNodeId}, ${enrichmentId}, 'anchor', ${conceptId}, 'document_anchored', 'anchor', ${label}, ${`${label.toLowerCase()}-${conceptId}`}, 'software engineering', '[]'::jsonb)`;
    nodeIds.push(derivedNodeId);
  }
  const bank = new PostgresStudyItemBankStore(sql);
  const items = nodeIds.map((derivedNodeId) => optionSelectItem(enrichmentId, derivedNodeId));
  await bank.persist({ graphVersionId: null, enrichmentId, configHash: "test", studyItems: items, rejected: [] });
  return { enrichmentId, nodeIds, itemIds: items.map((item) => item.studyItemId) };
}

function optionSelectItem(enrichmentId: string, derivedNodeId: string): OptionSelectItem {
  return {
    studyItemId: randomUUID(),
    graphVersionId: null,
    enrichmentId,
    derivedNodeId,
    groundingProvenance: "generated",
    generatingModel: "test",
    configHash: "test",
    explorableTerms: [],
    itemType: "option_select",
    question: "Which is right?",
    explanation: "Because.",
    options: [
      { optionId: randomUUID(), text: "right", isCorrect: true, provenance: "source", citation: { provenance: "generated", derivedNodeId, passageText: "grounding" } },
      { optionId: randomUUID(), text: "wrong-a", isCorrect: false, provenance: "generated" },
      { optionId: randomUUID(), text: "wrong-b", isCorrect: false, provenance: "generated" },
      { optionId: randomUUID(), text: "wrong-c", isCorrect: false, provenance: "generated" }
    ]
  };
}

async function seedChallengeLearner(sql: Sql): Promise<string> {
  const learner = await seedLearner(sql, `L-${randomUUID()}`);
  seededLearners.push(learner);
  return learner;
}

function answerEvent(attemptRef: string, studyItemId: string, correct: boolean) {
  return { kind: "selection_answer" as const, attemptRef, studyItemId, promptId: null, chosenId: "opt-x", correct, recoveryPhase: false, responseDurationMs: 1200 };
}

maybe("create persists an immutable lineup; a second create for the same active scope conflicts", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { enrichmentId, nodeIds, itemIds } = await seedSubstrate(sql);
    const learner = await seedChallengeLearner(sql);
    const store = new PostgresLearnerRecallChallengeStore(sql);

    const challengeId = randomUUID();
    const lineup = itemIds.map((studyItemId, index) => ({ studyItemId, derivedNodeId: nodeIds[index] }));
    const scope = { learnerStateRef: learner, enrichmentId, scopeKind: "section" as const, scopeAnchorDerivedNodeId: nodeIds[0] };
    assert.deepEqual(await store.create({ challengeId, ...scope, lineup }), { created: true });
    assert.deepEqual(await store.create({ challengeId: randomUUID(), ...scope, lineup }), { created: false });

    const record = await store.getForLearner({ challengeId, learnerStateRef: learner });
    assert.equal(record?.challenge.status, "active");
    assert.deepEqual(record?.lineup.map((entry) => entry.studyItemId), itemIds);
    assert.deepEqual(record?.events, []);
    // A different learner cannot read it.
    const stranger = await seedChallengeLearner(sql);
    assert.equal(await store.getForLearner({ challengeId, learnerStateRef: stranger }), undefined);
  } finally {
    await sql.end();
  }
});

maybe("appendEvent serializes on expectedSeq, dedupes attemptRef, and materializes won atomically", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { enrichmentId, nodeIds, itemIds } = await seedSubstrate(sql);
    const learner = await seedChallengeLearner(sql);
    const store = new PostgresLearnerRecallChallengeStore(sql);
    const challengeId = randomUUID();
    await store.create({
      challengeId,
      learnerStateRef: learner,
      enrichmentId,
      scopeKind: "section",
      scopeAnchorDerivedNodeId: nodeIds[0],
      lineup: [{ studyItemId: itemIds[0], derivedNodeId: nodeIds[0] }]
    });

    const attemptRef = randomUUID();
    const base = { challengeId, learnerStateRef: learner, expectedSeq: 1, event: answerEvent(attemptRef, itemIds[0], true), materializeStatus: "won" as const };
    assert.equal(await store.appendEvent(base), "appended");
    // Network replay of the SAME attempt after the win: duplicate, not conflict — the caller
    // replays the committed view.
    assert.equal(await store.appendEvent(base), "duplicate");
    // A different attempt with a stale sequence is stale; a fresh sequence on a terminal
    // challenge is a conflict.
    assert.equal(await store.appendEvent({ ...base, event: answerEvent(randomUUID(), itemIds[0], true) }), "conflict");
    // Wrong learner never reaches the row.
    const stranger = await seedChallengeLearner(sql);
    assert.equal(await store.appendEvent({ ...base, learnerStateRef: stranger }), "conflict");

    const record = await store.getForLearner({ challengeId, learnerStateRef: learner });
    assert.equal(record?.challenge.status, "won");
    assert.equal(record?.events.length, 1);
  } finally {
    await sql.end();
  }
});

maybe("a stale expectedSeq is rejected without writing (concurrent answer race)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { enrichmentId, nodeIds, itemIds } = await seedSubstrate(sql);
    const learner = await seedChallengeLearner(sql);
    const store = new PostgresLearnerRecallChallengeStore(sql);
    const challengeId = randomUUID();
    await store.create({
      challengeId,
      learnerStateRef: learner,
      enrichmentId,
      scopeKind: "section",
      scopeAnchorDerivedNodeId: nodeIds[0],
      lineup: itemIds.map((studyItemId, index) => ({ studyItemId, derivedNodeId: nodeIds[index] }))
    });
    // Two computed transitions off the same fold: the first commits, the second (same
    // expectedSeq, different attempt) must be told the world moved on.
    const first = store.appendEvent({ challengeId, learnerStateRef: learner, expectedSeq: 1, event: answerEvent(randomUUID(), itemIds[0], false) });
    const second = store.appendEvent({ challengeId, learnerStateRef: learner, expectedSeq: 1, event: answerEvent(randomUUID(), itemIds[0], false) });
    const results = (await Promise.all([first, second])).sort();
    assert.deepEqual(results, ["appended", "stale"]);
    const record = await store.getForLearner({ challengeId, learnerStateRef: learner });
    assert.equal(record?.events.length, 1);
  } finally {
    await sql.end();
  }
});

maybe("lifecycle events dedupe on operationRef; abandon frees the scope for a fresh create", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { enrichmentId, nodeIds, itemIds } = await seedSubstrate(sql);
    const learner = await seedChallengeLearner(sql);
    const store = new PostgresLearnerRecallChallengeStore(sql);
    const challengeId = randomUUID();
    const scope = { learnerStateRef: learner, enrichmentId, scopeKind: "section" as const, scopeAnchorDerivedNodeId: nodeIds[0] };
    const lineup = [{ studyItemId: itemIds[0], derivedNodeId: nodeIds[0] }];
    await store.create({ challengeId, ...scope, lineup });

    const retreatRef = randomUUID();
    assert.equal(await store.appendEvent({ challengeId, learnerStateRef: learner, expectedSeq: 1, event: { kind: "retreat", operationRef: retreatRef } }), "appended");
    assert.equal(await store.appendEvent({ challengeId, learnerStateRef: learner, expectedSeq: 2, event: { kind: "retreat", operationRef: retreatRef } }), "duplicate");

    const abandonRef = randomUUID();
    assert.equal(
      await store.appendEvent({ challengeId, learnerStateRef: learner, expectedSeq: 2, event: { kind: "abandon", operationRef: abandonRef }, materializeStatus: "abandoned" }),
      "appended"
    );
    assert.equal((await store.getForLearner({ challengeId, learnerStateRef: learner }))?.challenge.status, "abandoned");
    // The scope's active slot is free again.
    assert.deepEqual(await store.create({ challengeId: randomUUID(), ...scope, lineup }), { created: true });
  } finally {
    await sql.end();
  }
});

maybe("an active lineup survives Study Item supersession and hydrates by identity", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { enrichmentId, nodeIds, itemIds } = await seedSubstrate(sql);
    const learner = await seedChallengeLearner(sql);
    const store = new PostgresLearnerRecallChallengeStore(sql);
    const bank = new PostgresStudyItemBankStore(sql);
    const challengeId = randomUUID();
    await store.create({
      challengeId,
      learnerStateRef: learner,
      enrichmentId,
      scopeKind: "enrichment",
      scopeAnchorDerivedNodeId: nodeIds[1],
      lineup: itemIds.map((studyItemId, index) => ({ studyItemId, derivedNodeId: nodeIds[index] }))
    });

    // Regenerate the bank: the old items are superseded, new ones replace them.
    await bank.persist({
      graphVersionId: null,
      enrichmentId,
      configHash: "test-2",
      studyItems: nodeIds.map((derivedNodeId) => optionSelectItem(enrichmentId, derivedNodeId)),
      rejected: []
    });
    // The normal current-generation read no longer resolves the lineup item…
    assert.equal(await bank.getStudyItemById(itemIds[0]), undefined);
    // …but the challenge hydration path still does, in lineup order, full options included.
    const hydrated = await store.hydrateLineupItems({ challengeId });
    assert.deepEqual(hydrated.map((item) => item.studyItemId), itemIds);
    assert.equal(hydrated[0].itemType, "option_select");
    if (hydrated[0].itemType === "option_select") assert.equal(hydrated[0].options.length, 4);
  } finally {
    await sql.end();
  }
});

maybe("prior exposure counts lineup memberships; won scopes report the FIRST victory; the exact fold state survives a new store instance", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { enrichmentId, nodeIds, itemIds } = await seedSubstrate(sql);
    const learner = await seedChallengeLearner(sql);
    const store = new PostgresLearnerRecallChallengeStore(sql);
    const scope = { learnerStateRef: learner, enrichmentId, scopeKind: "section" as const, scopeAnchorDerivedNodeId: nodeIds[0] };
    const lineup = [{ studyItemId: itemIds[0], derivedNodeId: nodeIds[0] }];

    const firstWin = randomUUID();
    await store.create({ challengeId: firstWin, ...scope, lineup });
    await store.appendEvent({ challengeId: firstWin, learnerStateRef: learner, expectedSeq: 1, event: answerEvent(randomUUID(), itemIds[0], true), materializeStatus: "won" });
    const rematch = randomUUID();
    await store.create({ challengeId: rematch, ...scope, lineup });
    await store.appendEvent({ challengeId: rematch, learnerStateRef: learner, expectedSeq: 1, event: answerEvent(randomUUID(), itemIds[0], false) });
    await store.appendEvent({ challengeId: rematch, learnerStateRef: learner, expectedSeq: 2, event: answerEvent(randomUUID(), itemIds[0], true), materializeStatus: "won" });

    assert.deepEqual(await store.priorExposure({ learnerStateRef: learner, enrichmentId }), { [itemIds[0]]: 2 });
    const won = await store.listWonScopes({ learnerStateRef: learner, enrichmentId });
    assert.deepEqual(won, [{ scopeKind: "section", scopeAnchorDerivedNodeId: nodeIds[0], challengeId: firstWin }]);

    // A brand-new store instance replays the identical record (exact resume, KTD2).
    const fresh = new PostgresLearnerRecallChallengeStore(sql);
    const record = await fresh.getForLearner({ challengeId: rematch, learnerStateRef: learner });
    assert.equal(record?.events.length, 2);
    assert.deepEqual(record?.events.map((event) => event.seq), [1, 2]);
  } finally {
    await sql.end();
  }
});

maybe("recall challenge writes leave response_log untouched (KTD4)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { enrichmentId, nodeIds, itemIds } = await seedSubstrate(sql);
    const learner = await seedChallengeLearner(sql);
    const store = new PostgresLearnerRecallChallengeStore(sql);
    // Scoped to this test's own freshly seeded learner: a global count races any concurrently
    // running test file that writes a response row inside this window.
    const [{ count: before }] = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM response_log WHERE learner_state_ref = ${learner}`;

    const challengeId = randomUUID();
    await store.create({
      challengeId,
      learnerStateRef: learner,
      enrichmentId,
      scopeKind: "section",
      scopeAnchorDerivedNodeId: nodeIds[0],
      lineup: [{ studyItemId: itemIds[0], derivedNodeId: nodeIds[0] }]
    });
    await store.appendEvent({ challengeId, learnerStateRef: learner, expectedSeq: 1, event: answerEvent(randomUUID(), itemIds[0], false) });
    await store.appendEvent({ challengeId, learnerStateRef: learner, expectedSeq: 2, event: answerEvent(randomUUID(), itemIds[0], true), materializeStatus: "won" });

    const [{ count: after }] = await sql<{ count: string }[]>`
      SELECT COUNT(*) AS count FROM response_log WHERE learner_state_ref = ${learner}`;
    assert.equal(after, before);
  } finally {
    await sql.end();
  }
});

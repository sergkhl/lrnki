import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Card, NewResponseLogRow, StructuredDocument } from "@lrnki/domain-core";
import { createDatabaseClient } from "./db";
import { PostgresCardBankStore, PostgresResponseLogStore } from "./PostgresLearnerLoopStores";
import { PostgresSourceRegistrationStore } from "./PostgresStores";

// Integration tests against a live PostgreSQL with the single initial migration
// applied. Skipped when DATABASE_URL is absent so the unit suite stays hermetic.
const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

const document: StructuredDocument = {
  sourceResourceId: "pending",
  parserName: "test",
  parserVersion: "1",
  parserConfigHash: "test",
  blocks: [
    { blockId: "b1", blockType: "paragraph", text: "Ownership is a set of rules that govern memory.", headingPath: ["Ownership"], locator: {} },
    { blockId: "b2", blockType: "paragraph", text: "Borrowing lets you reference a value without taking ownership.", headingPath: ["Borrowing"], locator: {} }
  ]
};

type Sql = ReturnType<typeof createDatabaseClient>;

// Seed the minimum published-graph substrate a Card cites: a source with blocks, a
// published graph version, and one Concept. Returns the ids the cards key on.
async function seedSubstrate(sql: Sql): Promise<{
  graphVersionId: string; conceptId: string; sourceResourceId: string; blockIds: string[];
}> {
  const registration = new PostgresSourceRegistrationStore(sql);
  const contentHash = randomUUID();
  const { sourceResourceId } = await registration.register({
    contentHash, contentType: "text/markdown", objectKey: `tmp/${contentHash}`,
    declaredDomain: "software engineering", title: "Test source", document
  });
  const blocks = await sql<{ source_block_id: string }[]>`
    SELECT sb.source_block_id FROM source_blocks sb
    JOIN source_documents sd ON sd.source_document_id = sb.source_document_id
    WHERE sd.source_resource_id = ${sourceResourceId} ORDER BY sb.block_id`;
  const graphVersionId = randomUUID();
  await sql`
    INSERT INTO graph_versions (graph_version_id, base_graph_version_id, status, refinement_config_hash, published_at)
    VALUES (${graphVersionId}, NULL, 'published', 'test', now())`;
  const conceptId = randomUUID();
  await sql`
    INSERT INTO concepts (concept_id, iri, normalized_label, declared_domain)
    VALUES (${conceptId}, ${`urn:lrnki:concept:${conceptId}`}, ${`ownership-${conceptId}`}, 'software engineering')`;
  return { graphVersionId, conceptId, sourceResourceId, blockIds: blocks.map((row) => row.source_block_id) };
}

function cardFor(input: { graphVersionId: string; conceptId: string; sourceResourceId: string; blockIds: string[] }): Card {
  return {
    cardId: randomUUID(),
    graphVersionId: input.graphVersionId,
    conceptId: input.conceptId,
    question: "What does ownership govern?",
    answerKey: "Ownership is the set of rules that govern memory.",
    selfReportPrompt: "How confident are you that you can explain ownership?",
    generatingModel: "test-model",
    configHash: "card-config-v1",
    citations: [
      { sourceResourceId: input.sourceResourceId, sourceBlockId: input.blockIds[0], evidenceQuote: "Ownership is a set of rules that govern memory." },
      { sourceResourceId: input.sourceResourceId, sourceBlockId: input.blockIds[1], evidenceQuote: "Borrowing lets you reference a value without taking ownership." }
    ]
  };
}

maybe("persists a card with citations and reads it back intact via getCard", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const substrate = await seedSubstrate(sql);
    const card = cardFor(substrate);
    const store = new PostgresCardBankStore(sql);
    await store.persist([card]);

    const loaded = await store.getCard(substrate.graphVersionId, substrate.conceptId);
    assert.ok(loaded, "card round-trips");
    assert.equal(loaded.question, card.question);
    assert.equal(loaded.answerKey, card.answerKey);
    assert.equal(loaded.selfReportPrompt, card.selfReportPrompt);
    assert.equal(loaded.citations.length, 2);
    assert.deepEqual(
      loaded.citations.map((c) => c.evidenceQuote).sort(),
      card.citations.map((c) => c.evidenceQuote).sort()
    );
  } finally {
    await sql.end();
  }
});

maybe("listCardsForVersion returns only the requested version's cards", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const a = await seedSubstrate(sql);
    const b = await seedSubstrate(sql);
    const store = new PostgresCardBankStore(sql);
    await store.persist([cardFor(a)]);
    await store.persist([cardFor(b)]);

    const cardsA = await store.listCardsForVersion(a.graphVersionId);
    assert.equal(cardsA.length, 1);
    assert.equal(cardsA[0].graphVersionId, a.graphVersionId);
  } finally {
    await sql.end();
  }
});

maybe("regeneration replaces a version's cards instead of duplicating under the unique key", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const substrate = await seedSubstrate(sql);
    const store = new PostgresCardBankStore(sql);
    const first = cardFor(substrate);
    await store.persist([first]);
    const regenerated: Card = { ...cardFor(substrate), question: "Regenerated question?" };
    await store.persist([regenerated]);

    const cards = await store.listCardsForVersion(substrate.graphVersionId);
    assert.equal(cards.length, 1, "delete-then-insert keeps exactly one card per (version, concept)");
    assert.equal(cards[0].question, "Regenerated question?");
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM card_answer_key_citations c
      JOIN cards cc ON cc.card_id = c.card_id WHERE cc.graph_version_id = ${substrate.graphVersionId}`;
    assert.equal(count, 2, "stale citations are cleared on regeneration");
  } finally {
    await sql.end();
  }
});

maybe("artifact_cards JSON_TABLE view returns one row per card", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const substrate = await seedSubstrate(sql);
    await new PostgresCardBankStore(sql).persist([cardFor(substrate)]);

    const rows = await sql<{ card_id: string; concept_id: string; citation_count: number }[]>`
      SELECT card_id, concept_id, citation_count FROM artifact_cards WHERE graph_version_id = ${substrate.graphVersionId}`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].concept_id, substrate.conceptId);
    assert.equal(Number(rows[0].citation_count), 2);
  } finally {
    await sql.end();
  }
});

// --- Response Log (U3) -----------------------------------------------------

// Persist a real card so response_log's card_id FK resolves, returning the ids the
// log keys on.
async function seedCard(sql: Sql): Promise<{ cardId: string; conceptId: string }> {
  const substrate = await seedSubstrate(sql);
  const card = cardFor(substrate);
  await new PostgresCardBankStore(sql).persist([card]);
  return { cardId: card.cardId, conceptId: substrate.conceptId };
}

function selfReportRow(input: { learnerStateRef: string; cardId: string; conceptId: string; rating: "again" | "hard" | "good" | "easy"; attemptSeq: number; batchId: string }): NewResponseLogRow {
  return {
    responseId: randomUUID(), learnerStateRef: input.learnerStateRef, cardId: input.cardId, conceptId: input.conceptId,
    signalType: "self_report", selfReportRating: input.rating, judgedOutcome: null, gradedScore: null,
    evidenceWeight: 0.3, responseSource: "synthetic", graderIdentity: null, batchId: input.batchId,
    attemptSeq: input.attemptSeq, submittedAnswer: null
  };
}

function gradedRow(input: { learnerStateRef: string; cardId: string; conceptId: string; outcome: "correct" | "partial" | "incorrect"; score: number; attemptSeq: number }): NewResponseLogRow {
  return {
    responseId: randomUUID(), learnerStateRef: input.learnerStateRef, cardId: input.cardId, conceptId: input.conceptId,
    signalType: "graded", selfReportRating: null, judgedOutcome: input.outcome, gradedScore: input.score,
    evidenceWeight: 1.0, responseSource: "synthetic", graderIdentity: "kg-independent-judge", batchId: null,
    attemptSeq: input.attemptSeq, submittedAnswer: "a written answer"
  };
}

maybe("appends a self_report and a graded row for the same learner+concept with distinct attempt_seq, nothing overwritten", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { cardId, conceptId } = await seedCard(sql);
    const store = new PostgresResponseLogStore(sql);
    const learner = `learner-${randomUUID()}`;
    await store.append([selfReportRow({ learnerStateRef: learner, cardId, conceptId, rating: "good", attemptSeq: 1, batchId: randomUUID() })]);
    await store.append([gradedRow({ learnerStateRef: learner, cardId, conceptId, outcome: "incorrect", score: 0, attemptSeq: 2 })]);

    const rows = await store.listForLearner(learner);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.attemptSeq), [1, 2], "rows return in attempt_seq order");
    assert.deepEqual(rows.map((r) => r.signalType), ["self_report", "graded"]);
  } finally {
    await sql.end();
  }
});

maybe("a partial graded row round-trips distinct from correct and incorrect (Covers AE4)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { cardId, conceptId } = await seedCard(sql);
    const store = new PostgresResponseLogStore(sql);
    const learner = `learner-${randomUUID()}`;
    await store.append([
      gradedRow({ learnerStateRef: learner, cardId, conceptId, outcome: "correct", score: 1, attemptSeq: 1 }),
      gradedRow({ learnerStateRef: learner, cardId, conceptId, outcome: "partial", score: 0.5, attemptSeq: 2 }),
      gradedRow({ learnerStateRef: learner, cardId, conceptId, outcome: "incorrect", score: 0, attemptSeq: 3 })
    ]);
    const rows = await store.listForLearnerConcept(learner, conceptId);
    assert.deepEqual(rows.map((r) => r.judgedOutcome), ["correct", "partial", "incorrect"]);
    assert.deepEqual(rows.map((r) => r.gradedScore), [1, 0.5, 0]);
  } finally {
    await sql.end();
  }
});

maybe("CHECK rejects a self_report with null rating and a graded row with null outcome", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { cardId, conceptId } = await seedCard(sql);
    const store = new PostgresResponseLogStore(sql);
    const learner = `learner-${randomUUID()}`;
    const badSelfReport: NewResponseLogRow = { ...selfReportRow({ learnerStateRef: learner, cardId, conceptId, rating: "good", attemptSeq: 1, batchId: randomUUID() }), selfReportRating: null };
    await assert.rejects(() => store.append([badSelfReport]), /violates check constraint|null/i);
    const badGraded: NewResponseLogRow = { ...gradedRow({ learnerStateRef: learner, cardId, conceptId, outcome: "correct", score: 1, attemptSeq: 1 }), judgedOutcome: null };
    await assert.rejects(() => store.append([badGraded]), /violates check constraint|null/i);
  } finally {
    await sql.end();
  }
});

maybe("two learners' rows never bleed across learner_state_ref", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { cardId, conceptId } = await seedCard(sql);
    const store = new PostgresResponseLogStore(sql);
    const learnerA = `learner-${randomUUID()}`;
    const learnerB = `learner-${randomUUID()}`;
    await store.append([selfReportRow({ learnerStateRef: learnerA, cardId, conceptId, rating: "good", attemptSeq: 1, batchId: randomUUID() })]);
    await store.append([selfReportRow({ learnerStateRef: learnerB, cardId, conceptId, rating: "again", attemptSeq: 1, batchId: randomUUID() })]);
    assert.equal((await store.listForLearner(learnerA)).length, 1);
    assert.equal((await store.listForLearner(learnerB)).length, 1);
    assert.equal((await store.listForLearner(learnerA))[0].selfReportRating, "good");
  } finally {
    await sql.end();
  }
});

maybe("re-calibration appends a new batch_id without deleting the prior batch (Covers R5, R10)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { cardId, conceptId } = await seedCard(sql);
    const store = new PostgresResponseLogStore(sql);
    const learner = `learner-${randomUUID()}`;
    const batch1 = randomUUID();
    const batch2 = randomUUID();
    let seq = await store.nextAttemptSeq(learner);
    await store.append([selfReportRow({ learnerStateRef: learner, cardId, conceptId, rating: "again", attemptSeq: seq, batchId: batch1 })]);
    seq = await store.nextAttemptSeq(learner);
    await store.append([selfReportRow({ learnerStateRef: learner, cardId, conceptId, rating: "good", attemptSeq: seq, batchId: batch2 })]);

    const rows = await store.listForLearner(learner);
    assert.equal(rows.length, 2, "the first batch survives the second");
    assert.deepEqual(new Set(rows.map((r) => r.batchId)), new Set([batch1, batch2]));
  } finally {
    await sql.end();
  }
});

maybe("the returned row set carries every field an IRT and a BKT fit require (R6)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { cardId, conceptId } = await seedCard(sql);
    const store = new PostgresResponseLogStore(sql);
    const learner = `learner-${randomUUID()}`;
    await store.append([gradedRow({ learnerStateRef: learner, cardId, conceptId, outcome: "correct", score: 1, attemptSeq: 1 })]);
    const [row] = await store.listForLearner(learner);
    // IRT needs an item id + ordered outcome; BKT needs a skill id + ordered sequence.
    assert.equal(typeof row.cardId, "string");      // per-item IRT key
    assert.equal(typeof row.conceptId, "string");   // per-skill BKT key
    assert.equal(typeof row.attemptSeq, "number");  // ordered sequence
    assert.equal(typeof row.gradedScore, "number");
    assert.equal(row.graderIdentity, "kg-independent-judge");
    assert.ok(row.createdAt, "createdAt stamped by the store");
  } finally {
    await sql.end();
  }
});

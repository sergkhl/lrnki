import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Card, StructuredDocument } from "@lrnki/domain-core";
import { createDatabaseClient } from "./db";
import { PostgresCardBankStore } from "./PostgresLearnerLoopStores";
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

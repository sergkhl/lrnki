import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { NewResponseLogRow, OptionSelectItem, RejectedStudyItem, SelfAssessmentItem, StructuredDocument, StudyItem } from "@lrnki/domain-core";
import { createDatabaseClient } from "./db";
import { PostgresStudyItemBankStore, PostgresResponseLogStore } from "./PostgresLearnerLoopStores";
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

type Substrate = {
  graphVersionId: string; enrichmentId: string; conceptId: string; derivedNodeId: string; sourceResourceId: string; blockIds: string[];
};

// Seed the minimum published-graph substrate a study item cites: a source with blocks, a
// published graph version, an enrichment, and one derived node. Returns the ids items key on.
async function seedSubstrate(sql: Sql): Promise<Substrate> {
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
  const enrichmentId = randomUUID();
  await sql`
    INSERT INTO graph_enrichments (enrichment_id, graph_version_id, enrichment_config_hash, status, judge_model, difficulty_method, completed_at)
    VALUES (${enrichmentId}, ${graphVersionId}, 'test', 'succeeded', 'test-judge', 'test-difficulty', now())`;
  const derivedNodeId = randomUUID();
  await sql`
    INSERT INTO derived_graph_nodes (derived_node_id, enrichment_id, node_kind, concept_id, grounding_origin, role, canonical_label, normalized_label, declared_domain, aliases)
    VALUES (${derivedNodeId}, ${enrichmentId}, 'anchor', ${conceptId}, 'document_anchored', 'anchor', 'Ownership', ${`ownership-${conceptId}`}, 'software engineering', '[]'::jsonb)`;
  return { graphVersionId, enrichmentId, conceptId, derivedNodeId, sourceResourceId, blockIds: blocks.map((row) => row.source_block_id) };
}

function selfAssessmentFor(s: Substrate): SelfAssessmentItem {
  return {
    itemType: "self_assessment",
    studyItemId: randomUUID(),
    graphVersionId: s.graphVersionId,
    enrichmentId: s.enrichmentId,
    derivedNodeId: s.derivedNodeId,
    groundingProvenance: "source_cep",
    question: "What does ownership govern?",
    answerKey: "Ownership is the set of rules that govern memory.",
    selfReportPrompt: "How confident are you that you can explain ownership?",
    generatingModel: "test-model",
    configHash: "cfg",
    citations: [
      { provenance: "source", sourceResourceId: s.sourceResourceId, sourceBlockId: s.blockIds[0], evidenceQuote: "Ownership is a set of rules that govern memory." }
    ]
  };
}

function optionSelectFor(s: Substrate): OptionSelectItem {
  return {
    itemType: "option_select",
    studyItemId: randomUUID(),
    graphVersionId: s.graphVersionId,
    enrichmentId: s.enrichmentId,
    derivedNodeId: s.derivedNodeId,
    groundingProvenance: "source_cep",
    question: "What does ownership govern?",
    generatingModel: "test-model",
    configHash: "cfg",
    options: [
      { optionId: randomUUID(), text: "Memory", isCorrect: true, provenance: "source", citation: { provenance: "source", sourceResourceId: s.sourceResourceId, sourceBlockId: s.blockIds[0], evidenceQuote: "Ownership is a set of rules that govern memory." } },
      { optionId: randomUUID(), text: "Network sockets", isCorrect: false, provenance: "generated" },
      { optionId: randomUUID(), text: "Thread scheduling", isCorrect: false, provenance: "generated" },
      { optionId: randomUUID(), text: "Disk layout", isCorrect: false, provenance: "generated" }
    ]
  };
}

function bankFor(sql: Sql, s: Substrate, items: StudyItem[], rejected: RejectedStudyItem[] = []): Promise<void> {
  return new PostgresStudyItemBankStore(sql).persist({ graphVersionId: s.graphVersionId, enrichmentId: s.enrichmentId, configHash: "cfg", studyItems: items, rejected });
}

maybe("persists both a self_assessment and an option_select item for one node; both round-trip with options + citations; supportedItemTypes returns both", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    await bankFor(sql, s, [selfAssessmentFor(s), optionSelectFor(s)]);

    const store = new PostgresStudyItemBankStore(sql);
    const items = await store.listStudyItemsForEnrichment(s.enrichmentId);
    assert.equal(items.length, 2);

    const sa = items.find((i) => i.itemType === "self_assessment") as SelfAssessmentItem;
    assert.equal(sa.answerKey, "Ownership is the set of rules that govern memory.");
    assert.equal(sa.citations.length, 1);

    const os = items.find((i) => i.itemType === "option_select") as OptionSelectItem;
    assert.equal(os.options.length, 4);
    const correct = os.options.filter((o) => o.isCorrect);
    assert.equal(correct.length, 1);
    assert.equal(correct[0].text, "Memory");
    assert.ok(correct[0].citation && correct[0].citation.provenance === "source");
    for (const distractor of os.options.filter((o) => !o.isCorrect)) {
      assert.equal(distractor.provenance, "generated");
      assert.equal(distractor.citation, undefined);
    }

    assert.deepEqual(await store.supportedItemTypes(s.derivedNodeId), ["option_select", "self_assessment"]);
  } finally {
    await sql.end();
  }
});

maybe("a node with only a self_assessment item supports only that type", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    await bankFor(sql, s, [selfAssessmentFor(s)]);
    assert.deepEqual(await new PostgresStudyItemBankStore(sql).supportedItemTypes(s.derivedNodeId), ["self_assessment"]);
  } finally {
    await sql.end();
  }
});

maybe("regeneration (delete-then-insert) replaces a prior bank, leaving no orphaned options or citations", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    await bankFor(sql, s, [selfAssessmentFor(s), optionSelectFor(s)]);
    // Re-persist with only the self_assessment item.
    await bankFor(sql, s, [selfAssessmentFor(s)]);

    const items = await new PostgresStudyItemBankStore(sql).listStudyItemsForEnrichment(s.enrichmentId);
    assert.equal(items.length, 1);
    assert.equal(items[0].itemType, "self_assessment");
    const [{ options }] = await sql<{ options: number }[]>`
      SELECT count(*)::int AS options FROM study_item_options o JOIN study_items si ON si.study_item_id = o.study_item_id WHERE si.enrichment_id = ${s.enrichmentId}`;
    assert.equal(options, 0, "orphaned options are cascade-cleared");
    const [{ citations }] = await sql<{ citations: number }[]>`
      SELECT count(*)::int AS citations FROM study_item_citations c JOIN study_items si ON si.study_item_id = c.study_item_id WHERE si.enrichment_id = ${s.enrichmentId}`;
    assert.equal(citations, 1, "only the surviving item's citation remains");
  } finally {
    await sql.end();
  }
});

maybe("UNIQUE (derived_node_id, item_type) rejects a second item of the same type for one node", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    await assert.rejects(() => bankFor(sql, s, [selfAssessmentFor(s), selfAssessmentFor(s)]), /duplicate key|unique/i);
  } finally {
    await sql.end();
  }
});

maybe("type-coherence CHECK rejects an option_select row with a non-null answer_key", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    await assert.rejects(
      () => sql`
        INSERT INTO study_items (study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, answer_key, self_report_prompt, generating_model, config_hash)
        VALUES (${randomUUID()}, 'option_select', ${s.graphVersionId}, ${s.enrichmentId}, ${s.derivedNodeId}, 'source_cep', 'Q?', 'should not be here', NULL, 'm', 'cfg')`,
      /violates check constraint/i
    );
  } finally {
    await sql.end();
  }
});

maybe("type-coherence CHECK rejects a self_assessment row with a null self_report_prompt", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    await assert.rejects(
      () => sql`
        INSERT INTO study_items (study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, answer_key, self_report_prompt, generating_model, config_hash)
        VALUES (${randomUUID()}, 'self_assessment', ${s.graphVersionId}, ${s.enrichmentId}, ${s.derivedNodeId}, 'source_cep', 'Q?', 'A.', NULL, 'm', 'cfg')`,
      /violates check constraint/i
    );
  } finally {
    await sql.end();
  }
});

maybe("option provenance CHECK rejects an invalid provenance value", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    const itemId = randomUUID();
    await sql`
      INSERT INTO study_items (study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, answer_key, self_report_prompt, generating_model, config_hash)
      VALUES (${itemId}, 'option_select', ${s.graphVersionId}, ${s.enrichmentId}, ${s.derivedNodeId}, 'source_cep', 'Q?', NULL, NULL, 'm', 'cfg')`;
    await assert.rejects(
      () => sql`
        INSERT INTO study_item_options (option_id, study_item_id, ordinal, option_text, is_correct, provenance)
        VALUES (${randomUUID()}, ${itemId}, 0, 'x', false, 'fabricated')`,
      /violates check constraint/i
    );
  } finally {
    await sql.end();
  }
});

// --- Response Log -----------------------------------------------------------

async function seedItem(sql: Sql): Promise<{ studyItemId: string; derivedNodeId: string }> {
  const s = await seedSubstrate(sql);
  const item = selfAssessmentFor(s);
  await bankFor(sql, s, [item]);
  return { studyItemId: item.studyItemId, derivedNodeId: s.derivedNodeId };
}

function gradedRow(input: { learnerStateRef: string; studyItemId: string; derivedNodeId: string; outcome: "correct" | "partial" | "incorrect"; score: number; attemptSeq: number }): NewResponseLogRow {
  return {
    responseId: randomUUID(), learnerStateRef: input.learnerStateRef, studyItemId: input.studyItemId, derivedNodeId: input.derivedNodeId,
    signalType: "graded", selfReportRating: null, judgedOutcome: input.outcome, gradedScore: input.score,
    evidenceWeight: 1.0, responseSource: "human", graderIdentity: "auto", batchId: null,
    attemptSeq: input.attemptSeq, submittedAnswer: null
  };
}

maybe("a graded row referencing a real study_item_id inserts; one referencing an absent id is rejected by the FK", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { studyItemId, derivedNodeId } = await seedItem(sql);
    const store = new PostgresResponseLogStore(sql);
    const learner = `learner-${randomUUID()}`;
    await store.append([gradedRow({ learnerStateRef: learner, studyItemId, derivedNodeId, outcome: "correct", score: 1, attemptSeq: 1 })]);
    const rows = await store.listForLearner(learner);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].studyItemId, studyItemId);

    await assert.rejects(
      () => store.append([gradedRow({ learnerStateRef: learner, studyItemId: randomUUID(), derivedNodeId, outcome: "correct", score: 1, attemptSeq: 2 })]),
      /violates foreign key|foreign key/i
    );
  } finally {
    await sql.end();
  }
});

maybe("graded rows preserve attempt_seq order and grader_identity 'auto'", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { studyItemId, derivedNodeId } = await seedItem(sql);
    const store = new PostgresResponseLogStore(sql);
    const learner = `learner-${randomUUID()}`;
    await store.append([
      gradedRow({ learnerStateRef: learner, studyItemId, derivedNodeId, outcome: "correct", score: 1, attemptSeq: 1 }),
      gradedRow({ learnerStateRef: learner, studyItemId, derivedNodeId, outcome: "incorrect", score: 0, attemptSeq: 2 })
    ]);
    const rows = await store.listForLearnerNode(learner, derivedNodeId);
    assert.deepEqual(rows.map((r) => r.attemptSeq), [1, 2]);
    assert.deepEqual(rows.map((r) => r.gradedScore), [1, 0]);
    assert.ok(rows.every((r) => r.graderIdentity === "auto"));
  } finally {
    await sql.end();
  }
});

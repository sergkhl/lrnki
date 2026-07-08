import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import type { ConceptLesson, ImpostorItem, NewResponseLogRow, OptionSelectItem, RejectedStudyItem, StructuredDocument, StudyItem } from "@lrnki/domain-core";
import { createDatabaseClient } from "./db";
import { PostgresConceptLessonStore, PostgresStudyItemBankStore, PostgresResponseLogStore, PostgresCalibrationVerdictStore } from "./PostgresLearnerLoopStores";
import { PostgresSourceRegistrationStore } from "./PostgresStores";
import { cleanupTrackedLearners, seedLearner } from "./testSupport";

// Integration tests against a live PostgreSQL with the single initial migration
// applied. Skipped when DATABASE_URL is absent so the unit suite stays hermetic.
const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

// This suite seeds `learners` rows; delete exactly those before exiting so the shared dev
// DB's learner count is unchanged by the run (plan 2026-07-07-007, R2/AE2).
after(() => cleanupTrackedLearners(databaseUrl));

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

function optionSelectFor(s: Substrate): OptionSelectItem {
  return {
    itemType: "option_select",
    studyItemId: randomUUID(),
    graphVersionId: s.graphVersionId,
    enrichmentId: s.enrichmentId,
    derivedNodeId: s.derivedNodeId,
    groundingProvenance: "source_cep",
    question: "What does ownership govern?",
    explanation: "Ownership governs memory according to the grounded source.",
    generatingModel: "test-model",
    configHash: "cfg",
    options: [
      { optionId: randomUUID(), text: "Memory", isCorrect: true, provenance: "source", citation: { provenance: "source", sourceResourceId: s.sourceResourceId, sourceBlockId: s.blockIds[0], evidenceQuote: "Ownership is a set of rules that govern memory.", matchKind: "exact" } },
      { optionId: randomUUID(), text: "Network sockets", isCorrect: false, provenance: "generated" },
      { optionId: randomUUID(), text: "Thread scheduling", isCorrect: false, provenance: "generated" },
      { optionId: randomUUID(), text: "Disk layout", isCorrect: false, provenance: "generated" }
    ]
  };
}

function impostorFor(s: Substrate, opts: { lieSource?: "sibling" | "generated"; siblingLabel?: string } = {}): ImpostorItem {
  const sourceCitation = { provenance: "source" as const, sourceResourceId: s.sourceResourceId, sourceBlockId: s.blockIds[0], evidenceQuote: "Ownership is a set of rules that govern memory.", matchKind: "exact" as const };
  return {
    itemType: "impostor",
    studyItemId: randomUUID(),
    graphVersionId: s.graphVersionId,
    enrichmentId: s.enrichmentId,
    derivedNodeId: s.derivedNodeId,
    groundingProvenance: "source_cep",
    question: "Which statement about ownership is false?",
    generatingModel: "test-model",
    configHash: "cfg",
    statements: [
      { statementId: randomUUID(), ordinal: 0, text: "Ownership governs memory.", isImpostor: false, provenance: "source", citation: sourceCitation },
      { statementId: randomUUID(), ordinal: 1, text: "Ownership is a set of rules.", isImpostor: false, provenance: "source", citation: sourceCitation },
      { statementId: randomUUID(), ordinal: 2, text: "Ownership applies to values that govern memory.", isImpostor: false, provenance: "source", citation: sourceCitation },
      {
        statementId: randomUUID(),
        ordinal: 3,
        text: "Ownership lets you reference a value without taking it.",
        isImpostor: true,
        provenance: "generated",
        reveal: "The fourth is false; that describes Borrowing.",
        lieSource: opts.lieSource ?? "sibling",
        ...((opts.lieSource ?? "sibling") === "sibling" ? { siblingLabel: opts.siblingLabel ?? "Borrowing" } : {})
      }
    ]
  };
}

function bankFor(sql: Sql, s: Substrate, items: StudyItem[], rejected: RejectedStudyItem[] = []): Promise<void> {
  return new PostgresStudyItemBankStore(sql).persist({ graphVersionId: s.graphVersionId, enrichmentId: s.enrichmentId, configHash: "cfg", studyItems: items, rejected });
}

maybe("persists an option_select item; it round-trips with options + citation; supportedItemTypes returns option_select", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    await bankFor(sql, s, [optionSelectFor(s)]);

    const store = new PostgresStudyItemBankStore(sql);
    const items = await store.listStudyItemsForEnrichment(s.enrichmentId);
    assert.equal(items.length, 1);

    const os = items[0] as OptionSelectItem;
    assert.equal(os.options.length, 4);
    const correct = os.options.filter((o) => o.isCorrect);
    assert.equal(correct.length, 1);
    assert.equal(correct[0].text, "Memory");
    assert.ok(correct[0].citation && correct[0].citation.provenance === "source");
    for (const distractor of os.options.filter((o) => !o.isCorrect)) {
      assert.equal(distractor.provenance, "generated");
      assert.equal(distractor.citation, undefined);
    }

    assert.deepEqual(await store.supportedItemTypes(s.derivedNodeId), ["option_select"]);
  } finally {
    await sql.end();
  }
});

maybe("getStudyItemById round-trips the full domain item by primary key and scopes to the current generation", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    const prior = optionSelectFor(s);
    await bankFor(sql, s, [prior]);
    const store = new PostgresStudyItemBankStore(sql);

    const hydrated = await store.getStudyItemById(prior.studyItemId);
    assert.ok(hydrated && hydrated.itemType === "option_select");
    assert.equal(hydrated.studyItemId, prior.studyItemId);
    assert.equal(hydrated.options.filter((o) => o.isCorrect).length, 1);

    assert.equal(await store.getStudyItemById(randomUUID()), undefined, "an unknown id returns undefined");

    // Superseding the item removes it from the current-generation lookup.
    await bankFor(sql, s, [optionSelectFor(s)]);
    assert.equal(await store.getStudyItemById(prior.studyItemId), undefined, "a superseded item is not returned");
  } finally {
    await sql.end();
  }
});

maybe("regeneration (supersede-then-insert) retires a prior bank from current reads while keeping its options/citations as history", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    const prior = optionSelectFor(s);
    await bankFor(sql, s, [prior]);
    // Re-persist with no items and a rejection.
    await bankFor(sql, s, [], [{ derivedNodeId: s.derivedNodeId, canonicalLabel: "Ownership", itemType: "option_select", reason: "no option-select item could be grounded" }]);

    const items = await new PostgresStudyItemBankStore(sql).listStudyItemsForEnrichment(s.enrichmentId);
    assert.equal(items.length, 0, "current reads see only the latest generation");

    const [priorRow] = await sql<{ superseded_at: string | null }[]>`
      SELECT superseded_at FROM study_items WHERE study_item_id = ${prior.studyItemId}`;
    assert.ok(priorRow.superseded_at !== null, "the prior item is superseded, not deleted");

    const [{ options }] = await sql<{ options: number }[]>`
      SELECT count(*)::int AS options FROM study_item_options o WHERE o.study_item_id = ${prior.studyItemId}`;
    assert.equal(options, 4, "the superseded item's options remain as history, not cascade-cleared");
    const [{ citations }] = await sql<{ citations: number }[]>`
      SELECT count(*)::int AS citations FROM study_item_citations c WHERE c.study_item_id = ${prior.studyItemId}`;
    assert.equal(citations, 1, "the superseded item's citation remains as history, not cascade-cleared");
  } finally {
    await sql.end();
  }
});

maybe("regenerating a study item bank after a learner response was logged against it no longer violates response_log's FK (the original defect)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    const prior = optionSelectFor(s);
    await bankFor(sql, s, [prior]);

    const responseId = randomUUID();
    const learnerStateRef = await seedLearner(sql, randomUUID());
    await new PostgresResponseLogStore(sql).append([
      {
        responseId,
        learnerStateRef,
        studyItemId: prior.studyItemId,
        derivedNodeId: s.derivedNodeId,
        signalType: "graded",
        judgedOutcome: "correct",
        gradedScore: 1,
        responseSource: "synthetic",
        graderIdentity: "test",
        batchId: null,
        submittedAnswer: "Memory"
      } satisfies NewResponseLogRow
    ]);

    // Regenerating the bank used to `DELETE FROM study_items WHERE enrichment_id = ...`
    // and fail with response_log_study_item_id_fkey once any response referenced an item
    // in that set. It must now succeed.
    await bankFor(sql, s, [optionSelectFor(s)]);

    const items = await new PostgresStudyItemBankStore(sql).listStudyItemsForEnrichment(s.enrichmentId);
    assert.equal(items.length, 1, "the new generation is current");

    const [response] = await sql<{ study_item_id: string }[]>`
      SELECT study_item_id FROM response_log WHERE response_id = ${responseId}`;
    assert.equal(response.study_item_id, prior.studyItemId, "the logged response still resolves to the exact item the learner answered");
  } finally {
    await sql.end();
  }
});

maybe("UNIQUE (derived_node_id, item_type) rejects a second item of the same type for one node", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    await assert.rejects(() => bankFor(sql, s, [optionSelectFor(s), optionSelectFor(s)]), /duplicate key|unique/i);
  } finally {
    await sql.end();
  }
});

maybe("study_items rejects non-option-select discriminants", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    await assert.rejects(
      () => sql`
        INSERT INTO study_items (study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, generating_model, config_hash)
        VALUES (${randomUUID()}, 'unsupported_item_type', ${s.graphVersionId}, ${s.enrichmentId}, ${s.derivedNodeId}, 'source_cep', 'Q?', 'm', 'cfg')`,
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
      INSERT INTO study_items (study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, generating_model, config_hash)
      VALUES (${itemId}, 'option_select', ${s.graphVersionId}, ${s.enrichmentId}, ${s.derivedNodeId}, 'source_cep', 'Q?', 'm', 'cfg')`;
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

maybe("Covers AE3: persists an impostor item; it round-trips with four statements, one generated impostor (no citation), three cited truths, reveal/lieSource/siblingLabel", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    await bankFor(sql, s, [impostorFor(s)]);

    const store = new PostgresStudyItemBankStore(sql);
    const items = await store.listStudyItemsForEnrichment(s.enrichmentId);
    assert.equal(items.length, 1);
    const item = items[0];
    assert.equal(item.itemType, "impostor");
    if (item.itemType !== "impostor") return;
    assert.equal(item.statements.length, 4);
    const impostors = item.statements.filter((st) => st.isImpostor);
    assert.equal(impostors.length, 1);
    assert.equal(impostors[0].provenance, "generated");
    assert.equal(impostors[0].reveal, "The fourth is false; that describes Borrowing.");
    assert.equal(impostors[0].lieSource, "sibling");
    assert.equal(impostors[0].siblingLabel, "Borrowing");
    for (const truth of item.statements.filter((st) => !st.isImpostor)) {
      assert.ok(truth.citation && truth.citation.provenance === "source");
    }
    assert.deepEqual(await store.supportedItemTypes(s.derivedNodeId), ["impostor"]);
  } finally {
    await sql.end();
  }
});

maybe("listStudyItemsForEnrichment returns BOTH item types for a node that has both", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    await bankFor(sql, s, [optionSelectFor(s), impostorFor(s)]);
    const store = new PostgresStudyItemBankStore(sql);
    const items = await store.listStudyItemsForEnrichment(s.enrichmentId);
    assert.deepEqual(items.map((i) => i.itemType).sort(), ["impostor", "option_select"]);
    assert.deepEqual(await store.supportedItemTypes(s.derivedNodeId), ["impostor", "option_select"]);
  } finally {
    await sql.end();
  }
});

maybe("regenerating an enrichment retires prior impostor statements from current reads while keeping them as history", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    const prior = impostorFor(s);
    await bankFor(sql, s, [prior]);
    await bankFor(sql, s, [], [{ derivedNodeId: s.derivedNodeId, canonicalLabel: "Ownership", itemType: "impostor", reason: "no impostor item could be grounded" }]);

    const items = await new PostgresStudyItemBankStore(sql).listStudyItemsForEnrichment(s.enrichmentId);
    assert.equal(items.length, 0, "current reads see only the latest generation");

    const [{ statements }] = await sql<{ statements: number }[]>`
      SELECT count(*)::int AS statements FROM impostor_statements st WHERE st.study_item_id = ${prior.studyItemId}`;
    assert.equal(statements, 4, "the superseded item's statements remain as history, not cascade-cleared");
  } finally {
    await sql.end();
  }
});

maybe("Covers R9/KTD8: a per-type rejection round-trips — impostor-absent while option-select-present", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    await bankFor(sql, s, [optionSelectFor(s)], [{ derivedNodeId: s.derivedNodeId, canonicalLabel: "Ownership", itemType: "impostor", reason: "no impostor item could be grounded" }]);
    const rejections = await sql<{ item_type: string; reason: string }[]>`
      SELECT item_type, reason FROM rejected_study_items WHERE enrichment_id = ${s.enrichmentId} ORDER BY item_type`;
    assert.deepEqual(rejections.map((r) => r.item_type), ["impostor"]);
    const store = new PostgresStudyItemBankStore(sql);
    assert.deepEqual(await store.supportedItemTypes(s.derivedNodeId), ["option_select"]);
  } finally {
    await sql.end();
  }
});

maybe("the DB CHECK rejects a source-cited impostor row (honesty inversion unrepresentable)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    const itemId = randomUUID();
    await sql`
      INSERT INTO study_items (study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, generating_model, config_hash)
      VALUES (${itemId}, 'impostor', ${s.graphVersionId}, ${s.enrichmentId}, ${s.derivedNodeId}, 'source_cep', 'Q?', 'm', 'cfg')`;
    await assert.rejects(
      () => sql`
        INSERT INTO impostor_statements (impostor_statement_id, study_item_id, ordinal, statement_text, is_impostor, provenance, source_resource_id, source_block_id, evidence_quote, match_kind, reveal_text, lie_source)
        VALUES (${randomUUID()}, ${itemId}, 0, 'a lie with a citation', true, 'source', ${s.sourceResourceId}, ${s.blockIds[0]}, 'q', 'exact', 'reveal', 'generated')`,
      /violates check constraint/i
    );
  } finally {
    await sql.end();
  }
});

maybe("the partial unique index rejects a second impostor statement for one item", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    const itemId = randomUUID();
    await sql`
      INSERT INTO study_items (study_item_id, item_type, graph_version_id, enrichment_id, derived_node_id, grounding_provenance, question, generating_model, config_hash)
      VALUES (${itemId}, 'impostor', ${s.graphVersionId}, ${s.enrichmentId}, ${s.derivedNodeId}, 'source_cep', 'Q?', 'm', 'cfg')`;
    const impostorRow = (ordinal: number) => sql`
      INSERT INTO impostor_statements (impostor_statement_id, study_item_id, ordinal, statement_text, is_impostor, provenance, reveal_text, lie_source)
      VALUES (${randomUUID()}, ${itemId}, ${ordinal}, 'a lie', true, 'generated', 'reveal', 'generated')`;
    await impostorRow(0);
    await assert.rejects(() => impostorRow(1), /duplicate key|unique/i);
  } finally {
    await sql.end();
  }
});

// --- Response Log -----------------------------------------------------------

async function seedItem(sql: Sql): Promise<{ studyItemId: string; derivedNodeId: string }> {
  const s = await seedSubstrate(sql);
  const item = optionSelectFor(s);
  await bankFor(sql, s, [item]);
  return { studyItemId: item.studyItemId, derivedNodeId: s.derivedNodeId };
}

function gradedRow(input: { learnerStateRef: string; studyItemId: string; derivedNodeId: string; outcome: "correct" | "partial" | "incorrect"; score: number }): NewResponseLogRow {
  return {
    responseId: randomUUID(), learnerStateRef: input.learnerStateRef, studyItemId: input.studyItemId, derivedNodeId: input.derivedNodeId,
    signalType: "graded", judgedOutcome: input.outcome, gradedScore: input.score,
    responseSource: "human", graderIdentity: "auto", batchId: null,
    submittedAnswer: null
  };
}

maybe("a graded row referencing a real study_item_id inserts; one referencing an absent id is rejected by the FK", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { studyItemId, derivedNodeId } = await seedItem(sql);
    const store = new PostgresResponseLogStore(sql);
    const learner = await seedLearner(sql, `learner-${randomUUID()}`);
    await store.append([gradedRow({ learnerStateRef: learner, studyItemId, derivedNodeId, outcome: "correct", score: 1 })]);
    const rows = await store.listForLearner(learner);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].studyItemId, studyItemId);

    await assert.rejects(
      () => store.append([gradedRow({ learnerStateRef: learner, studyItemId: randomUUID(), derivedNodeId, outcome: "correct", score: 1 })]),
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
    const learner = await seedLearner(sql, `learner-${randomUUID()}`);
    await store.append([
      gradedRow({ learnerStateRef: learner, studyItemId, derivedNodeId, outcome: "correct", score: 1 }),
      gradedRow({ learnerStateRef: learner, studyItemId, derivedNodeId, outcome: "incorrect", score: 0 })
    ]);
    const rows = await store.listForLearnerNode(learner, derivedNodeId);
    assert.deepEqual(rows.map((r) => r.attemptSeq), [1, 2]);
    assert.deepEqual(rows.map((r) => r.gradedScore), [1, 0]);
    assert.ok(rows.every((r) => r.graderIdentity === "auto"));
  } finally {
    await sql.end();
  }
});

// The race this fix closes (TODO #1): many concurrent same-learner appends must each get a
// distinct, gapless attempt_seq with zero `(learner_state_ref, attempt_seq)` unique
// violations. Before the in-boundary advisory-lock assignment they would have read the same
// MAX and collided. A 16-wide fan-out exceeds the connection pool (max 10), so this also
// proves correctness when connection acquisition itself queues.
maybe("concurrent same-learner appends each get a distinct, gapless attempt_seq (no unique violation)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { studyItemId, derivedNodeId } = await seedItem(sql);
    const store = new PostgresResponseLogStore(sql);
    const learner = await seedLearner(sql, `learner-${randomUUID()}`);
    const fanOut = 16;
    await Promise.all(
      Array.from({ length: fanOut }, () =>
        store.append([gradedRow({ learnerStateRef: learner, studyItemId, derivedNodeId, outcome: "correct", score: 1 })])
      )
    );
    const seqs = (await store.listForLearner(learner)).map((r) => r.attemptSeq);
    assert.equal(seqs.length, fanOut, "every concurrent append committed");
    assert.equal(new Set(seqs).size, fanOut, "no two appends shared an attempt_seq");
    assert.deepEqual([...seqs].sort((a, b) => a - b), Array.from({ length: fanOut }, (_, i) => i + 1), "the sequence is gapless 1..N");
  } finally {
    await sql.end();
  }
});

// --- Calibration Verdicts (U1, R10/R16) -------------------------------------

maybe("upsert writes a verdict that reads back; a second upsert OVERWRITES it (one row, not two)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { derivedNodeId } = await seedItem(sql);
    const store = new PostgresCalibrationVerdictStore(sql);
    const learner = await seedLearner(sql, `learner-${randomUUID()}`);
    await store.upsert({ learnerStateRef: learner, derivedNodeId, verdict: "known" });
    let verdicts = await store.listForLearner(learner);
    assert.equal(verdicts.length, 1);
    assert.equal(verdicts[0].verdict, "known");

    // Same node, different verdict — overwrites, never duplicates.
    await store.upsert({ learnerStateRef: learner, derivedNodeId, verdict: "learn" });
    verdicts = await store.listForLearner(learner);
    assert.equal(verdicts.length, 1, "the (learner, node) PK overwrites rather than appending");
    assert.equal(verdicts[0].verdict, "learn");
  } finally {
    await sql.end();
  }
});

maybe("delete removes one node's verdict (R7 reversal); clearLearner removes only that learner's verdicts (R16)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { derivedNodeId } = await seedItem(sql);
    const store = new PostgresCalibrationVerdictStore(sql);
    const learnerA = await seedLearner(sql, `learner-${randomUUID()}`);
    const learnerB = await seedLearner(sql, `learner-${randomUUID()}`);
    await store.upsert({ learnerStateRef: learnerA, derivedNodeId, verdict: "known" });
    await store.upsert({ learnerStateRef: learnerB, derivedNodeId, verdict: "known" });

    await store.delete({ learnerStateRef: learnerA, derivedNodeId });
    assert.equal((await store.listForLearner(learnerA)).length, 0, "delete reverses the single verdict");
    assert.equal((await store.listForLearner(learnerB)).length, 1, "another learner is untouched");

    await store.clearLearner(learnerB);
    assert.equal((await store.listForLearner(learnerB)).length, 0, "clearLearner nukes only that learner");
  } finally {
    await sql.end();
  }
});

maybe("the verdict CHECK rejects a value outside known/learn", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { derivedNodeId } = await seedItem(sql);
    const learner = await seedLearner(sql, `learner-${randomUUID()}`);
    await assert.rejects(
      () => sql`
        INSERT INTO calibration_verdicts (learner_state_ref, derived_node_id, verdict)
        VALUES (${learner}, ${derivedNodeId}, 'maybe')`,
      /violates check constraint/i
    );
  } finally {
    await sql.end();
  }
});

maybe("clearLearner of verdicts plus a graded-row delete leaves the learner with zero verdicts and zero rows (Covers AE5)", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { studyItemId, derivedNodeId } = await seedItem(sql);
    const verdicts = new PostgresCalibrationVerdictStore(sql);
    const log = new PostgresResponseLogStore(sql);
    const learner = await seedLearner(sql, `learner-${randomUUID()}`);
    await verdicts.upsert({ learnerStateRef: learner, derivedNodeId, verdict: "known" });
    await log.append([gradedRow({ learnerStateRef: learner, studyItemId, derivedNodeId, outcome: "correct", score: 1 })]);

    // The per-learner reset: clear verdicts via the store, nuke graded rows via a direct
    // operator delete (the log has no store-port delete — the append-only guarantee stands).
    await verdicts.clearLearner(learner);
    await sql`DELETE FROM response_log WHERE learner_state_ref = ${learner}`;

    assert.equal((await verdicts.listForLearner(learner)).length, 0);
    assert.equal((await log.listForLearner(learner)).length, 0);
  } finally {
    await sql.end();
  }
});

// --- Concept Lesson store (U5, ADR-0031) ---------------------------------------

function lessonFor(s: Substrate): ConceptLesson {
  return {
    derivedNodeId: s.derivedNodeId,
    graphVersionId: s.graphVersionId,
    enrichmentId: s.enrichmentId,
    generatingModel: "test-model",
    configHash: "cfg",
    canonicalLabel: "Ownership",
    sections: [
      { kind: "gist", text: "Each value has a single owner.", groundingProvenance: "generated" },
      {
        kind: "definition",
        text: "Ownership is a set of rules that govern memory.",
        groundingProvenance: "source_cep",
        citation: { provenance: "source", sourceResourceId: s.sourceResourceId, sourceBlockId: s.blockIds[0], evidenceQuote: "Ownership is a set of rules that govern memory.", matchKind: "exact" }
      }
    ]
  };
}

maybe("Covers R1: persists a two-section lesson; it round-trips by derivedNodeId with sections, provenance, and citations intact", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    await new PostgresConceptLessonStore(sql).persist({ graphVersionId: s.graphVersionId, enrichmentId: s.enrichmentId, configHash: "cfg", lessons: [lessonFor(s)], absent: [] });

    const lesson = await new PostgresConceptLessonStore(sql).getLesson(s.derivedNodeId);
    assert.ok(lesson);
    assert.equal(lesson!.sections.length, 2);
    assert.deepEqual(lesson!.sections.map((sec) => sec.kind), ["gist", "definition"]);
    const definition = lesson!.sections.find((sec) => sec.kind === "definition")!;
    assert.equal(definition.groundingProvenance, "source_cep");
    assert.ok(definition.citation && definition.citation.provenance === "source");
    assert.equal(lesson!.sections[0].citation, undefined);
  } finally {
    await sql.end();
  }
});

maybe("regenerating an enrichment replaces its prior lessons and absences rather than appending", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    const store = new PostgresConceptLessonStore(sql);
    await store.persist({ graphVersionId: s.graphVersionId, enrichmentId: s.enrichmentId, configHash: "cfg", lessons: [lessonFor(s)], absent: [] });
    // Re-persist with no lesson and an absence.
    await store.persist({ graphVersionId: s.graphVersionId, enrichmentId: s.enrichmentId, configHash: "cfg", lessons: [], absent: [{ derivedNodeId: s.derivedNodeId, canonicalLabel: "Ownership", reason: "no usable grounding passages" }] });

    assert.equal((await store.listLessonsForEnrichment(s.enrichmentId)).length, 0);
    const [{ sections }] = await sql<{ sections: number }[]>`
      SELECT count(*)::int AS sections FROM concept_lesson_sections WHERE concept_lesson_id IN (SELECT concept_lesson_id FROM concept_lessons WHERE enrichment_id = ${s.enrichmentId})`;
    assert.equal(sections, 0, "orphaned sections are cascade-cleared");
  } finally {
    await sql.end();
  }
});

maybe("Covers R3: a lesson_absent_nodes row round-trips with its reason and is not returned by getLesson", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    const store = new PostgresConceptLessonStore(sql);
    await store.persist({ graphVersionId: s.graphVersionId, enrichmentId: s.enrichmentId, configHash: "cfg", lessons: [], absent: [{ derivedNodeId: s.derivedNodeId, canonicalLabel: "Ownership", reason: "no usable grounding passages" }] });

    assert.equal(await store.getLesson(s.derivedNodeId), undefined);
    const absent = await store.listAbsentForEnrichment(s.enrichmentId);
    assert.equal(absent.length, 1);
    assert.equal(absent[0].reason, "no usable grounding passages");
    assert.equal(absent[0].canonicalLabel, "Ownership");
  } finally {
    await sql.end();
  }
});

maybe("the artifact_concept_lessons view flattens one row per persisted lesson", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    await new PostgresConceptLessonStore(sql).persist({ graphVersionId: s.graphVersionId, enrichmentId: s.enrichmentId, configHash: "cfg", lessons: [lessonFor(s)], absent: [] });

    const rows = await sql<{ derived_node_id: string; section_count: number; canonical_label: string }[]>`
      SELECT derived_node_id, section_count, canonical_label FROM artifact_concept_lessons WHERE enrichment_id = ${s.enrichmentId}`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].section_count, 2);
    assert.equal(rows[0].canonical_label, "Ownership");
  } finally {
    await sql.end();
  }
});

maybe("a generated-citation section persists null source ids; a source-citation section persists source ids", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    const lesson: ConceptLesson = {
      ...lessonFor(s),
      sections: [
        { kind: "gist", text: "Synthesized gist.", groundingProvenance: "generated", citation: { provenance: "generated", derivedNodeId: s.derivedNodeId, passageText: "a synthesized passage" } },
        { kind: "definition", text: "Ownership is a set of rules that govern memory.", groundingProvenance: "source_cep", citation: { provenance: "source", sourceResourceId: s.sourceResourceId, sourceBlockId: s.blockIds[0], evidenceQuote: "Ownership is a set of rules that govern memory.", matchKind: "exact" } }
      ]
    };
    await new PostgresConceptLessonStore(sql).persist({ graphVersionId: s.graphVersionId, enrichmentId: s.enrichmentId, configHash: "cfg", lessons: [lesson], absent: [] });

    const round = await new PostgresConceptLessonStore(sql).getLesson(s.derivedNodeId);
    const gist = round!.sections.find((sec) => sec.kind === "gist")!;
    assert.ok(gist.citation && gist.citation.provenance === "generated");
    if (gist.citation.provenance === "generated") assert.equal(gist.citation.passageText, "a synthesized passage");
    const definition = round!.sections.find((sec) => sec.kind === "definition")!;
    assert.ok(definition.citation && definition.citation.provenance === "source");
  } finally {
    await sql.end();
  }
});

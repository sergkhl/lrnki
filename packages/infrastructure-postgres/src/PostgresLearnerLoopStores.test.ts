import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { ConceptLesson, NewResponseLogRow, OptionSelectItem, RejectedStudyItem, StructuredDocument, StudyItem } from "@lrnki/domain-core";
import { createDatabaseClient } from "./db";
import { PostgresConceptLessonStore, PostgresStudyItemBankStore, PostgresResponseLogStore, PostgresCalibrationVerdictStore } from "./PostgresLearnerLoopStores";
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

maybe("regeneration (delete-then-insert) replaces a prior bank, leaving no orphaned options or citations", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const s = await seedSubstrate(sql);
    await bankFor(sql, s, [optionSelectFor(s)]);
    // Re-persist with no items and a rejection.
    await bankFor(sql, s, [], [{ derivedNodeId: s.derivedNodeId, canonicalLabel: "Ownership", reason: "no option-select item could be grounded" }]);

    const items = await new PostgresStudyItemBankStore(sql).listStudyItemsForEnrichment(s.enrichmentId);
    assert.equal(items.length, 0);
    const [{ options }] = await sql<{ options: number }[]>`
      SELECT count(*)::int AS options FROM study_item_options o JOIN study_items si ON si.study_item_id = o.study_item_id WHERE si.enrichment_id = ${s.enrichmentId}`;
    assert.equal(options, 0, "orphaned options are cascade-cleared");
    const [{ citations }] = await sql<{ citations: number }[]>`
      SELECT count(*)::int AS citations FROM study_item_citations c JOIN study_items si ON si.study_item_id = c.study_item_id WHERE si.enrichment_id = ${s.enrichmentId}`;
    assert.equal(citations, 0, "orphaned citations are cascade-cleared");
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
    const learner = `learner-${randomUUID()}`;
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
    const learner = `learner-${randomUUID()}`;
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
    const learner = `learner-${randomUUID()}`;
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
    const learner = `learner-${randomUUID()}`;
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
    const learnerA = `learner-${randomUUID()}`;
    const learnerB = `learner-${randomUUID()}`;
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
    const learner = `learner-${randomUUID()}`;
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
    const learner = `learner-${randomUUID()}`;
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
        citation: { provenance: "source", sourceResourceId: s.sourceResourceId, sourceBlockId: s.blockIds[0], evidenceQuote: "Ownership is a set of rules that govern memory." }
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
        { kind: "definition", text: "Ownership is a set of rules that govern memory.", groundingProvenance: "source_cep", citation: { provenance: "source", sourceResourceId: s.sourceResourceId, sourceBlockId: s.blockIds[0], evidenceQuote: "Ownership is a set of rules that govern memory." } }
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

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import type { ConceptLesson, MatchingItem, OptionSelectItem } from "@lrnki/domain-core";
import type { SourceExpeditionAssetExpectation } from "@lrnki/ports";
import { createDatabaseClient } from "./db";
import { PostgresLearnerExpeditionStore } from "./PostgresLearnerExpeditionStore";
import {
  PostgresConceptLessonStore,
  PostgresStudyItemBankStore
} from "./PostgresLearnerLoopStores";
import { cleanupTrackedLearners, seedLearner } from "./testSupport";

const databaseUrl = process.env.TEST_DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

// Delete the learners this suite seeds so later isolated DB suites see no residue (R2/AE2).
after(() => cleanupTrackedLearners(databaseUrl));

type Sql = ReturnType<typeof createDatabaseClient>;

async function seedSourceAssets(sql: Sql): Promise<{
  graphVersionId: string;
  enrichmentId: string;
  derivedNodeId: string;
  expectedAssets: SourceExpeditionAssetExpectation;
}> {
  const graphVersionId = randomUUID();
  await sql`
    INSERT INTO graph_versions (graph_version_id, base_graph_version_id, status, refinement_config_hash, published_at)
    VALUES (${graphVersionId}, NULL, 'published', 'source-expedition-test', now())`;
  const enrichmentId = randomUUID();
  await sql`
    INSERT INTO graph_enrichments (enrichment_id, graph_version_id, enrichment_config_hash, status, judge_model, difficulty_method, completed_at)
    VALUES (${enrichmentId}, ${graphVersionId}, 'source-expedition-test', 'succeeded', 'test-judge', 'test', now())`;
  const conceptId = randomUUID();
  await sql`
    INSERT INTO concepts (concept_id, iri, normalized_label, declared_domain)
    VALUES (${conceptId}, ${`urn:lrnki:concept:${conceptId}`}, ${`source-node-${conceptId}`}, 'test-domain')`;
  const derivedNodeId = randomUUID();
  await sql`
    INSERT INTO derived_graph_nodes (derived_node_id, enrichment_id, node_kind, concept_id, grounding_origin, role, canonical_label, normalized_label, declared_domain, aliases)
    VALUES (${derivedNodeId}, ${enrichmentId}, 'anchor', ${conceptId}, 'document_anchored', 'anchor', 'Source summit', ${`source-node-${conceptId}`}, 'test-domain', '[]'::jsonb)`;
  const expectedAssets = await persistSourceAssets(sql, {
    graphVersionId,
    enrichmentId,
    derivedNodeId,
    assetSetIdentity: "qualified-source-assets-v1"
  });
  return { graphVersionId, enrichmentId, derivedNodeId, expectedAssets };
}

async function persistSourceAssets(sql: Sql, input: {
  graphVersionId: string;
  enrichmentId: string;
  derivedNodeId: string;
  assetSetIdentity: string;
}): Promise<SourceExpeditionAssetExpectation> {
  const configHash = "qualified-source-contract:test";
  const conceptLessonId = randomUUID();
  const lesson: ConceptLesson = {
    conceptLessonId,
    graphVersionId: input.graphVersionId,
    enrichmentId: input.enrichmentId,
    derivedNodeId: input.derivedNodeId,
    generatingModel: "test-model",
    configHash,
    canonicalLabel: "Source summit",
    sections: [{
      kind: "definition",
      text: "A source-backed definition.",
      groundingProvenance: "generated"
    }],
    explorableTerms: []
  };
  await new PostgresConceptLessonStore(sql).persist({
    graphVersionId: input.graphVersionId,
    enrichmentId: input.enrichmentId,
    configHash,
    lessons: [lesson],
    absent: []
  });
  const studyItemId = randomUUID();
  const item: OptionSelectItem = {
    studyItemId,
    graphVersionId: input.graphVersionId,
    enrichmentId: input.enrichmentId,
    derivedNodeId: input.derivedNodeId,
    groundingProvenance: "generated",
    generatingModel: "test-model",
    configHash,
    explorableTerms: [],
    itemType: "option_select",
    question: "Which is the source-backed definition?",
    explanation: "The keyed answer follows the source.",
    options: [
      {
        optionId: randomUUID(),
        text: "A source-backed definition.",
        isCorrect: true,
        provenance: "source",
        citation: {
          provenance: "generated",
          derivedNodeId: input.derivedNodeId,
          passageText: "A source-backed definition."
        }
      },
      { optionId: randomUUID(), text: "Wrong one", isCorrect: false, provenance: "generated" },
      { optionId: randomUUID(), text: "Wrong two", isCorrect: false, provenance: "generated" },
      { optionId: randomUUID(), text: "Wrong three", isCorrect: false, provenance: "generated" }
    ]
  };
  const matching: MatchingItem = {
    studyItemId: randomUUID(),
    graphVersionId: input.graphVersionId,
    enrichmentId: input.enrichmentId,
    derivedNodeId: input.derivedNodeId,
    groundingProvenance: "generated",
    generatingModel: "test-model",
    configHash: "inspection-only-base-config",
    explorableTerms: [],
    itemType: "matching",
    question: "Match each inspection-only clue.",
    pairs: ["one", "two", "three"].map((value) => ({
      pairId: randomUUID(),
      matchId: randomUUID(),
      promptText: `Prompt ${value}`,
      matchText: `Match ${value}`,
      citation: {
        provenance: "generated" as const,
        derivedNodeId: input.derivedNodeId,
        passageText: "A source-backed definition."
      }
    }))
  };
  await new PostgresStudyItemBankStore(sql).persist({
    graphVersionId: input.graphVersionId,
    enrichmentId: input.enrichmentId,
    configHash,
    // Matching remains current and inspectable, but the source snapshot contract below owns only
    // learner-qualified option-select identities.
    studyItems: [item, matching],
    rejected: []
  });
  return {
    assetSetIdentity: input.assetSetIdentity,
    currentConceptLessonIds: [conceptLessonId],
    currentStudyItemIds: [studyItemId]
  };
}

maybe("learner expeditions round-trip and stay scoped per learner", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const store = new PostgresLearnerExpeditionStore(sql);
    const learnerOne = await seedLearner(sql, randomUUID());
    const learnerTwo = await seedLearner(sql, randomUUID());
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
    const learnerStateRef = await seedLearner(sql, randomUUID());
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

maybe("source rows require a ready enrichment and opaque qualified asset identity", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const learnerStateRef = await seedLearner(sql, randomUUID());
    await assert.rejects(
      () => sql`
        INSERT INTO learner_expeditions (learner_expedition_id, learner_state_ref, kind, title, declared_domain, status)
        VALUES (${randomUUID()}, ${learnerStateRef}, 'source', 'Incomplete source row', 'test', 'generating')`,
      /learner_expeditions_source_asset_identity_check/
    );
  } finally {
    await sql.end();
  }
});

maybe("source adoption compares the exact current asset snapshot, switches active atomically, and is idempotent", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { enrichmentId, expectedAssets } = await seedSourceAssets(sql);
    const learnerStateRef = await seedLearner(sql, randomUUID());
    const store = new PostgresLearnerExpeditionStore(sql);
    const priorActiveId = randomUUID();
    await store.upsert({
      learnerExpeditionId: priorActiveId,
      learnerStateRef,
      kind: "topic",
      title: "Prior active topic",
      declaredDomain: null,
      status: "generating",
      active: true
    });
    const proposedId = randomUUID();
    const adopted = await store.adoptSourceExpedition({
      learnerExpeditionId: proposedId,
      learnerStateRef,
      enrichmentId,
      title: "Authoritative source summit",
      declaredDomain: "test-domain",
      expectedAssets
    });
    assert.deepEqual(adopted, { adopted: true, learnerExpeditionId: proposedId });
    const rows = await store.listForLearner(learnerStateRef);
    const source = rows.find((row) => row.kind === "source");
    assert.equal(source?.title, "Authoritative source summit");
    assert.equal(source?.status, "ready");
    assert.equal(source?.assetSetIdentity, expectedAssets.assetSetIdentity);
    assert.equal(source?.currentOperationId, null);
    assert.deepEqual(rows.filter((row) => row.active).map((row) => row.learnerExpeditionId), [proposedId]);

    const repeated = await store.adoptSourceExpedition({
      learnerExpeditionId: randomUUID(),
      learnerStateRef,
      enrichmentId,
      title: "Authoritative source summit",
      declaredDomain: "test-domain",
      expectedAssets
    });
    assert.deepEqual(repeated, { adopted: true, learnerExpeditionId: proposedId });
    assert.equal((await store.listForLearner(learnerStateRef)).filter((row) => row.kind === "source").length, 1);
  } finally {
    await sql.end();
  }
});

maybe("changed source assets refuse adoption and activation without a partial active switch", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const sourceAssets = await seedSourceAssets(sql);
    const learnerStateRef = await seedLearner(sql, randomUUID());
    const store = new PostgresLearnerExpeditionStore(sql);
    const sourceId = randomUUID();
    assert.equal((await store.adoptSourceExpedition({
      learnerExpeditionId: sourceId,
      learnerStateRef,
      enrichmentId: sourceAssets.enrichmentId,
      title: "Source summit",
      declaredDomain: "test-domain",
      expectedAssets: sourceAssets.expectedAssets
    })).adopted, true);

    const activeTopicId = randomUUID();
    await store.upsert({
      learnerExpeditionId: activeTopicId,
      learnerStateRef,
      kind: "topic",
      title: "Still active after refusal",
      declaredDomain: null,
      status: "generating",
      active: true
    });
    await persistSourceAssets(sql, {
      graphVersionId: sourceAssets.graphVersionId,
      enrichmentId: sourceAssets.enrichmentId,
      derivedNodeId: sourceAssets.derivedNodeId,
      assetSetIdentity: "qualified-source-assets-v2"
    });

    assert.deepEqual(await store.activateSourceExpedition({
      learnerStateRef,
      learnerExpeditionId: sourceId,
      enrichmentId: sourceAssets.enrichmentId,
      expectedAssets: sourceAssets.expectedAssets
    }), { activated: false, refused: "asset_set_changed" });
    assert.deepEqual(await store.adoptSourceExpedition({
      learnerExpeditionId: randomUUID(),
      learnerStateRef,
      enrichmentId: sourceAssets.enrichmentId,
      title: "Stale candidate",
      declaredDomain: "test-domain",
      expectedAssets: sourceAssets.expectedAssets
    }), { adopted: false, refused: "asset_set_changed" });
    const rows = await store.listForLearner(learnerStateRef);
    assert.deepEqual(rows.filter((row) => row.active).map((row) => row.learnerExpeditionId), [activeTopicId]);
    assert.equal(rows.find((row) => row.learnerExpeditionId === sourceId)?.assetSetIdentity, sourceAssets.expectedAssets.assetSetIdentity);
  } finally {
    await sql.end();
  }
});

maybe("an asset change concurrent with source adoption is detected before any learner write", async () => {
  const sql = createDatabaseClient(databaseUrl);
  const concurrentSql = createDatabaseClient(databaseUrl);
  try {
    const sourceAssets = await seedSourceAssets(sql);
    const learnerStateRef = await seedLearner(sql, randomUUID());
    const store = new PostgresLearnerExpeditionStore(concurrentSql);
    let releaseLocks!: () => void;
    const release = new Promise<void>((resolve) => { releaseLocks = resolve; });
    let locksHeld!: () => void;
    const held = new Promise<void>((resolve) => { locksHeld = resolve; });
    const changing = sql.begin(async (tx) => {
      await tx`
        SELECT concept_lesson_id FROM concept_lessons
        WHERE enrichment_id = ${sourceAssets.enrichmentId} AND superseded_at IS NULL
        FOR UPDATE`;
      await tx`
        SELECT study_item_id FROM study_items
        WHERE enrichment_id = ${sourceAssets.enrichmentId} AND superseded_at IS NULL
        FOR UPDATE`;
      locksHeld();
      await release;
      await tx`UPDATE concept_lessons SET superseded_at = now() WHERE enrichment_id = ${sourceAssets.enrichmentId} AND superseded_at IS NULL`;
      await tx`UPDATE study_items SET superseded_at = now() WHERE enrichment_id = ${sourceAssets.enrichmentId} AND superseded_at IS NULL`;
    });
    await held;
    const adoption = store.adoptSourceExpedition({
      learnerExpeditionId: randomUUID(),
      learnerStateRef,
      enrichmentId: sourceAssets.enrichmentId,
      title: "Concurrent candidate",
      declaredDomain: "test-domain",
      expectedAssets: sourceAssets.expectedAssets
    });
    releaseLocks();
    await changing;
    assert.deepEqual(await adoption, { adopted: false, refused: "asset_set_changed" });
    assert.equal((await store.listForLearner(learnerStateRef)).length, 0);
  } finally {
    await concurrentSql.end();
    await sql.end();
  }
});

maybe("claimNextGenerating claims fresh rows and increments attempts", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const store = new PostgresLearnerExpeditionStore(sql);
    await removePriorClaimFixtures(sql);
    const learnerStateRef = await seedLearner(sql, randomUUID());
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
    assert.match(claimed?.currentOperationId ?? "", /^[0-9a-f-]{36}$/);
    assert.equal(claimed?.currentOperationType, "enrichment");
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
    const learnerStateRef = await seedLearner(sql, randomUUID());
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
    // Reclaim atomically replaces the stale operation with a fresh fence.
    assert.notEqual(claimed?.currentOperationId, operationId);
    assert.equal(claimed?.currentOperationType, "enrichment");

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
    const learnerStateRef = await seedLearner(sql, randomUUID());
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
    const learnerStateRef = await seedLearner(sql, randomUUID());
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
    const learnerStateRef = await seedLearner(sql, randomUUID());
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

maybe("updateProgress is fenced: a stale claimed token cannot write after a newer claim", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const store = new PostgresLearnerExpeditionStore(sql);
    const learnerStateRef = await seedLearner(sql, randomUUID());
    const learnerExpeditionId = randomUUID();
    await store.upsert({
      learnerExpeditionId,
      learnerStateRef,
      kind: "topic",
      title: "Fenced write fixture",
      declaredDomain: null,
      status: "generating"
    });

    await sql`
      UPDATE learner_expeditions SET created_at = now() - interval '100 years'
      WHERE learner_expedition_id = ${learnerExpeditionId}`;
    const claimed = await store.claimNextGenerating({ staleBefore: new Date(Date.now() - 120000), maxAttempts: 3 });
    assert.equal(claimed?.learnerExpeditionId, learnerExpeditionId);
    const staleToken = claimed?.currentOperationId;
    assert.ok(staleToken);

    // Simulate a newer claim replacing the token — the old worker's write is a no-op.
    const newerToken = randomUUID();
    await sql`
      UPDATE learner_expeditions SET current_operation_id = ${newerToken}, current_operation_type = 'enrichment'
      WHERE learner_expedition_id = ${learnerExpeditionId}`;
    const stale = await store.updateProgress({
      learnerExpeditionId,
      expectedOperationId: staleToken,
      status: "ready"
    });
    assert.equal(stale, 0);
    const current = await store.updateProgress({
      learnerExpeditionId,
      expectedOperationId: newerToken,
      declaredDomain: "test"
    });
    assert.equal(current, 1);
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
    const learnerStateRef = await seedLearner(sql, randomUUID());
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

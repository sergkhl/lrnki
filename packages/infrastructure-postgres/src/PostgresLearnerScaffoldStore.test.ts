import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import type { ScaffoldStep } from "@lrnki/domain-core";
import { createDatabaseClient } from "./db";
import { PostgresLearnerScaffoldStore } from "./PostgresLearnerScaffoldStore";
import { PostgresResponseLogStore } from "./PostgresLearnerLoopStores";
import { cleanupTrackedLearners, seedLearner } from "./testSupport";

// Integration tests against a live PostgreSQL with the single initial migration applied.
// Skipped when DATABASE_URL is absent so the unit suite stays hermetic.
const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? test : test.skip;

after(() => cleanupTrackedLearners(databaseUrl));

type Sql = ReturnType<typeof createDatabaseClient>;

// Seed the minimum substrate a detour attaches to: a published graph version, an enrichment,
// and two derived nodes (a parent + a reference target). Returns the ids the detour keys on.
async function seedSubstrate(sql: Sql): Promise<{ enrichmentId: string; parentNodeId: string; refNodeId: string }> {
  const graphVersionId = randomUUID();
  await sql`
    INSERT INTO graph_versions (graph_version_id, base_graph_version_id, status, refinement_config_hash, published_at)
    VALUES (${graphVersionId}, NULL, 'published', 'test', now())`;
  const enrichmentId = randomUUID();
  await sql`
    INSERT INTO graph_enrichments (enrichment_id, graph_version_id, enrichment_config_hash, status, judge_model, difficulty_method, completed_at)
    VALUES (${enrichmentId}, ${graphVersionId}, 'test', 'succeeded', 'j', 'd', now())`;
  const nodeIds: string[] = [];
  for (const label of ["Parent", "Reference"]) {
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
  return { enrichmentId, parentNodeId: nodeIds[0], refNodeId: nodeIds[1] };
}

function generatedStep(ordinal: number): ScaffoldStep {
  return {
    scaffoldStepId: randomUUID(),
    ordinal,
    kind: "generated",
    lessonReadAt: null,
    payload: {
      scaffoldNodeId: randomUUID(),
      label: "Affine types",
      lesson: [{ kind: "definition", text: "A short generated definition.", groundingProvenance: "generated" }],
      item: {
        scaffoldItemId: randomUUID(),
        question: "Which best describes an affine type?",
        explanation: "It may be used at most once.",
        options: [
          { optionId: randomUUID(), text: "Used at most once", isCorrect: true },
          { optionId: randomUUID(), text: "Used at least twice", isCorrect: false },
          { optionId: randomUUID(), text: "Never used", isCorrect: false },
          { optionId: randomUUID(), text: "Always copied", isCorrect: false }
        ]
      }
    }
  };
}

// Covers U2 scenario 1 (AE8) + scenario 2: idempotent create returns one detour; hide/restore
// preserves published steps; different terms and parents make distinct detours.
maybe("upsertPending is idempotent per (learner, enrichment, parent, term); hide/restore preserves content", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { enrichmentId, parentNodeId } = await seedSubstrate(sql);
    const learner = await seedLearner(sql, `L-${randomUUID()}`);
    const store = new PostgresLearnerScaffoldStore(sql);

    const key = { learnerStateRef: learner, enrichmentId, parentDerivedNodeId: parentNodeId, term: "Affine type", normalizedTerm: "affine type" };
    const first = await store.upsertPending(key);
    const second = await store.upsertPending(key);
    assert.equal(first.detourId, second.detourId, "same term returns the same detour");
    assert.equal(first.status, "generating");

    // A different normalized term under the same parent is a separate detour.
    const other = await store.upsertPending({ ...key, term: "Borrow checker", normalizedTerm: "borrow checker" });
    assert.notEqual(other.detourId, first.detourId);

    // Publish content, then hide and restore: the same ready steps come back.
    const claimToken = randomUUID();
    assert.equal(await store.claim({ detourId: first.detourId, operationId: randomUUID(), claimToken }), true);
    const step = generatedStep(0);
    assert.equal(await store.publishReady({ detourId: first.detourId, claimToken, steps: [step] }), true);
    assert.equal(await store.hide({ detourId: first.detourId, learnerStateRef: learner }), true);
    const restored = await store.upsertPending(key);
    assert.equal(restored.detourId, first.detourId, "restore returns the same detour");
    assert.equal(restored.status, "ready", "a hidden detour with content restores to ready");
    assert.equal(restored.steps.length, 1);
    assert.equal(restored.steps[0].scaffoldStepId, step.scaffoldStepId, "the published step id is preserved");
  } finally {
    await sql.end();
  }
});

// Covers U2 scenario 3: the DB CHECK rejects a step that is both/neither, and a bad lifecycle.
maybe("the schema rejects a mixed step shape and an invalid lifecycle value", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { enrichmentId, parentNodeId, refNodeId } = await seedSubstrate(sql);
    const learner = await seedLearner(sql, `L-${randomUUID()}`);
    const store = new PostgresLearnerScaffoldStore(sql);
    const detour = await store.upsertPending({ learnerStateRef: learner, enrichmentId, parentDerivedNodeId: parentNodeId, term: "x", normalizedTerm: "x" });

    await assert.rejects(() => sql`
      INSERT INTO learner_scaffold_steps (scaffold_step_id, detour_id, ordinal, kind, referenced_derived_node_id, payload)
      VALUES (${randomUUID()}, ${detour.detourId}, 0, 'reference', ${refNodeId}, '{"x":1}'::jsonb)`, /violates check|check constraint/i, "a reference step with a payload is rejected");

    await assert.rejects(() => sql`
      UPDATE learner_scaffold_detours SET status = 'bogus' WHERE detour_id = ${detour.detourId}`, /violates check|check constraint/i, "an unknown lifecycle value is rejected");
  } finally {
    await sql.end();
  }
});

// Covers U3 supervisor claim path (KTD7): claim-next claims one generating detour with a fresh
// operation id that equals the fencing token, increments the attempt budget, skips an
// already-claimed fresh detour, and fails an exhausted stale one.
maybe("claimNextGenerating claims within the attempt budget; failExhaustedGenerating fails a stale exhausted detour", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { enrichmentId, parentNodeId } = await seedSubstrate(sql);
    const learner = await seedLearner(sql, `L-${randomUUID()}`);
    const store = new PostgresLearnerScaffoldStore(sql);
    // claimNextGenerating is process-global (it drains every learner's queue), so isolate this
    // test from generating rows earlier tests left behind before asserting on a specific detour.
    await sql`DELETE FROM learner_scaffold_detours`;
    const detour = await store.upsertPending({ learnerStateRef: learner, enrichmentId, parentDerivedNodeId: parentNodeId, term: "z", normalizedTerm: "z" });

    const future = new Date(Date.now() + 60_000);
    const claimed = await store.claimNextGenerating({ staleBefore: future, maxAttempts: 3 });
    assert.ok(claimed, "a generating detour is claimed");
    assert.equal(claimed.detourId, detour.detourId);
    assert.equal(claimed.claimToken, claimed.latestOperationId, "the op id IS the fencing token (KTD7)");
    assert.ok(claimed.claimToken, "a fencing token was installed");

    // The freshly-claimed detour is not immediately reclaimable (claimed_at just set).
    assert.equal(await store.claimNextGenerating({ staleBefore: new Date(Date.now() - 60_000), maxAttempts: 3 }), undefined, "a fresh claim is not stale");

    // With a future staleBefore it looks stale; the token still fences a publish.
    assert.equal(await store.publishReady({ detourId: detour.detourId, claimToken: randomUUID(), steps: [generatedStep(0)] }), false, "a wrong token cannot publish");

    // Exhaust the budget: with maxAttempts=1 the already-attempted (attempts=1) stale detour fails.
    const failed = await store.failExhaustedGenerating({ staleBefore: future, maxAttempts: 1 });
    assert.equal(failed, 1, "the exhausted stale detour is failed once");
    assert.equal((await store.getById(detour.detourId))?.status, "failed");
    // A retry resets the attempt budget so the detour can be claimed again.
    const retried = await store.restartGenerating({ detourId: detour.detourId, learnerStateRef: learner });
    assert.equal(retried?.status, "generating");
    assert.ok(await store.claimNextGenerating({ staleBefore: future, maxAttempts: 1 }), "a retried detour claims again on a fresh budget");
  } finally {
    await sql.end();
  }
});

// Covers U2 scenario 4 + 6: a scaffold response appends through the same monotonic sequence as
// neutral rows and hydrates to the scaffold scope; a competing claim yields one active token.
maybe("scaffold and neutral responses share one attempt sequence; a claimed detour rejects a second claim", async () => {
  const sql = createDatabaseClient(databaseUrl);
  try {
    const { enrichmentId, parentNodeId } = await seedSubstrate(sql);
    const learner = await seedLearner(sql, `L-${randomUUID()}`);
    const store = new PostgresLearnerScaffoldStore(sql);
    const detour = await store.upsertPending({ learnerStateRef: learner, enrichmentId, parentDerivedNodeId: parentNodeId, term: "x", normalizedTerm: "x" });

    // Only the first claim on a generating detour wins; the second is rejected.
    assert.equal(await store.claim({ detourId: detour.detourId, operationId: randomUUID(), claimToken: randomUUID() }), true);
    assert.equal(await store.claim({ detourId: detour.detourId, operationId: randomUUID(), claimToken: randomUUID() }), false);

    // Publish a generated step, then append a scaffold response against it.
    const detour2 = await store.upsertPending({ learnerStateRef: learner, enrichmentId, parentDerivedNodeId: parentNodeId, term: "y", normalizedTerm: "y" });
    const token = randomUUID();
    await store.claim({ detourId: detour2.detourId, operationId: randomUUID(), claimToken: token });
    const step = generatedStep(0);
    await store.publishReady({ detourId: detour2.detourId, claimToken: token, steps: [step] });

    const responseLog = new PostgresResponseLogStore(sql);
    await responseLog.append([
      { scope: "scaffold", scaffoldStepId: step.scaffoldStepId, responseId: randomUUID(), learnerStateRef: learner, signalType: "graded", judgedOutcome: "correct", gradedScore: 1, responseSource: "human", graderIdentity: "auto", batchId: null, submittedAnswer: "Used at most once" }
    ]);
    const rows = await responseLog.listForLearner(learner);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].scope, "scaffold");
    assert.equal(rows[0].scope === "scaffold" && rows[0].scaffoldStepId, step.scaffoldStepId);
    assert.equal(rows[0].attemptSeq, 1, "the scaffold row takes the next monotonic attempt seq");
  } finally {
    await sql.end();
  }
});

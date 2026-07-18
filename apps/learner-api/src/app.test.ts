import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createLearnerApp } from "./app";
import type { DatabaseClient } from "./db";
import { FixedWindowRateLimiter } from "./auth";

// DB-free surface tests through Hono's fetch-native `app.request` (KTD6): validation,
// auth, and throttle behavior never reach the pool, so the stub client is never invoked.
const stubSql = new Proxy(() => {}, {
  apply() {
    throw new Error("unexpected database access");
  }
}) as unknown as DatabaseClient;

test("health responds without auth", async () => {
  const app = createLearnerApp(stubSql);
  const res = await app.request("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("authenticated routes refuse a missing bearer token", async () => {
  const app = createLearnerApp(stubSql);
  for (const path of ["/journal", "/catalog", "/leaderboard", "/me"]) {
    const res = await app.request(path);
    assert.equal(res.status, 401, path);
  }
  const write = await app.request("/expedition/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "Tides" })
  });
  assert.equal(write.status, 401);
  const referenceGrade = await app.request("/scaffold/reference-option-select", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scaffoldStepId: "step-1", chosenOptionId: "option-1" })
  });
  assert.equal(referenceGrade.status, 401);
});

test("session route validates its body", async () => {
  const app = createLearnerApp(stubSql);
  const res = await app.request("/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin: "1234" })
  });
  assert.equal(res.status, 400);
});

test("session route rejects a blank name without touching the store", async () => {
  const app = createLearnerApp(stubSql);
  const res = await app.request("/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ learnerStateRef: "   ", pin: "1234" })
  });
  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { error: "invalid_name" });
});

test("session route rate-limits a PIN sweep from one client", async () => {
  const app = createLearnerApp(stubSql);
  let last = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const res = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify({ learnerStateRef: " ", pin: String(1000 + attempt) })
    });
    last = res.status;
  }
  assert.equal(last, 429);
});

test("fixed window resets after the window elapses", () => {
  let at = 0;
  const limiter = new FixedWindowRateLimiter(2, 1000, () => at);
  assert.equal(limiter.allow("k"), true);
  assert.equal(limiter.allow("k"), true);
  assert.equal(limiter.allow("k"), false);
  at = 1001;
  assert.equal(limiter.allow("k"), true);
});

// --- Recall Challenge routes (plan 2026-07-13-003 U3, KTD7) --------------------

test("challenge routes refuse a missing bearer token", async () => {
  const app = createLearnerApp(stubSql);
  for (const path of [`/challenge/scopes/${randomUUID()}`, `/challenge/${randomUUID()}`]) {
    assert.equal((await app.request(path)).status, 401, path);
  }
  for (const path of ["/challenge/create", "/challenge/answer", "/challenge/matching-pair", "/challenge/retreat", "/challenge/resume", "/challenge/abandon"]) {
    const res = await app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(res.status, 401, path);
  }
});

// End-to-end challenge lifecycle against the live database: create → misses into Last Stand →
// recovery win, exact resume, replay idempotency, retreat/resume, and the KTD4 neutrality
// checksum. Skipped without TEST_DATABASE_URL (the unit suite stays hermetic and never touches dev data).
const databaseUrl = process.env.TEST_DATABASE_URL;
const maybeDb = databaseUrl ? test : test.skip;

maybeDb("recall challenge end-to-end: create, Last Stand, recovery win, idempotent replay, response_log untouched", async () => {
  const { createDatabaseClient, PostgresResponseLogStore, PostgresStudyItemBankStore } = await import("@lrnki/infrastructure-postgres");
  const sql = createDatabaseClient(databaseUrl as string);
  const learner = `L-${randomUUID().slice(0, 8)}`;
  try {
    const app = createLearnerApp(sql as unknown as DatabaseClient);
    // Register through the real session route to get a bearer token.
    const session = await app.request("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "create", learnerStateRef: learner, pin: "1234" })
    });
    assert.equal(session.status, 200);
    const { token } = (await session.json()) as { token: string };
    const authed = (path: string, body?: unknown) =>
      app.request(path, {
        method: body === undefined ? "GET" : "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });

    // Seed a minimal enrichment: one isolated node with one current option-select item the
    // learner has answered latest-correct (the eligibility rule).
    const graphVersionId = randomUUID();
    await sql`
      INSERT INTO graph_versions (graph_version_id, base_graph_version_id, status, refinement_config_hash, published_at)
      VALUES (${graphVersionId}, NULL, 'published', 'test', now())`;
    const enrichmentId = randomUUID();
    await sql`
      INSERT INTO graph_enrichments (enrichment_id, graph_version_id, enrichment_config_hash, status, judge_model, difficulty_method, completed_at)
      VALUES (${enrichmentId}, ${graphVersionId}, 'test', 'succeeded', 'j', 'd', now())`;
    const conceptId = randomUUID();
    await sql`
      INSERT INTO concepts (concept_id, iri, normalized_label, declared_domain)
      VALUES (${conceptId}, ${`urn:lrnki:concept:${conceptId}`}, ${`node-${conceptId}`}, 'software engineering')`;
    const nodeId = randomUUID();
    await sql`
      INSERT INTO derived_graph_nodes (derived_node_id, enrichment_id, node_kind, concept_id, grounding_origin, role, canonical_label, normalized_label, declared_domain, aliases)
      VALUES (${nodeId}, ${enrichmentId}, 'anchor', ${conceptId}, 'document_anchored', 'anchor', 'Node', ${`node-${conceptId}`}, 'software engineering', '[]'::jsonb)`;
    const correctOptionId = randomUUID();
    const wrongOptionId = randomUUID();
    const studyItemId = randomUUID();
    await new PostgresStudyItemBankStore(sql).persist({
      graphVersionId: null,
      enrichmentId,
      configHash: "test",
      studyItems: [{
        studyItemId,
        graphVersionId: null,
        enrichmentId,
        derivedNodeId: nodeId,
        groundingProvenance: "generated",
        generatingModel: "test",
        configHash: "test",
        explorableTerms: [],
        itemType: "option_select",
        question: "Which is right?",
        explanation: "Because.",
        options: [
          { optionId: correctOptionId, text: "right", isCorrect: true, provenance: "source", citation: { provenance: "generated", derivedNodeId: nodeId, passageText: "grounding" } },
          { optionId: wrongOptionId, text: "wrong-a", isCorrect: false, provenance: "generated" },
          { optionId: randomUUID(), text: "wrong-b", isCorrect: false, provenance: "generated" },
          { optionId: randomUUID(), text: "wrong-c", isCorrect: false, provenance: "generated" }
        ]
      }],
      rejected: []
    });
    await new PostgresResponseLogStore(sql).append([{
      responseId: randomUUID(),
      learnerStateRef: learner,
      scope: "neutral",
      studyItemId,
      derivedNodeId: nodeId,
      signalType: "graded",
      judgedOutcome: "correct",
      gradedScore: 1,
      responseSource: "human",
      graderIdentity: "auto",
      batchId: null,
      submittedAnswer: null
    }]);
    const responseLogBaseline = async () =>
      (await sql<{ count: string }[]>`SELECT COUNT(*) AS count FROM response_log WHERE learner_state_ref = ${learner}`)[0].count;
    const logBefore = await responseLogBaseline();

    // Scope status: one section (available) + the summit (locked until the Leg is won).
    const scopesRes = await authed(`/challenge/scopes/${enrichmentId}`);
    assert.equal(scopesRes.status, 200);
    const { scopes } = (await scopesRes.json()) as { scopes: { scopeKind: string; state: string; anchorDerivedNodeId: string }[] };
    assert.deepEqual(scopes.map((scope) => [scope.scopeKind, scope.state]), [["section", "available"], ["enrichment", "locked"]]);

    // Fresh-start over an active challenge conflicts; invalid anchors are 422.
    const badAnchor = await authed("/challenge/create", { enrichmentId, scopeKind: "section", anchorDerivedNodeId: randomUUID() });
    assert.equal(badAnchor.status, 422);
    const createRes = await authed("/challenge/create", { enrichmentId, scopeKind: "section", anchorDerivedNodeId: nodeId });
    assert.equal(createRes.status, 200);
    const created = (await createRes.json()) as { created: true; view: { challengeId: string; state: string; remainingMissBuffer: number; currentItem: { kind: string; item: { studyItemId: string } } } };
    const challengeId = created.view.challengeId;
    assert.equal(created.view.state, "active");
    // No pre-answer key anywhere in the wire view.
    assert.ok(!JSON.stringify(created.view).includes("isCorrect"));
    const conflict = await authed("/challenge/create", { enrichmentId, scopeKind: "section", anchorDerivedNodeId: nodeId });
    assert.equal(conflict.status, 409);
    assert.equal(((await conflict.json()) as { activeChallengeId: string }).activeChallengeId, challengeId);

    // Three misses reach Last Stand; a further miss never kills; recovery-correct wins.
    const miss = () => authed("/challenge/answer", { challengeId, attemptRef: randomUUID(), studyItemId, chosenId: wrongOptionId });
    for (const expectedBuffer of [2, 1, 0]) {
      const res = await miss();
      assert.equal(res.status, 200);
      const body = (await res.json()) as { view: { state: string; remainingMissBuffer: number }; feedback: { correct: boolean; keyedCorrectId: string } };
      assert.equal(body.view.remainingMissBuffer, expectedBuffer);
      assert.equal(body.feedback.correct, false);
      assert.equal(body.feedback.keyedCorrectId, correctOptionId); // post-commit current-item feedback only
    }
    const read = (await (await authed(`/challenge/${challengeId}`)).json()) as { view: { state: string } };
    assert.equal(read.view.state, "recovery");

    // Out-of-turn item is rejected without an event; retreat/resume are state-edge no-ops.
    const stale = await authed("/challenge/answer", { challengeId, attemptRef: randomUUID(), studyItemId: randomUUID(), chosenId: wrongOptionId });
    assert.equal(stale.status, 409);
    const retreatRef = randomUUID();
    assert.equal((await authed("/challenge/retreat", { challengeId, operationRef: retreatRef })).status, 200);
    assert.equal((await authed("/challenge/retreat", { challengeId, operationRef: randomUUID() })).status, 200); // no-op, no event
    assert.equal((await authed("/challenge/resume", { challengeId, operationRef: randomUUID() })).status, 200);

    // Recovery win, then idempotent network replay of the SAME winning attempt.
    const winAttempt = randomUUID();
    const win = await authed("/challenge/answer", { challengeId, attemptRef: winAttempt, studyItemId, chosenId: correctOptionId, responseDurationMs: 4200 });
    assert.equal(win.status, 200);
    const winBody = (await win.json()) as { replayed: boolean; view: { state: string } };
    assert.equal(winBody.view.state, "won");
    assert.equal(winBody.replayed, false);
    const replay = await authed("/challenge/answer", { challengeId, attemptRef: winAttempt, studyItemId, chosenId: correctOptionId, responseDurationMs: 4200 });
    assert.equal(replay.status, 200);
    const replayBody = (await replay.json()) as { replayed: boolean; view: { state: string } };
    assert.equal(replayBody.replayed, true);
    assert.equal(replayBody.view.state, "won");

    // The won scope is durable; the summit unlocks once every Leg is won; response_log is
    // byte-count identical across every challenge action (KTD4).
    const scopesAfter = (await (await authed(`/challenge/scopes/${enrichmentId}`)).json()) as { scopes: { scopeKind: string; state: string; wonChallengeId?: string }[] };
    assert.deepEqual(scopesAfter.scopes.map((scope) => [scope.scopeKind, scope.state]), [["section", "won"], ["enrichment", "available"]]);
    assert.equal(scopesAfter.scopes[0].wonChallengeId, challengeId);
    assert.equal(await responseLogBaseline(), logBefore);

    // A rematch creates a fresh challenge; abandoning it frees the scope again.
    const rematch = (await (await authed("/challenge/create", { enrichmentId, scopeKind: "section", anchorDerivedNodeId: nodeId })).json()) as { created: true; view: { challengeId: string } };
    assert.notEqual(rematch.view.challengeId, challengeId);
    assert.equal((await authed("/challenge/abandon", { challengeId: rematch.view.challengeId, operationRef: randomUUID() })).status, 200);
    assert.equal((await authed(`/challenge/${rematch.view.challengeId}`)).status, 404);
  } finally {
    await sql`DELETE FROM recall_challenges WHERE learner_state_ref = ${learner}`;
    await sql`DELETE FROM response_log WHERE learner_state_ref = ${learner}`;
    await sql`DELETE FROM learner_sessions WHERE learner_ref = ${learner}`;
    await sql`DELETE FROM learners WHERE learner_ref = ${learner}`;
    await sql.end();
  }
});

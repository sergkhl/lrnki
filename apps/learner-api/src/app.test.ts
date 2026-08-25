import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createLearnerApp } from "./app";
import type { DatabaseClient } from "./db";

// Better Auth reads its secret and public origin from the environment when the app is
// constructed. `app.request` issues `http://localhost/...` URLs, so the base URL must agree or
// the handler resolves a different origin than the one it is being called on.
process.env.BETTER_AUTH_SECRET ??= "test-only-secret-never-used-by-any-deployment";
process.env.BETTER_AUTH_URL ??= "http://localhost";

// DB-free surface tests through Hono's fetch-native `app.request` (KTD6): validation, auth, and
// throttle behavior never reach the pool. The stub answers only what Drizzle reads while
// *constructing* the Better Auth adapter (it rewrites `options.parsers`/`options.serializers` in
// place); every actual query still throws, which is what makes "never reached the pool" an
// assertion rather than a hope. Two independent stubs, because the app takes two clients — the
// auth one is Drizzle's to mutate, the store one must survive untouched.
function makeStubSql(): DatabaseClient {
  return new Proxy(() => {}, {
    apply() {
      throw new Error("unexpected database access");
    },
    get(_target, prop) {
      return prop === "options" ? { parsers: {}, serializers: {} } : undefined;
    }
  }) as unknown as DatabaseClient;
}
const stubSql = makeStubSql();
const authStubSql = makeStubSql();

test("health responds without a session", async () => {
  const app = createLearnerApp(stubSql, authStubSql);
  const res = await app.request("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("authenticated routes refuse a request with no session cookie", async () => {
  const app = createLearnerApp(stubSql, authStubSql);
  for (const path of ["/journal", "/catalog", "/leaderboard"]) {
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

test("the identity surface is mounted and reports no session for an anonymous request", async () => {
  const app = createLearnerApp(stubSql, authStubSql);
  const res = await app.request("/auth/get-session");
  assert.equal(res.status, 200);
  assert.equal(await res.json(), null, "an anonymous session read resolves without touching the pool");
});

// The framework's own limiter replaced the hand-rolled fixed-window one (ADR-0041). What matters
// is that it is ON and keyed per client IP: a burst from one address is cut off, and a different
// address is unaffected. The allowed attempts fail with 500 here because the stub pool throws —
// that is itself the evidence they reached the handler rather than the limiter.
test("the sign-in route rate-limits a burst per client IP", async () => {
  const app = createLearnerApp(stubSql, authStubSql);
  const attempt = (ip: string) =>
    app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email: "sweep@test.invalid", password: "not-the-password" })
    });

  const statuses: number[] = [];
  for (let i = 0; i < 8; i += 1) statuses.push((await attempt("203.0.113.9")).status);
  assert.ok(statuses.includes(429), `a sustained burst is refused, got ${statuses.join(",")}`);
  assert.equal(statuses.at(-1), 429, "once tripped the window stays closed");

  // A distinct address is a distinct bucket — one attacker cannot lock everyone else out.
  assert.notEqual((await attempt("198.51.100.7")).status, 429);
});

test("challenge routes refuse a request with no session cookie", async () => {
  const app = createLearnerApp(stubSql, authStubSql);
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

maybeDb("paused Synthetic Topic routes expose one capability and perform no write or wake", async () => {
  const { createDatabaseClient } = await import("@lrnki/infrastructure-postgres");
  const { deleteLearner } = await import("@lrnki/infrastructure-postgres/test-support");
  const sql = createDatabaseClient(databaseUrl as string);
  const authClientSql = createDatabaseClient(databaseUrl as string);
  let learner = "";
  let wakes = 0;
  try {
    const app = createLearnerApp(
      sql as unknown as DatabaseClient,
      authClientSql as unknown as DatabaseClient,
      { wakeTopicGeneration: () => { wakes += 1; } }
    );
    const signUp = await app.request("/auth/sign-up/email", {
      method: "POST",
      // Own rate-limit bucket: this database test must not spend the anonymous default-IP budget
      // that the later naming round-trip asserts independently.
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.41" },
      body: JSON.stringify({
        email: `topic-pause-${randomUUID()}@test.invalid`,
        password: `pw-${randomUUID()}`,
        name: "Source-backed Tester"
      })
    });
    assert.equal(signUp.status, 200);
    learner = ((await signUp.json()) as { user: { id: string } }).user.id;
    const cookie = signUp.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const authed = (path: string, body?: unknown) => app.request(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { cookie, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });

    const journal = await authed("/journal");
    assert.equal(journal.status, 200);
    const journalBody = (await journal.json()) as {
      capabilities: { syntheticTopicGeneration: { status: string; message?: string } };
    };
    assert.equal(journalBody.capabilities.syntheticTopicGeneration.status, "paused");
    assert.match(journalBody.capabilities.syntheticTopicGeneration.message ?? "", /source-backed generation/i);

    const start = await authed("/expedition/start", { topic: "Tides" });
    assert.equal(start.status, 409);
    assert.equal((await start.json() as { error: string }).error, "synthetic_topic_generation_paused");
    const retry = await authed("/expedition/retry", { learnerExpeditionId: randomUUID() });
    assert.equal(retry.status, 409);
    assert.equal((await retry.json() as { error: string }).error, "synthetic_topic_generation_paused");

    const generatedGrade = await authed("/scaffold/option-select", {
      scaffoldStepId: randomUUID(),
      chosenOptionId: randomUUID()
    });
    assert.equal(generatedGrade.status, 409);
    assert.equal((await generatedGrade.json() as { error: string }).error, "generated_support_steps_paused");
    const generatedLessonRead = await authed("/scaffold/lesson-read", { scaffoldStepId: randomUUID() });
    assert.equal(generatedLessonRead.status, 409);
    assert.equal((await generatedLessonRead.json() as { error: string }).error, "generated_support_steps_paused");
    const generatedRetry = await authed("/scaffold/retry", { detourId: randomUUID() });
    assert.equal(generatedRetry.status, 409);
    assert.deepEqual(await generatedRetry.json(), {
      retried: false,
      refused: "generated_support_step_unavailable"
    });

    const [count] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM learner_expeditions
      WHERE learner_state_ref = ${learner}`;
    assert.equal(count.count, 0, "paused requests create or reset no expedition rows");
    assert.equal(wakes, 0, "paused requests never wake the supervisor");

    // A production-shaped source adoption cannot bypass the same graph policy by posting an
    // enrichment id directly. The held-out detail is inspectable in Postgres, but choose and
    // activation both refuse before making it learner-active.
    const heldEnrichmentId = randomUUID();
    await sql`
      INSERT INTO graph_enrichments (
        enrichment_id, graph_version_id, enrichment_config_hash, status,
        judge_model, difficulty_method, completed_at
      ) VALUES (${heldEnrichmentId}, NULL, 'test', 'succeeded', 'test', 'test', now())`;
    await sql`
      INSERT INTO derived_graph_nodes (
        derived_node_id, enrichment_id, node_kind, concept_id, grounding_origin,
        role, canonical_label, normalized_label, declared_domain, aliases
      ) VALUES (
        ${randomUUID()}, ${heldEnrichmentId}, 'enrichment', NULL, 'llm_grounded',
        'prerequisite', 'Held prerequisite', 'held prerequisite', 'test', '[]'::jsonb
      )`;
    const chooseHeld = await authed("/expedition/choose", {
      enrichmentId: heldEnrichmentId,
      title: "Client-supplied title",
      declaredDomain: "client-supplied domain"
    });
    assert.equal(chooseHeld.status, 409);
    assert.equal((await chooseHeld.json() as { capability: string }).capability, "llmGroundedPrerequisites");
    const [afterChoose] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM learner_expeditions
      WHERE learner_state_ref = ${learner}`;
    assert.equal(afterChoose.count, 0, "held-out choose writes no learner expedition");

    const historicalExpeditionId = randomUUID();
    await sql`
      INSERT INTO learner_expeditions (
        learner_expedition_id, learner_state_ref, kind, title, declared_domain,
        status, enrichment_id, active
      ) VALUES (
        ${historicalExpeditionId}, ${learner}, 'topic', 'Historical held row', 'test',
        'ready', ${heldEnrichmentId}, false
      )`;
    const activateHeld = await authed("/expedition/activate", {
      learnerExpeditionId: historicalExpeditionId,
      enrichmentId: heldEnrichmentId
    });
    assert.equal(activateHeld.status, 409);
    const [heldRow] = await sql<{ active: boolean }[]>`
      SELECT active FROM learner_expeditions WHERE learner_expedition_id = ${historicalExpeditionId}`;
    assert.equal(heldRow.active, false, "held historical row remains inactive");
  } finally {
    if (learner) await deleteLearner(sql, learner);
    await Promise.all([sql.end(), authClientSql.end()]);
  }
});

maybeDb("recall challenge end-to-end: create, Last Stand, recovery win, idempotent replay, response_log untouched", async () => {
  const { createDatabaseClient, PostgresResponseLogStore, PostgresStudyItemBankStore } = await import("@lrnki/infrastructure-postgres");
  const { deleteLearner } = await import("@lrnki/infrastructure-postgres/test-support");
  const sql = createDatabaseClient(databaseUrl as string);
  // Better Auth gets its own client. Sharing one here does not merely couple the two — Drizzle
  // rewrites the json/jsonb serializers of whatever client it wraps, so the very next
  // `sql.json(...)` write on the shared pool throws ERR_INVALID_ARG_TYPE. This test is where that
  // regression surfaces, because `PostgresStudyItemBankStore.persist` writes `explorable_terms`
  // through `sql.json`.
  const authClientSql = createDatabaseClient(databaseUrl as string);
  let learner = "";
  try {
    const app = createLearnerApp(sql as unknown as DatabaseClient, authClientSql as unknown as DatabaseClient);
    // Register through the real Better Auth credential route — the same one the rigs and the
    // sign-in UI use — and carry its session cookie. Google is never driven by any test.
    const signUp = await app.request("/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `challenge-${randomUUID()}@test.invalid`, password: `pw-${randomUUID()}`, name: "Challenge Tester" })
    });
    assert.equal(signUp.status, 200);
    const cookie = signUp.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    assert.ok(cookie.length > 0, "sign-up issues the session cookie");
    // `learnerStateRef` IS the Better Auth user id (ADR-0041) — nothing chooses it client-side.
    learner = ((await signUp.json()) as { user: { id: string } }).user.id;
    const authed = (path: string, body?: unknown) =>
      app.request(path, {
        method: body === undefined ? "GET" : "POST",
        headers: { cookie, "content-type": "application/json" },
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

    // Signing out revokes the session server-side: the very next request with the SAME cookie
    // is refused, because the cookie names a `session` row that no longer exists. The `origin`
    // header is not decoration — Better Auth CSRF-checks cookie-bearing state changes against its
    // trusted origins, and a browser always sends one. `app.request` does not, so omitting it here
    // reads as a cross-site attempt and is refused 403.
    const signOut = await app.request("/auth/sign-out", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", origin: process.env.BETTER_AUTH_URL as string },
      body: "{}"
    });
    assert.equal(signOut.status, 200);
    assert.equal((await authed("/journal")).status, 401, "the revoked cookie no longer names a live session");
  } finally {
    // One FK-ordered teardown, owned by `testSupport` (ADR-0039 reads the deletion graph off the
    // schema authority) rather than restated here.
    if (learner) await deleteLearner(sql, learner);
    await Promise.all([sql.end(), authClientSql.end()]);
  }
});

// The regression that the codec mutation would otherwise reintroduce silently. Composing the app
// must leave the STORE pool's `sql.json()` intact; if a future change hands Better Auth the shared
// client again, this fails immediately and by name instead of surfacing as an unrelated write
// blowing up somewhere in study-item persistence.
maybeDb("composing the app leaves the store pool's json serialization intact", async () => {
  const { createDatabaseClient } = await import("@lrnki/infrastructure-postgres");
  const sql = createDatabaseClient(databaseUrl as string);
  const authClientSql = createDatabaseClient(databaseUrl as string);
  try {
    createLearnerApp(sql as unknown as DatabaseClient, authClientSql as unknown as DatabaseClient);
    const [row] = await sql<{ value: { terms: string[] } }[]>`SELECT ${sql.json({ terms: ["a", "b"] })}::jsonb AS value`;
    assert.deepEqual(row.value, { terms: ["a", "b"] });
  } finally {
    await Promise.all([sql.end(), authClientSql.end()]);
  }
});

// The `profileComplete` round trip, which is the ONLY thing standing between a Google account's
// real legal name and the shared weekly leaderboard (ADR-0041, D7). Every part of it is invisible
// to the type system — the field is an `additionalFields` entry, so a config change that drops it
// from the sign-up body or from the session projection compiles fine and simply stops gating the
// naming screen. Nothing else in either suite would notice: the client would either ask a named
// learner to name themselves again, or never ask at all and publish the provider's name.
maybeDb("the naming gate's flag round-trips through sign-up, the session read, and updateUser", async () => {
  const { createDatabaseClient } = await import("@lrnki/infrastructure-postgres");
  const { deleteLearner } = await import("@lrnki/infrastructure-postgres/test-support");
  const sql = createDatabaseClient(databaseUrl as string);
  const authClientSql = createDatabaseClient(databaseUrl as string);
  const created: string[] = [];
  try {
    const app = createLearnerApp(sql as unknown as DatabaseClient, authClientSql as unknown as DatabaseClient);
    const signUp = async (body: Record<string, unknown>) =>
      app.request("/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
    const sessionOf = async (cookie: string) =>
      (await (await app.request("/auth/get-session", { headers: { cookie } })).json()) as {
        user: { id: string; name: string; profileComplete: boolean };
      };
    const cookieOf = (res: Response) => res.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");

    // The rig and fallback path: the name is collected inline, so the profile is complete on
    // arrival and the naming screen must never be shown.
    const named = await signUp({
      email: `named-${randomUUID()}@test.invalid`,
      password: `pw-${randomUUID()}`,
      name: "Named Explorer",
      profileComplete: true
    });
    assert.equal(named.status, 200);
    const namedSession = await sessionOf(cookieOf(named));
    created.push(namedSession.user.id);
    assert.equal(namedSession.user.profileComplete, true, "an inline-named sign-up starts complete");

    // The Google shape: an account arrives with a provider name and no choice made yet.
    const unnamed = await signUp({
      email: `unnamed-${randomUUID()}@test.invalid`,
      password: `pw-${randomUUID()}`,
      name: "Real Legal Name"
    });
    assert.equal(unnamed.status, 200);
    const cookie = cookieOf(unnamed);
    const before = await sessionOf(cookie);
    created.push(before.user.id);
    assert.equal(before.user.profileComplete, false, "the default is what opens the naming screen");

    // Naming writes the chosen name and closes the gate in ONE call. `origin` is required because
    // this is a cookie-bearing write and Better Auth CSRF-checks those against its trusted origins.
    const update = await app.request("/auth/update-user", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", origin: process.env.BETTER_AUTH_URL as string },
      body: JSON.stringify({ name: "Trailblazer", profileComplete: true })
    });
    assert.equal(update.status, 200);
    const after = await sessionOf(cookie);
    assert.equal(after.user.name, "Trailblazer", "the chosen name replaces the provider's");
    assert.equal(after.user.profileComplete, true, "and the gate closes, so it is asked exactly once");
  } finally {
    for (const ref of created) await sql.begin((tx) => deleteLearner(tx as unknown as never, ref));
    await Promise.all([sql.end(), authClientSql.end()]);
  }
});

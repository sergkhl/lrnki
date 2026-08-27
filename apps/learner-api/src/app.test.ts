import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY } from "@lrnki/application";
import { createLearnerApp } from "./app";
import type { DatabaseClient } from "./db";
import { createLearnerSourceExpeditions } from "./sourceExpedition";

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
    const heldNodeId = randomUUID();
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
        ${heldNodeId}, ${heldEnrichmentId}, 'enrichment', NULL, 'llm_grounded',
        'prerequisite', 'Held prerequisite', 'held prerequisite', 'test', '[]'::jsonb
      )`;
    const chooseHeld = await authed("/expedition/choose", {
      enrichmentId: heldEnrichmentId
    });
    assert.equal(chooseHeld.status, 409);
    assert.equal(
      (await chooseHeld.json() as { error: string }).error,
      "accepted_catalog_entry_required"
    );
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
      learnerExpeditionId: historicalExpeditionId
    });
    assert.equal(activateHeld.status, 409);
    const [heldRow] = await sql<{ active: boolean }[]>`
      SELECT active FROM learner_expeditions WHERE learner_expedition_id = ${historicalExpeditionId}`;
    assert.equal(heldRow.active, false, "held historical row remains inactive");

    const heldVerdict = await authed("/study/verdict", {
      enrichmentId: heldEnrichmentId,
      derivedNodeId: heldNodeId,
      verdict: "known"
    });
    assert.equal(heldVerdict.status, 409);
    assert.deepEqual(await heldVerdict.json(), { ok: false, error: "expedition_inactive" });
    const heldLessonRead = await authed("/study/lesson-read", {
      enrichmentId: heldEnrichmentId,
      derivedNodeId: heldNodeId
    });
    assert.equal(heldLessonRead.status, 409);
    assert.deepEqual(await heldLessonRead.json(), { ok: false, error: "expedition_inactive" });
    const [heldWrites] = await sql<{ verdicts: number; reads: number }[]>`
      SELECT
        (SELECT count(*)::int FROM calibration_verdicts WHERE learner_state_ref = ${learner}) AS verdicts,
        (SELECT count(*)::int FROM lesson_reads WHERE learner_state_ref = ${learner}) AS reads`;
    assert.deepEqual(heldWrites, { verdicts: 0, reads: 0 }, "held routes report refusal and write nothing");
  } finally {
    if (learner) await deleteLearner(sql, learner);
    await Promise.all([sql.end(), authClientSql.end()]);
  }
});

maybeDb("exact-reference Support Path and recall challenge share qualified neutral evidence without generated work", async () => {
  const {
    createDatabaseClient,
    PostgresConceptLessonStore,
    PostgresStudyItemBankStore
  } = await import("@lrnki/infrastructure-postgres");
  const { qualifiedSourceExpeditionAssetConfigHash } = await import("@lrnki/application");
  const { studyItemBankConfigHash } = await import("@lrnki/infrastructure-litellm");
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
    let scaffoldWakes = 0;
    const app = createLearnerApp(
      sql as unknown as DatabaseClient,
      authClientSql as unknown as DatabaseClient,
      { wakeScaffoldGeneration: () => { scaffoldWakes += 1; } }
    );
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

    // Seed a minimal fully qualified Source Expedition: a two-stop source-backed trail with
    // one current source-cited lesson and exact-reference option-select activity per stop.
    const sourceResourceId = randomUUID();
    const sourceDocumentId = randomUUID();
    const sourceBlockId = randomUUID();
    const extractionRunId = randomUUID();
    const lessonTexts = [
      "Source prerequisite establishes the invariant.",
      "Source summit applies that invariant."
    ];
    const sourceText = `${lessonTexts.join(" ")} Diagnostic glossary gap labels supplementary material that is not modeled as a trail node.`;
    await sql`
      INSERT INTO source_resources
        (source_resource_id, content_hash, content_type, object_key, declared_domain, title,
         source_uri, license)
      VALUES (${sourceResourceId}, ${randomUUID()}, 'text/plain', ${randomUUID()},
        'software engineering', 'Challenge source',
        'https://example.test/challenge-source', 'CC-BY-4.0')`;
    await sql`
      INSERT INTO source_documents
        (source_document_id, source_resource_id, parser_name, parser_version, parser_config_hash)
      VALUES (${sourceDocumentId}, ${sourceResourceId}, 'test', '1', 'test')`;
    await sql`
      INSERT INTO source_blocks
        (source_block_id, source_document_id, block_id, block_type, text, heading_path, locator)
      VALUES (${sourceBlockId}, ${sourceDocumentId}, 'block-1', 'paragraph', ${sourceText}, ${sql.json(["Challenge source"])}, ${sql.json({ lineStart: 1, lineEnd: 1 })})`;
    await sql`
      INSERT INTO extraction_runs
        (run_id, source_resource_id, source_document_id, pipeline_config_hash, status, completed_at)
      VALUES (${extractionRunId}, ${sourceResourceId}, ${sourceDocumentId}, 'test', 'succeeded', now())`;
    const graphVersionId = randomUUID();
    await sql`
      INSERT INTO graph_versions (graph_version_id, base_graph_version_id, status, refinement_config_hash, published_at)
      VALUES (${graphVersionId}, NULL, 'published', 'test', now())`;
    await sql`
      INSERT INTO graph_version_run_memberships
        (graph_version_run_membership_id, graph_version_id, run_id, source_resource_id)
      VALUES (${randomUUID()}, ${graphVersionId}, ${extractionRunId}, ${sourceResourceId})`;
    const enrichmentId = randomUUID();
    await sql`
      INSERT INTO graph_enrichments (enrichment_id, graph_version_id, enrichment_config_hash, status, judge_model, difficulty_method, completed_at)
      VALUES (${enrichmentId}, ${graphVersionId}, 'test', 'succeeded', 'j', 'd', now())`;
    const nodeIds = [randomUUID(), randomUUID()];
    for (const [index, nodeId] of nodeIds.entries()) {
      const conceptId = randomUUID();
      const label = index === 0 ? "Source prerequisite" : "Source summit";
      await sql`
        INSERT INTO concepts (concept_id, iri, normalized_label, declared_domain)
        VALUES (${conceptId}, ${`urn:lrnki:concept:${conceptId}`}, ${`node-${conceptId}`}, 'software engineering')`;
      await sql`
        INSERT INTO derived_graph_nodes (derived_node_id, enrichment_id, node_kind, concept_id, grounding_origin, role, canonical_label, normalized_label, declared_domain, aliases)
        VALUES (${nodeId}, ${enrichmentId}, 'anchor', ${conceptId}, 'document_anchored', 'anchor', ${label}, ${`node-${conceptId}`}, 'software engineering', '[]'::jsonb)`;
    }
    await sql`
      INSERT INTO inferred_prerequisite_edges (
        inferred_prerequisite_edge_id, enrichment_id, prerequisite_derived_node_id,
        dependent_derived_node_id, confidence, uncertain, judge_model, provenance
      ) VALUES (
        ${randomUUID()}, ${enrichmentId}, ${nodeIds[0]}, ${nodeIds[1]},
        0.95, false, 'test-judge', ${sql.json({ source: "test" })}
      )`;
    const qualifiedConfigHash = qualifiedSourceExpeditionAssetConfigHash(studyItemBankConfigHash());
    const citation = {
      provenance: "source" as const,
      sourceResourceId,
      sourceBlockId,
      matchKind: "exact" as const
    };
    await new PostgresConceptLessonStore(sql).persist({
      graphVersionId,
      enrichmentId,
      configHash: qualifiedConfigHash,
      lessons: nodeIds.map((derivedNodeId, index) => ({
        conceptLessonId: randomUUID(),
        graphVersionId,
        enrichmentId,
        derivedNodeId,
        generatingModel: "test-model",
        configHash: qualifiedConfigHash,
        canonicalLabel: index === 0 ? "Source prerequisite" : "Source summit",
        sections: [{
          kind: "definition" as const,
          text: lessonTexts[index],
          groundingProvenance: "source_cep" as const,
          citation: { ...citation, evidenceQuote: lessonTexts[index] }
        }],
        explorableTerms: index === 0
          ? [{ term: "Source summit", sectionKind: "definition" as const }]
          : []
      })),
      absent: []
    });
    const correctOptionIds = [randomUUID(), randomUUID()];
    const wrongOptionIds = [randomUUID(), randomUUID()];
    const correctOptionId = correctOptionIds[0];
    const wrongOptionId = wrongOptionIds[0];
    const studyItemIds = [randomUUID(), randomUUID()];
    const studyItemId = studyItemIds[0];
    await new PostgresStudyItemBankStore(sql).persist({
      graphVersionId,
      enrichmentId,
      configHash: qualifiedConfigHash,
      studyItems: nodeIds.map((derivedNodeId, index) => ({
        studyItemId: studyItemIds[index],
        graphVersionId,
        enrichmentId,
        derivedNodeId,
        groundingProvenance: "source_cep" as const,
        generatingModel: "test-model",
        configHash: qualifiedConfigHash,
        explorableTerms: index === 1
          ? ["Source prerequisite", "Diagnostic glossary gap"]
          : [],
        itemType: "option_select" as const,
        question: index === 1
          ? "Which source statement defines Source summit? Explore Source prerequisite or Diagnostic glossary gap for related context."
          : "Which source statement defines Source prerequisite?",
        explanation: lessonTexts[index],
        options: [
          {
            optionId: correctOptionIds[index],
            text: lessonTexts[index],
            isCorrect: true,
            provenance: "source" as const,
            citation: { ...citation, evidenceQuote: lessonTexts[index] }
          },
          {
            optionId: wrongOptionIds[index],
            text: "Wrong A",
            isCorrect: false,
            provenance: "generated" as const
          },
          { optionId: randomUUID(), text: "Wrong B", isCorrect: false, provenance: "generated" as const },
          { optionId: randomUUID(), text: "Wrong C", isCorrect: false, provenance: "generated" as const }
        ]
      })),
      rejected: []
    });
    // This test isolates exact-reference and Recall Challenge behavior over the historical
    // two-stop minimum. U2's application publication command owns the new three-stop accepted
    // floor; the fixture installs an already-accepted row directly and pins the exact same
    // qualification identity that every learner read rechecks.
    const sourceExpeditions = createLearnerSourceExpeditions(
      sql,
      CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY
    );
    const qualification = await sourceExpeditions.qualify(enrichmentId);
    assert.equal(qualification.status, "available");
    if (qualification.status !== "available") throw new Error("fixture qualification failed");
    await sql`
      INSERT INTO source_expedition_catalog_entries (
        catalog_key, enrichment_id, title, teaser, catalog_role, audience, sort_order,
        source_provenance, accepted_asset_set_identity, accepted_asset_config_hash
      ) VALUES (
        ${`challenge-${enrichmentId}`}, ${enrichmentId}, 'Challenge source',
        'Exercise exact-reference support and recall.', 'test_fixture', 'test_fixture', 999,
        ${sql.json({
          authorship: "test_fixture",
          knowledgeBasis: "registered_source",
          externalClaimVerificationRequired: false,
          acceptanceScope: "automated_test"
        })}, ${qualification.assets.expectedAssets.assetSetIdentity}, ${qualifiedConfigHash}
      )`;
    const catalogResponse = await authed("/catalog");
    assert.equal(catalogResponse.status, 200);
    const catalogBody = await catalogResponse.json() as {
      candidates: Array<{
        enrichmentId: string;
        catalogKey: string;
        title: string;
        teaser: string;
        sortOrder: number;
      }>;
      sources: Array<{
        catalogKey: string;
        title: string;
        sourceCredits: Array<{
          sourceResourceId: string;
          title: string;
          sourceUri: string | null;
          license: string | null;
        }>;
      }>;
    };
    assert.deepEqual(
      catalogBody.candidates.find((candidate) => candidate.enrichmentId === enrichmentId),
      {
        enrichmentId,
        catalogKey: `challenge-${enrichmentId}`,
        title: "Challenge source",
        teaser: "Exercise exact-reference support and recall.",
        declaredDomain: "software engineering",
        totalStopCount: 2,
        searchTerms: ["Source prerequisite", "Source summit"],
        sortOrder: 999
      }
    );
    assert.deepEqual(
      catalogBody.sources.find((source) => source.catalogKey === `challenge-${enrichmentId}`),
      {
        catalogKey: `challenge-${enrichmentId}`,
        title: "Challenge source",
        sourceProvenance: {
          authorship: "test_fixture",
          knowledgeBasis: "registered_source",
          externalClaimVerificationRequired: false,
          acceptanceScope: "automated_test"
        },
        sourceCredits: [{
          sourceResourceId,
          title: "Challenge source",
          sourceUri: "https://example.test/challenge-source",
          license: "CC-BY-4.0"
        }]
      }
    );
    const adoption = await authed("/expedition/choose", { enrichmentId });
    assert.equal(adoption.status, 200);

    // An advertised term with no exact eligible neutral node refuses before any detour write or
    // supervisor wake. The exact term then publishes READY synchronously and pins the precise
    // qualified lesson/item identities selected from the same active Source Expedition snapshot.
    const missingReference = await authed("/scaffold/request", {
      enrichmentId,
      source: { kind: "study_item", studyItemId: studyItemIds[1] },
      term: "Diagnostic glossary gap"
    });
    assert.equal(missingReference.status, 409);
    assert.deepEqual(await missingReference.json(), {
      created: false,
      reason: "generated_support_step_unavailable"
    });
    const [{ refusedDetours }] = await sql<{ refusedDetours: number }[]>`
      SELECT count(*)::int AS "refusedDetours"
      FROM learner_scaffold_detours
      WHERE learner_state_ref = ${learner}`;
    assert.equal(refusedDetours, 0);
    assert.equal(scaffoldWakes, 0);

    const exactReference = await authed("/scaffold/request", {
      enrichmentId,
      source: { kind: "study_item", studyItemId: studyItemIds[1] },
      term: "Source prerequisite"
    });
    assert.equal(exactReference.status, 200);
    const exactReferenceBody = await exactReference.json() as {
      created: true;
      detourId: string;
      status: string;
    };
    assert.equal(exactReferenceBody.status, "ready");
    assert.equal(scaffoldWakes, 0);
    const [published] = await sql<{
      status: string;
      latestOperationId: string | null;
      referenceSteps: number;
      generatedSteps: number;
      referencedNodeId: string;
      referencedLessonId: string;
      referencedItemId: string;
    }[]>`
      SELECT d.status,
             d.latest_operation_id AS "latestOperationId",
             count(*) FILTER (WHERE s.kind = 'reference')::int AS "referenceSteps",
             count(*) FILTER (WHERE s.kind = 'generated')::int AS "generatedSteps",
             max(s.referenced_derived_node_id::text) AS "referencedNodeId",
             max(s.referenced_concept_lesson_id::text) AS "referencedLessonId",
             max(s.referenced_study_item_id::text) AS "referencedItemId"
      FROM learner_scaffold_detours d
      JOIN learner_scaffold_steps s ON s.detour_id = d.detour_id
      WHERE d.detour_id = ${exactReferenceBody.detourId}
      GROUP BY d.detour_id`;
    assert.deepEqual({
      status: published.status,
      latestOperationId: published.latestOperationId,
      referenceSteps: published.referenceSteps,
      generatedSteps: published.generatedSteps,
      referencedNodeId: published.referencedNodeId,
      referencedItemId: published.referencedItemId
    }, {
      status: "ready",
      latestOperationId: null,
      referenceSteps: 1,
      generatedSteps: 0,
      referencedNodeId: nodeIds[0],
      referencedItemId: studyItemIds[0]
    });
    const [referenceLesson] = await sql<{ concept_lesson_id: string }[]>`
      SELECT concept_lesson_id
      FROM concept_lessons
      WHERE enrichment_id = ${enrichmentId}
        AND derived_node_id = ${nodeIds[0]}
        AND superseded_at IS NULL`;
    assert.equal(published.referencedLessonId, referenceLesson.concept_lesson_id);

    // Hide/restore uses the same aggregate and pin, remains synchronous, and never duplicates.
    assert.deepEqual(await (await authed("/scaffold/hide", {
      detourId: exactReferenceBody.detourId
    })).json(), { hidden: true });
    const hiddenSession = await (await authed(`/expedition/${enrichmentId}`)).json() as {
      session: { detours: unknown[] };
    };
    assert.equal(hiddenSession.session.detours.length, 0);
    const restoredResponse = await authed("/scaffold/request", {
      enrichmentId,
      source: { kind: "study_item", studyItemId: studyItemIds[1] },
      term: "Source prerequisite"
    });
    const restored = await restoredResponse.json() as { detourId: string; status: string };
    assert.equal(restored.detourId, exactReferenceBody.detourId);
    assert.equal(restored.status, "ready");
    assert.equal(scaffoldWakes, 0);
    const [{ stepCount }] = await sql<{ stepCount: number }[]>`
      SELECT count(*)::int AS "stepCount"
      FROM learner_scaffold_steps
      WHERE detour_id = ${exactReferenceBody.detourId}`;
    assert.equal(stepCount, 1);

    // Reference study records ordinary neutral evidence for the exact pin. It completes the
    // prerequisite and Support Path while leaving the parent node unmastered; no scaffold-scoped
    // response can contaminate neutral identity or vice versa.
    assert.equal((await authed("/study/lesson-read", {
      enrichmentId,
      derivedNodeId: nodeIds[0]
    })).status, 200);
    const referenceGrade = await authed("/scaffold/reference-option-select", {
      scaffoldStepId: (await sql<{ scaffold_step_id: string }[]>`
        SELECT scaffold_step_id
        FROM learner_scaffold_steps
        WHERE detour_id = ${exactReferenceBody.detourId}`)[0].scaffold_step_id,
      chosenOptionId: correctOptionId
    });
    assert.equal(referenceGrade.status, 200);
    assert.equal((await referenceGrade.json() as { correct: boolean }).correct, true);
    const responseRows = await sql<{
      scope: string;
      studyItemId: string | null;
      derivedNodeId: string | null;
      scaffoldStepId: string | null;
    }[]>`
      SELECT CASE WHEN scaffold_step_id IS NULL THEN 'neutral' ELSE 'scaffold' END AS scope,
             study_item_id AS "studyItemId", derived_node_id AS "derivedNodeId",
             scaffold_step_id AS "scaffoldStepId"
      FROM response_log
      WHERE learner_state_ref = ${learner}`;
    assert.deepEqual([...responseRows], [{
      scope: "neutral",
      studyItemId,
      derivedNodeId: nodeIds[0],
      scaffoldStepId: null
    }]);
    const supportSession = await (await authed(`/expedition/${enrichmentId}`)).json() as {
      session: {
        detours: { complete: boolean; steps: { complete: boolean }[] }[];
        expeditionPath: { derivedNodeId: string; state: string }[];
      };
    };
    assert.equal(supportSession.session.detours[0].complete, true);
    assert.equal(supportSession.session.detours[0].steps[0].complete, true);
    const stateByNode = Object.fromEntries(
      supportSession.session.expeditionPath.map((step) => [step.derivedNodeId, step.state])
    );
    assert.equal(stateByNode[nodeIds[0]], "mastered");
    assert.equal(stateByNode[nodeIds[1]], "frontier");

    // The request composition must read the same lesson evidence as the learner-facing session.
    // This reference is impossible before the prerequisite is mastered and therefore catches a
    // partial composition that loads response rows but silently omits lesson reads.
    const progressedReference = await authed("/scaffold/request", {
      enrichmentId,
      source: { kind: "lesson", derivedNodeId: nodeIds[0] },
      term: "Source summit"
    });
    assert.equal(progressedReference.status, 200);
    const progressedReferenceBody = await progressedReference.json() as { detourId: string; status: string };
    assert.equal(progressedReferenceBody.status, "ready");
    const [progressedPin] = await sql<{ referencedNodeId: string }[]>`
      SELECT s.referenced_derived_node_id AS "referencedNodeId"
      FROM learner_scaffold_steps s
      WHERE s.detour_id = ${progressedReferenceBody.detourId}`;
    assert.equal(progressedPin.referencedNodeId, nodeIds[1]);
    assert.equal(scaffoldWakes, 0);

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
    const createRes = await authed("/challenge/create", { enrichmentId, scopeKind: "section", anchorDerivedNodeId: nodeIds[1] });
    assert.equal(createRes.status, 200);
    const created = (await createRes.json()) as { created: true; view: { challengeId: string; state: string; remainingMissBuffer: number; currentItem: { kind: string; item: { studyItemId: string } } } };
    const challengeId = created.view.challengeId;
    assert.equal(created.view.state, "active");
    // No pre-answer key anywhere in the wire view.
    assert.ok(!JSON.stringify(created.view).includes("isCorrect"));
    const conflict = await authed("/challenge/create", { enrichmentId, scopeKind: "section", anchorDerivedNodeId: nodeIds[1] });
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
    const rematch = (await (await authed("/challenge/create", { enrichmentId, scopeKind: "section", anchorDerivedNodeId: nodeIds[1] })).json()) as { created: true; view: { challengeId: string } };
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

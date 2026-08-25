import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY,
  checkMatchingAttempt,
  getExpeditionCatalog,
  getExpeditionJournal,
  getStudySession,
  gradeScaffoldReferenceOptionSelect,
  gradeScaffoldOptionSelect,
  gradeStudyResponse,
  hideLearnerScaffold,
  recordLearnerVerdict,
  recordLessonRead,
  recordScaffoldLessonRead,
  requestLearnerScaffold,
  retryLearnerScaffold,
  learnerKnowledgeCapabilityIsAvailable,
  type GradeRefusalReason,
  type LearnerKnowledgeAvailability,
  type NodeWriteRefusalReason
} from "@lrnki/application";
import {
  PostgresCalibrationVerdictStore,
  PostgresConceptLessonStore,
  PostgresEnrichmentInspectionRead,
  PostgresEnrichmentLayerPurposeStore,
  PostgresLearnerExpeditionStore,
  PostgresLearnerRecallChallengeStore,
  PostgresLearnerScaffoldStore,
  PostgresScaffoldReferenceActivityRead,
  PostgresLessonReadStore,
  PostgresOperationTimelineRead,
  PostgresResponseLogStore,
  PostgresStudyItemBankStore
} from "@lrnki/infrastructure-postgres";
import { createLearnerAuth, learnerWebOrigins, requireSession, type AuthEnv } from "./auth";
import type { DatabaseClient } from "./db";
import { loadLeaderboard } from "./leaderboard";
import { createLearnerRecallChallenge } from "./recallChallenge";
import { createLearnerSourceExpeditions } from "./sourceExpedition";
import { wakeScaffoldGenerationSupervisor } from "./scaffoldGenerationSupervisor";
import { wakeTopicGenerationSupervisor } from "./topicGenerationSupervisor";

export type LearnerGradingResult =
  | { kind: "selection"; graded: true; chosenId: string; keyedCorrectId: string; correct: boolean }
  | { kind: "selection"; graded: false; message: string };

export type LearnerMatchingResult =
  | { kind: "matching"; graded: true; correct: boolean; correctFirstTry: number; pairCount: number }
  | { kind: "matching"; graded: false; message: string };

export type LearnerMatchingAttemptResult =
  | { checked: true; correct: boolean }
  | { checked: false; message: string };

// The two learner-facing copy strings the grading surface renders (ADR-0033 keeps themed copy
// with the surface that produced it before the split). The use-case returns reason codes; only
// `invalid_input` maps to "could not be recorded" — every other refusal collapses to the reopen
// prompt.
function gradingMessage(refused: GradeRefusalReason, invalidCopy: string): string {
  return refused === "invalid_input"
    ? invalidCopy
    : "This expedition is no longer active. Return to the expedition list and reopen it.";
}

function nodeWriteRefusalStatus(refused: NodeWriteRefusalReason): 409 | 422 {
  return refused === "expedition_inactive" ? 409 : 422;
}

const matchingTrace = z.array(z.object({ promptId: z.string(), chosenMatchId: z.string() }));

// Recall Challenge transport bounds (plan 2026-07-13-003 KTD7/KTD8): UUIDs validated before
// the application boundary, chosen ids bounded, and client-observed duration clamped to the
// same 0–1h window the DB CHECK enforces. The duration is untrusted reporting evidence only.
const challengeAnswerBase = {
  challengeId: z.string().uuid(),
  attemptRef: z.string().uuid(),
  studyItemId: z.string().uuid(),
  responseDurationMs: z.number().int().min(0).max(3600000).nullish()
};
const challengeLifecycleBody = z.object({
  challengeId: z.string().uuid(),
  operationRef: z.string().uuid()
});

// One refusal → HTTP status mapping for every Recall Challenge route: unknown/foreign
// resources are 404, malformed or unusable requests 422, and everything that means "the
// durable state disagrees with you" (stale turn, inactive challenge, active-scope conflict,
// locked scope) is 409 so the client reloads the committed view.
function challengeRefusalStatus(refused: string): 404 | 409 | 422 {
  if (refused === "not_found") return 404;
  if (refused === "invalid_input" || refused === "invalid_scope" || refused === "no_eligible_items" || refused === "item_type_mismatch") return 422;
  return 409;
}

// The complete learner HTTP API (R1): every route is a thin zod-validated mapper over
// `@lrnki/application` use-cases on the shared pool. Identity comes from the Better Auth
// session cookie only (ADR-0041) — no route accepts a client-supplied learnerStateRef.
//
// `authSql` is a SECOND client, and passing the same one twice is a bug: Better Auth's Drizzle
// adapter rewrites its client's type codecs in place and would strip `sql.json()` from every
// store on the shared pool (see `createAuthDatabase`). It is a separate parameter precisely so
// the constraint is visible at every call site rather than buried in a composition root.
export type LearnerAppOptions = Readonly<{
  learnerKnowledgeAvailability?: LearnerKnowledgeAvailability;
  wakeTopicGeneration?: () => void;
  wakeScaffoldGeneration?: () => void;
}>;

export function createLearnerApp(sql: DatabaseClient, authSql: DatabaseClient, options: LearnerAppOptions = {}) {
  const expeditionStore = new PostgresLearnerExpeditionStore(sql);
  const learnerAuth = createLearnerAuth(authSql);
  const auth = requireSession(learnerAuth);
  const learnerKnowledgeAvailability = options.learnerKnowledgeAvailability
    ?? CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY;
  const wakeTopicGeneration = options.wakeTopicGeneration ?? wakeTopicGenerationSupervisor;
  const wakeScaffoldGeneration = options.wakeScaffoldGeneration ?? wakeScaffoldGenerationSupervisor;
  const sourceExpeditions = createLearnerSourceExpeditions(sql, learnerKnowledgeAvailability);
  // The Recall Challenge deep module, bound once at the composition root (KTD1).
  const recallChallenges = createLearnerRecallChallenge(sql, sourceExpeditions);

  const studyDeps = () => ({
    sourceExpeditions,
    studyItemStore: new PostgresStudyItemBankStore(sql),
    responseLog: new PostgresResponseLogStore(sql)
  });
  const verdictDeps = () => ({
    sourceExpeditions,
    verdictStore: new PostgresCalibrationVerdictStore(sql)
  });
  const scaffoldRequestDeps = () => ({
    sourceExpeditions,
    studyItemStore: new PostgresStudyItemBankStore(sql),
    conceptLessonStore: new PostgresConceptLessonStore(sql),
    scaffoldStore: new PostgresLearnerScaffoldStore(sql),
    learnerKnowledgeAvailability,
    readStudySession: ({ enrichmentId, learnerStateRef }: { enrichmentId: string; learnerStateRef: string }) =>
      getStudySession({
        enrichmentId,
        learnerStateRef,
        sourceExpeditions,
        responseLog: new PostgresResponseLogStore(sql),
        verdictStore: new PostgresCalibrationVerdictStore(sql),
        learnerKnowledgeAvailability
      })
  });
  const scaffoldGradeDeps = () => ({
    scaffoldStore: new PostgresLearnerScaffoldStore(sql),
    responseLog: new PostgresResponseLogStore(sql)
  });
  const scaffoldReferenceGradeDeps = () => ({
    referenceActivityRead: new PostgresScaffoldReferenceActivityRead(sql),
    responseLog: new PostgresResponseLogStore(sql),
    sourceExpeditions
  });

  const app = new Hono<AuthEnv>()
    .use("*", cors({
      // One shared environment (root README): the same process may serve the Pages origin
      // (prod, or a host-run dev process behind Caddy's dev-first upstream) and the local
      // Expo web server (8881). Echo back any allowed origin so both topologies work
      // without widening to "*", which a credentialed request forbids outright.
      origin: (origin) => (learnerWebOrigins().includes(origin) ? origin : null),
      allowHeaders: ["Content-Type"],
      // Session cookies ride the cross-origin (Pages web ↔ VPS api) fetch, so the browser
      // needs this to send them at all and to expose the response (ADR-0041).
      credentials: true,
      // Cache preflights for a day — the only real per-request cost of the two-origin
      // topology, since web and api never share an origin.
      maxAge: 86400
    }))

    .get("/health", (c) => c.json({ ok: true as const }))

    // The complete identity surface (ADR-0041): sign-up, sign-in, sign-out, session read,
    // profile update, and the Google callback are all Better Auth's own endpoints. Mounted
    // AFTER cors so its responses carry the credentialed headers. It is deliberately outside
    // the typed route chain — clients reach it through Better Auth's own typed client, not
    // through `AppType`.
    .on(["GET", "POST"], "/auth/*", (c) => learnerAuth.handler(c.req.raw))

    .get("/journal", auth, async (c) => {
      const journal = await getExpeditionJournal(
        { learnerStateRef: c.get("learnerStateRef") },
        {
          sourceExpeditions,
          enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
          expeditionStore,
          studyItemStore: new PostgresStudyItemBankStore(sql),
          responseLog: new PostgresResponseLogStore(sql),
          lessonReadStore: new PostgresLessonReadStore(sql),
          layerPurposeStore: new PostgresEnrichmentLayerPurposeStore(sql),
          timelineRead: new PostgresOperationTimelineRead(sql),
          learnerKnowledgeAvailability
        }
      );
      return c.json({
        ...journal,
        capabilities: { syntheticTopicGeneration: learnerKnowledgeAvailability.syntheticTopicGeneration }
      });
    })

    // Browse all is intentionally independent from the polled journal payload: it has no
    // timelines and is fetched only after the learner opens the catalog.
    .get("/catalog", auth, async (c) => {
      return c.json(await getExpeditionCatalog(
        { learnerStateRef: c.get("learnerStateRef") },
        {
          sourceExpeditions
        }
      ));
    })

    .get("/leaderboard", auth, async (c) => {
      return c.json(await loadLeaderboard(sql, c.get("learnerStateRef")));
    })

    .get("/expedition/:enrichmentId", auth, async (c) => {
      const enrichmentId = c.req.param("enrichmentId");
      const learnerStateRef = c.get("learnerStateRef");
      const [session, expedition] = await Promise.all([
        getStudySession({
          enrichmentId,
          learnerStateRef,
          sourceExpeditions,
          lessonReadStore: new PostgresLessonReadStore(sql),
          layerPurposeStore: new PostgresEnrichmentLayerPurposeStore(sql),
          responseLog: new PostgresResponseLogStore(sql),
          verdictStore: new PostgresCalibrationVerdictStore(sql),
          learnerKnowledgeAvailability,
          scaffoldStore: new PostgresLearnerScaffoldStore(sql),
          scaffoldReferenceRead: new PostgresScaffoldReferenceActivityRead(sql),
          // Guardian scope views ride down with the session (plan 2026-07-13-003 U4, KTD3).
          challengeStore: new PostgresLearnerRecallChallengeStore(sql)
        }),
        expeditionStore.getByEnrichment({ learnerStateRef, enrichmentId })
      ]);
      if (!session) return c.json({ error: "not_found" as const }, 404);
      return c.json({ session, expedition: expedition ?? null });
    })

    .post("/expedition/choose", auth, zValidator("json", z.object({
      enrichmentId: z.string().uuid()
    })), async (c) => {
      const input = c.req.valid("json");
      const result = await sourceExpeditions.adopt({
        learnerStateRef: c.get("learnerStateRef"),
        enrichmentId: input.enrichmentId
      });
      if (!result.adopted) {
        return c.json(
          { error: result.refused },
          result.refused === "enrichment_not_found" ? 404 : 409
        );
      }
      return c.json({ ok: true as const, learnerExpeditionId: result.learnerExpeditionId });
    })

    .post("/expedition/activate", auth, zValidator("json", z.object({
      learnerExpeditionId: z.string().uuid()
    })), async (c) => {
      const input = c.req.valid("json");
      const learnerStateRef = c.get("learnerStateRef");
      const expedition = await expeditionStore.getForLearner({
        learnerStateRef,
        learnerExpeditionId: input.learnerExpeditionId
      });
      if (!expedition) return c.json({ error: "expedition_not_owned" as const }, 404);
      if (expedition.kind === "topic" &&
          !learnerKnowledgeCapabilityIsAvailable(learnerKnowledgeAvailability, "syntheticTopicGeneration")) {
        return c.json({
          error: "synthetic_topic_generation_paused" as const,
          availability: learnerKnowledgeAvailability.syntheticTopicGeneration
        }, 409);
      }
      if (expedition.kind === "source") {
        const result = await sourceExpeditions.activate({
          learnerStateRef,
          learnerExpeditionId: input.learnerExpeditionId
        });
        if (!result.activated) {
          return c.json(
            { error: result.refused },
            result.refused === "expedition_not_owned" ? 404 : 409
          );
        }
      } else {
        await expeditionStore.setActive({ learnerStateRef, learnerExpeditionId: input.learnerExpeditionId });
      }
      return c.json({ ok: true as const });
    })

    .post("/expedition/start", auth, zValidator("json", z.object({ topic: z.string().trim().min(1) })), async (c) => {
      if (!learnerKnowledgeCapabilityIsAvailable(learnerKnowledgeAvailability, "syntheticTopicGeneration")) {
        return c.json({
          error: "synthetic_topic_generation_paused" as const,
          availability: learnerKnowledgeAvailability.syntheticTopicGeneration
        }, 409);
      }
      await expeditionStore.upsert({
        learnerExpeditionId: randomUUID(),
        learnerStateRef: c.get("learnerStateRef"),
        kind: "topic",
        title: c.req.valid("json").topic,
        declaredDomain: null,
        status: "generating",
        active: true
      });
      wakeTopicGeneration();
      return c.json({ ok: true as const });
    })

    .post("/expedition/retry", auth, zValidator("json", z.object({ learnerExpeditionId: z.string() })), async (c) => {
      if (!learnerKnowledgeCapabilityIsAvailable(learnerKnowledgeAvailability, "syntheticTopicGeneration")) {
        return c.json({
          error: "synthetic_topic_generation_paused" as const,
          availability: learnerKnowledgeAvailability.syntheticTopicGeneration
        }, 409);
      }
      await expeditionStore.resetGeneration({
        learnerStateRef: c.get("learnerStateRef"),
        learnerExpeditionId: c.req.valid("json").learnerExpeditionId
      });
      wakeTopicGeneration();
      return c.json({ ok: true as const });
    })

    .post("/study/option-select", auth, zValidator("json", z.object({
      enrichmentId: z.string(),
      studyItemId: z.string(),
      chosenOptionId: z.string()
    })), async (c) => {
      const input = c.req.valid("json");
      const result = await gradeStudyResponse(
        {
          learnerStateRef: c.get("learnerStateRef"),
          enrichmentId: input.enrichmentId,
          studyItemId: input.studyItemId,
          submission: { itemType: "option_select", chosenOptionId: input.chosenOptionId }
        },
        studyDeps()
      );
      if (!result.graded) return c.json<LearnerGradingResult>({ kind: "selection", graded: false, message: gradingMessage(result.refused, "This answer could not be recorded.") });
      const { outcome } = result;
      if (outcome.kind !== "selection") return c.json<LearnerGradingResult>({ kind: "selection", graded: false, message: "This answer could not be recorded." });
      return c.json<LearnerGradingResult>({ kind: "selection", graded: true, chosenId: outcome.chosenId, keyedCorrectId: outcome.keyedCorrectId, correct: outcome.correct });
    })

    .post("/study/impostor", auth, zValidator("json", z.object({
      enrichmentId: z.string(),
      studyItemId: z.string(),
      chosenStatementId: z.string()
    })), async (c) => {
      const input = c.req.valid("json");
      const result = await gradeStudyResponse(
        {
          learnerStateRef: c.get("learnerStateRef"),
          enrichmentId: input.enrichmentId,
          studyItemId: input.studyItemId,
          submission: { itemType: "impostor", chosenStatementId: input.chosenStatementId }
        },
        studyDeps()
      );
      if (!result.graded) return c.json<LearnerGradingResult>({ kind: "selection", graded: false, message: gradingMessage(result.refused, "This answer could not be recorded.") });
      const { outcome } = result;
      if (outcome.kind !== "selection") return c.json<LearnerGradingResult>({ kind: "selection", graded: false, message: "This answer could not be recorded." });
      return c.json<LearnerGradingResult>({ kind: "selection", graded: true, chosenId: outcome.chosenId, keyedCorrectId: outcome.keyedCorrectId, correct: outcome.correct });
    })

    .post("/study/matching", auth, zValidator("json", z.object({
      enrichmentId: z.string(),
      studyItemId: z.string(),
      trace: matchingTrace
    })), async (c) => {
      const input = c.req.valid("json");
      const result = await gradeStudyResponse(
        {
          learnerStateRef: c.get("learnerStateRef"),
          enrichmentId: input.enrichmentId,
          studyItemId: input.studyItemId,
          submission: { itemType: "matching", trace: input.trace }
        },
        studyDeps()
      );
      if (!result.graded) return c.json<LearnerMatchingResult>({ kind: "matching", graded: false, message: gradingMessage(result.refused, "This answer could not be recorded.") });
      const { outcome } = result;
      if (outcome.kind !== "matching") return c.json<LearnerMatchingResult>({ kind: "matching", graded: false, message: "This answer could not be recorded." });
      return c.json<LearnerMatchingResult>({ kind: "matching", graded: true, correct: outcome.correct, correctFirstTry: outcome.correctFirstTry, pairCount: outcome.pairCount });
    })

    .post("/study/matching-attempt", auth, zValidator("json", z.object({
      enrichmentId: z.string(),
      studyItemId: z.string(),
      promptId: z.string(),
      matchId: z.string()
    })), async (c) => {
      const result = await checkMatchingAttempt(
        { learnerStateRef: c.get("learnerStateRef"), ...c.req.valid("json") },
        { sourceExpeditions, studyItemStore: new PostgresStudyItemBankStore(sql) }
      );
      if (!result.checked) {
        return c.json<LearnerMatchingAttemptResult>({
          checked: false,
          message: result.refused === "invalid_input"
            ? "This match could not be checked."
            : "This expedition is no longer active. Return to the expedition list and reopen it."
        });
      }
      return c.json<LearnerMatchingAttemptResult>({ checked: true, correct: result.correct });
    })

    // Clearing a verdict IS setting "learn" — one route covers set and clear.
    .post("/study/verdict", auth, zValidator("json", z.object({
      enrichmentId: z.string(),
      derivedNodeId: z.string(),
      verdict: z.enum(["known", "learn"])
    })), async (c) => {
      const result = await recordLearnerVerdict(
        { learnerStateRef: c.get("learnerStateRef"), ...c.req.valid("json") },
        verdictDeps()
      );
      if (!result.recorded) {
        return c.json(
          { ok: false as const, error: result.refused },
          nodeWriteRefusalStatus(result.refused)
        );
      }
      return c.json({ ok: true as const });
    })

    .post("/study/lesson-read", auth, zValidator("json", z.object({
      enrichmentId: z.string(),
      derivedNodeId: z.string()
    })), async (c) => {
      const result = await recordLessonRead(
        { learnerStateRef: c.get("learnerStateRef"), ...c.req.valid("json") },
        {
          sourceExpeditions,
          lessonReadStore: new PostgresLessonReadStore(sql)
        }
      );
      if (!result.recorded) {
        return c.json(
          { ok: false as const, error: result.refused },
          nodeWriteRefusalStatus(result.refused)
        );
      }
      return c.json({ ok: true as const });
    })

    // --- Learner-Scoped Scaffold Detours (plan 2026-07-12-002 U5) --------------------------
    // Request-or-restore a detour for an advertised term. The use-case verifies the active
    // expedition, the source block, parent membership, and the exact advertised term from
    // server-owned neutral content before upserting. Exact reuse publishes synchronously; only a
    // result that explicitly queued generated work wakes the supervisor.
    .post("/scaffold/request", auth, zValidator("json", z.object({
      enrichmentId: z.string(),
      source: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("lesson"), derivedNodeId: z.string() }),
        z.object({ kind: z.literal("study_item"), studyItemId: z.string() })
      ]),
      term: z.string()
    })), async (c) => {
      const result = await requestLearnerScaffold(
        { learnerStateRef: c.get("learnerStateRef"), ...c.req.valid("json") },
        scaffoldRequestDeps()
      );
      if (!result.created) {
        const status = result.refused === "generated_support_step_unavailable" ||
          result.refused === "reference_support_step_unavailable" ||
          result.refused === "expedition_inactive" ? 409 : 422;
        return c.json({ created: false as const, reason: result.refused }, status);
      }
      if (result.generationRequested) wakeScaffoldGeneration();
      return c.json({ created: true as const, detourId: result.detourId, status: result.status });
    })

    // Retry a failed detour: reuse its identity, return it to generating, wake the supervisor.
    .post("/scaffold/retry", auth, zValidator("json", z.object({ detourId: z.string() })), async (c) => {
      const result = await retryLearnerScaffold(
        { learnerStateRef: c.get("learnerStateRef"), detourId: c.req.valid("json").detourId },
        {
          scaffoldStore: new PostgresLearnerScaffoldStore(sql),
          learnerKnowledgeAvailability
        }
      );
      if (result.retried) wakeScaffoldGeneration();
      return result.retried || !result.refused ? c.json(result) : c.json(result, 409);
    })

    // Hide a ready detour or dismiss a failed one (content + evidence preserved).
    .post("/scaffold/hide", auth, zValidator("json", z.object({ detourId: z.string() })), async (c) => {
      const result = await hideLearnerScaffold(
        { learnerStateRef: c.get("learnerStateRef"), detourId: c.req.valid("json").detourId },
        { scaffoldStore: new PostgresLearnerScaffoldStore(sql) }
      );
      return c.json({ hidden: result.hidden });
    })

    // Grade a generated Scaffold Step's option-select. Scaffold-scoped; never touches base mastery.
    .post("/scaffold/option-select", auth, zValidator("json", z.object({
      scaffoldStepId: z.string(),
      chosenOptionId: z.string()
    })), async (c) => {
      if (!learnerKnowledgeCapabilityIsAvailable(learnerKnowledgeAvailability, "generatedSupportSteps")) {
        return c.json({
          error: "generated_support_steps_paused" as const,
          availability: learnerKnowledgeAvailability.generatedSupportSteps
        }, 409);
      }
      const result = await gradeScaffoldOptionSelect(
        { learnerStateRef: c.get("learnerStateRef"), ...c.req.valid("json") },
        scaffoldGradeDeps()
      );
      if (!result.graded) return c.json<LearnerGradingResult>({ kind: "selection", graded: false, message: "This answer could not be recorded." });
      return c.json<LearnerGradingResult>({ kind: "selection", graded: true, chosenId: result.chosenId, keyedCorrectId: result.keyedCorrectId, correct: result.correct });
    })

    // Grade a learner-owned reference step against its pinned (possibly superseded) neutral
    // option-select. The application resolves the key and appends ordinary neutral evidence.
    .post("/scaffold/reference-option-select", auth, zValidator("json", z.object({
      scaffoldStepId: z.string(),
      chosenOptionId: z.string()
    })), async (c) => {
      const result = await gradeScaffoldReferenceOptionSelect(
        { learnerStateRef: c.get("learnerStateRef"), ...c.req.valid("json") },
        scaffoldReferenceGradeDeps()
      );
      if (!result.graded) return c.json<LearnerGradingResult>({ kind: "selection", graded: false, message: "This answer could not be recorded." });
      return c.json<LearnerGradingResult>({ kind: "selection", graded: true, chosenId: result.chosenId, keyedCorrectId: result.keyedCorrectId, correct: result.correct });
    })

    // Mark a generated Scaffold Step's micro-lesson read (R12).
    .post("/scaffold/lesson-read", auth, zValidator("json", z.object({ scaffoldStepId: z.string() })), async (c) => {
      if (!learnerKnowledgeCapabilityIsAvailable(learnerKnowledgeAvailability, "generatedSupportSteps")) {
        return c.json({
          error: "generated_support_steps_paused" as const,
          availability: learnerKnowledgeAvailability.generatedSupportSteps
        }, 409);
      }
      const result = await recordScaffoldLessonRead(
        { learnerStateRef: c.get("learnerStateRef"), scaffoldStepId: c.req.valid("json").scaffoldStepId },
        { scaffoldStore: new PostgresLearnerScaffoldStore(sql) }
      );
      return c.json({ recorded: result.recorded });
    })

    // --- Recall Challenges (plan 2026-07-13-003 U3, KTD7). One authenticated, learner-safe,
    // idempotent lifecycle over the neutral Recall Challenge module. The Learner App maps
    // these plain views to Crystal Guardian presentation. ------------------------------------

    .get("/challenge/scopes/:enrichmentId", auth, async (c) => {
      const scopes = await recallChallenges.scopeStatus({
        learnerStateRef: c.get("learnerStateRef"),
        enrichmentId: c.req.param("enrichmentId")
      });
      if (!scopes) return c.json({ error: "not_found" as const }, 404);
      return c.json({ scopes });
    })

    .post("/challenge/create", auth, zValidator("json", z.object({
      enrichmentId: z.string().uuid(),
      scopeKind: z.enum(["section", "enrichment"]),
      anchorDerivedNodeId: z.string().uuid()
    })), async (c) => {
      const result = await recallChallenges.create({ learnerStateRef: c.get("learnerStateRef"), ...c.req.valid("json") });
      if (!result.created) {
        if (result.refused === "active_challenge_exists") {
          return c.json({ created: false as const, refused: result.refused, activeChallengeId: result.activeChallengeId }, 409);
        }
        return c.json({ created: false as const, refused: result.refused }, challengeRefusalStatus(result.refused));
      }
      return c.json({ created: true as const, view: result.view });
    })

    .get("/challenge/:challengeId", auth, async (c) => {
      const result = await recallChallenges.read({
        learnerStateRef: c.get("learnerStateRef"),
        challengeId: c.req.param("challengeId")
      });
      if (!result.found) return c.json({ error: "not_found" as const }, 404);
      return c.json({ view: result.view });
    })

    .post("/challenge/answer", auth, zValidator("json", z.object({
      ...challengeAnswerBase,
      chosenId: z.string().min(1).max(200)
    })), async (c) => {
      const input = c.req.valid("json");
      const result = await recallChallenges.answerSelection({
        learnerStateRef: c.get("learnerStateRef"),
        challengeId: input.challengeId,
        attemptRef: input.attemptRef,
        studyItemId: input.studyItemId,
        chosenId: input.chosenId,
        responseDurationMs: input.responseDurationMs ?? null
      });
      if (!result.answered) return c.json({ answered: false as const, refused: result.refused }, challengeRefusalStatus(result.refused));
      return c.json({ answered: true as const, replayed: result.replayed, feedback: result.feedback, view: result.view });
    })

    .post("/challenge/matching-pair", auth, zValidator("json", z.object({
      ...challengeAnswerBase,
      promptId: z.string().min(1).max(200),
      chosenMatchId: z.string().min(1).max(200)
    })), async (c) => {
      const input = c.req.valid("json");
      const result = await recallChallenges.answerMatchingPair({
        learnerStateRef: c.get("learnerStateRef"),
        challengeId: input.challengeId,
        attemptRef: input.attemptRef,
        studyItemId: input.studyItemId,
        promptId: input.promptId,
        chosenMatchId: input.chosenMatchId,
        responseDurationMs: input.responseDurationMs ?? null
      });
      if (!result.answered) return c.json({ answered: false as const, refused: result.refused }, challengeRefusalStatus(result.refused));
      return c.json({ answered: true as const, replayed: result.replayed, feedback: result.feedback, view: result.view });
    })

    .post("/challenge/retreat", auth, zValidator("json", challengeLifecycleBody), async (c) => {
      const result = await recallChallenges.retreat({ learnerStateRef: c.get("learnerStateRef"), ...c.req.valid("json") });
      if (!result.applied) return c.json({ applied: false as const, refused: result.refused }, challengeRefusalStatus(result.refused));
      return c.json({ applied: true as const, view: result.view });
    })

    .post("/challenge/resume", auth, zValidator("json", challengeLifecycleBody), async (c) => {
      const result = await recallChallenges.resume({ learnerStateRef: c.get("learnerStateRef"), ...c.req.valid("json") });
      if (!result.applied) return c.json({ applied: false as const, refused: result.refused }, challengeRefusalStatus(result.refused));
      return c.json({ applied: true as const, view: result.view });
    })

    .post("/challenge/abandon", auth, zValidator("json", challengeLifecycleBody), async (c) => {
      const result = await recallChallenges.abandon({ learnerStateRef: c.get("learnerStateRef"), ...c.req.valid("json") });
      if (!result.applied) return c.json({ applied: false as const, refused: result.refused }, challengeRefusalStatus(result.refused));
      return c.json({ applied: true as const, view: result.view });
    });

  return app;
}

export type AppType = ReturnType<typeof createLearnerApp>;

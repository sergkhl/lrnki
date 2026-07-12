import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  checkMatchingAttempt,
  enterLearnerSession,
  getDuelSetup,
  getExpeditionCatalog,
  getExpeditionJournal,
  getStudySession,
  gradeDuelAnswer,
  gradeScaffoldOptionSelect,
  gradeStudyResponse,
  hideLearnerScaffold,
  recordLearnerVerdict,
  recordLessonRead,
  recordScaffoldLessonRead,
  registerLearner,
  requestLearnerScaffold,
  retryLearnerScaffold,
  type GradeRefusalReason
} from "@lrnki/application";
import {
  PostgresCalibrationVerdictStore,
  PostgresConceptLessonStore,
  PostgresEnrichmentInspectionRead,
  PostgresEnrichmentLayerPurposeStore,
  PostgresLearnerAwardsStore,
  PostgresLearnerExpeditionStore,
  PostgresLearnerScaffoldStore,
  PostgresLearnerSessionStore,
  PostgresLearnerStore,
  PostgresLessonReadStore,
  PostgresOperationTimelineRead,
  PostgresResponseLogStore,
  PostgresStudyItemBankStore
} from "@lrnki/infrastructure-postgres";
import { FixedWindowRateLimiter, bearerAuth, compactLearnerRef, hashSessionToken, mintSessionToken, type AuthEnv } from "./auth";
import type { DatabaseClient } from "./db";
import { loadLeaderboard } from "./leaderboard";
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

const sessionBody = z.object({
  intent: z.enum(["enter", "create"]).default("enter"),
  learnerStateRef: z.string(),
  pin: z.string(),
  displayName: z.string().optional()
});

const matchingTrace = z.array(z.object({ promptId: z.string(), chosenMatchId: z.string() }));

const duelSubmission = z.discriminatedUnion("itemType", [
  z.object({ itemType: z.literal("option_select"), chosenOptionId: z.string() }),
  z.object({ itemType: z.literal("impostor"), chosenStatementId: z.string() })
]);

// PIN brute-force throttle at the ONE route where PINs exist (R2/KTD8): fixed windows,
// keyed per client IP and per learner name.
const SESSION_ATTEMPT_LIMIT = 10;
const SESSION_WINDOW_MS = 60 * 1000;

// The complete learner HTTP API (R1): every route is a thin zod-validated mapper over
// `@lrnki/application` use-cases on the shared pool. Identity comes from the bearer
// token only (R2) — no route accepts a client-supplied learnerStateRef.
export function createLearnerApp(sql: DatabaseClient) {
  const sessions = new PostgresLearnerSessionStore(sql);
  const learners = new PostgresLearnerStore(sql);
  const expeditionStore = new PostgresLearnerExpeditionStore(sql);
  const rateLimiter = new FixedWindowRateLimiter(SESSION_ATTEMPT_LIMIT, SESSION_WINDOW_MS);
  const auth = bearerAuth(sessions);

  const studyDeps = () => ({
    expeditionStore,
    studyItemStore: new PostgresStudyItemBankStore(sql),
    responseLog: new PostgresResponseLogStore(sql)
  });
  const verdictDeps = () => ({
    expeditionStore,
    enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
    verdictStore: new PostgresCalibrationVerdictStore(sql)
  });
  const scaffoldRequestDeps = () => ({
    expeditionStore,
    studyItemStore: new PostgresStudyItemBankStore(sql),
    conceptLessonStore: new PostgresConceptLessonStore(sql),
    enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
    scaffoldStore: new PostgresLearnerScaffoldStore(sql)
  });
  const scaffoldGradeDeps = () => ({
    scaffoldStore: new PostgresLearnerScaffoldStore(sql),
    responseLog: new PostgresResponseLogStore(sql)
  });

  const app = new Hono<AuthEnv>()
    .use("*", cors({
      // One shared environment (ADR-0036): the same process may serve the Pages origin
      // (prod, or a host-run dev process behind Caddy's dev-first upstream) and the local
      // Expo web server (8081). Echo back any allowed origin so both topologies work
      // without widening to "*", which the credentialed Authorization flow forbids.
      origin: (origin) => {
        const allowed = new Set([
          process.env.LEARNER_WEB_ORIGIN ?? "https://lrnki.globesoul.com",
          "http://localhost:8081"
        ]);
        return allowed.has(origin) ? origin : null;
      },
      allowHeaders: ["Authorization", "Content-Type"],
      // Cache preflights for a day — the only real per-request cost of the two-origin
      // (Pages web ↔ VPS api) topology, since web and api never share an origin.
      maxAge: 86400
    }))

    .get("/health", (c) => c.json({ ok: true as const }))

    // Login/register — the one place PINs exist (KTD8) and the swap seam for real auth.
    .post("/session", zValidator("json", sessionBody), async (c) => {
      const body = c.req.valid("json");
      const learnerRef = compactLearnerRef(body.learnerStateRef);
      const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
      if (!rateLimiter.allow(`ip:${ip}`) || !rateLimiter.allow(`name:${learnerRef}`)) {
        return c.json({ error: "rate_limited" as const }, 429);
      }
      if (!learnerRef) return c.json({ error: "invalid_name" as const }, 422);
      if (body.intent === "create") {
        const displayName = compactLearnerRef(body.displayName ?? "") || learnerRef;
        const result = await registerLearner({ learnerRef, displayName, pin: body.pin }, { learnerStore: learners });
        if (!result.registered) return c.json({ error: result.reason }, 422);
        return c.json(await issueSession(sessions, result.learner.learnerRef, result.learner.displayName));
      }
      const result = await enterLearnerSession({ learnerRef, pin: body.pin }, { learnerStore: learners });
      if (!result.entered) {
        return c.json({ error: result.reason === "not_found" ? ("invalid_name" as const) : ("wrong_pin" as const) }, 401);
      }
      return c.json(await issueSession(sessions, result.learner.learnerRef, result.learner.displayName));
    })

    .delete("/session", auth, async (c) => {
      await sessions.revoke(c.get("tokenHash"));
      return c.json({ ok: true as const });
    })

    .get("/me", auth, async (c) => {
      const learner = await learners.get(c.get("learnerStateRef"));
      if (!learner) return c.json({ error: "unauthorized" as const }, 401);
      return c.json({ learnerStateRef: learner.learnerRef, displayName: learner.displayName });
    })

    .get("/journal", auth, async (c) => {
      return c.json(await getExpeditionJournal(
        { learnerStateRef: c.get("learnerStateRef") },
        {
          enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
          expeditionStore,
          studyItemStore: new PostgresStudyItemBankStore(sql),
          responseLog: new PostgresResponseLogStore(sql),
          lessonReadStore: new PostgresLessonReadStore(sql),
          layerPurposeStore: new PostgresEnrichmentLayerPurposeStore(sql),
          timelineRead: new PostgresOperationTimelineRead(sql)
        }
      ));
    })

    // Browse all is intentionally independent from the polled journal payload: it has no
    // timelines and is fetched only after the learner opens the catalog.
    .get("/catalog", auth, async (c) => {
      return c.json(await getExpeditionCatalog(
        { learnerStateRef: c.get("learnerStateRef") },
        { enrichmentRead: new PostgresEnrichmentInspectionRead(sql), expeditionStore }
      ));
    })

    .get("/leaderboard", auth, async (c) => {
      return c.json(await loadLeaderboard(sql, c.get("learnerStateRef")));
    })

    .get("/duel-setup", auth, async (c) => {
      const setup = await getDuelSetup(
        { learnerStateRef: c.get("learnerStateRef") },
        {
          expeditionStore,
          enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
          studyItemStore: new PostgresStudyItemBankStore(sql),
          conceptLessonStore: new PostgresConceptLessonStore(sql),
          responseLog: new PostgresResponseLogStore(sql),
          verdictStore: new PostgresCalibrationVerdictStore(sql),
          lessonReadStore: new PostgresLessonReadStore(sql)
        }
      );
      return c.json(setup);
    })

    .get("/expedition/:enrichmentId", auth, async (c) => {
      const enrichmentId = c.req.param("enrichmentId");
      const learnerStateRef = c.get("learnerStateRef");
      const [session, expedition] = await Promise.all([
        getStudySession({
          enrichmentId,
          learnerStateRef,
          enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
          studyItemStore: new PostgresStudyItemBankStore(sql),
          conceptLessonStore: new PostgresConceptLessonStore(sql),
          lessonReadStore: new PostgresLessonReadStore(sql),
          layerPurposeStore: new PostgresEnrichmentLayerPurposeStore(sql),
          responseLog: new PostgresResponseLogStore(sql),
          verdictStore: new PostgresCalibrationVerdictStore(sql),
          scaffoldStore: new PostgresLearnerScaffoldStore(sql)
        }),
        expeditionStore.getByEnrichment({ learnerStateRef, enrichmentId })
      ]);
      if (!session) return c.json({ error: "not_found" as const }, 404);
      return c.json({ session, expedition: expedition ?? null });
    })

    .post("/expedition/choose", auth, zValidator("json", z.object({
      enrichmentId: z.string(),
      title: z.string(),
      declaredDomain: z.string()
    })), async (c) => {
      const input = c.req.valid("json");
      const learnerStateRef = c.get("learnerStateRef");
      const existing = await expeditionStore.getByEnrichment({ learnerStateRef, enrichmentId: input.enrichmentId });
      await expeditionStore.upsert({
        learnerExpeditionId: existing?.learnerExpeditionId ?? randomUUID(),
        learnerStateRef,
        kind: "topic",
        title: input.title,
        declaredDomain: input.declaredDomain,
        status: "ready",
        enrichmentId: input.enrichmentId,
        active: true
      });
      return c.json({ ok: true as const });
    })

    .post("/expedition/activate", auth, zValidator("json", z.object({
      learnerExpeditionId: z.string(),
      enrichmentId: z.string().nullish()
    })), async (c) => {
      const input = c.req.valid("json");
      await expeditionStore.setActive({ learnerStateRef: c.get("learnerStateRef"), learnerExpeditionId: input.learnerExpeditionId });
      return c.json({ ok: true as const });
    })

    .post("/expedition/start", auth, zValidator("json", z.object({ topic: z.string().trim().min(1) })), async (c) => {
      await expeditionStore.upsert({
        learnerExpeditionId: randomUUID(),
        learnerStateRef: c.get("learnerStateRef"),
        kind: "topic",
        title: c.req.valid("json").topic,
        declaredDomain: null,
        status: "generating",
        active: true
      });
      wakeTopicGenerationSupervisor();
      return c.json({ ok: true as const });
    })

    .post("/expedition/retry", auth, zValidator("json", z.object({ learnerExpeditionId: z.string() })), async (c) => {
      await expeditionStore.resetGeneration({
        learnerStateRef: c.get("learnerStateRef"),
        learnerExpeditionId: c.req.valid("json").learnerExpeditionId
      });
      wakeTopicGenerationSupervisor();
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
        { expeditionStore, studyItemStore: new PostgresStudyItemBankStore(sql) }
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
      await recordLearnerVerdict({ learnerStateRef: c.get("learnerStateRef"), ...c.req.valid("json") }, verdictDeps());
      return c.json({ ok: true as const });
    })

    .post("/study/lesson-read", auth, zValidator("json", z.object({
      enrichmentId: z.string(),
      derivedNodeId: z.string()
    })), async (c) => {
      await recordLessonRead(
        { learnerStateRef: c.get("learnerStateRef"), ...c.req.valid("json") },
        {
          expeditionStore,
          enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
          lessonReadStore: new PostgresLessonReadStore(sql)
        }
      );
      return c.json({ ok: true as const });
    })

    // --- Learner-Scoped Scaffold Detours (plan 2026-07-12-002 U5) --------------------------
    // Request-or-restore a detour for an advertised term. The use-case verifies the active
    // expedition, the source block, parent membership, and the exact advertised term from
    // server-owned neutral content before upserting; a determinate create wakes the supervisor.
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
      if (!result.created) return c.json({ created: false as const, reason: result.refused }, 422);
      wakeScaffoldGenerationSupervisor();
      return c.json({ created: true as const, detourId: result.detourId, status: result.status });
    })

    // Retry a failed detour: reuse its identity, return it to generating, wake the supervisor.
    .post("/scaffold/retry", auth, zValidator("json", z.object({ detourId: z.string() })), async (c) => {
      const result = await retryLearnerScaffold(
        { learnerStateRef: c.get("learnerStateRef"), detourId: c.req.valid("json").detourId },
        { scaffoldStore: new PostgresLearnerScaffoldStore(sql) }
      );
      if (result.retried) wakeScaffoldGenerationSupervisor();
      return c.json({ retried: result.retried });
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
      const result = await gradeScaffoldOptionSelect(
        { learnerStateRef: c.get("learnerStateRef"), ...c.req.valid("json") },
        scaffoldGradeDeps()
      );
      if (!result.graded) return c.json<LearnerGradingResult>({ kind: "selection", graded: false, message: "This answer could not be recorded." });
      return c.json<LearnerGradingResult>({ kind: "selection", graded: true, chosenId: result.chosenId, keyedCorrectId: result.keyedCorrectId, correct: result.correct });
    })

    // Mark a generated Scaffold Step's micro-lesson read (R12).
    .post("/scaffold/lesson-read", auth, zValidator("json", z.object({ scaffoldStepId: z.string() })), async (c) => {
      const result = await recordScaffoldLessonRead(
        { learnerStateRef: c.get("learnerStateRef"), scaffoldStepId: c.req.valid("json").scaffoldStepId },
        { scaffoldStore: new PostgresLearnerScaffoldStore(sql) }
      );
      return c.json({ recorded: result.recorded });
    })

    // Grade one duel answer (KTD3): resolves the key server-side and returns correctness only —
    // it NEVER writes to the response log, so a duel cannot touch mastery state.
    .post("/duel/grade", auth, zValidator("json", z.object({
      studyItemId: z.string(),
      submission: duelSubmission
    })), async (c) => {
      const result = await gradeDuelAnswer(c.req.valid("json"), { studyItemStore: new PostgresStudyItemBankStore(sql) });
      return c.json(result);
    })

    // Record a durable `duel_win` award (R7/R8). `duelId` is the dedupe key, so a screen that
    // re-submits the same finished duel never double-awards. Losing never calls this.
    .post("/duel/win", auth, zValidator("json", z.object({ duelId: z.string().min(1) })), async (c) => {
      await new PostgresLearnerAwardsStore(sql).record({
        awardId: randomUUID(),
        learnerRef: c.get("learnerStateRef"),
        awardType: "duel_win",
        dedupeKey: c.req.valid("json").duelId,
        context: { at: new Date().toISOString() }
      });
      return c.json({ ok: true as const });
    });

  return app;
}

async function issueSession(sessions: PostgresLearnerSessionStore, learnerRef: string, displayName: string) {
  const token = mintSessionToken();
  await sessions.create({ tokenHash: hashSessionToken(token), learnerRef });
  return { token, learnerStateRef: learnerRef, displayName };
}

export type AppType = ReturnType<typeof createLearnerApp>;

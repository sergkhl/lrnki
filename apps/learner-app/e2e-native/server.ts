import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  loadQualifiedCatalogOrThrow,
  qualifiedExpeditionDocument,
  type LearnerActivityProjection
} from "@lrnki/learner-runtime/content-node";
import {
  createLearnerRuntime,
  MemoryLearnerStateStore,
  type LearnerCommand,
  type LearnerRuntime,
  type LearnerTransitionResult
} from "@lrnki/learner-runtime/runtime";

import { E2E_FIXTURE_EMAIL, E2E_FIXTURE_PASSWORD } from "../src/lib/e2eFixture";

// The native rig drives the real Expo APK against the real authored-content qualifier and learner
// runtime in memory. Only Better Auth's wire identity and Postgres are replaced. This keeps the
// Support/Guardian response shapes, grading, revisions, and command behavior owned by production
// code while remaining deterministic and isolated from every database.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const PORT = Number(process.env.NATIVE_FIXTURE_PORT ?? 8799);
const LEARNER_REF = "native-capture";
const EXPEDITION_KEY = "critical-thinking";
const SESSION_COOKIE = "better-auth.session_token";
const SESSION_TOKEN = "native-fixture-session-token";

const SESSION = {
  session: {
    id: "native-fixture-session",
    userId: LEARNER_REF,
    token: SESSION_TOKEN,
    expiresAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  user: {
    id: LEARNER_REF,
    name: "Native Capture",
    email: E2E_FIXTURE_EMAIL,
    emailVerified: false,
    image: null,
    profileComplete: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,cookie,expo-origin,x-skip-oauth-proxy"
};

type Fixture = Readonly<{
  runtime: LearnerRuntime;
  legChallengeId: string;
  expeditionChallengeId: string;
  firstStopKey: string;
  firstStopLabel: string;
  firstSectionKey: string;
  firstSectionTitle: string;
  firstSourceTitle: string;
  supportPathKey: string;
  supportStopLabel: string;
  supportSectionKey: string;
  supportSectionIndex: number;
  firstSectionCount: number;
  firstActivityKey: string;
  firstActivityAnswer: string;
  legTitles: readonly [string, string, string];
}>;

function transport(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, nested: unknown) =>
    typeof nested === "bigint" ? nested.toString() : nested
  ));
}

function send(res: ServerResponse, status: number, body: unknown, setCookie?: string): void {
  res.writeHead(status, {
    "content-type": "application/json",
    ...CORS,
    ...(setCookie ? { "set-cookie": setCookie } : {})
  });
  res.end(JSON.stringify(transport(body)));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

async function bootstrapFixture(): Promise<Fixture> {
  const catalog = await loadQualifiedCatalogOrThrow(resolve(repoRoot, "content"));
  const document = qualifiedExpeditionDocument(catalog, EXPEDITION_KEY);
  if (!document) throw new Error(`native fixture is missing ${EXPEDITION_KEY}`);
  const store = new MemoryLearnerStateStore([{ learnerRef: LEARNER_REF, displayName: "Native Capture" }]);
  const runtime = createLearnerRuntime({
    catalog,
    stateStore: store,
    now: (() => {
      let tick = 0;
      return () => new Date(Date.UTC(2026, 7, 31, 0, 0, tick++));
    })()
  });

  let requestSequence = 0;
  const dispatch = async (command: LearnerCommand): Promise<Extract<LearnerTransitionResult, { status: "applied" }>> => {
    const current = await store.read(LEARNER_REF);
    if (!current.found) throw new Error("native fixture learner disappeared");
    const result = await runtime.dispatch(LEARNER_REF, {
      requestId: `native-bootstrap-${++requestSequence}`,
      expectedStateVersion: current.stateVersion,
      command
    });
    if (result.status !== "applied") {
      throw new Error(`native bootstrap ${command.kind} was ${result.status}${result.status === "refused" ? `:${result.reason}` : ""}`);
    }
    return result;
  };

  await dispatch({ kind: "adopt_expedition", expeditionKey: EXPEDITION_KEY });
  await dispatch({ kind: "activate_expedition", expeditionKey: EXPEDITION_KEY });

  for (const leg of document.legs) {
    for (const stop of leg.stops) {
      await dispatch({ kind: "record_lesson_read", expeditionKey: EXPEDITION_KEY, stopKey: stop.key });
      const read = await runtime.read(LEARNER_REF, { kind: "expedition", expeditionKey: EXPEDITION_KEY });
      if (read.status !== "ok" || read.view.kind !== "expedition") {
        throw new Error(`native bootstrap could not project Stop ${stop.key}`);
      }
      const publicStop = read.view.expedition.legs
        .flatMap((candidate) => candidate.stops)
        .find((candidate) => candidate.key === stop.key);
      if (!publicStop) throw new Error(`native bootstrap projection lost Stop ${stop.key}`);
      for (const activity of stop.activities) {
        const projected = publicStop.activities.find((candidate) => candidate.key === activity.key);
        if (!projected) throw new Error(`native bootstrap projection lost Activity ${activity.key}`);
        if (activity.family === "option_select") {
          await dispatch({
            kind: "answer_option_select",
            expeditionKey: EXPEDITION_KEY,
            stopKey: stop.key,
            activityKey: activity.key,
            chosenOptionKey: activity.answerKey,
            source: { kind: "trail" }
          });
        } else if (activity.family === "impostor") {
          const answer = activity.statements.find((statement) => statement.kind === "impostor")?.key;
          if (!answer) throw new Error(`native bootstrap Activity ${activity.key} has no impostor`);
          await dispatch({
            kind: "answer_impostor",
            expeditionKey: EXPEDITION_KEY,
            stopKey: stop.key,
            activityKey: activity.key,
            chosenStatementKey: answer,
            source: { kind: "trail" }
          });
        } else {
          await dispatch({
            kind: "answer_matching",
            expeditionKey: EXPEDITION_KEY,
            stopKey: stop.key,
            activityKey: activity.key,
            matches: publicMatchingAnswers(activity.pairs, projected),
            source: { kind: "trail" }
          });
        }
      }
    }
  }

  const firstLeg = document.legs[0];
  const secondLeg = document.legs[1];
  const thirdLeg = document.legs[2];
  if (!firstLeg || !secondLeg || !thirdLeg) {
    throw new Error("native fixture Expedition must have exactly three Legs");
  }
  for (const leg of document.legs) {
    const challenge = await dispatch({
      kind: "create_guardian",
      expeditionKey: EXPEDITION_KEY,
      scope: { kind: "leg", legKey: leg.key }
    });
    if (!challenge.effect.challengeId) {
      throw new Error(`native bootstrap Leg Guardian ${leg.key} has no id`);
    }
    await winGuardian(runtime, store, document, challenge.effect.challengeId, dispatch);
  }

  const rematch = await dispatch({
    kind: "create_guardian",
    expeditionKey: EXPEDITION_KEY,
    scope: { kind: "leg", legKey: firstLeg.key }
  });
  const summit = await dispatch({
    kind: "create_guardian",
    expeditionKey: EXPEDITION_KEY,
    scope: { kind: "expedition" }
  });
  if (!rematch.effect.challengeId || !summit.effect.challengeId) {
    throw new Error("native bootstrap Guardian identity missing");
  }
  const firstStop = firstLeg.stops[0];
  const firstSection = firstStop?.lesson.sections[0];
  const firstCreditKey = firstSection?.sourceCreditKeys[0];
  const firstSource = document.sourceCredits.find((credit) => credit.key === firstCreditKey);
  const firstSupport = document.legs
    .flatMap((leg) => leg.stops)
    .flatMap((stop) => stop.supportPaths.map(path => ({ stop, path })))
    .at(0);
  if (!firstStop || !firstSection || !firstSource || !firstSupport) {
    throw new Error("native fixture lacks its representative Stop, source credit, or Support Path");
  }
  const supportSectionIndex = firstSupport.stop.lesson.sections.findIndex(section =>
    section.explorableTerms.some(term => term.supportPathKey === firstSupport.path.key));
  const firstActivity = firstStop.activities[0];
  if (supportSectionIndex < 0 || firstActivity?.family !== "option_select") {
    throw new Error("native representative theory or first selection question is unavailable");
  }
  const firstAnswer = firstActivity.options.find(option => option.key === firstActivity.answerKey);
  if (!firstAnswer) throw new Error("native first question has no authored answer");
  return {
    runtime,
    legChallengeId: rematch.effect.challengeId,
    expeditionChallengeId: summit.effect.challengeId,
    firstStopKey: firstStop.key,
    firstStopLabel: firstStop.label,
    firstSectionKey: firstSection.key,
    firstSectionTitle: firstSection.title,
    firstSourceTitle: firstSource.title,
    supportPathKey: firstSupport.path.key,
    supportStopLabel: firstSupport.stop.label,
    supportSectionKey: firstSupport.stop.lesson.sections[supportSectionIndex]!.key,
    supportSectionIndex,
    firstSectionCount: firstStop.lesson.sections.length,
    firstActivityKey: firstActivity.key,
    firstActivityAnswer: firstAnswer.text,
    legTitles: [firstLeg.title, secondLeg.title, thirdLeg.title]
  };
}

function publicMatchingAnswers(
  pairs: ReadonlyArray<Readonly<{ left: string; right: string }>>,
  projected: LearnerActivityProjection
): Array<{ leftKey: string; rightKey: string }> {
  if (projected.family !== "matching") throw new Error("matching Activity projection changed family");
  return pairs.map((pair) => {
    const left = projected.left.find((entry) => entry.text === pair.left);
    const right = projected.right.find((entry) => entry.text === pair.right);
    if (!left || !right) throw new Error("matching Activity projection lost an authored pair");
    return { leftKey: left.key, rightKey: right.key };
  });
}

async function winGuardian(
  runtime: LearnerRuntime,
  store: MemoryLearnerStateStore,
  document: NonNullable<ReturnType<typeof qualifiedExpeditionDocument>>,
  challengeId: string,
  dispatch: (command: LearnerCommand) => Promise<Extract<LearnerTransitionResult, { status: "applied" }>>
): Promise<void> {
  for (;;) {
    const read = await runtime.read(LEARNER_REF, {
      kind: "guardian",
      expeditionKey: EXPEDITION_KEY,
      challengeId
    });
    if (read.status !== "ok" || read.view.kind !== "guardian") {
      throw new Error(`native bootstrap could not read Guardian ${challengeId}`);
    }
    if (read.view.state === "won") return;
    const projected = read.view.currentActivity;
    const authored = document.legs
      .flatMap((leg) => leg.stops)
      .flatMap((stop) => stop.activities)
      .find((activity) => activity.key === projected.key);
    if (!authored) throw new Error(`native bootstrap lost Guardian Activity ${projected.key}`);
    if (authored.family === "option_select") {
      await dispatch({
        kind: "answer_guardian_selection",
        expeditionKey: EXPEDITION_KEY,
        challengeId,
        activityKey: authored.key,
        chosenKey: authored.answerKey
      });
    } else if (authored.family === "impostor") {
      const chosenKey = authored.statements.find((statement) => statement.kind === "impostor")?.key;
      if (!chosenKey) throw new Error(`native bootstrap Guardian Activity ${authored.key} has no impostor`);
      await dispatch({
        kind: "answer_guardian_selection",
        expeditionKey: EXPEDITION_KEY,
        challengeId,
        activityKey: authored.key,
        chosenKey
      });
    } else {
      for (const pair of publicMatchingAnswers(authored.pairs, projected)) {
        await dispatch({
          kind: "answer_guardian_matching_pair",
          expeditionKey: EXPEDITION_KEY,
          challengeId,
          activityKey: authored.key,
          ...pair
        });
      }
    }
    const current = await store.read(LEARNER_REF);
    if (!current.found) throw new Error("native fixture learner disappeared during Guardian bootstrap");
  }
}

async function main(): Promise<void> {
const fixture = await bootstrapFixture();

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const pathname = new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname;
  if (method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (method === "POST" && pathname === "/auth/sign-in/email") {
    const body = (await readBody(req)) as { email?: string; password?: string } | undefined;
    if (body?.email !== E2E_FIXTURE_EMAIL || body?.password !== E2E_FIXTURE_PASSWORD) {
      return send(res, 401, { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" });
    }
    return send(
      res,
      200,
      { redirect: false, token: SESSION_TOKEN, user: SESSION.user },
      `${SESSION_COOKIE}=${SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
    );
  }
  if (method === "GET" && pathname === "/auth/get-session") {
    return send(res, 200, (req.headers.cookie ?? "").includes(SESSION_COOKIE) ? SESSION : null);
  }
  if (method === "GET" && pathname === "/health") return send(res, 200, { ok: true });
  if (method === "GET" && pathname === "/fixture") {
    return send(res, 200, {
      expeditionKey: EXPEDITION_KEY,
      legChallengeId: fixture.legChallengeId,
      expeditionChallengeId: fixture.expeditionChallengeId,
      firstStopKey: fixture.firstStopKey,
      firstStopLabel: fixture.firstStopLabel,
      firstSectionKey: fixture.firstSectionKey,
      firstSectionTitle: fixture.firstSectionTitle,
      firstSourceTitle: fixture.firstSourceTitle,
      supportPathKey: fixture.supportPathKey,
      supportStopLabel: fixture.supportStopLabel,
      supportSectionKey: fixture.supportSectionKey,
      supportSectionIndex: fixture.supportSectionIndex,
      firstSectionCount: fixture.firstSectionCount,
      firstActivityKey: fixture.firstActivityKey,
      firstActivityAnswer: fixture.firstActivityAnswer,
      legTitles: fixture.legTitles
    });
  }
  if (method === "GET" && pathname === "/journal") {
    return send(res, 200, await fixture.runtime.read(LEARNER_REF, { kind: "journal" }));
  }
  if (method === "GET" && pathname === "/catalog") {
    return send(res, 200, await fixture.runtime.read(LEARNER_REF, { kind: "catalog" }));
  }
  if (method === "GET" && pathname === "/leaderboard") {
    return send(res, 200, await fixture.runtime.read(LEARNER_REF, { kind: "leaderboard" }));
  }
  if (method === "GET" && pathname.startsWith("/expedition/")) {
    const expeditionKey = decodeURIComponent(pathname.slice("/expedition/".length));
    return send(res, 200, await fixture.runtime.read(LEARNER_REF, { kind: "expedition", expeditionKey }));
  }
  if (method === "GET" && pathname.startsWith("/guardian/")) {
    const [, , expeditionKey, challengeId] = pathname.split("/");
    if (!expeditionKey || !challengeId) return send(res, 404, { error: "not_found" });
    return send(res, 200, await fixture.runtime.read(LEARNER_REF, {
      kind: "guardian",
      expeditionKey: decodeURIComponent(expeditionKey),
      challengeId: decodeURIComponent(challengeId)
    }));
  }
  if (method === "POST" && pathname === "/game/commands") {
    const body = (await readBody(req)) as {
      requestId?: string;
      expectedStateVersion?: string;
      command?: LearnerCommand;
    } | undefined;
    if (!body?.requestId || !/^\d+$/.test(body.expectedStateVersion ?? "") || !body.command) {
      return send(res, 400, { error: "bad_request" });
    }
    return send(res, 200, await fixture.runtime.dispatch(LEARNER_REF, {
      requestId: body.requestId,
      expectedStateVersion: BigInt(body.expectedStateVersion!),
      command: body.command
    }));
  }

  await readBody(req);
  return send(res, 404, { error: "not_found", method, pathname });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[native-fixture] authored runtime on http://127.0.0.1:${PORT}; Android connects through ADB reverse`);
});

const shutdown = (): void => {
  console.log("[native-fixture] shutting down");
  server.close(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

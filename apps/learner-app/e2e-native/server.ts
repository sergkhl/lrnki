import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { answerGuardianSelection, applyGuardianLifecycle, guardianView } from "./guardianFixture";

// Deterministic loopback fixture server for the native Maestro gate (plan 2026-07-15-001 U5, R15-R16).
// It serves REAL learner-api response SHAPES — captured once from the supervisor-free API over a
// genuine production enrichment ("Vesicular transport", Cell Biology: a 12-lesson expedition with a
// long Theory activity and available Explorable Terms) and frozen under `scenario/`. The purpose of
// the native gate is Android layout, touch scrolling, Support Path dialog reachability, and Crystal
// Guardian obelisk rendering, so the upstream data is deterministic here while the APK and UI are
// real; the separate real-use WEB suite owns live backend integration. This binds to host loopback
// ONLY; the Android emulator reaches it through the `10.0.2.2` host alias. It is never pointed at
// production or the real-use database.
//
// Session reads replay those frozen captures. The Guardian challenge is the one stateful surface,
// because the ward states this gate exists to look at are only reachable by answering — and its
// combat rules come from the production fold, not from this file (see `guardianFixture.ts`).
//
// Identity is faked at the WIRE level, not stubbed in the app: the flow drives the real sign-in
// UI, the real `authClient`, and the real `@better-auth/expo` SecureStore mirror, and this server
// answers with the response shapes and `Set-Cookie` a real Better Auth would. So a break in the
// app's cookie handling still fails here; only the identity authority behind it is deterministic.

const here = dirname(fileURLToPath(import.meta.url));
const scenario = (name: string): unknown => JSON.parse(readFileSync(join(here, "scenario", `${name}.json`), "utf8"));

const SESSION = scenario("session");
const JOURNAL = scenario("journal");
const CATALOG = scenario("catalog");
const EXPEDITION = scenario("expedition");
const LEADERBOARD = scenario("leaderboard");

// Ephemeral fixture login, injected by the runner (never committed to flow YAML). The server
// accepts exactly this address/password on Better Auth's credential sign-in route and answers with
// a session cookie; every authed read is then served regardless of cookie value (the fixture
// models one pre-existing learner, whose frozen journal a fresh sign-up could not plausibly have).
const FIXTURE_EMAIL = process.env.NATIVE_FIXTURE_EMAIL ?? "native-fixture@fixture.invalid";
const FIXTURE_PASSWORD = process.env.NATIVE_FIXTURE_PASSWORD ?? "native-fixture-password";
const PORT = Number(process.env.NATIVE_FIXTURE_PORT ?? 8799);

// `@better-auth/expo` only persists a `Set-Cookie` whose name carries the default `better-auth`
// prefix and a `session_token`/`session_data` suffix — anything else is dropped silently and the
// app returns to the gate with no error to read. No `Secure` flag: the emulator reaches this over
// cleartext http, which is also how the real API behaves when its base URL is http.
const SESSION_COOKIE = "better-auth.session_token";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,cookie,expo-origin,x-skip-oauth-proxy"
};

function send(res: ServerResponse, status: number, body: unknown, setCookie?: string): void {
  res.writeHead(status, {
    "content-type": "application/json",
    ...CORS,
    ...(setCookie ? { "set-cookie": setCookie } : {})
  });
  res.end(JSON.stringify(body));
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

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const pathname = new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname;

  if (method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // Identity: Better Auth's credential sign-in, the one route any rig drives (ADR-0041). Accept
  // exactly the injected address/password and hand back the session cookie the Expo plugin
  // mirrors into SecureStore. Google is never involved — no rig automates a consent screen.
  if (method === "POST" && pathname === "/auth/sign-in/email") {
    const body = (await readBody(req)) as { email?: string; password?: string } | undefined;
    if (body?.email !== FIXTURE_EMAIL || body?.password !== FIXTURE_PASSWORD) {
      return send(res, 401, { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" });
    }
    const { session, user } = SESSION as { session: { token: string }; user: unknown };
    return send(res, 200, { redirect: false, token: session.token, user }, `${SESSION_COOKIE}=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
  }

  // The session read answers 200-with-null when the app carries no cookie, which is what makes
  // `launchApp: clearState: true` land on the sign-in gate rather than straight in the Journal.
  // Any cookie value is then accepted: the fixture models exactly one learner.
  if (method === "GET" && pathname === "/auth/get-session") {
    const signedIn = (req.headers.cookie ?? "").includes(SESSION_COOKIE);
    return send(res, 200, signedIn ? SESSION : null);
  }

  if (method === "GET" && pathname === "/health") return send(res, 200, { ok: true });
  if (method === "GET" && pathname === "/journal") return send(res, 200, JOURNAL);
  if (method === "GET" && pathname === "/catalog") return send(res, 200, CATALOG);
  if (method === "GET" && pathname === "/leaderboard") return send(res, 200, LEADERBOARD);
  // The long-Theory session is served for any expedition id the flow opens (the fixture models one).
  if (method === "GET" && pathname.startsWith("/expedition/")) return send(res, 200, EXPEDITION);

  // --- Crystal Guardian (ADR-0038 / Ward Obelisk plan U4). The ONLY stateful part of this
  // fixture: a five-ward Leg challenge whose combat state is folded by the production pure
  // functions, so the native gate can reach entry, partial, miss, Last Stand, and Final Ward on a
  // real APK. See `guardianFixture.ts`. ------------------------------------------------------
  if (method === "GET" && pathname.startsWith("/challenge/")) {
    const view = guardianView(pathname.slice("/challenge/".length));
    if (view) return send(res, 200, { view });
  }

  if (method === "POST" && pathname === "/challenge/answer") {
    const body = (await readBody(req)) as
      | { challengeId?: string; attemptRef?: string; studyItemId?: string; chosenId?: string; responseDurationMs?: number }
      | undefined;
    if (!body?.challengeId || !body.attemptRef || !body.studyItemId || !body.chosenId) return send(res, 400, { error: "bad_request" });
    const result = answerGuardianSelection({
      challengeId: body.challengeId,
      attemptRef: body.attemptRef,
      studyItemId: body.studyItemId,
      chosenId: body.chosenId,
      responseDurationMs: body.responseDurationMs ?? null
    });
    return send(res, result.answered ? 200 : 409, result);
  }

  if (method === "POST" && (pathname === "/challenge/retreat" || pathname === "/challenge/resume" || pathname === "/challenge/abandon")) {
    const body = (await readBody(req)) as { challengeId?: string; operationRef?: string } | undefined;
    if (!body?.challengeId || !body.operationRef) return send(res, 400, { error: "bad_request" });
    const kind = pathname.slice("/challenge/".length) as "retreat" | "resume" | "abandon";
    const result = applyGuardianLifecycle({ kind, challengeId: body.challengeId, operationRef: body.operationRef });
    return send(res, result.applied ? 200 : 404, result);
  }

  // Non-graded writes the flow may issue while traversing Theory. Deterministic acks; these leave
  // the frozen session untouched, so a re-read returns the same session.
  if (method === "POST" && (pathname === "/study/lesson-read" || pathname === "/expedition/choose" || pathname === "/expedition/activate")) {
    await readBody(req);
    return send(res, 200, { ok: true });
  }

  await readBody(req);
  send(res, 404, { error: "not_found", method, pathname });
});

// Loopback bind (R15/security): reachable from the emulator via 10.0.2.2, never on a public iface.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`[native-fixture] serving learner-api shapes on http://127.0.0.1:${PORT} (emulator: http://10.0.2.2:${PORT})`);
});

const shutdown = (): void => {
  console.log("[native-fixture] shutting down");
  server.close(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

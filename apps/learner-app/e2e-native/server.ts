import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Deterministic loopback fixture server for the native Maestro gate (plan 2026-07-15-001 U5, R15-R16).
// It serves REAL learner-api response SHAPES — captured once from the supervisor-free API over a
// genuine production enrichment ("Vesicular transport", Cell Biology: a 12-lesson expedition with a
// long Theory activity and available Explorable Terms) and frozen under `scenario/`. The purpose of
// the native gate is Android layout, touch scrolling, and Support Path dialog reachability, so the
// upstream data is deterministic here while the APK and UI are real; the separate real-use WEB suite
// owns live backend integration. This binds to host loopback ONLY; the Android emulator reaches it
// through the `10.0.2.2` host alias. It is never pointed at production or the real-use database.

const here = dirname(fileURLToPath(import.meta.url));
const scenario = (name: string): unknown => JSON.parse(readFileSync(join(here, "scenario", `${name}.json`), "utf8"));

const ME = scenario("me");
const JOURNAL = scenario("journal");
const CATALOG = scenario("catalog");
const EXPEDITION = scenario("expedition");
const LEADERBOARD = scenario("leaderboard");

// Ephemeral fixture login, injected by the runner (never committed to flow YAML). The server
// accepts exactly this ref/pin on POST /session and returns an opaque token; every authed read is
// then served regardless of token value (the fixture models one learner).
const FIXTURE_REF = process.env.NATIVE_FIXTURE_REF ?? "native-fixture";
const FIXTURE_PIN = process.env.NATIVE_FIXTURE_PIN ?? "0000";
const PORT = Number(process.env.NATIVE_FIXTURE_PORT ?? 8799);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "authorization,content-type"
};

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", ...CORS });
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

  // Registry entry: the flow's runner-generated fixture login. Accept exactly the injected values.
  if (method === "POST" && pathname === "/session") {
    const body = (await readBody(req)) as { learnerStateRef?: string; pin?: string; displayName?: string } | undefined;
    if (!body || body.pin !== FIXTURE_PIN) return send(res, 401, { error: "unauthorized" });
    return send(res, 200, { token: "native-fixture-token", learnerStateRef: body.learnerStateRef ?? FIXTURE_REF, displayName: body.displayName ?? body.learnerStateRef ?? FIXTURE_REF });
  }

  if (method === "GET" && pathname === "/health") return send(res, 200, { ok: true });
  if (method === "GET" && pathname === "/me") return send(res, 200, ME);
  if (method === "GET" && pathname === "/journal") return send(res, 200, JOURNAL);
  if (method === "GET" && pathname === "/catalog") return send(res, 200, CATALOG);
  if (method === "GET" && pathname === "/leaderboard") return send(res, 200, LEADERBOARD);
  // The long-Theory session is served for any expedition id the flow opens (the fixture models one).
  if (method === "GET" && pathname.startsWith("/expedition/")) return send(res, 200, EXPEDITION);

  // Non-graded writes the flow may issue while traversing Theory. Deterministic acks; the fixture
  // holds no mutable state, so a re-read returns the same session.
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

import { test as base, expect, type Page, type Route } from "@playwright/test";

// Deterministic fixtures and typed-API interception for the learner web gate (plan
// 2026-07-14-001 U5, KTD8). The export is baked against the sentinel origin below; every call
// to it is fulfilled here, so a scenario controls exactly which of the pending/error/data
// branches each route sees. Response SHAPES mirror the learner-api projections (journal rows,
// candidate cards, session/me identity) so the real bundle renders as it would in production.

export const API_ORIGIN = process.env.E2E_API_ORIGIN ?? "http://127.0.0.1:8788";
export const TOKEN_KEY = "lrnki_learner_token";

export type Reply = { status: number; body: unknown };
export const ok = (body: unknown): Reply => ({ status: 200, body });
export const status = (code: number, body: unknown = { error: "error" }): Reply => ({ status: code, body });

// A per-endpoint handler receives the intercepted request and returns a reply. Returning a
// promise lets a scenario inject latency to exercise the visible loading states.
export type Handler = (ctx: { method: string; pathname: string; postData: unknown }) => Reply | Promise<Reply>;

export type MockState = {
  handlers: Partial<Record<string, Handler>>;
  // Requests that reached the API origin with no matching handler — asserted empty so a
  // forgotten mock surfaces as a test failure rather than a stray production call.
  unmatched: string[];
};

// ---- Fixture data -----------------------------------------------------------------------

export const identity = { learnerStateRef: "gate-explorer", displayName: "Gate Explorer" };

export const sessionSuccess = { token: "e2e-session-token", ...identity };

export const journalPopulated = {
  started: [
    {
      status: "ready" as const,
      learnerExpeditionId: "lex-started",
      title: "Continental drift",
      declaredDomain: "Geology",
      enrichmentId: "enr-started",
      active: true,
      progress: { itemsPassed: 3, itemsAttempted: 5, lessonsRead: 2, itemsTotal: 10 },
      layerPurpose: "Read plate boundaries from the rock record."
    }
  ],
  yours: [
    {
      status: "ready" as const,
      learnerExpeditionId: "lex-ready",
      title: "Cell membranes",
      declaredDomain: "Biology",
      enrichmentId: "enr-ready",
      active: false,
      progress: { itemsPassed: 0, itemsAttempted: 0, lessonsRead: 0, itemsTotal: 8 },
      layerPurpose: null
    },
    {
      status: "generating" as const,
      learnerExpeditionId: "lex-generating",
      title: "Ocean currents",
      declaredDomain: null,
      failureMessage: null,
      generation: {
        queued: false,
        stalled: false,
        completed: 4,
        total: 14,
        fraction: 4 / 14,
        indeterminate: false,
        currentStage: "study-item-generation"
      }
    }
  ],
  shared: [
    { enrichmentId: "enr-shared-1", title: "Tectonic plates", declaredDomain: "Geology", totalStopCount: 7, searchTerms: ["plate", "tectonics"] },
    { enrichmentId: "enr-shared-2", title: "Photosynthesis", declaredDomain: "Biology", totalStopCount: 5, searchTerms: ["photosynthesis", "carbon fixation"] }
  ]
};

export const catalogPopulated = {
  candidates: journalPopulated.shared
};

export const leaderboardFixture = {
  // The board is optional in the journal UI (rendered only when present). Keep it minimal.
  weekLabel: "This week",
  cohort: [],
  self: null
};

// ---- Interception -----------------------------------------------------------------------

export const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// A handler that fails the first `n` calls with 500, then succeeds — the failed-then-recover
// shape behind AE2/AE3.
export function failThenSucceed(failures: number, success: Reply, failure: Reply = status(500)): Handler {
  let seen = 0;
  return () => (seen++ < failures ? failure : success);
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "authorization,content-type"
};

async function installMock(page: Page, state: MockState): Promise<void> {
  await page.route(
    (url) => url.href.startsWith(API_ORIGIN),
    async (route: Route) => {
      const request = route.request();
      const method = request.method();
      // Web and API live on different origins (Pages ↔ VPS in production), so an authenticated
      // GET or a JSON POST is a non-simple CORS request and the browser preflights it. Answer
      // the preflight here or the real request never fires.
      if (method === "OPTIONS") {
        await route.fulfill({ status: 204, headers: CORS_HEADERS, body: "" });
        return;
      }
      const pathname = new URL(request.url()).pathname;
      const key = matchKey(method, pathname, state.handlers);
      if (!key) {
        state.unmatched.push(`${method} ${pathname}`);
        await route.fulfill({ status: 500, headers: CORS_HEADERS, contentType: "application/json", body: JSON.stringify({ error: "unmocked" }) });
        return;
      }
      let postData: unknown = undefined;
      try {
        postData = request.postDataJSON();
      } catch {
        postData = undefined;
      }
      const reply = await state.handlers[key]!({ method, pathname, postData });
      await route.fulfill({
        status: reply.status,
        contentType: "application/json",
        headers: CORS_HEADERS,
        body: JSON.stringify(reply.body)
      });
    }
  );
}

// Match "METHOD /path" against registered keys, supporting a trailing `/*` wildcard for the
// dynamic `/expedition/:id` and `/challenge/:id` reads.
function matchKey(method: string, pathname: string, handlers: MockState["handlers"]): string | undefined {
  const exact = `${method} ${pathname}`;
  if (handlers[exact]) return exact;
  for (const key of Object.keys(handlers)) {
    const [m, pattern] = key.split(" ");
    if (m !== method || !pattern.endsWith("/*")) continue;
    const base = pattern.slice(0, -1); // keep trailing slash
    if (pathname.startsWith(base)) return key;
  }
  return undefined;
}

// Seed a stored token before the app boots, so scenarios can start signed-in or with a stale
// credential. Runs as an init script (before any app JS), which is where the token mirror reads.
export async function seedToken(page: Page, token: string | null): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    },
    [TOKEN_KEY, token] as const
  );
}

export async function readStoredToken(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), TOKEN_KEY);
}

// ---- Test fixture: mock + console-error guard -------------------------------------------

type Fixtures = {
  mock: MockState;
  pageErrors: string[];
};

export const test = base.extend<Fixtures>({
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });
    await use(errors);
  },
  mock: async ({ page }, use) => {
    const state: MockState = { handlers: {}, unmatched: [] };
    await installMock(page, state);
    await use(state);
    // No unmocked API call slipped through to (a non-existent) production backend.
    expect(state.unmatched, `unmocked API calls: ${state.unmatched.join(", ")}`).toEqual([]);
  }
});

export { expect };

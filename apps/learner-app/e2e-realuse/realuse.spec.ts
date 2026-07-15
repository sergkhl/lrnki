import { test, expect, type Page } from "@playwright/test";

// REAL-USE gate (seed: plan 2026-07-14-001 U6). Drives the production Expo web export served
// locally, baked against a REAL learner-api over Postgres + production LiteLLM. NOTHING is
// intercepted — every state below is a real backend response. This proves the shipped web
// behavior under real transport, DISTINCT from the committed deterministic suite in `e2e/`
// (which mocks the API and runs inside `pnpm check`). This suite is opt-in: it needs live
// services and is NOT part of `pnpm check`. See README.md in this directory for standup.
//
// Real-backend state sources (verify by curl if they drift):
//   /me + garbage token       -> real 401  (stale-token clear -> gate)
//   /expedition/<random-uuid> -> real 404  (unavailable route state)
//   /guardian/<random-uuid>   -> real 404  (Guardian "fight is over" unavailable state)
//   /guardian/not-a-uuid      -> real 500  (Guardian error state + Retry)
//
// Required env: U6_EXPLORER + U6_PIN (a real, pre-seeded learner with a populated journal).
// Optional env: U6_EVIDENCE_DIR (screenshots), U6_CATALOG_MATCH (a catalog card substring),
//               U6_RUNID (a stable per-run suffix for the disposable signup name).

const EXPLORER = process.env.U6_EXPLORER ?? "";
const PIN = process.env.U6_PIN ?? "";
const TOKEN_KEY = "lrnki_learner_token";
// Screenshots land in a gitignored tmp dir by default.
const EVID = process.env.U6_EVIDENCE_DIR ?? "tmp/realuse-screenshots";
// Every catalog card renders "Expedition: <title>", so this substring proves a real candidate
// rendered without pinning an environment-specific title. Override to assert a known expedition.
const CATALOG_MATCH = process.env.U6_CATALOG_MATCH ?? "Expedition:";

test.beforeAll(() => {
  if (!EXPLORER || !PIN) {
    throw new Error("Set U6_EXPLORER and U6_PIN to a real seeded learner (see e2e-realuse/README.md).");
  }
});

// Copy tolerant of the typographic apostrophe (U+2019) in the learner vocabulary.
const re = (s: string) => new RegExp(s.replace(/['’]/g, "."));
const GATE = re("Choose your explorer");
const JOURNAL = re("Choose an expedition");

const errors: string[] = [];
// Several scenarios INTENTIONALLY drive real 401/404/500 backend responses (stale-token /me,
// failed Enter, unavailable/error routes). A real HTTP error status makes the browser emit a
// "Failed to load resource: the server responded with a status of N" console error — that is
// the browser reporting a network status, NOT a JS runtime fault. Ignore exactly those; every
// other pageerror / console.error (uncaught exceptions, React errors, CORS failures) still fails
// the test. This is the real-backend analogue of the mocked suite's console guard.
const EXPECTED_STATUS_NOISE = /Failed to load resource: the server responded with a status of (401|404|500)/;
test.beforeEach(({ page }) => {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !EXPECTED_STATUS_NOISE.test(m.text())) errors.push(`console.error: ${m.text()}`);
  });
});
test.afterEach(() => {
  expect(errors, `unexpected runtime errors:\n${errors.join("\n")}`).toEqual([]);
  errors.length = 0;
});

async function seedToken(page: Page, value: string | null): Promise<void> {
  await page.addInitScript(
    ([k, v]) => (v === null ? window.localStorage.removeItem(k) : window.localStorage.setItem(k, v)),
    [TOKEN_KEY, value] as const
  );
}
const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `${EVID}/${project}-${name}.png`, fullPage: true });

// Sign in through the real registry gate as the pre-seeded populated learner.
async function signInReal(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText(GATE)).toBeVisible();
  await page.getByLabel("Explorer name").fill(EXPLORER);
  await page.getByLabel("PIN").fill(PIN);
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByText(JOURNAL)).toBeVisible();
}

// AE1 (R1-R2): a stale token is rejected by a REAL /me 401, a failed Enter does not block a
// later successful signup, and Set out reaches the real Journal with no reload.
test("AE1 real: stale token -> failed Enter -> successful Set out reaches the real Journal", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  // Unique per run: AE1's failed Enter relies on the name being UNREGISTERED, and Set out
  // persists a durable learner row. A run-scoped suffix keeps the failed-Enter precondition
  // true across reruns; clean up all `gate-u6-signup%` rows afterward (cleanup-learner.sh).
  const runId = process.env.U6_RUNID ?? String(Date.now());
  const signupName = `gate-u6-signup-${project}-${runId}`;
  const signupPin = "4242";

  await seedToken(page, "stale-garbage-token");
  await page.goto("/");

  // Real /me 401 clears the bad credential; the gate is the stable signed-out state (R3).
  await expect(page.getByText(GATE)).toBeVisible();
  expect(await page.evaluate((k) => window.localStorage.getItem(k), TOKEN_KEY)).toBeNull();

  await page.getByLabel("Explorer name").fill(signupName);
  await page.getByLabel("PIN").fill(signupPin);

  // Enter on an unregistered name is a REAL 401 refusal; the gate stays and shows an error,
  // but must not block the following signup (R2).
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.locator('[aria-live="polite"]')).toBeVisible();
  await expect(page.getByText(GATE)).toBeVisible();
  await shot(page, "AE1-failed-enter", project);

  // Set out registers the learner for real; the returned identity seeds `me` directly, so the
  // observer flips to the Journal — no reload, no bounce to the gate (R1, KTD1/KTD2).
  await page.getByRole("button", { name: "Set out" }).click();
  await expect(page.getByText(JOURNAL)).toBeVisible();
  await expect(page.getByText(GATE)).toHaveCount(0);
  expect(await page.evaluate((k) => window.localStorage.getItem(k), TOKEN_KEY)).toBeTruthy();
  await shot(page, "AE1-journal-after-signup", project);
});

// AE3 (R6): every query-driven route renders an explicit, non-blank state. These are REAL 404/500
// backend responses, proving unavailable and error tones are distinct and recoverable.
test("AE3 real: expedition unavailable, Guardian unavailable, and Guardian error render explicit states", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await signInReal(page);

  // Real 404 -> unavailable (distinct from a transport error and from a blank frame).
  await page.goto("/expedition/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText(re("This expedition isn't available."))).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to trail" })).toBeVisible();
  await shot(page, "AE3-expedition-unavailable", project);

  // Real 404 -> Guardian "fight is over" unavailable state.
  await page.goto("/guardian/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText(re("This fight is over"))).toBeVisible();
  await shot(page, "AE3-guardian-unavailable", project);

  // Real 500 (non-uuid id hits the store) -> Guardian error tone with Retry.
  await page.goto("/guardian/not-a-uuid");
  await expect(page.getByText(re("The Guardian is out of reach right now."))).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await shot(page, "AE3-guardian-error", project);
});

// AE3 (Catalog) real: the Browse route loads real candidates (loading -> data, never blank).
test("AE3 real: Catalog renders real candidates", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await signInReal(page);
  await page.goto("/catalog");
  // A real shared, beginnable expedition from the catalog projection.
  await expect(page.getByText(re(CATALOG_MATCH)).first()).toBeVisible();
  await shot(page, "AE3-catalog-data", project);
});

// AE6 (R11-R12): opening the planning sheet over a REAL populated Journal places one scrim above
// the whole page; hit-testing over a journal control resolves into the modal layer, and the page
// beneath cannot be interacted with. Scrim press dismisses without activating an underlying control.
test("AE6 real: planning sheet scrim covers and disables the real populated Journal", async ({ page }, testInfo) => {
  const project = testInfo.project.name;
  await signInReal(page);
  await shot(page, "AE6-journal-populated", project);

  // The top-right Menu control is anchored above the sheet content, so the SCRIM (not the drawer
  // body) sits over it once open — the clean point that proves both coverage and inertness.
  const menu = page.getByRole("button", { name: "Menu" });
  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;

  const before = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest("[data-vaul-overlay],[data-vaul-drawer]") != null,
    [cx, cy]
  );
  expect(before).toBe(false);

  await page.getByRole("button", { name: "Plan a new expedition" }).click();
  await expect(page.getByLabel("Topic", { exact: true })).toBeVisible();
  await shot(page, "AE6-sheet-open", project);

  const overlay = page.locator("[data-vaul-overlay]");
  await expect(overlay).toBeVisible();
  const ob = await overlay.boundingBox();
  const vp = page.viewportSize()!;
  expect(ob!.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(ob!.height).toBeGreaterThanOrEqual(vp.height - 1);

  // Hit-testing over the now-covered Menu resolves into the modal layer, not the Menu button.
  const covered = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el != null && el.closest("[data-vaul-overlay],[data-vaul-drawer]") != null;
    },
    [cx, cy]
  );
  expect(covered).toBe(true);

  // Clicking that point hits the scrim -> the sheet dismisses, the Menu never opens, URL unchanged.
  const url = page.url();
  await page.mouse.click(cx, cy);
  await expect(page.getByLabel("Topic", { exact: true })).toBeHidden();
  expect(page.url()).toBe(url);
});

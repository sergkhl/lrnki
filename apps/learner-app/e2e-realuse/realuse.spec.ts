import { test, expect, type Page } from "@playwright/test";

// The ONE durable real-backend integration journey (plan 2026-07-15-001 U3). It runs against the
// production Expo export served locally, driven by a REAL supervisor-free learner-api over Postgres
// — NOTHING is intercepted. It is project-parameterized: the phone project also exercises real
// stale-token/failed-entry auth recovery (R10-R11); both projects then run the same persisted spine
// (choose a shared enrichment → open the Study Session → submit one auto-graded selection → return
// to the Journal → reload → see it in `Continue`). Route-error/scrim matrices stay in the
// intercepted `e2e/` suite. The runner (`run.ts`) owns the environment; run via `pnpm e2e:web:realuse`.
//
// Assertions use roles, accessibility names, and a minimal set of app-owned semantic test IDs. They
// consume the runtime-selected enrichment id/title but NEVER assert generated prose, answer
// correctness, or source-domain vocabulary (R12).

const RUN_ID = process.env.REALUSE_RUN_ID ?? "";
const PIN = process.env.REALUSE_PIN ?? "";
const ENRICHMENT_ID = process.env.REALUSE_ENRICHMENT_ID ?? "";
const ENRICHMENT_TITLE = process.env.REALUSE_ENRICHMENT_TITLE ?? "";
const GRADED_KIND = process.env.REALUSE_GRADED_KIND ?? "";
const TOKEN_KEY = "lrnki_learner_token";

test.beforeAll(() => {
  const required = { REALUSE_RUN_ID: RUN_ID, REALUSE_PIN: PIN, REALUSE_ENRICHMENT_ID: ENRICHMENT_ID, REALUSE_ENRICHMENT_TITLE: ENRICHMENT_TITLE, REALUSE_GRADED_KIND: GRADED_KIND };
  for (const [key, value] of Object.entries(required)) {
    if (!value) throw new Error(`${key} is required. Run via \`pnpm e2e:web:realuse\`, which sets it from preflight.`);
  }
});

// Copy tolerant of the typographic apostrophe (U+2019) in the learner vocabulary.
const re = (s: string) => new RegExp(s.replace(/['’]/g, "."));
const GATE = re("Choose your explorer");
const JOURNAL = re("Choose an expedition");

// The phone recovery flow drives a REAL /me 401 and a real failed Enter 401. A real error status
// makes the browser log "Failed to load resource ... status of 401" — a network report, not a JS
// fault. Ignore exactly that; every other pageerror/console.error still fails the suite (R13).
const errors: string[] = [];
const EXPECTED_STATUS_NOISE = /Failed to load resource: the server responded with a status of 401/;
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

// Phone (R10): a stale bearer is rejected by the real /me 401 and cleared, an invalid Enter on the
// (unregistered) run-unique name is a real 401 that does NOT block signup, and Set out registers
// the learner so the Journal renders with no reload.
async function recoverAndSignUp(page: Page, learnerName: string): Promise<void> {
  // Seed the stale bearer directly into storage (NOT via addInitScript, which re-runs on every
  // later navigation and would clobber the real signup token), then reload to boot with it.
  await page.goto("/");
  await expect(page.getByText(GATE)).toBeVisible();
  await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [TOKEN_KEY, "stale-garbage-token"] as const);
  await page.reload();
  await expect(page.getByText(GATE)).toBeVisible();
  expect(await page.evaluate((k) => window.localStorage.getItem(k), TOKEN_KEY)).toBeNull();

  await page.getByLabel("Explorer name").fill(learnerName);
  await page.getByLabel("PIN").fill(PIN);
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.locator('[aria-live="polite"]')).toBeVisible();
  await expect(page.getByText(GATE)).toBeVisible();

  await page.getByRole("button", { name: "Set out" }).click();
  await expect(page.getByText(JOURNAL)).toBeVisible();
  await expect(page.getByText(GATE)).toHaveCount(0);
  expect(await page.evaluate((k) => window.localStorage.getItem(k), TOKEN_KEY)).toBeTruthy();
}

// Desktop: register directly.
async function signUpDirect(page: Page, learnerName: string): Promise<void> {
  await page.goto("/");
  await expect(page.getByText(GATE)).toBeVisible();
  await page.getByLabel("Explorer name").fill(learnerName);
  await page.getByLabel("PIN").fill(PIN);
  await page.getByRole("button", { name: "Set out" }).click();
  await expect(page.getByText(JOURNAL)).toBeVisible();
}

// The shared persisted spine (R10): choose the runtime-selected shared enrichment through the
// Catalog, open its Study Session, submit ONE auto-graded selection (any option — correctness is
// never asserted), then reload the Journal and confirm the expedition is now in `Continue`.
async function chooseStudyAndPersist(page: Page): Promise<void> {
  // Hard-navigate to the Catalog. A client-side "Browse all" push can leave the journal's Explore
  // card (same candidate, same testID) mounted alongside the catalog card, so a full route load
  // keeps the candidate selector unambiguous.
  await page.goto("/catalog");
  await expect(page.getByText(re("Browse expeditions"))).toBeVisible();
  await page.getByLabel("Search expeditions").fill(ENRICHMENT_TITLE);

  const begin = page.getByTestId(`candidate-${ENRICHMENT_ID}`);
  await expect(begin).toBeVisible();
  await begin.click();

  // The trail: tap the preflight-selected one-tap graded checkpoint by typed kind, not by label.
  const checkpoint = page.getByTestId(`checkpoint-${GRADED_KIND}-available`).first();
  await expect(checkpoint).toBeVisible();
  await checkpoint.click();

  // Select one visible choice and wait for the REAL grade to persist before leaving.
  const choice = page.getByTestId("study-choice").first();
  await expect(choice).toBeVisible();
  const graded = page.waitForResponse((r) => /\/study\/(option-select|impostor)/.test(r.url()) && r.request().method() === "POST");
  await choice.click();
  await graded;

  // Reload the Journal from persisted state: a graded attempt moves the expedition to `started`,
  // so the `Continue` section (rendered only when a started expedition exists) now shows it.
  await page.goto("/");
  await page.reload();
  await expect(page.getByText("Continue", { exact: true })).toBeVisible();
  await expect(page.getByText(ENRICHMENT_TITLE).first()).toBeVisible();
}

test("real journey: signup → choose shared enrichment → one graded selection → persisted Continue", async ({ page }, testInfo) => {
  const project = testInfo.project.name; // "phone" | "desktop"
  const learnerName = `realuse-${project}-${RUN_ID}`;
  if (project === "phone") {
    await recoverAndSignUp(page, learnerName);
  } else {
    await signUpDirect(page, learnerName);
  }
  await chooseStudyAndPersist(page);
});

import { test, expect, type Page } from "@playwright/test";

// The ONE durable real-backend integration journey (plan 2026-07-15-001 U3). It runs against the
// production Expo export served locally, driven by a REAL supervisor-free learner-api over Postgres
// — NOTHING is intercepted. It is project-parameterized: the phone project also exercises real
// stale-cookie/failed-entry auth recovery (R10-R11); both projects then run the same persisted spine
// (choose a shared enrichment → open the Study Session → submit one auto-graded selection → return
// to the Journal → reload → see it in `Continue`). Route-error/scrim matrices stay in the
// intercepted `e2e/` suite. The runner (`run.ts`) owns the environment; run via `pnpm e2e:web:realuse`.
//
// Assertions use roles, accessibility names, and a minimal set of app-owned semantic test IDs. They
// consume the runtime-selected enrichment id/title but NEVER assert generated prose, answer
// correctness, or source-domain vocabulary (R12).
//
// Identity is Better Auth over a session cookie (ADR-0041): each project signs up with its own
// reserved address through the email + password route — the fallback path, and the only one any rig
// drives. Google's consent screen is never automated. The runner's teardown finds these learners by
// address, so nothing here needs (or can know) the generated `user.id`.

const RUN_ID = process.env.REALUSE_RUN_ID ?? "";
const PASSWORD = process.env.REALUSE_PASSWORD ?? "";
// The API's own origin, needed to seed a cookie the browser will actually attach to it.
const API_BASE = process.env.REALUSE_API_BASE ?? "";
const EMAILS: Record<string, string> = {
  phone: process.env.REALUSE_EMAIL_PHONE ?? "",
  desktop: process.env.REALUSE_EMAIL_DESKTOP ?? ""
};
const ENRICHMENT_ID = process.env.REALUSE_ENRICHMENT_ID ?? "";
const ENRICHMENT_TITLE = process.env.REALUSE_ENRICHMENT_TITLE ?? "";
const GRADED_KIND = process.env.REALUSE_GRADED_KIND ?? "";

test.beforeAll(() => {
  const required = {
    REALUSE_RUN_ID: RUN_ID,
    REALUSE_PASSWORD: PASSWORD,
    REALUSE_API_BASE: API_BASE,
    REALUSE_EMAIL_PHONE: EMAILS.phone,
    REALUSE_EMAIL_DESKTOP: EMAILS.desktop,
    REALUSE_ENRICHMENT_ID: ENRICHMENT_ID,
    REALUSE_ENRICHMENT_TITLE: ENRICHMENT_TITLE,
    REALUSE_GRADED_KIND: GRADED_KIND
  };
  for (const [key, value] of Object.entries(required)) {
    if (!value) throw new Error(`${key} is required. Run via \`pnpm e2e:web:realuse\`, which sets it from preflight.`);
  }
});

// Copy tolerant of the typographic apostrophe (U+2019) in the learner vocabulary.
const re = (s: string) => new RegExp(s.replace(/['’]/g, "."));
const GATE = re("Choose your explorer");
const JOURNAL = re("Choose an expedition");

// The phone recovery flow drives a real failed Enter, which Better Auth answers 401. A real error
// status makes the browser log "Failed to load resource ... status of 401" — a network report, not
// a JS fault. Ignore exactly that; every other pageerror/console.error still fails the suite (R13).
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

// The gate opens on the "enter an existing explorer" intent; creating one needs the toggle first,
// which also reveals the name field (D7 — email sign-up takes the explorer name inline, so this
// route never meets the first-run naming screen).
async function fillSignUp(page: Page, email: string, name: string): Promise<void> {
  await page.getByTestId("gate-toggle-intent").click();
  await page.getByLabel("Explorer name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
}

// The session must live ONLY in an HttpOnly cookie (ADR-0041): the page cannot read it, and the
// app stores no mirror of its own. Asserted against the real backend, where a genuine `Set-Cookie`
// has actually been issued — a mocked suite could not tell the two apart.
async function expectNoReadableCredential(page: Page): Promise<void> {
  const readable = await page.evaluate(() => ({
    cookie: document.cookie,
    storage: [...Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? "")]
  }));
  expect(readable.cookie, "the session cookie must be HttpOnly and invisible to the page").toBe("");
  expect(readable.storage.filter((key) => /token|session|auth|cookie/i.test(key)), "the app holds no credential of its own").toEqual([]);
}

// Phone (R10): a stale session cookie settles to the gate rather than to an error, an invalid
// Enter on the (unregistered) reserved address is a real 401 that does NOT block signup, and Set
// out registers the learner so the Journal renders with no reload.
async function recoverAndSignUp(page: Page, email: string, learnerName: string): Promise<void> {
  await page.goto("/");
  await expect(page.getByText(GATE)).toBeVisible();

  // A cookie the server cannot verify — the shape a dev database reset leaves behind. Better Auth
  // answers `get-session` 200-with-null for it, which is what lets the app distinguish "signed
  // out" from "the read failed" and settle to the gate instead of offering retry. Seeded on the
  // API's own origin so the browser attaches it to the credentialed cross-origin call; cookies are
  // not port-scoped, which is exactly why web and API must share a host here.
  // `httpOnly` matches how a real one was set, and keeps it out of `document.cookie` so the
  // credential-absence check below measures the app rather than this test's own artifact.
  await page.context().addCookies([
    { name: "better-auth.session_token", value: "stale-garbage-cookie", url: API_BASE, httpOnly: true }
  ]);
  await page.reload();
  await expect(page.getByText(GATE)).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.locator('[aria-live="polite"]')).toBeVisible();
  await expect(page.getByText(GATE)).toBeVisible();

  await fillSignUp(page, email, learnerName);
  await page.getByRole("button", { name: "Set out" }).click();
  await expect(page.getByText(JOURNAL)).toBeVisible();
  await expect(page.getByText(GATE)).toHaveCount(0);
  await expectNoReadableCredential(page);
}

// Desktop: register directly.
async function signUpDirect(page: Page, email: string, learnerName: string): Promise<void> {
  await page.goto("/");
  await expect(page.getByText(GATE)).toBeVisible();
  await fillSignUp(page, email, learnerName);
  await page.getByRole("button", { name: "Set out" }).click();
  await expect(page.getByText(JOURNAL)).toBeVisible();
  await expectNoReadableCredential(page);
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
  const email = EMAILS[project];
  expect(email, `no reserved address for project ${project}`).toBeTruthy();
  // The display name is the address's local part — run-unique and domain-neutral, so nothing here
  // depends on generated content or on a name the learner would have typed.
  const learnerName = email.split("@")[0];
  if (project === "phone") {
    await recoverAndSignUp(page, email, learnerName);
  } else {
    await signUpDirect(page, email, learnerName);
  }
  await chooseStudyAndPersist(page);
});

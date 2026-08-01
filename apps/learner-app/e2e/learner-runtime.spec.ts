import {
  test,
  expect,
  ok,
  status,
  delay,
  identity,
  sessionSuccess,
  journalPopulated,
  catalogPopulated,
  leaderboardFixture,
  seedToken,
  readStoredToken
} from "./fixtures";

// Durable web acceptance for the reproduced runtime defects and the shared route-state
// contract (plan 2026-07-14-001 U5). Everything runs against the real production Expo export
// with the typed API fully intercepted, on a phone and a desktop viewport (playwright.config).
//
// A note on retry counts: the app's QueryClient uses `retry: 1`, so a throwing read is
// attempted twice before it surfaces an error. Scenarios that must reach the error UI fail the
// first two calls, then let a manual Retry (a third call) recover — matching real behavior.

// Copy assertions tolerate the typographic apostrophe (’ U+2019) in the learner vocabulary.
const re = (s: string) => new RegExp(s.replace(/'/g, "."));
const GATE = re("Choose your explorer");
const JOURNAL = re("Choose an expedition");

test.afterEach(async ({ pageErrors }) => {
  expect(pageErrors, `unexpected runtime errors:\n${pageErrors.join("\n")}`).toEqual([]);
});

test.describe("session entry", () => {
  // AE1: a stale token is rejected by /me, an invalid Enter fails, then Set out succeeds and the
  // Journal renders immediately with the new token — no reload, no bounce back to the gate.
  test("stale token, failed Enter, then successful Set out reaches the Journal (AE1)", async ({ page, mock }) => {
    await seedToken(page, "stale-token");
    mock.handlers = {
      "GET /me": () => status(401, { error: "unauthorized" }),
      "POST /session": ({ postData }) =>
        (postData as { intent: string }).intent === "create" ? ok(sessionSuccess) : status(401, { error: "wrong_pin" }),
      "GET /journal": () => ok(journalPopulated),
      "GET /leaderboard": () => ok(leaderboardFixture)
    };

    await page.goto("/");

    // The stale token is validated (/me 401), cleared, and the registry gate settles as the
    // stable signed-out state (R3).
    await expect(page.getByText(GATE)).toBeVisible();
    expect(await readStoredToken(page)).toBeNull();

    await page.getByLabel("Explorer name").fill("gate-explorer");
    await page.getByLabel("PIN").fill("1234");

    // A failed Enter shows its refusal but must not block a later signup (R2).
    await page.getByRole("button", { name: "Enter" }).click();
    await expect(page.getByText(re("That PIN doesn't match"))).toBeVisible();
    await expect(page.getByText(GATE)).toBeVisible();

    // Set out succeeds: the returned identity seeds `me` directly, so the observer flips to the
    // Journal with no second /me round-trip and no reload (R1, KTD1/KTD2).
    await page.getByRole("button", { name: "Set out" }).click();
    await expect(page.getByText(JOURNAL)).toBeVisible();
    await expect(page.getByText(GATE)).toHaveCount(0);
    expect(await readStoredToken(page)).toBe(sessionSuccess.token);
  });

  // AE2: a successful session followed by a failing Journal keeps the learner signed in and
  // offers Retry + Log out; Retry recovers without another login. The gate never returns.
  test("Journal failure after signup stays signed in with Retry and Log out (AE2)", async ({ page, mock }) => {
    await seedToken(page, "valid-token");
    let journalCalls = 0;
    mock.handlers = {
      "GET /me": () => ok(identity),
      "GET /journal": () => (++journalCalls <= 2 ? status(500) : ok(journalPopulated)),
      "GET /leaderboard": () => ok(leaderboardFixture)
    };

    await page.goto("/");

    // Signed in, but the Journal read fails: error surface with recovery, NOT the gate (R5).
    await expect(page.getByText(re("Your journal didn't load"))).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await expect(page.getByText(GATE)).toHaveCount(0);

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText(JOURNAL)).toBeVisible();
  });
});

test.describe("route states", () => {
  // AE3 (Catalog): delayed → visible loading, failed → named error with recovery actions, Retry
  // → data. A valid empty catalog would be a distinct data state, not this error.
  test("Catalog shows loading, error+recovery, then data on Retry (AE3)", async ({ page, mock }) => {
    let calls = 0;
    mock.handlers = {
      "GET /catalog": async () => {
        calls += 1;
        if (calls <= 2) {
          await delay(250);
          return status(500);
        }
        return ok(catalogPopulated);
      }
    };

    await page.goto("/catalog");
    await expect(page.getByText(re("Loading expeditions"))).toBeVisible();
    await expect(page.getByText(re("Couldn't load expeditions"))).toBeVisible();
    await expect(page.getByRole("button", { name: "Return to trail" })).toBeVisible();

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText(re("Browse expeditions"))).toBeVisible();
  });

  // AE3 (Expedition): a failing trail read renders the named error with Retry + Return, never a
  // blank frame.
  test("Expedition read failure renders the named trail error (AE3)", async ({ page, mock }) => {
    let calls = 0;
    mock.handlers = {
      "GET /expedition/*": async () => {
        calls += 1;
        if (calls === 1) await delay(250);
        return status(500);
      }
    };

    await page.goto("/expedition/enr-broken");
    await expect(page.getByText(re("Loading your trail"))).toBeVisible();
    await expect(page.getByText(re("This trail didn't load"))).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Return to trail" })).toBeVisible();
  });

  // AE3 (Guardian): a failing challenge read renders the Guardian error surface (distinct from
  // the "fight is over" unavailable state a 404 would produce).
  test("Guardian read failure renders the Guardian error surface (AE3)", async ({ page, mock }) => {
    let calls = 0;
    mock.handlers = {
      "GET /challenge/*": async () => {
        calls += 1;
        if (calls === 1) await delay(250);
        return status(500);
      }
    };

    await page.goto("/guardian/chal-broken");
    await expect(page.getByText(re("The Guardian is out of reach"))).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Return to trail" })).toBeVisible();
  });
});

test.describe("web planning sheet layer", () => {
  async function openPopulatedJournal(page: import("@playwright/test").Page, mock: { handlers: Record<string, unknown> }) {
    await seedToken(page, "valid-token");
    mock.handlers = {
      "GET /me": () => ok(identity),
      "GET /journal": () => ok(journalPopulated),
      "GET /leaderboard": () => ok(leaderboardFixture),
      "POST /expedition/start": async () => {
        await delay(1500);
        return ok({ learnerExpeditionId: "lex-new" });
      }
    };
    await page.goto("/");
    await expect(page.getByText(JOURNAL)).toBeVisible();
  }

  // AE6: opening the planning sheet places one scrim above the whole Journal (Browse, ready
  // expeditions, Crystal Guardian surfaces), so hit-testing over any journal control resolves to
  // the modal layer and the page cannot be interacted with beneath it.
  test("planning sheet scrim covers and disables the Journal (AE6)", async ({ page, mock }) => {
    await openPopulatedJournal(page, mock as never);

    // The top-right Menu icon is a real journal control anchored above the bottom-sheet content,
    // so once the sheet opens the SCRIM (not the drawer body) sits over it — the point that proves
    // both coverage and inertness. A candidate "Begin" or "Browse all" button lower on the page
    // can fall behind the drawer body itself, which is still covered but not a clean scrim hit.
    const menu = page.getByRole("button", { name: "Menu" });
    const box = await menu.boundingBox();
    expect(box).not.toBeNull();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    // Before opening, the point resolves to the journal itself (sanity), not any modal layer.
    const before = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest("[data-testid='bottom-sheet-backdrop'],[data-vaul-drawer]") != null,
      [cx, cy]
    );
    expect(before).toBe(false);

    await page.getByRole("button", { name: "Plan a new expedition" }).click();
    await expect(page.getByLabel("Topic", { exact: true })).toBeVisible();

    // The app-owned root scrim covers the full viewport and out-ranks every journal or
    // already-portaled full-screen stacking context.
    const overlay = page.locator("[data-testid='bottom-sheet-backdrop']");
    await expect(overlay).toBeVisible();
    const overlayBox = await overlay.boundingBox();
    const viewport = page.viewportSize()!;
    expect(overlayBox!.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(overlayBox!.height).toBeGreaterThanOrEqual(viewport.height - 1);

    // Hit-testing over the (now-covered) Menu control resolves into the modal layer, not the
    // Menu button — the page beneath cannot receive the pointer (R12).
    const covered = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return el != null && el.closest("[data-testid='bottom-sheet-backdrop'],[data-vaul-drawer]") != null;
      },
      [cx, cy]
    );
    expect(covered).toBe(true);

    // Clicking that point hits the scrim, which dismisses the sheet — the Menu never opens, and
    // the URL is unchanged (no underlying control activated).
    const url = page.url();
    await page.mouse.click(cx, cy);
    await expect(page.getByLabel("Topic", { exact: true })).toBeHidden();
    expect(page.url()).toBe(url);
  });

  // R12/AE4: while the creation mutation is pending, the sheet cannot be dismissed by Escape or
  // scrim; once it settles, the same inputs close it.
  test("pending creation blocks dismissal until it settles (R12)", async ({ page, mock }) => {
    await openPopulatedJournal(page, mock as never);

    await page.getByRole("button", { name: "Plan a new expedition" }).click();
    await page.getByLabel("Topic", { exact: true }).fill("Spaced practice intuition");
    await page.getByRole("button", { name: "Plan expedition" }).click();

    // Mutation in flight (POST /expedition/start delayed): Escape must not close the sheet.
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Topic", { exact: true })).toBeVisible();

    // After settlement the sheet closes itself (setOpen(false) on success).
    await expect(page.getByLabel("Topic", { exact: true })).toBeHidden({ timeout: 5000 });
  });
});

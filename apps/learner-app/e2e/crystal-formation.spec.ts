import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect, ok, signedIn } from "./fixtures";
import {
  FORMATION_ENRICHMENT_ID,
  formationExpedition,
  formationVistaExpedition,
  gradedCorrect,
  guardianAnswerReply,
  guardianChallenge,
  guardianFight,
  guardianLegRewardExpedition,
  guardianSummitRewardExpedition
} from "./scenarios/crystalFormation";

// Crystal Formation reward acceptance. Runs against the production Expo export with the typed API
// intercepted; assertions are semantic (accessible names, copy, app-owned state selectors), never
// pixel baselines. Retargeted onto the cavern presentation in plan 2026-07-30-001 U5 with every
// claim preserved: these scenarios assert structural states, choreography identity, honest copy,
// reduced-motion equivalence, and containment — never geometry.

const EVIDENCE_ROOT = "../../../tmp/2026-07-30-crystal-formation-cavern/web";
const EVIDENCE_DIR = path.resolve(__dirname, `${EVIDENCE_ROOT}/collection`);
const VISTA_EVIDENCE_DIR = path.resolve(__dirname, `${EVIDENCE_ROOT}/vista`);
const GUARDIAN_EVIDENCE_DIR = path.resolve(__dirname, `${EVIDENCE_ROOT}/guardian`);
const U6_EVIDENCE_DIR = path.resolve(__dirname, `${EVIDENCE_ROOT}/states`);
const OBELISK_EVIDENCE_DIR = path.resolve(__dirname, "../../../tmp/2026-07-31-guardian-obelisk/web");

test.afterEach(async ({ pageErrors }) => {
  expect(pageErrors, `unexpected runtime errors:\n${pageErrors.join("\n")}`).toEqual([]);
});

function shot(name: string, projectName: string): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  return path.join(EVIDENCE_DIR, `${projectName}-${name}.png`);
}

function vistaShot(name: string, projectName: string): string {
  mkdirSync(VISTA_EVIDENCE_DIR, { recursive: true });
  return path.join(VISTA_EVIDENCE_DIR, `${projectName}-${name}.png`);
}

function guardianShot(name: string, projectName: string): string {
  mkdirSync(GUARDIAN_EVIDENCE_DIR, { recursive: true });
  return path.join(GUARDIAN_EVIDENCE_DIR, `${projectName}-${name}.png`);
}

function u6Shot(name: string, projectName: string): string {
  mkdirSync(U6_EVIDENCE_DIR, { recursive: true });
  return path.join(U6_EVIDENCE_DIR, `${projectName}-${name}.png`);
}

async function seedVistaNavigationMemory(page: Page) {
  await page.addInitScript(() => {
    // Key shape is owned by `recallScopeKey` in src/lib/guardianEntry.ts: a scope is
    // (kind, anchor), so acknowledging this Leg cannot also answer for the summit.
    window.localStorage.setItem("lrnki_guardian_arrival_gate-explorer_section_v1m", "1");
  });
}

// Wire the collecting → collected transition: the expedition read serves the collecting
// phase until the graded answer commits, then serves the collected phase — exactly the
// refetch-driven flow the real client performs after a correct grade.
function installFormation(mock: { handlers: Record<string, unknown> }) {
  let phase: "collecting" | "collected" = "collecting";
  mock.handlers = {
    ...signedIn(),
    "GET /expedition/*": () => ok(formationExpedition(phase)),
    "POST /study/option-select": ({ postData }: { postData: unknown }) => {
      phase = "collected";
      return ok(gradedCorrect((postData as { chosenOptionId: string }).chosenOptionId));
    }
  };
}

test("compact surfaces speak exact honest progress with no miniature specimens (AE1)", async ({ page, mock }) => {
  installFormation(mock as never);
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);

  // Header vista door: exact crystal count (known ground never inflates it).
  await expect(page.getByText("1/5")).toBeVisible();

  // The trail map names completed ground, crystals, and known ground separately (A2).
  await page.getByLabel("Trail map").click();
  await expect(page.getByText(/2 of 3 ground complete · 1 crystal · 1 known/).first()).toBeVisible();
  await page.screenshot({ path: shot("trail-map", test.info().project.name), fullPage: false });
});

test("mastering the final activity collects the new specimen into its shared Leg scene (AE2)", async ({ page, mock }) => {
  installFormation(mock as never);
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);
  await page.screenshot({ path: shot("trail-before", test.info().project.name), fullPage: true });

  // Answer Waypoint Beta's one remaining activity through the real sheet.
  await page.getByTestId("checkpoint-option_select-available").click();
  await page.getByLabel("The waypoint marker").click();
  await expect(page.getByText("Correct.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // The capstone renders the focused SHARED Leg scene: the leg is now fully complete, so
  // its announced state and exact counts update together with the new specimen (R16).
  await expect(page.getByText("This crystal now sits in its leg's formation.")).toBeVisible();
  await expect(page.getByRole("img", { name: /First Ridge — Guardian has nothing to test yet. 3 of 3 ground complete · 2 crystals · 1 known/ })).toBeVisible();
  await page.screenshot({ path: shot("collection-reward", test.info().project.name), fullPage: false });

  // Header count reflects the collection after returning to the trail.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("2/5")).toBeVisible();
});

test("a directly reopened mastered capstone renders the settled scene without replaying entry (AE2)", async ({ page, mock }) => {
  mock.handlers = {
    ...signedIn(),
    "GET /expedition/*": () => ok(formationExpedition("collected"))
  };
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);
  await expect(page.getByText("2/5")).toBeVisible();

  // Three concepts in the Leg are complete, so three capstone checkpoints share the
  // typed testID; Waypoint Beta's is the last complete one on the trail.
  await page.getByTestId("checkpoint-capstone-complete").last().click();
  await expect(page.getByText("This crystal now sits in its leg's formation.")).toBeVisible();
  // No entering transform on a settled reopen: the scene is static.
  await expect(page.locator('[data-testid="leg-slot-entering"]')).toHaveCount(0);
  await page.screenshot({ path: shot("capstone-reopened", test.info().project.name), fullPage: false });
});

test("reduced motion renders the final collected scene immediately with equivalent copy (AE9)", async ({ page, mock }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  installFormation(mock as never);
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);

  await page.getByTestId("checkpoint-option_select-available").click();
  await expect(page.getByLabel("The waypoint marker")).toBeVisible();
  await page.getByLabel("The waypoint marker").click();
  await expect(page.getByText("Correct.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("This crystal now sits in its leg's formation.")).toBeVisible();
  await expect(page.getByRole("img", { name: /3 of 3 ground complete · 2 crystals · 1 known/ })).toBeVisible();
  await expect(page.locator('[data-testid="leg-slot-entering"]')).toHaveCount(0);
  await page.screenshot({ path: shot("collection-reduced-motion", test.info().project.name), fullPage: false });
});

test("Crystal Vista layers a dismissible memory sheet above the full-screen formation and Examine returns to trail", async ({ page, mock }) => {
  if (test.info().project.name === "phone") {
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await seedVistaNavigationMemory(page);
  mock.handlers = {
    ...signedIn(),
    "GET /expedition/*": () => ok(formationVistaExpedition())
  };
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);
  await page.getByRole("button", { name: "Open the crystal formation" }).click();

  await expect(page.getByText("Leg 1 · Bound formation")).toBeVisible();
  await expect(page.getByText("Leg 2 · Guardian awaits")).toBeVisible();
  await expect(page.getByText("Leg 3 · Collecting crystals")).toBeVisible();
  await expect(page.getByText("Leg 4 · Fogged leg")).toBeVisible();
  await expect(page.getByRole("img", { name: /Summit — Keystone awaits/ })).toBeVisible();
  await expect(page.getByText("Leg 1 settles into the Crystal Formation.")).toBeVisible();
  await expect(page.getByTestId("cavern-ground")).toBeVisible();
  await expect(page.locator('[data-testid^="cavern-panel-"]')).toHaveCount(4);

  const vistaClose = page.getByRole("button", { name: "Return to trail" });
  const vistaCloseBox = await vistaClose.boundingBox();
  expect(vistaCloseBox).not.toBeNull();
  const outsideX = vistaCloseBox!.x + vistaCloseBox!.width / 2;
  const outsideY = vistaCloseBox!.y + vistaCloseBox!.height / 2;
  await page.getByRole("button", { name: "Waypoint Bound Alpha" }).click();
  await expect(page.getByText("The first waypoint anchors the ascent.")).toBeVisible();
  const examineAction = page.getByRole("button", { name: "Examine" });
  await expect(examineAction).toBeVisible();
  await expect(page.locator("[data-testid='bottom-sheet-backdrop']")).toBeVisible();
  await expect(page.locator("[data-vaul-drawer]")).toBeInViewport();
  // Wait through the drawer's entrance transform and prove the whole action—not merely an
  // intersecting edge—sits above the viewport bottom.
  await expect.poll(async () => {
    const box = await examineAction.boundingBox();
    return box !== null && box.y + box.height <= (page.viewportSize()?.height ?? 0);
  }).toBe(true);
  const sheetAboveVista = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest("[data-testid='bottom-sheet-backdrop'],[data-vaul-drawer]") != null,
    [outsideX, outsideY]
  );
  expect(sheetAboveVista).toBe(true);
  await page.screenshot({ path: vistaShot("four-state-ascent", test.info().project.name), fullPage: false });

  // Backdrop dismissal clears only the selected memory: Vista remains open and scroll state stays.
  await page.mouse.click(outsideX, outsideY);
  await expect(page.getByRole("button", { name: "Examine" })).toBeHidden();
  await expect(page.getByTestId("cavern-ground")).toBeVisible();

  // Examine clears the sheet, closes Vista, and hands focus back to the corresponding trail stop.
  await page.getByRole("button", { name: "Waypoint Bound Alpha" }).click();
  await page.getByRole("button", { name: "Examine" }).click();
  await expect(page.getByTestId("cavern-ground")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Crystal: Waypoint Bound Alpha" })).toBeInViewport();
});

test("explicit Vista focus opens once and closing consumes route intent (AE10)", async ({ page, mock }) => {
  await seedVistaNavigationMemory(page);
  mock.handlers = {
    ...signedIn(),
    "GET /expedition/*": () => ok(formationVistaExpedition())
  };
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}?vista=1&formationFocus=leg:2`);
  await expect(page.getByTestId("formation-focus-leg-2")).toBeVisible();
  await page.screenshot({ path: vistaShot("explicit-focus", test.info().project.name), fullPage: false });
  await page.getByRole("button", { name: "Return to trail" }).click();
  await expect(page.getByTestId("cavern-ground")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("cavern-ground")).toHaveCount(0);
});

test("final Guardian feedback hands a first Leg win into the refetched binding reward", async ({ page, mock }) => {
  const challengeId = "guardian-first-ready-leg";
  mock.handlers = {
    ...signedIn(),
    "GET /challenge/*": () => ok({ view: guardianChallenge(challengeId) }),
    "POST /challenge/answer": () => ok(guardianAnswerReply(challengeId)),
    "GET /expedition/*": () => ok(guardianLegRewardExpedition(challengeId))
  };
  await page.goto(`/guardian/${challengeId}`);
  await page.getByRole("button", { name: "The keyed route marker" }).click();
  await expect(page.getByText("The keyed marker completes the route and preserves the learned relationship.")).toBeVisible();
  await expect(page.getByRole("button", { name: "See your formation" })).toBeVisible();
  await expect(page.getByText("Leg bound!")).toHaveCount(0);

  await page.getByRole("button", { name: "See your formation" }).click();
  await expect(page.getByText("Leg bound!")).toBeVisible();
  await expect(page.getByTestId("leg-binding-event")).toBeVisible();
  await expect(page.getByRole("button", { name: "Explore formation" })).toBeEnabled();
  await page.screenshot({ path: guardianShot("first-leg", test.info().project.name), fullPage: false });
  await page.getByRole("button", { name: "Explore formation" }).click();
  await expect(page).toHaveURL(new RegExp(`/expedition/${FORMATION_ENRICHMENT_ID}\\?vista=1&formationFocus=leg(?:%3A|:)1$`));
});

test("a Guardian rematch keeps the formation settled and uses endurance copy", async ({ page, mock }) => {
  const challengeId = "guardian-ready-leg-rematch";
  mock.handlers = {
    ...signedIn(),
    "GET /challenge/*": () => ok({ view: guardianChallenge(challengeId) }),
    "POST /challenge/answer": () => ok(guardianAnswerReply(challengeId)),
    "GET /expedition/*": () => ok(guardianLegRewardExpedition("guardian-original-first-win"))
  };
  await page.goto(`/guardian/${challengeId}`);
  await page.getByRole("button", { name: "The keyed route marker" }).click();
  await page.getByRole("button", { name: "See your formation" }).click();
  await expect(page.getByText("Formation holds strong")).toBeVisible();
  await expect(page.getByText(/permanent formation stays exactly as earned/)).toBeVisible();
  await expect(page.getByTestId("leg-binding-event")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue expedition" })).toBeEnabled();
  await page.screenshot({ path: guardianShot("rematch", test.info().project.name), fullPage: false });
});

test("a rematch entered from the trail leaves both reward actions immediately usable", async ({ page, mock }) => {
  // Regression (plan 2026-07-16-003 U1): visiting the trail first pre-warms the expedition
  // query cache, which used to classify the reward from the STALE session, deadlocking the
  // settle-timer gating when the controller's refetch flipped the preview back to loading.
  const challengeId = "guardian-rematch-cached";
  mock.handlers = {
    ...signedIn(),
    "GET /expedition/*": () => ok(guardianLegRewardExpedition("guardian-original-first-win")),
    "POST /challenge/create": () => ok({ created: true, view: guardianChallenge(challengeId) }),
    "GET /challenge/*": () => ok({ view: guardianChallenge(challengeId) }),
    "POST /challenge/answer": () => ok(guardianAnswerReply(challengeId))
  };
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);
  await page.getByTestId("guardian-node-section_v1m").click();
  await page.getByRole("button", { name: "The keyed route marker" }).click();
  await page.getByRole("button", { name: "See your formation" }).click();
  await expect(page.getByText("Formation holds strong")).toBeVisible();
  await expect(page.getByTestId("guardian-reward-rematch")).toBeVisible();
  await expect(page.getByRole("button", { name: "Explore formation" })).toBeEnabled();
  const continueButton = page.getByRole("button", { name: "Continue expedition" });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page).toHaveURL(new RegExp(`/expedition/${FORMATION_ENRICHMENT_ID}$`));
});

test("the first Expedition Guardian win seats the summit keystone", async ({ page, mock }) => {
  const challengeId = "guardian-first-summit";
  mock.handlers = {
    ...signedIn(),
    "GET /challenge/*": () => ok({ view: guardianChallenge(challengeId, "enrichment") }),
    "POST /challenge/answer": () => ok(guardianAnswerReply(challengeId, "enrichment")),
    "GET /expedition/*": () => ok(guardianSummitRewardExpedition(challengeId))
  };
  await page.goto(`/guardian/${challengeId}`);
  await page.getByRole("button", { name: "The keyed route marker" }).click();
  await page.getByRole("button", { name: "See your formation" }).click();
  await expect(page.getByText("Keystone seated!")).toBeVisible();
  await expect(page.getByRole("img", { name: /Summit — Keystone seated/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Explore formation" })).toBeEnabled();
  await page.screenshot({ path: guardianShot("first-summit", test.info().project.name), fullPage: false });
});

test("reward preview failure preserves committed victory, Retry, and plain Continue", async ({ page, mock }) => {
  const challengeId = "guardian-preview-failure";
  mock.handlers = {
    ...signedIn(),
    "GET /challenge/*": () => ok({ view: guardianChallenge(challengeId) }),
    "POST /challenge/answer": () => ok(guardianAnswerReply(challengeId)),
    "GET /expedition/*": () => ({ status: 500, body: { error: "preview_failed" } })
  };
  await page.goto(`/guardian/${challengeId}`);
  await page.getByRole("button", { name: "The keyed route marker" }).click();
  await page.getByRole("button", { name: "See your formation" }).click();
  await expect(page.getByText(/victory is secure, but the formation preview didn’t load/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry preview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue expedition" })).toBeEnabled();
  await page.screenshot({ path: guardianShot("preview-error", test.info().project.name), fullPage: false });
});

// —— U6: complete production-web exercise (plan 2026-07-15-002) ——————————————————————

test("a Guardian-ready Leg announces the engaged fight honestly (R7)", async ({ page, mock }) => {
  await seedVistaNavigationMemory(page);
  mock.handlers = {
    ...signedIn(),
    "GET /expedition/*": () => ok(formationVistaExpedition("active"))
  };
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);
  await page.getByRole("button", { name: "Open the crystal formation" }).click();
  await expect(page.getByText("Leg 2 · Guardian engaged")).toBeVisible();
  await page.screenshot({ path: u6Shot("guardian-engaged", test.info().project.name), fullPage: false });
});

test("a complete Leg with zero eligible items shows the honest unavailable copy (R7)", async ({ page, mock }) => {
  await seedVistaNavigationMemory(page);
  mock.handlers = {
    ...signedIn(),
    "GET /expedition/*": () => ok(formationVistaExpedition("unavailable"))
  };
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);
  await page.getByRole("button", { name: "Open the crystal formation" }).click();
  await expect(page.getByText("Leg 2 · Guardian has nothing to test yet")).toBeVisible();
  await page.screenshot({ path: u6Shot("guardian-unavailable", test.info().project.name), fullPage: false });
});

test("a summit rematch keeps the keystone seated with endurance copy (AE8)", async ({ page, mock }) => {
  const challengeId = "guardian-summit-rematch";
  mock.handlers = {
    ...signedIn(),
    "GET /challenge/*": () => ok({ view: guardianChallenge(challengeId, "enrichment") }),
    "POST /challenge/answer": () => ok(guardianAnswerReply(challengeId, "enrichment")),
    "GET /expedition/*": () => ok(guardianSummitRewardExpedition("summit-original-first-win"))
  };
  await page.goto(`/guardian/${challengeId}`);
  await page.getByRole("button", { name: "The keyed route marker" }).click();
  await page.getByRole("button", { name: "See your formation" }).click();
  await expect(page.getByText("Formation holds strong")).toBeVisible();
  await expect(page.getByRole("img", { name: /Summit — Keystone seated/ })).toBeVisible();
  await expect(page.getByTestId("guardian-reward-rematch")).toBeVisible();
  await expect(page.getByText("Keystone seated!")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue expedition" })).toBeEnabled();
  await page.screenshot({ path: u6Shot("summit-rematch", test.info().project.name), fullPage: false });
});

test("reduced motion binds the first Leg statically with immediate actions (AE9)", async ({ page, mock }) => {
  const challengeId = "guardian-first-ready-leg";
  if (test.info().project.name === "phone") {
    await page.setViewportSize({ width: 320, height: 568 });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  mock.handlers = {
    ...signedIn(),
    "GET /challenge/*": () => ok({ view: guardianChallenge(challengeId) }),
    "POST /challenge/answer": () => ok(guardianAnswerReply(challengeId)),
    "GET /expedition/*": () => ok(guardianLegRewardExpedition(challengeId))
  };
  await page.goto(`/guardian/${challengeId}`);
  await page.getByRole("button", { name: "The keyed route marker" }).click();
  await page.getByRole("button", { name: "See your formation" }).click();
  await expect(page.getByText("Leg bound!")).toBeVisible();
  // The final sealed scene renders immediately: no binding overlay, no light sweep.
  await expect(page.getByTestId("leg-binding-event")).toHaveCount(0);
  await expect(page.getByTestId("guardian-reward-sweep")).toHaveCount(0);
  await expect(page.getByTestId("cavern-panel-bound")).toBeVisible();
  await expect(page.getByRole("button", { name: "Explore formation" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Continue expedition" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth)
  );
  await page.screenshot({ path: u6Shot("binding-reduced-motion", test.info().project.name), fullPage: false });
});

test("reduced motion seats the summit keystone immediately with equivalent copy (AE9)", async ({ page, mock }) => {
  const challengeId = "guardian-first-summit";
  await page.emulateMedia({ reducedMotion: "reduce" });
  mock.handlers = {
    ...signedIn(),
    "GET /challenge/*": () => ok({ view: guardianChallenge(challengeId, "enrichment") }),
    "POST /challenge/answer": () => ok(guardianAnswerReply(challengeId, "enrichment")),
    "GET /expedition/*": () => ok(guardianSummitRewardExpedition(challengeId))
  };
  await page.goto(`/guardian/${challengeId}`);
  await page.getByRole("button", { name: "The keyed route marker" }).click();
  await page.getByRole("button", { name: "See your formation" }).click();
  await expect(page.getByText("Keystone seated!")).toBeVisible();
  await expect(page.getByRole("img", { name: /Summit — Keystone seated/ })).toBeVisible();
  await expect(page.getByTestId("guardian-reward-sweep")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Explore formation" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Continue expedition" })).toBeEnabled();
  await page.screenshot({ path: u6Shot("keystone-reduced-motion", test.info().project.name), fullPage: false });
});

test("reduced motion contextualizes an unseen bound Leg with static emphasis and copy (AE9)", async ({ page, mock }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedVistaNavigationMemory(page);
  mock.handlers = {
    ...signedIn(),
    "GET /expedition/*": () => ok(formationVistaExpedition())
  };
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);
  await page.getByRole("button", { name: "Open the crystal formation" }).click();
  // Equivalent text still announces the one-time contextualization; the island renders
  // its final settled state with no transform animation.
  await expect(page.getByText("Leg 1 settles into the Crystal Formation.")).toBeVisible();
  await expect(page.getByText("Leg 1 · Bound formation")).toBeVisible();
  await page.screenshot({ path: u6Shot("contextualization-reduced-motion", test.info().project.name), fullPage: false });
});

// R7: the cavern contains itself at the narrowest phone the app supports. A 320 px viewport must
// reduce cells per row rather than overflow — this is an explicit gate because the 2026-07-16
// redesign shipped a 320 px overflow defect that only final review caught.
test("the cavern never overflows horizontally at 320 px", async ({ page, mock }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await seedVistaNavigationMemory(page);
  mock.handlers = {
    ...signedIn(),
    "GET /expedition/*": () => ok(formationVistaExpedition())
  };
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);
  await page.getByRole("button", { name: "Open the crystal formation" }).click();
  await expect(page.getByTestId("cavern-ground")).toBeVisible();
  await expect(page.locator('[data-testid^="cavern-panel-"]')).toHaveCount(4);
  await expect(page.getByRole("img", { name: /Summit — Keystone awaits/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth)
  );
  // Every rendered panel and cell stays inside the formation ground's own box.
  const contained = await page.evaluate(() => {
    const ground = document.querySelector('[data-testid="cavern-ground"]')!.getBoundingClientRect();
    return [...document.querySelectorAll('[data-testid^="cavern-panel-"], [data-testid^="cavern-cell-"]')].every((node) => {
      const box = node.getBoundingClientRect();
      return box.left >= ground.left - 0.5 && box.right <= ground.right + 0.5;
    });
  });
  expect(contained).toBe(true);
  // Every caption keeps its counts intact instead of truncating them at this width.
  await expect(page.getByTestId("formation-focus-leg-0").getByText("3 of 3 ground complete · 2 crystals · 1 known")).toBeVisible();
  // The dialog's entrance fade is decorative; settle it so the evidence shot shows final colour.
  await page.waitForTimeout(500);
  await page.screenshot({ path: u6Shot("cavern-320px", test.info().project.name), fullPage: true });
});

test("the warm formation remains contained and legible at 200% page zoom", async ({ page, mock }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedVistaNavigationMemory(page);
  mock.handlers = {
    ...signedIn(),
    "GET /expedition/*": () => ok(formationVistaExpedition())
  };
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);
  await page.addStyleTag({ content: "html { zoom: 2; }" });
  await page.getByRole("button", { name: "Open the crystal formation" }).click();
  await expect(page.getByText("Leg 1 · Bound formation")).toBeVisible();
  await expect(page.getByText("Leg 4 · Fogged leg")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth)
  );
  await page.screenshot({ path: u6Shot("formation-zoom200", test.info().project.name), fullPage: true });
});

// —— Ward Obelisk (plan 2026-07-31-002 U3) —————————————————————————————————————————
// The Guardian's body is one fixed obelisk whose ordered segments ARE the ward count. Segment
// STATE partitioning is locked at the component layer (`CrystalGuardian.test.tsx`); what only a
// browser can prove is what those states land on in the real production bundle — that the drawn
// body keeps its exact box while a whole five-ward fight is played through it, that a spent
// shield moves nothing, and that a seven-ward Expedition Guardian still contains itself and its
// answer controls at 320 px and at 200% zoom.

const WARD_SEGMENT = '[data-testid^="guardian-ward-segment-"]';

function obeliskShot(name: string, projectName: string): string {
  mkdirSync(OBELISK_EVIDENCE_DIR, { recursive: true });
  return path.join(OBELISK_EVIDENCE_DIR, `${projectName}-${name}.png`);
}

// The rendered segments in document order — base (0) to crown — as their state names.
// `evaluateAll` is a snapshot read with no auto-waiting, so the body is awaited first: without
// this the assertion races the mount and reads an empty obelisk.
async function wardStates(page: Page): Promise<string[]> {
  await expect(page.getByTestId("guardian-obelisk-frame")).toBeVisible();
  return page
    .locator(WARD_SEGMENT)
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid")!.replace("guardian-ward-segment-", "")));
}

// The vertical extent of a set of SVG shapes in viewport pixels.
function bandOf(page: Page, selector: string): Promise<{ top: number; bottom: number }> {
  return page.locator(selector).evaluateAll((nodes) => {
    const rects = nodes.map((node) => node.getBoundingClientRect());
    return { top: Math.min(...rects.map((rect) => rect.top)), bottom: Math.max(...rects.map((rect) => rect.bottom)) };
  });
}

async function frameBox(page: Page) {
  const box = await page.getByTestId("guardian-obelisk-frame").boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth)
  );
}

// One ward answered correctly, through the reveal the real fight holds between wards. The
// reveal REPLACES the stage, so returning waits for the body to be back on screen — every
// caller reads the obelisk immediately afterwards.
async function breakWard(page: Page) {
  await page.getByRole("button", { name: "The keyed route marker" }).click();
  await expect(page.getByText("Ward broken!")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByTestId("guardian-obelisk-frame")).toBeVisible();
}

// One miss: the ward holds, the shield spends a segment, and the queue rotates.
async function holdWard(page: Page) {
  await page.getByRole("button", { name: "An unrelated marker" }).click();
  await expect(page.getByText("The ward holds")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByTestId("guardian-obelisk-frame")).toBeVisible();
}

function currentWardQuestion(page: Page): Promise<string | null> {
  return page.getByText(/^Which marker completes ward \d+\?$/).textContent();
}

test("a Guardian answer reveal keeps every option in its submitted position", async ({ page, mock }) => {
  const challengeId = "guardian-stable-answer-order";
  const fight = guardianFight({ challengeId, wardTotal: 2 });
  mock.handlers = {
    ...signedIn(),
    "GET /challenge/*": () => ok({ view: fight.view() }),
    "POST /challenge/answer": ({ postData }) => ok(fight.answer(postData))
  };
  await page.goto(`/guardian/${challengeId}`);

  const choices = page.getByTestId("study-choice");
  await expect(choices).toHaveCount(2);
  const submittedOrder = await choices.allTextContents();
  await page.getByRole("button", { name: "An unrelated marker" }).click();
  await expect(page.getByText("The ward holds")).toBeVisible();
  await expect(choices).toHaveCount(2);
  expect(await choices.allTextContents()).toEqual(submittedOrder);
  await page.screenshot({ path: obeliskShot("answer-reveal-stable-order", test.info().project.name), fullPage: false });
});

test("a five-ward Leg Guardian is one unchanged body from the base ward to the crown", async ({ page, mock }) => {
  const challengeId = "guardian-five-ward-leg";
  const fight = guardianFight({ challengeId, wardTotal: 5 });
  mock.handlers = {
    ...signedIn(),
    "GET /challenge/*": () => ok({ view: fight.view() }),
    "POST /challenge/answer": ({ postData }) => ok(fight.answer(postData)),
    "GET /expedition/*": () => ok(guardianLegRewardExpedition(challengeId))
  };
  await page.goto(`/guardian/${challengeId}`);

  // A fresh Guardian already stands complete: five real ward slots, the base one current.
  await expect(page.locator(WARD_SEGMENT)).toHaveCount(5);
  expect(await wardStates(page)).toEqual(["current", "queued", "queued", "queued", "queued"]);
  await expect(page.getByText("5 wards left · Shield 3/3")).toBeVisible();
  const frame = await frameBox(page);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: obeliskShot("leg5-all-wards", test.info().project.name), fullPage: false });

  // Two wards genuinely fall. Only the material state advances — the body keeps its exact box.
  await breakWard(page);
  await breakWard(page);
  expect(await wardStates(page)).toEqual(["resolved", "resolved", "current", "queued", "queued"]);
  expect(await frameBox(page)).toEqual(frame);
  await page.screenshot({ path: obeliskShot("leg5-partial", test.info().project.name), fullPage: false });

  // Final Ward: the crown is what is left standing, and the count line says so in words.
  await breakWard(page);
  await breakWard(page);
  expect(await wardStates(page)).toEqual(["resolved", "resolved", "resolved", "resolved", "current"]);
  await expect(page.getByText("Final ward · Shield 3/3")).toBeVisible();
  expect(await frameBox(page)).toEqual(frame);
  const crown = await page.getByTestId("guardian-ward-segment-current").boundingBox();
  expect(crown!.y).toBeCloseTo(frame.y, 0);
  await page.screenshot({ path: obeliskShot("leg5-final-ward", test.info().project.name), fullPage: false });

  // The last ward breaks into the ordinary first-win reward handoff, unchanged by this plan.
  await page.getByRole("button", { name: "The keyed route marker" }).click();
  await page.getByRole("button", { name: "See your formation" }).click();
  await expect(page.getByText("Leg bound!")).toBeVisible();
});

test("a spent shield drops the Guardian into Last Stand without moving a ward", async ({ page, mock }) => {
  const challengeId = "guardian-last-stand";
  const fight = guardianFight({ challengeId, wardTotal: 5 });
  mock.handlers = {
    ...signedIn(),
    "GET /challenge/*": () => ok({ view: fight.view() }),
    "POST /challenge/answer": ({ postData }) => ok(fight.answer(postData))
  };
  await page.goto(`/guardian/${challengeId}`);
  await breakWard(page);
  const wards = await wardStates(page);
  expect(wards).toEqual(["resolved", "current", "queued", "queued", "queued"]);
  const question = await currentWardQuestion(page);

  await holdWard(page);
  await holdWard(page);
  await holdWard(page);

  // Last Stand is the LEARNER's state, not a ward's: the segmentation is byte-identical and the
  // queue has rotated a different ward into the same slot.
  await expect(page.getByText("Last Stand", { exact: true })).toBeVisible();
  expect(await wardStates(page)).toEqual(wards);
  expect(await currentWardQuestion(page)).not.toBe(question);
  await expect(page.getByText("4 wards left · Shield 0/3")).toBeVisible();
  await expect(page.locator('[data-testid="shield-intact"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="shield-spent"]')).toHaveCount(3);
  await page.screenshot({ path: obeliskShot("leg5-last-stand", test.info().project.name), fullPage: false });

  // The clean answer that leaves Last Stand restores exactly one shield segment and resolves
  // exactly one more ward.
  await breakWard(page);
  await expect(page.getByText("Last Stand", { exact: true })).toHaveCount(0);
  expect(await wardStates(page)).toEqual(["resolved", "resolved", "current", "queued", "queued"]);
  await expect(page.locator('[data-testid="shield-intact"]')).toHaveCount(1);
});

test("the seven-ward Expedition Guardian contains itself and its answers at 320 px", async ({ page, mock }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const challengeId = "guardian-seven-ward-summit";
  mock.handlers = {
    ...signedIn(),
    "GET /challenge/*": () =>
      ok({
        view: guardianChallenge(challengeId, "enrichment", {
          wardTotal: 7,
          unresolvedItemCount: 4,
          remainingMissBuffer: 2,
          missBufferTotal: 3
        })
      })
  };
  await page.goto(`/guardian/${challengeId}`);

  await expect(page.getByText("Expedition Guardian")).toBeVisible();
  expect(await wardStates(page)).toEqual([
    "resolved",
    "resolved",
    "resolved",
    "current",
    "queued",
    "queued",
    "queued"
  ]);
  await expect(page.getByText("4 wards left · Shield 2/3")).toBeVisible();
  await noHorizontalOverflow(page);

  // The learner's shield stays visibly clear of the Guardian's body above it, so the two
  // counts can never read as one stack.
  const body = await bandOf(page, WARD_SEGMENT);
  const shield = await bandOf(page, '[data-testid="shield-intact"],[data-testid="shield-spent"]');
  expect(shield.top).toBeGreaterThan(body.bottom);

  // The question and both answer controls render complete below the figure.
  await expect(page.getByText("Which marker completes ward 4?")).toBeVisible();
  for (const name of ["The keyed route marker", "An unrelated marker"]) {
    const option = page.getByRole("button", { name });
    await option.scrollIntoViewIfNeeded();
    await expect(option).toBeInViewport();
    const box = (await option.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  await page.screenshot({ path: obeliskShot("summit7-320px", test.info().project.name), fullPage: true });
});

test("the Guardian stage stays contained at 200% page zoom", async ({ page, mock }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const challengeId = "guardian-zoom200";
  mock.handlers = {
    ...signedIn(),
    "GET /challenge/*": () =>
      ok({ view: guardianChallenge(challengeId, "section", { wardTotal: 5, unresolvedItemCount: 3, missBufferTotal: 3 }) })
  };
  await page.goto(`/guardian/${challengeId}`);
  await page.addStyleTag({ content: "html { zoom: 2; }" });
  await expect(page.locator(WARD_SEGMENT)).toHaveCount(5);
  expect(await wardStates(page)).toEqual(["resolved", "resolved", "current", "queued", "queued"]);
  await expect(page.getByText("3 wards left · Shield 3/3")).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: obeliskShot("leg5-zoom200", test.info().project.name), fullPage: true });
});

test("reduced motion renders the Final Ward under Last Stand as one static body", async ({ page, mock }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const challengeId = "guardian-reduced-motion";
  mock.handlers = {
    ...signedIn(),
    "GET /challenge/*": () =>
      ok({
        view: guardianChallenge(challengeId, "section", {
          state: "recovery",
          wardTotal: 5,
          unresolvedItemCount: 1,
          remainingMissBuffer: 0,
          missBufferTotal: 3
        })
      })
  };
  await page.goto(`/guardian/${challengeId}`);

  // The most extreme composite state: the crown alone still standing while the shield is spent.
  expect(await wardStates(page)).toEqual(["resolved", "resolved", "resolved", "resolved", "current"]);
  await expect(page.getByText("Final ward · Shield 0/3")).toBeVisible();
  await expect(page.getByText("Last Stand", { exact: true })).toBeVisible();
  const frame = await frameBox(page);
  const crown = await page.getByTestId("guardian-ward-segment-current").boundingBox();
  expect(crown!.y).toBeCloseTo(frame.y, 0);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: obeliskShot("leg5-final-ward-reduced-motion", test.info().project.name), fullPage: false });
});

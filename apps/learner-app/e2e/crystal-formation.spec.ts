import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect, ok, seedToken } from "./fixtures";
import {
  FORMATION_ENRICHMENT_ID,
  formationExpedition,
  formationVistaExpedition,
  gradedCorrect,
  guardianAnswerReply,
  guardianChallenge,
  guardianLegRewardExpedition,
  guardianSummitRewardExpedition
} from "./scenarios/crystalFormation";

// Crystal Formation reward acceptance (plan 2026-07-15-002 U3 — the mastery collection
// case; U4-U6 expand this file through Vista, Guardian reward, and summit states). Runs
// against the production Expo export with the typed API intercepted; assertions are
// semantic (accessible names, copy, app-owned state selectors), never pixel baselines.

const EVIDENCE_DIR = path.resolve(__dirname, "../../../tmp/2026-07-16-crystal-formation-minimal-redesign/milestone-a-collection");
const VISTA_EVIDENCE_DIR = path.resolve(__dirname, "../../../tmp/2026-07-16-crystal-formation-minimal-redesign/milestone-b-vista");
const GUARDIAN_EVIDENCE_DIR = path.resolve(__dirname, "../../../tmp/2026-07-16-crystal-formation-minimal-redesign/milestone-c-guardian");
const U6_EVIDENCE_DIR = path.resolve(__dirname, "../../../tmp/2026-07-16-crystal-formation-minimal-redesign/u6-final");

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
    window.localStorage.setItem("lrnki_guardian_arrival_gate-explorer_v1m", "1");
  });
}

// Wire the collecting → collected transition: the expedition read serves the collecting
// phase until the graded answer commits, then serves the collected phase — exactly the
// refetch-driven flow the real client performs after a correct grade.
function installFormation(mock: { handlers: Record<string, unknown> }) {
  let phase: "collecting" | "collected" = "collecting";
  mock.handlers = {
    "GET /me": () => ok({ learnerStateRef: "gate-explorer", displayName: "Gate Explorer" }),
    "GET /expedition/*": () => ok(formationExpedition(phase)),
    "POST /study/option-select": ({ postData }: { postData: unknown }) => {
      phase = "collected";
      return ok(gradedCorrect((postData as { chosenOptionId: string }).chosenOptionId));
    }
  };
}

test("compact surfaces speak exact honest progress with no miniature specimens (AE1)", async ({ page, mock }) => {
  await seedToken(page, "valid-token");
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
  await seedToken(page, "valid-token");
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
  await seedToken(page, "valid-token");
  mock.handlers = {
    "GET /me": () => ok({ learnerStateRef: "gate-explorer", displayName: "Gate Explorer" }),
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
  await seedToken(page, "valid-token");
  installFormation(mock as never);
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);

  await page.getByTestId("checkpoint-option_select-available").click();
  await page.getByLabel("The waypoint marker").click();
  await expect(page.getByText("Correct.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("This crystal now sits in its leg's formation.")).toBeVisible();
  await expect(page.getByRole("img", { name: /3 of 3 ground complete · 2 crystals · 1 known/ })).toBeVisible();
  await expect(page.locator('[data-testid="leg-slot-entering"]')).toHaveCount(0);
  await page.screenshot({ path: shot("collection-reduced-motion", test.info().project.name), fullPage: false });
});

test("Crystal Vista renders the four Leg states as one separated ascent with a memory door (AE6, AE12)", async ({ page, mock }) => {
  await seedToken(page, "valid-token");
  await seedVistaNavigationMemory(page);
  mock.handlers = {
    "GET /me": () => ok({ learnerStateRef: "gate-explorer", displayName: "Gate Explorer" }),
    "GET /expedition/*": () => ok(formationVistaExpedition())
  };
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);
  await page.getByRole("button", { name: "Open the crystal formation" }).click();

  await expect(page.getByRole("img", { name: /Leg 1: Bound Ridge — Bound formation/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Leg 2: Ready Ridge — Guardian awaits/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Leg 3: Growing Ridge — Collecting crystals/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Leg 4: Summit Ridge — Fogged leg/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "Summit peak — Keystone awaits." })).toBeVisible();
  await expect(page.getByText("Leg 1 settles into the Crystal Formation.")).toBeVisible();
  await expect(page.getByTestId("formation-spine-segment")).toHaveCount(4);

  await page.getByRole("button", { name: "Waypoint Bound Alpha" }).click();
  await expect(page.getByText("The first waypoint anchors the ascent.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Examine" })).toBeVisible();
  await page.screenshot({ path: vistaShot("four-state-ascent", test.info().project.name), fullPage: false });
});

test("explicit Vista focus opens once and closing consumes route intent (AE10)", async ({ page, mock }) => {
  await seedToken(page, "valid-token");
  await seedVistaNavigationMemory(page);
  mock.handlers = {
    "GET /me": () => ok({ learnerStateRef: "gate-explorer", displayName: "Gate Explorer" }),
    "GET /expedition/*": () => ok(formationVistaExpedition())
  };
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}?vista=1&formationFocus=leg:2`);
  await expect(page.getByTestId("formation-focus-leg-2")).toBeVisible();
  await page.screenshot({ path: vistaShot("explicit-focus", test.info().project.name), fullPage: false });
  await page.getByRole("button", { name: "Return to trail" }).click();
  await expect(page.getByTestId("formation-spine-segment")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("formation-spine-segment")).toHaveCount(0);
});

test("final Guardian feedback hands a first Leg win into the refetched binding reward", async ({ page, mock }) => {
  const challengeId = "guardian-first-ready-leg";
  await seedToken(page, "valid-token");
  mock.handlers = {
    "GET /me": () => ok({ learnerStateRef: "gate-explorer", displayName: "Gate Explorer" }),
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
  await seedToken(page, "valid-token");
  mock.handlers = {
    "GET /me": () => ok({ learnerStateRef: "gate-explorer", displayName: "Gate Explorer" }),
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
  await seedToken(page, "valid-token");
  mock.handlers = {
    "GET /me": () => ok({ learnerStateRef: "gate-explorer", displayName: "Gate Explorer" }),
    "GET /expedition/*": () => ok(guardianLegRewardExpedition("guardian-original-first-win")),
    "POST /challenge/create": () => ok({ created: true, view: guardianChallenge(challengeId) }),
    "GET /challenge/*": () => ok({ view: guardianChallenge(challengeId) }),
    "POST /challenge/answer": () => ok(guardianAnswerReply(challengeId))
  };
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);
  await page.getByTestId("guardian-node-v1m").click();
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
  await seedToken(page, "valid-token");
  mock.handlers = {
    "GET /me": () => ok({ learnerStateRef: "gate-explorer", displayName: "Gate Explorer" }),
    "GET /challenge/*": () => ok({ view: guardianChallenge(challengeId, "enrichment") }),
    "POST /challenge/answer": () => ok(guardianAnswerReply(challengeId, "enrichment")),
    "GET /expedition/*": () => ok(guardianSummitRewardExpedition(challengeId))
  };
  await page.goto(`/guardian/${challengeId}`);
  await page.getByRole("button", { name: "The keyed route marker" }).click();
  await page.getByRole("button", { name: "See your formation" }).click();
  await expect(page.getByText("Keystone seated!")).toBeVisible();
  await expect(page.getByRole("img", { name: "Summit peak — Keystone seated." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Explore formation" })).toBeEnabled();
  await page.screenshot({ path: guardianShot("first-summit", test.info().project.name), fullPage: false });
});

test("reward preview failure preserves committed victory, Retry, and plain Continue", async ({ page, mock }) => {
  const challengeId = "guardian-preview-failure";
  await seedToken(page, "valid-token");
  mock.handlers = {
    "GET /me": () => ok({ learnerStateRef: "gate-explorer", displayName: "Gate Explorer" }),
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
  await seedToken(page, "valid-token");
  await seedVistaNavigationMemory(page);
  mock.handlers = {
    "GET /me": () => ok({ learnerStateRef: "gate-explorer", displayName: "Gate Explorer" }),
    "GET /expedition/*": () => ok(formationVistaExpedition("active"))
  };
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);
  await page.getByRole("button", { name: "Open the crystal formation" }).click();
  await expect(page.getByRole("img", { name: /Leg 2: Ready Ridge — Guardian engaged/ })).toBeVisible();
  await page.screenshot({ path: u6Shot("guardian-engaged", test.info().project.name), fullPage: false });
});

test("a complete Leg with zero eligible items shows the honest unavailable copy (R7)", async ({ page, mock }) => {
  await seedToken(page, "valid-token");
  await seedVistaNavigationMemory(page);
  mock.handlers = {
    "GET /me": () => ok({ learnerStateRef: "gate-explorer", displayName: "Gate Explorer" }),
    "GET /expedition/*": () => ok(formationVistaExpedition("unavailable"))
  };
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);
  await page.getByRole("button", { name: "Open the crystal formation" }).click();
  await expect(page.getByRole("img", { name: /Leg 2: Ready Ridge — Guardian has nothing to test yet/ })).toBeVisible();
  await page.screenshot({ path: u6Shot("guardian-unavailable", test.info().project.name), fullPage: false });
});

test("a summit rematch keeps the keystone seated with endurance copy (AE8)", async ({ page, mock }) => {
  const challengeId = "guardian-summit-rematch";
  await seedToken(page, "valid-token");
  mock.handlers = {
    "GET /me": () => ok({ learnerStateRef: "gate-explorer", displayName: "Gate Explorer" }),
    "GET /challenge/*": () => ok({ view: guardianChallenge(challengeId, "enrichment") }),
    "POST /challenge/answer": () => ok(guardianAnswerReply(challengeId, "enrichment")),
    "GET /expedition/*": () => ok(guardianSummitRewardExpedition("summit-original-first-win"))
  };
  await page.goto(`/guardian/${challengeId}`);
  await page.getByRole("button", { name: "The keyed route marker" }).click();
  await page.getByRole("button", { name: "See your formation" }).click();
  await expect(page.getByText("Formation holds strong")).toBeVisible();
  await expect(page.getByRole("img", { name: "Summit peak — Keystone seated." })).toBeVisible();
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
  await seedToken(page, "valid-token");
  mock.handlers = {
    "GET /me": () => ok({ learnerStateRef: "gate-explorer", displayName: "Gate Explorer" }),
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
  await expect(page.getByTestId("island-rim-bound")).toBeVisible();
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
  await seedToken(page, "valid-token");
  mock.handlers = {
    "GET /me": () => ok({ learnerStateRef: "gate-explorer", displayName: "Gate Explorer" }),
    "GET /challenge/*": () => ok({ view: guardianChallenge(challengeId, "enrichment") }),
    "POST /challenge/answer": () => ok(guardianAnswerReply(challengeId, "enrichment")),
    "GET /expedition/*": () => ok(guardianSummitRewardExpedition(challengeId))
  };
  await page.goto(`/guardian/${challengeId}`);
  await page.getByRole("button", { name: "The keyed route marker" }).click();
  await page.getByRole("button", { name: "See your formation" }).click();
  await expect(page.getByText("Keystone seated!")).toBeVisible();
  await expect(page.getByRole("img", { name: "Summit peak — Keystone seated." })).toBeVisible();
  await expect(page.getByTestId("guardian-reward-sweep")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Explore formation" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Continue expedition" })).toBeEnabled();
  await page.screenshot({ path: u6Shot("keystone-reduced-motion", test.info().project.name), fullPage: false });
});

test("reduced motion contextualizes an unseen bound Leg with static emphasis and copy (AE9)", async ({ page, mock }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedToken(page, "valid-token");
  await seedVistaNavigationMemory(page);
  mock.handlers = {
    "GET /me": () => ok({ learnerStateRef: "gate-explorer", displayName: "Gate Explorer" }),
    "GET /expedition/*": () => ok(formationVistaExpedition())
  };
  await page.goto(`/expedition/${FORMATION_ENRICHMENT_ID}`);
  await page.getByRole("button", { name: "Open the crystal formation" }).click();
  // Equivalent text still announces the one-time contextualization; the island renders
  // its final settled state with no transform animation.
  await expect(page.getByText("Leg 1 settles into the Crystal Formation.")).toBeVisible();
  await expect(page.getByRole("img", { name: /Leg 1: Bound Ridge — Bound formation/ })).toBeVisible();
  await page.screenshot({ path: u6Shot("contextualization-reduced-motion", test.info().project.name), fullPage: false });
});

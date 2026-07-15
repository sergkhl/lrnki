import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, ok, seedToken } from "./fixtures";
import { FORMATION_ENRICHMENT_ID, formationExpedition, gradedCorrect } from "./scenarios/crystalFormation";

// Crystal Formation reward acceptance (plan 2026-07-15-002 U3 — the mastery collection
// case; U4-U6 expand this file through Vista, Guardian reward, and summit states). Runs
// against the production Expo export with the typed API intercepted; assertions are
// semantic (accessible names, copy, app-owned state selectors), never pixel baselines.

const EVIDENCE_DIR = path.resolve(__dirname, "../../../tmp/2026-07-15-crystal-formation-reward-ux/milestone-a-collection");

test.afterEach(async ({ pageErrors }) => {
  expect(pageErrors, `unexpected runtime errors:\n${pageErrors.join("\n")}`).toEqual([]);
});

function shot(name: string, projectName: string): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  return path.join(EVIDENCE_DIR, `${projectName}-${name}.png`);
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

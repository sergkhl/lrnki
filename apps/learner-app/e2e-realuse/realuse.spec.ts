import assert from "node:assert/strict";
import { resolve } from "node:path";

import { test, expect, type Locator, type Page } from "@playwright/test";
import type { AuthoredActivity, AuthoredExpedition } from "@lrnki/learner-runtime";
import {
  loadQualifiedCatalogOrThrow,
  qualifiedExpeditionDocument
} from "@lrnki/learner-runtime/content-node";

const RUN_ID = process.env.REALUSE_RUN_ID ?? "";
const PASSWORD = process.env.REALUSE_PASSWORD ?? "";
const API_BASE = process.env.REALUSE_API_BASE ?? "";
const EMAILS: Record<string, string> = {
  phone: process.env.REALUSE_EMAIL_PHONE ?? "",
  desktop: process.env.REALUSE_EMAIL_DESKTOP ?? ""
};
const EXPEDITION_KEY = process.env.REALUSE_EXPEDITION_KEY ?? "";
const EXPEDITION_TITLE = process.env.REALUSE_EXPEDITION_TITLE ?? "";
// run.ts launches Playwright with learner-app as cwd. Keep this CJS/ESM-neutral because the
// Playwright loader may compile the spec differently from the repository's tsx runtime.
const repoRoot = resolve(process.cwd(), "../..");

// Frozen before the UI gate: first-, second-, and third-Leg scopes jointly cover all three Activity
// families, targeted Support, distinct citation sets, intra-/cross-Leg prerequisites, and different
// Guardian pools. Neuroscience retains its exact reviewer/private/source/structural/intercepted and
// direct real-backend execution evidence without being mislabeled as a real-backend UI Leg pass.
const SECONDARY_UI_SCOPES = [
  { expeditionKey: "probability-and-statistics", legKey: "produce-and-describe-data" },
  { expeditionKey: "personal-finance", legKey: "borrow-and-protect" },
  { expeditionKey: "machine-learning", legKey: "deploy-and-respond" }
] as const;
const REVIEW_ONLY_UI_KEY = "neuroscience-of-memory-and-attention";

type QualifiedCatalog = Awaited<ReturnType<typeof loadQualifiedCatalogOrThrow>>;
type AuthoredLeg = AuthoredExpedition["legs"][number];
type AuthoredStop = AuthoredLeg["stops"][number];
type AuthoredSupportPath = AuthoredStop["supportPaths"][number];
type UiCommandResult = Readonly<{
  status: string;
  view?: Readonly<{
    kind?: string;
    state?: string;
    remainingShield?: number;
  }>;
}>;

let catalog: QualifiedCatalog;

test.beforeAll(async () => {
  for (const [key, value] of Object.entries({
    REALUSE_RUN_ID: RUN_ID,
    REALUSE_PASSWORD: PASSWORD,
    REALUSE_API_BASE: API_BASE,
    REALUSE_EMAIL_PHONE: EMAILS.phone,
    REALUSE_EMAIL_DESKTOP: EMAILS.desktop,
    REALUSE_EXPEDITION_KEY: EXPEDITION_KEY,
    REALUSE_EXPEDITION_TITLE: EXPEDITION_TITLE
  })) {
    if (!value) throw new Error(`${key} is required; run through pnpm e2e:web:realuse`);
  }
  catalog = await loadQualifiedCatalogOrThrow(resolve(repoRoot, "content"));
  const flagship = requireDocument(EXPEDITION_KEY);
  assert.equal(flagship.key, "critical-thinking", "real-use preflight must select the flagship");
  assert.equal(flagship.title, EXPEDITION_TITLE);
  for (const scope of SECONDARY_UI_SCOPES) {
    assert.ok(
      requireDocument(scope.expeditionKey).legs.some((leg) => leg.key === scope.legKey),
      `frozen UI scope ${scope.expeditionKey}/${scope.legKey} disappeared`
    );
  }
  requireDocument(REVIEW_ONLY_UI_KEY);
});

const errors: string[] = [];
const EXPECTED_STATUS_NOISE = /Failed to load resource: the server responded with a status of 401/;
test.beforeEach(({ page }) => {
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !EXPECTED_STATUS_NOISE.test(message.text())) {
      errors.push(`console.error: ${message.text()}`);
    }
  });
});
test.afterEach(() => {
  expect(errors, `unexpected runtime errors:\n${errors.join("\n")}`).toEqual([]);
  errors.length = 0;
});

async function fillSignUp(page: Page, email: string, name: string): Promise<void> {
  await page.getByTestId("gate-toggle-intent").click();
  await page.getByLabel("Explorer name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
}

async function expectNoReadableCredential(page: Page): Promise<void> {
  const readable = await page.evaluate(() => ({
    cookie: document.cookie,
    storage: Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? "")
  }));
  expect(readable.cookie).toBe("");
  expect(readable.storage.filter((key) => /token|session|auth|cookie/i.test(key))).toEqual([]);
}

async function signUp(page: Page, email: string, name: string, staleCookie: boolean): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("Choose your explorer")).toBeVisible();
  if (staleCookie) {
    await page.context().addCookies([{
      name: "better-auth.session_token",
      value: "stale-after-greenfield-reset",
      url: API_BASE,
      httpOnly: true
    }]);
    await page.reload();
    await expect(page.getByText("Choose your explorer")).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Enter" }).click();
    await expect(page.locator('[aria-live="polite"]')).toBeVisible();
  }
  await fillSignUp(page, email, name);
  await page.getByRole("button", { name: "Set out" }).click();
  await expect(page.getByText("Expedition journal")).toBeVisible();
  await expectNoReadableCredential(page);
}

async function clickCommand(
  page: Page,
  control: Locator,
  refreshedPath: RegExp
): Promise<UiCommandResult> {
  const command = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().endsWith("/game/commands")
  );
  const refreshed = page.waitForResponse((response) =>
    response.request().method() === "GET" && refreshedPath.test(new URL(response.url()).pathname)
  );
  await expect(control).toBeEnabled();
  await control.click();
  const commandResponse = await command;
  expect(commandResponse.ok()).toBe(true);
  const result = await commandResponse.json() as UiCommandResult;
  expect(result.status).toBe("applied");
  expect((await refreshed).ok()).toBe(true);
  // The refetch response can finish just before React commits the new query result. Waiting for the
  // quiet network boundary prevents the next command from reusing the previous rendered version.
  await page.waitForLoadState("networkidle");
  return result;
}

async function adoptThroughCatalog(
  page: Page,
  expedition: AuthoredExpedition,
  inspectCatalogSources: boolean
): Promise<void> {
  await page.goto("/catalog");
  await page.getByLabel("Search expeditions").fill(expedition.title);
  if (inspectCatalogSources) {
    await page.getByRole("button", { name: "Sources" }).click();
    const credit = expedition.sourceCredits[0];
    assert.ok(credit);
    await expect(page.getByText(credit.title, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Open source: ${credit.title}` })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
  }

  const preAnswerResponse = page.waitForResponse((response) =>
    response.request().method() === "GET" && response.url().endsWith(`/expedition/${expedition.key}`)
  );
  await page.getByRole("button", { name: "Add to journal" }).click();
  await expect(page).toHaveURL(new RegExp(`/expedition/${expedition.key}$`));
  const response = await preAnswerResponse;
  const preAnswerBody = JSON.stringify(await response.json());
  expect(preAnswerBody).not.toMatch(
    /answerKey|feedbackSourceCreditKeys|sourceAnchor|"kind":"truth"|"kind":"impostor"/
  );
  expect(preAnswerBody).toMatch(/sourceCredits|sourceCreditKeys/);
  for (const leg of expedition.legs) {
    await expect(page.getByText(leg.title, { exact: true })).toBeVisible();
  }
}

function stopCard(page: Page, stopKey: string): Locator {
  return page.getByTestId(`stop-${stopKey}`);
}

function activityCard(page: Page, activityKey: string): Locator {
  return page.getByTestId(`activity-${activityKey}`);
}

async function calibrateKnown(page: Page, stop: AuthoredStop): Promise<void> {
  const card = stopCard(page, stop.key);
  await expect(card).toBeVisible();
  await clickCommand(
    page,
    card.getByRole("button", { name: "I already know this" }),
    new RegExp(`/expedition/[^/]+$`)
  );
  await expect(card.getByText("known", { exact: true })).toBeVisible();
}

async function clearKnown(page: Page, stop: AuthoredStop): Promise<void> {
  const card = stopCard(page, stop.key);
  await clickCommand(
    page,
    card.getByRole("button", { name: "Clear known" }),
    new RegExp(`/expedition/[^/]+$`)
  );
}

async function markLessonRead(page: Page, stop: AuthoredStop): Promise<void> {
  const card = stopCard(page, stop.key);
  const button = card.getByRole("button", { name: "Mark lesson read" });
  if (await button.isVisible().catch(() => false)) {
    await clickCommand(page, button, new RegExp(`/expedition/[^/]+$`));
  }
  await expect(card.getByText("Lesson read", { exact: true })).toBeVisible();
}

function creditTitle(expedition: AuthoredExpedition, creditKey: string): string {
  const credit = expedition.sourceCredits.find((candidate) => candidate.key === creditKey);
  assert.ok(credit, `${expedition.key} lost source credit ${creditKey}`);
  return credit.title;
}

async function expandRepresentativeLessonCredit(
  page: Page,
  expedition: AuthoredExpedition,
  stop: AuthoredStop
): Promise<void> {
  const section = stop.lesson.sections[0];
  const sourceKey = section?.sourceCreditKeys[0];
  assert.ok(section && sourceKey);
  const card = stopCard(page, stop.key);
  const toggle = card.getByLabel(`Show sources for the Lesson section “${section.title}”`);
  await toggle.click();
  await expect(card.getByText(creditTitle(expedition, sourceKey), { exact: true })).toBeVisible();
  await expect(
    card.getByLabel(`Hide sources for the Lesson section “${section.title}”`)
  ).toHaveAttribute("aria-expanded", "true");
}

function correctSelection(activity: Exclude<AuthoredActivity, { family: "matching" }>): string {
  if (activity.family === "option_select") {
    const answer = activity.options.find((option) => option.key === activity.answerKey);
    assert.ok(answer);
    return answer.text;
  }
  const answer = activity.statements.find((statement) => statement.kind === "impostor");
  assert.ok(answer);
  return answer.text;
}

function wrongSelection(activity: Exclude<AuthoredActivity, { family: "matching" }>): string {
  if (activity.family === "option_select") {
    const answer = activity.options.find((option) => option.key !== activity.answerKey);
    assert.ok(answer);
    return answer.text;
  }
  const answer = activity.statements.find((statement) => statement.kind === "truth");
  assert.ok(answer);
  return answer.text;
}

async function fillMatching(
  card: Locator,
  activity: Extract<AuthoredActivity, { family: "matching" }>,
  correct: boolean
): Promise<void> {
  const rights = activity.pairs.map((pair) => pair.right);
  for (let index = 0; index < activity.pairs.length; index += 1) {
    const pair = activity.pairs[index]!;
    const right = correct ? pair.right : rights[(index + 1) % rights.length]!;
    await card.getByLabel(pair.left, { exact: true }).click();
    await card.getByLabel(right, { exact: true }).click();
  }
}

async function answerActivityOnce(
  page: Page,
  activity: AuthoredActivity,
  correct: boolean
): Promise<void> {
  const card = activityCard(page, activity.key);
  await expect(card).toBeVisible();
  if (activity.family === "matching") {
    await fillMatching(card, activity, correct);
    await clickCommand(
      page,
      card.getByRole("button", { name: "Submit matches" }),
      new RegExp(`/expedition/[^/]+$`)
    );
  } else {
    await clickCommand(
      page,
      card.getByLabel(correct ? correctSelection(activity) : wrongSelection(activity), { exact: true }),
      new RegExp(`/expedition/[^/]+$`)
    );
  }
  await expect(card.getByText(correct ? "Correct." : "Not quite.", { exact: true })).toBeVisible();
}

async function answerActivityWrongThenCorrect(
  page: Page,
  expedition: AuthoredExpedition,
  activity: AuthoredActivity,
  inspectExplanationCredit: boolean
): Promise<void> {
  const card = activityCard(page, activity.key);
  await expect(card.getByLabel("Show sources for this graded explanation")).toHaveCount(0);
  await answerActivityOnce(page, activity, false);
  if (activity.family === "matching") await card.getByRole("button", { name: "Reset" }).click();
  await answerActivityOnce(page, activity, true);
  if (inspectExplanationCredit) {
    const sourceKey = activity.explanation.sourceCreditKeys[0];
    assert.ok(sourceKey);
    const toggle = card.getByLabel("Show sources for this graded explanation");
    await toggle.click();
    await expect(card.getByText(creditTitle(expedition, sourceKey), { exact: true })).toBeVisible();
  }
}

async function exerciseSupport(
  page: Page,
  expedition: AuthoredExpedition,
  parent: AuthoredStop,
  support: AuthoredSupportPath
): Promise<void> {
  await clickCommand(
    page,
    page.getByTestId(`support-path-${support.key}`),
    new RegExp(`/expedition/${expedition.key}$`)
  );
  await expect(page.getByText("Support Path", { exact: true })).toBeVisible();
  await expect(page.getByText(/reuses ordinary acquisition evidence/i)).toBeVisible();
  const sourceToggle = page.getByLabel(/Show sources for the Support Lesson section/).first();
  await sourceToggle.click();
  await expect(page.getByTestId("source-credit-list").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide path" })).toBeVisible();
  await page.getByRole("button", { name: "Keep exploring" }).click();
  await expect(page.getByText("Support Path", { exact: true })).toHaveCount(0);
  await expect(stopCard(page, parent.key)).toBeVisible();
}

async function completeStop(
  page: Page,
  expedition: AuthoredExpedition,
  stop: AuthoredStop,
  inspectCredits: boolean
): Promise<void> {
  if (inspectCredits) await expandRepresentativeLessonCredit(page, expedition, stop);
  await markLessonRead(page, stop);
  for (let index = 0; index < stop.activities.length; index += 1) {
    await answerActivityWrongThenCorrect(
      page,
      expedition,
      stop.activities[index]!,
      inspectCredits && index === 0
    );
  }
  await expect(stopCard(page, stop.key).getByText("mastered", { exact: true })).toBeVisible();
}

function transitiveExternalPrerequisites(
  expedition: AuthoredExpedition,
  targetLeg: AuthoredLeg
): AuthoredStop[] {
  const allStops = expedition.legs.flatMap((leg) => leg.stops);
  const byKey = new Map(allStops.map((stop) => [stop.key, stop] as const));
  const targetKeys = new Set(targetLeg.stops.map((stop) => stop.key));
  const required = new Set<string>();
  const add = (key: string): void => {
    if (targetKeys.has(key) || required.has(key)) return;
    const stop = byKey.get(key);
    assert.ok(stop, `${expedition.key}/${targetLeg.key} prerequisite ${key} disappeared`);
    for (const dependency of stop.requires) add(dependency);
    required.add(key);
  };
  for (const stop of targetLeg.stops) {
    for (const dependency of stop.requires) add(dependency);
  }
  return allStops.filter((stop) => required.has(stop.key));
}

async function currentGuardianActivity(
  page: Page,
  expedition: AuthoredExpedition
): Promise<{ activity: AuthoredActivity; card: Locator }> {
  const card = page.locator('[data-testid^="guardian-activity-"]').first();
  await expect(card).toBeVisible();
  const testId = await card.getAttribute("data-testid");
  if (!testId?.startsWith("guardian-activity-")) {
    throw new Error(`${expedition.key} Guardian Activity card lost its stable test id`);
  }
  const key = testId.slice("guardian-activity-".length);
  const activity = expedition.legs
    .flatMap((leg) => leg.stops)
    .flatMap((stop) => stop.activities)
    .find((candidate) => candidate.key === key);
  assert.ok(activity, `${expedition.key} Guardian projected unknown Activity ${key}`);
  return { activity, card };
}

async function answerGuardianWrong(page: Page, expedition: AuthoredExpedition): Promise<string | undefined> {
  const { activity, card } = await currentGuardianActivity(page, expedition);
  let result: UiCommandResult;
  if (activity.family === "matching") {
    const first = activity.pairs[0];
    const wrong = activity.pairs.find((pair) => pair.right !== first?.right);
    assert.ok(first && wrong);
    await card.getByLabel(first.left, { exact: true }).click();
    result = await clickCommand(page, card.getByLabel(wrong.right, { exact: true }), /\/guardian\//);
    await expect(page.getByText("The shield took the hit.", { exact: true })).toBeVisible();
    // A wrong Matching pair taints the round; the combat fold spends shield only after the learner
    // finishes that round. Close every real pair so this helper records one complete miss.
    for (const pair of activity.pairs) {
      await card.getByLabel(pair.left, { exact: true }).click();
      result = await clickCommand(page, card.getByLabel(pair.right, { exact: true }), /\/guardian\//);
    }
  } else {
    result = await clickCommand(
      page,
      card.getByLabel(wrongSelection(activity), { exact: true }),
      /\/guardian\//
    );
    await expect(page.getByText("The shield took the hit.", { exact: true })).toBeVisible();
  }
  if (result.view?.state === "recovery") {
    await expect(page.getByText("Last Stand", { exact: true })).toBeVisible();
  } else if (result.view?.remainingShield !== undefined) {
    await expect(page.getByText(new RegExp(`Shield ${result.view.remainingShield}/`))).toBeVisible();
  }
  return result.view?.state;
}

async function answerGuardianCorrect(page: Page, expedition: AuthoredExpedition): Promise<AuthoredActivity> {
  const { activity, card } = await currentGuardianActivity(page, expedition);
  if (activity.family === "matching") {
    for (const pair of activity.pairs) {
      await card.getByLabel(pair.left, { exact: true }).click();
      await clickCommand(page, card.getByLabel(pair.right, { exact: true }), /\/guardian\//);
    }
  } else {
    await clickCommand(page, card.getByLabel(correctSelection(activity), { exact: true }), /\/guardian\//);
  }
  return activity;
}

async function solveGuardian(
  page: Page,
  expedition: AuthoredExpedition,
  wrongHits: number,
  inspectExplanationCredit: boolean
): Promise<void> {
  let recoveryReached = false;
  for (let miss = 0; miss < wrongHits; miss += 1) {
    if ((await answerGuardianWrong(page, expedition)) === "recovery") {
      recoveryReached = true;
      break;
    }
  }
  if (wrongHits === 3) assert.equal(recoveryReached, true, "three applied misses must exhaust shield");

  let inspected = !inspectExplanationCredit;
  for (let turn = 0; turn < 100; turn += 1) {
    const victory = page.getByText("Guardian won", { exact: true });
    const activityCard = page.locator('[data-testid^="guardian-activity-"]').first();
    await expect(victory.or(activityCard)).toBeVisible();
    if (await victory.isVisible().catch(() => false)) return;
    const activity = await answerGuardianCorrect(page, expedition);
    if (!inspected) {
      const toggle = page.getByLabel("Show sources for this graded Guardian explanation");
      if (await toggle.isVisible().catch(() => false)) {
        const sourceKey = activity.explanation.sourceCreditKeys[0];
        assert.ok(sourceKey);
        await toggle.click();
        await expect(
          page.locator('[data-testid^="guardian-activity-"]').first()
            .getByText(creditTitle(expedition, sourceKey), { exact: true })
        ).toBeVisible();
        inspected = true;
      }
    }
  }
  throw new Error(`${expedition.key} Guardian did not finish within 100 UI turns`);
}

async function enterGuardian(
  page: Page,
  gateTestId: string,
  buttonName: "Challenge Guardian" | "Rematch Guardian"
): Promise<void> {
  await clickCommand(
    page,
    page.getByTestId(gateTestId).getByRole("button", { name: buttonName }),
    /\/expedition\//
  );
  await expect(page).toHaveURL(/\/guardian\/[^/]+\/[^/]+$/);
  await expect(page.locator('[data-testid^="guardian-activity-"]').first()).toBeVisible();
}

async function returnToTrail(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Return to trail" }).click();
  await expect(page).toHaveURL(/\/expedition\/[^/]+$/);
}

async function exerciseFlagship(page: Page): Promise<AuthoredExpedition> {
  const expedition = requireDocument("critical-thinking");
  await adoptThroughCatalog(page, expedition, true);

  for (const key of [
    "map-an-argument",
    "weigh-inductive-support",
    "investigate-source-fit",
    "distinguish-causal-support"
  ]) {
    await calibrateKnown(page, requireStop(expedition, key));
  }
  const dependent = requireStop(expedition, "compare-plausible-explanations");
  await markLessonRead(page, dependent);
  await answerActivityOnce(page, requireActivity(expedition, "choose-discriminating-test"), false);
  await expect(
    stopCard(page, dependent.key).getByText(/Restore calibrated prerequisites: distinguish-causal-support/)
  ).toBeVisible();
  await clearKnown(page, requireStop(expedition, "distinguish-causal-support"));
  await expect(stopCard(page, dependent.key).getByText("locked", { exact: true })).toBeVisible();

  const representativeSupport = expedition.legs
    .flatMap((leg) => leg.stops)
    .flatMap((stop) => stop.supportPaths.map((support) => ({ stop, support })))
    .at(0);
  assert.ok(representativeSupport);
  let supportExercised = false;
  let firstStop = true;
  for (const leg of expedition.legs) {
    for (const stop of leg.stops) {
      if (!supportExercised && stop.key === representativeSupport.stop.key) {
        await exerciseSupport(page, expedition, stop, representativeSupport.support);
        supportExercised = true;
      }
      await completeStop(page, expedition, stop, firstStop);
      firstStop = false;
    }
  }
  assert.equal(supportExercised, true);

  await expect(
    page.getByTestId("guardian-expedition").getByRole("button", { name: "Guardian locked" })
  ).toBeDisabled();

  const firstLeg = expedition.legs[0];
  assert.ok(firstLeg);
  await enterGuardian(page, `guardian-leg-${firstLeg.key}`, "Challenge Guardian");
  await solveGuardian(page, expedition, 3, true);
  await expect(page.getByText(/first-win reward is durable/i)).toBeVisible();
  await returnToTrail(page);

  await enterGuardian(page, `guardian-leg-${firstLeg.key}`, "Rematch Guardian");
  await solveGuardian(page, expedition, 0, false);
  await expect(page.getByText(/Rematch complete/)).toBeVisible();
  await returnToTrail(page);

  for (const leg of expedition.legs.slice(1)) {
    await enterGuardian(page, `guardian-leg-${leg.key}`, "Challenge Guardian");
    await solveGuardian(page, expedition, 0, false);
    await returnToTrail(page);
  }
  await enterGuardian(page, "guardian-expedition", "Challenge Guardian");
  await solveGuardian(page, expedition, 0, false);
  await expect(page.getByText(/summit keystone is seated/i)).toBeVisible();
  await returnToTrail(page);
  return expedition;
}

async function exerciseSecondaryScopes(page: Page): Promise<AuthoredExpedition[]> {
  const completed: AuthoredExpedition[] = [];
  for (let scopeIndex = 0; scopeIndex < SECONDARY_UI_SCOPES.length; scopeIndex += 1) {
    const scope = SECONDARY_UI_SCOPES[scopeIndex]!;
    const expedition = requireDocument(scope.expeditionKey);
    const leg = expedition.legs.find((candidate) => candidate.key === scope.legKey);
    assert.ok(leg);
    await adoptThroughCatalog(page, expedition, scopeIndex === 0);
    for (const prerequisite of transitiveExternalPrerequisites(expedition, leg)) {
      await calibrateKnown(page, prerequisite);
    }
    const representativeSupport = leg.stops
      .flatMap((stop) => stop.supportPaths.map((support) => ({ stop, support })))
      .at(0);
    assert.ok(representativeSupport, `${expedition.key}/${leg.key} needs targeted Support`);
    let supportExercised = false;
    for (let stopIndex = 0; stopIndex < leg.stops.length; stopIndex += 1) {
      const stop = leg.stops[stopIndex]!;
      if (!supportExercised && stop.key === representativeSupport.stop.key) {
        await exerciseSupport(page, expedition, stop, representativeSupport.support);
        supportExercised = true;
      }
      await completeStop(page, expedition, stop, stopIndex === 0);
    }
    assert.equal(supportExercised, true);
    await enterGuardian(page, `guardian-leg-${leg.key}`, "Challenge Guardian");
    await solveGuardian(page, expedition, 0, scopeIndex === 0);
    await returnToTrail(page);
    completed.push(expedition);
  }
  return completed;
}

async function dismissBoardSplash(page: Page): Promise<void> {
  const splash = page.getByText("You climbed the board!", { exact: true });
  if (await splash.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Close" }).click();
  }
}

async function verifyPersistenceAndCompactNavigation(
  page: Page,
  email: string,
  expected: readonly AuthoredExpedition[],
  absentTitles: readonly string[]
): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("Expedition journal", { exact: true })).toBeVisible();
  await dismissBoardSplash(page);
  for (const expedition of expected) {
    await expect(page.getByText(expedition.title, { exact: true })).toBeVisible();
  }
  for (const title of absentTitles) await expect(page.getByText(title, { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Expedition journal", { exact: true })).toBeVisible();
  for (const expedition of expected) {
    await expect(page.getByText(expedition.title, { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "View the board" }).click();
  await expect(page.getByText("This week’s climbers")).toBeVisible();
  await expect(page.getByText(email.split("@")[0]!, { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByText("Choose your explorer")).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByText("Expedition journal", { exact: true })).toBeVisible();
  for (const expedition of expected) {
    await expect(page.getByText(expedition.title, { exact: true })).toBeVisible();
  }
  await expectNoReadableCredential(page);
}

function requireDocument(expeditionKey: string): AuthoredExpedition {
  const document = qualifiedExpeditionDocument(catalog, expeditionKey);
  assert.ok(document, `qualified catalog lost ${expeditionKey}`);
  return document;
}

function requireStop(expedition: AuthoredExpedition, stopKey: string): AuthoredStop {
  const stop = expedition.legs.flatMap((leg) => leg.stops).find((candidate) => candidate.key === stopKey);
  assert.ok(stop, `${expedition.key} lost Stop ${stopKey}`);
  return stop;
}

function requireActivity(expedition: AuthoredExpedition, activityKey: string): AuthoredActivity {
  const activity = expedition.legs
    .flatMap((leg) => leg.stops)
    .flatMap((stop) => stop.activities)
    .find((candidate) => candidate.key === activityKey);
  assert.ok(activity, `${expedition.key} lost Activity ${activityKey}`);
  return activity;
}

test("reviewed authored routes: flagship summit, three frozen Leg scopes, privacy, citations, isolation, and persistence", async ({ page }, testInfo) => {
  test.setTimeout(10 * 60_000);
  const email = EMAILS[testInfo.project.name];
  expect(email).toBeTruthy();
  await signUp(page, email, email.split("@")[0]!, testInfo.project.name === "phone");

  if (testInfo.project.name === "phone") {
    const flagship = await exerciseFlagship(page);
    const absent = SECONDARY_UI_SCOPES
      .map((scope) => requireDocument(scope.expeditionKey).title)
      .concat(requireDocument(REVIEW_ONLY_UI_KEY).title);
    await verifyPersistenceAndCompactNavigation(page, email, [flagship], absent);
  } else {
    const secondary = await exerciseSecondaryScopes(page);
    await verifyPersistenceAndCompactNavigation(
      page,
      email,
      secondary,
      [requireDocument("critical-thinking").title, requireDocument(REVIEW_ONLY_UI_KEY).title]
    );
  }
});

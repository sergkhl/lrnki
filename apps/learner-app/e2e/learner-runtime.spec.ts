import {
  test,
  expect,
  ok,
  status,
  signedIn,
  signedOut,
  credentialSuccess,
  invalidCredentials,
  emptyJournalRead,
  journalRead,
  catalogRead,
  expeditionRead,
  guardianRead,
  guardianActiveView,
  leaderboardRead,
  appliedTransition,
  readableStorageKeys
} from "./fixtures";

test.afterEach(async ({ pageErrors }) => {
  expect(pageErrors, `unexpected runtime errors:\n${pageErrors.join("\n")}`).toEqual([]);
});

test("email refusal followed by sign-up reaches the authored Journal without a readable credential", async ({ page, mock }) => {
  mock.handlers = {
    ...signedOut(),
    "POST /auth/sign-in/email": () => status(401, invalidCredentials),
    "POST /auth/sign-up/email": () => ok(credentialSuccess),
    "GET /journal": () => ok(emptyJournalRead),
    "GET /leaderboard": () => ok(leaderboardRead)
  };

  await page.goto("/");
  await expect(page.getByText("Choose your explorer")).toBeVisible();
  await page.getByLabel("Email").fill("gate-explorer@e2e.invalid");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByText(/match an explorer/i)).toBeVisible();

  await page.getByTestId("gate-toggle-intent").click();
  await page.getByLabel("Explorer name").fill("Gate Explorer");
  await page.getByRole("button", { name: "Set out" }).click();
  await expect(page.getByText("Expedition journal")).toBeVisible();
  await expect(page.getByText("Begin with an authored expedition")).toBeVisible();
  expect(await readableStorageKeys(page)).not.toContainEqual(expect.stringMatching(/token|session|auth/i));
});

test("Journal and board retain the selected game presentation without generation states", async ({ page, mock }) => {
  mock.handlers = {
    ...signedIn(),
    "GET /journal": () => ok(journalRead),
    "GET /leaderboard": () => ok(leaderboardRead)
  };

  await page.goto("/");
  await expect(page.getByText("Expedition journal")).toBeVisible();
  await expect(page.getByText("Critical Thinking")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Resume trail" })).toBeVisible();
  await expect(page.getByText(/generat|planning|retry topic/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "View the board" }).click();
  await expect(page.getByText("This week’s climbers")).toBeVisible();
  await expect(page.getByText("Mina", { exact: true })).toBeVisible();
  await expect(page.getByText(/Basecamp · 1 crystals/)).toBeVisible();
});

test("Catalog adopts and activates through the single command endpoint, then opens authored-key content", async ({ page, mock }) => {
  const unadopted = {
    ...catalogRead,
    view: {
      ...catalogRead.view,
      expeditions: catalogRead.view.expeditions.map((candidate) => ({
        ...candidate,
        adopted: false,
        active: false
      }))
    }
  };
  mock.handlers = {
    "GET /catalog": () => ok(unadopted),
    "POST /game/commands": ({ postData }) => {
      const kind = (postData as { command?: { kind?: string } } | undefined)?.command?.kind;
      return ok(appliedTransition({ kind: kind === "adopt_expedition" ? "expedition_adopted" : "expedition_activated" }));
    },
    "GET /expedition/*": () => ok(expeditionRead)
  };

  await page.goto("/catalog");
  await expect(page.getByText("Browse expeditions")).toBeVisible();
  await page.getByRole("button", { name: "Sources" }).click();
  await expect(page.getByText("Critical Thinking source guide")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open source: Critical Thinking source guide" })).toBeVisible();
  await expect(page.getByText(/no independent factual-verification claim/i)).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Add to journal" }).click();
  await expect(page).toHaveURL(/\/expedition\/critical-thinking$/);
  await expect(page.getByText("From claims to warranted conclusions")).toBeVisible();

  const commands = mock.requests
    .filter((request) => request.pathname === "/game/commands")
    .map((request) => (request.postData as { command: { kind: string; expeditionKey: string } }).command);
  expect(commands).toEqual([
    { kind: "adopt_expedition", expeditionKey: "critical-thinking" },
    { kind: "activate_expedition", expeditionKey: "critical-thinking" }
  ]);
});

test("authored trail renders all activity families and opens an exact-reference Support Path immediately", async ({ page, mock }) => {
  mock.handlers = {
    "GET /expedition/*": () => ok(expeditionRead),
    "POST /game/commands": ({ postData }) => {
      const command = (postData as { command: { kind: string; supportPathKey?: string } }).command;
      return ok(appliedTransition({
        kind: command.kind === "open_support_path" ? "support_opened" : "activity_answered",
        supportPathKey: command.supportPathKey ?? null,
        correct: command.kind.startsWith("answer_") ? true : null,
        feedback: command.kind.startsWith("answer_") ? "The authored explanation is returned only after grading." : null,
        feedbackSourceCreditKeys: command.kind.startsWith("answer_") ? ["reasoning-guide"] : []
      }));
    }
  };

  await page.goto("/expedition/critical-thinking");
  await expect(page.getByText("Choose", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Match", { exact: true })).toBeVisible();
  await expect(page.getByText("Find the impostor", { exact: true })).toBeVisible();
  await expect(page.getByText("support relationship", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Show sources for the Lesson section “Separate claims from support”")).toBeVisible();
  await expect(page.getByLabel("Show sources for this graded explanation")).toHaveCount(0);

  await page.getByLabel("The northern road is closed.").first().click();
  await expect(page.getByText("The authored explanation is returned only after grading.")).toBeVisible();
  await page.getByLabel("Show sources for this graded explanation").click();
  await expect(page.getByRole("button", { name: "Open source: Critical Thinking source guide" })).toBeVisible();

  await page.getByRole("button", { name: /Explore “support relationship” Support Path/ }).click();
  await expect(page.getByText("Support Path", { exact: true })).toBeVisible();
  await expect(page.getByText("1. See the support structure")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh path" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide path" })).toBeVisible();
  await expect(page.getByText(/generating|failed support|polling/i)).toHaveCount(0);

  const open = mock.requests.find((request) => {
    const command = (request.postData as { command?: { kind?: string } } | undefined)?.command;
    return command?.kind === "open_support_path";
  });
  expect(open?.pathname).toBe("/game/commands");
  expect((open?.postData as { command: unknown }).command).toEqual({
    kind: "open_support_path",
    expeditionKey: "critical-thinking",
    stopKey: "evidence-quality",
    supportPathKey: "review-support-relationship"
  });
});

test("Guardian uses authored activities and the command union without exposing a keyed correctness flag", async ({ page, mock }) => {
  mock.handlers = {
    "GET /guardian/*": () => ok(guardianRead),
    "POST /game/commands": ({ postData }) => {
      const command = (postData as { command: { chosenKey?: string } }).command;
      return ok(appliedTransition({
        kind: "guardian_answered",
        challengeId: "guardian-e2e",
        activityKey: "spot-evidence-impostor",
        correct: true,
        revealKey: command.chosenKey ?? null,
        feedback: "Large samples do not repair biased selection.",
        feedbackSourceCreditKeys: ["reasoning-guide"]
      }, guardianActiveView));
    }
  };

  await page.goto("/guardian/critical-thinking/guardian-e2e");
  await expect(page.getByText("3 wards remain")).toBeVisible();
  await expect(page.getByText("Shield 3/3 · 0/3 resolved")).toBeVisible();
  await expect(page.getByText("A large sample always removes selection bias.")).toBeVisible();

  const preAnswerPayload = JSON.stringify(guardianRead);
  expect(preAnswerPayload).not.toMatch(/answerKey|correctKey|"correct":true/);

  await page.getByLabel("A large sample always removes selection bias.").click();
  await expect(page.getByText("Ward resolved.")).toBeVisible();
  await expect(page.getByText("Large samples do not repair biased selection.")).toBeVisible();
  await page.getByLabel("Show sources for this graded Guardian explanation").click();
  await expect(page.getByRole("button", { name: "Open source: Critical Thinking source guide" })).toBeVisible();
  const command = mock.requests.find((request) => request.pathname === "/game/commands");
  expect((command?.postData as { command: unknown }).command).toEqual({
    kind: "answer_guardian_selection",
    expeditionKey: "critical-thinking",
    challengeId: "guardian-e2e",
    activityKey: "spot-evidence-impostor",
    chosenKey: "size-cures-bias"
  });
});

test("the trail's Expedition journal control targets home after a Guardian retreat", async ({ page, mock }) => {
  mock.handlers = {
    ...signedIn(),
    "GET /guardian/*": () => ok(guardianRead),
    "GET /expedition/*": () => ok(expeditionRead),
    "GET /journal": () => ok(journalRead),
    "GET /leaderboard": () => ok(leaderboardRead),
    "POST /game/commands": () => ok(appliedTransition({ kind: "guardian_retreated", challengeId: "guardian-e2e" }))
  };

  await page.goto("/guardian/critical-thinking/guardian-e2e");
  await page.getByRole("button", { name: "Retreat to trail" }).click();
  await expect(page).toHaveURL(/\/expedition\/critical-thinking$/);

  await page.getByRole("button", { name: "Expedition journal" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Expedition journal", { exact: true })).toBeVisible();
});

test("named read failures remain recoverable and signed-in", async ({ page, mock }) => {
  mock.handlers = {
    ...signedIn(),
    "GET /journal": () => status(500),
    "GET /leaderboard": () => ok(leaderboardRead)
  };
  await page.goto("/");
  await expect(page.getByText("Your journal is out of reach")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByText("Choose your explorer")).toHaveCount(0);
});

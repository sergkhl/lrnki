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
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/match an explorer/i)).toBeVisible();

  await page.getByTestId("gate-toggle-intent").click();
  await page.getByLabel("Explorer name").fill("Gate Explorer");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Expedition journal")).toBeVisible();
  await expect(page.getByText("Choose your first expedition")).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
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
    ...signedIn(),
    "GET /catalog": () => ok(unadopted),
    "POST /game/commands": ({ postData }) => {
      const kind = (postData as { command?: { kind?: string } } | undefined)?.command?.kind;
      return ok(appliedTransition({ kind: kind === "adopt_expedition" ? "expedition_adopted" : "expedition_activated" }));
    },
    "GET /expedition/*": () => ok(expeditionRead)
  };

  await page.goto("/catalog");
  await expect(page.getByText("Browse expeditions")).toBeVisible();
  await page.getByRole("button", { name: "Show sources for Critical Thinking" }).click();
  await expect(page.getByText("Critical Thinking source guide")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open source: Critical Thinking source guide" })).toBeVisible();
  await page.getByRole("button", { name: "Close sources" }).click();

  await page.getByRole("button", { name: "Start expedition" }).click();
  await expect(page).toHaveURL(/\/expedition\/critical-thinking$/);
  await page.getByRole("button", { name: "Trail", exact: true }).click();
  await expect(page.getByTestId("trail-overview").getByText("Make the Reasoning Visible", { exact: true })).toBeVisible();
  await expect(page.getByTestId("trail-overview").getByText("Interrogate the Evidence")).toBeVisible();
  await expect(page.getByTestId("trail-overview").getByText("Decide and Revise")).toBeVisible();

  const commands = mock.requests
    .filter((request) => request.pathname === "/game/commands")
    .map((request) => (request.postData as { command: { kind: string; expeditionKey: string } }).command);
  expect(commands).toEqual([
    { kind: "adopt_expedition", expeditionKey: "critical-thinking" },
    { kind: "activate_expedition", expeditionKey: "critical-thinking" }
  ]);
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

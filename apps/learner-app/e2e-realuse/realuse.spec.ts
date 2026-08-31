import { test, expect, type Page } from "@playwright/test";

const RUN_ID = process.env.REALUSE_RUN_ID ?? "";
const PASSWORD = process.env.REALUSE_PASSWORD ?? "";
const API_BASE = process.env.REALUSE_API_BASE ?? "";
const EMAILS: Record<string, string> = {
  phone: process.env.REALUSE_EMAIL_PHONE ?? "",
  desktop: process.env.REALUSE_EMAIL_DESKTOP ?? ""
};
const EXPEDITION_KEY = process.env.REALUSE_EXPEDITION_KEY ?? "";
const EXPEDITION_TITLE = process.env.REALUSE_EXPEDITION_TITLE ?? "";

test.beforeAll(() => {
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

async function completeFirstStopAndOpenSupport(page: Page): Promise<void> {
  await page.goto("/catalog");
  await page.getByLabel("Search expeditions").fill(EXPEDITION_TITLE);
  const preAnswerResponse = page.waitForResponse((response) =>
    response.request().method() === "GET" && response.url().endsWith(`/expedition/${EXPEDITION_KEY}`)
  );
  await page.getByRole("button", { name: "Add to journal" }).click();
  await expect(page).toHaveURL(new RegExp(`/expedition/${EXPEDITION_KEY}$`));
  const preAnswerBody = JSON.stringify(await (await preAnswerResponse).json());
  expect(preAnswerBody).not.toMatch(/answerKey|correctKey|"kind":"truth"|"kind":"impostor"/);

  await page.getByRole("button", { name: "Mark lesson read" }).first().click();
  await page.getByLabel("We should take the southern road.").click();
  await expect(page.getByText("Correct.").first()).toBeVisible();

  const match = async (left: string, right: string) => {
    await page.getByLabel(left, { exact: true }).click();
    await page.getByLabel(right, { exact: true }).click();
  };
  await match("Claim", "A statement that can be accepted or rejected");
  await match("Reason", "A claim offered in support of another claim");
  await match("Conclusion", "The claim the reasons are intended to support");
  await page.getByRole("button", { name: "Submit matches" }).click();
  await expect(page.getByText(/Stop mastered · \+1 weekly points/)).toBeVisible();

  await page.getByRole("button", { name: /Explore “support relationship” Support Path/ }).click();
  await expect(page.getByText("Support Path", { exact: true })).toBeVisible();
  await expect(page.getByText(/reuses ordinary acquisition evidence/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide path" })).toBeVisible();
  await page.getByRole("button", { name: "Keep exploring" }).click();
}

test("real authored journey: auth recovery, private grading, Support, persistence, and board", async ({ page }, testInfo) => {
  const email = EMAILS[testInfo.project.name];
  expect(email).toBeTruthy();
  await signUp(page, email, email.split("@")[0]!, testInfo.project.name === "phone");
  await completeFirstStopAndOpenSupport(page);

  await page.goto("/");
  await page.reload();
  await expect(page.getByText(EXPEDITION_TITLE).first()).toBeVisible();
  await expect(page.getByText(/1 earned · 0 calibrated · 3 stops/)).toBeVisible();
  await expect(page.getByText("You climbed the board!")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "View the board" }).click();
  await expect(page.getByText("This week’s climbers")).toBeVisible();
  await expect(page.getByText(email.split("@")[0]!, { exact: false })).toBeVisible();
});

import { test, expect, status } from "./fixtures";

test.afterEach(async ({ pageErrors }) => {
  expect(pageErrors, `unexpected runtime errors:\n${pageErrors.join("\n")}`).toEqual([]);
});

test("a hard-loaded Expedition id reaches its unavailable surface without hydration errors", async ({
  page,
  mock
}) => {
  mock.handlers = { "GET /expedition/*": () => status(404) };

  await page.goto("/expedition/missing-expedition");

  await expect(page.getByText("This expedition isn’t available.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to trail" })).toBeVisible();
});

test("a hard-loaded Guardian id reaches its unavailable surface without hydration errors", async ({
  page,
  mock
}) => {
  mock.handlers = { "GET /challenge/*": () => status(404) };

  await page.goto("/guardian/missing-guardian");

  await expect(page.getByText("This fight is over")).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to trail" })).toBeVisible();
});

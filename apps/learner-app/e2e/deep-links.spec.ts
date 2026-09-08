import { test, expect, status, signedIn } from "./fixtures";

test.afterEach(async ({ pageErrors }) => {
  expect(pageErrors, `unexpected runtime errors:\n${pageErrors.join("\n")}`).toEqual([]);
});

test("a hard-loaded authored Expedition key reaches its unavailable surface without hydration errors", async ({ page, mock }) => {
  mock.handlers = {
    ...signedIn(),
    "GET /expedition/*": () => status(404, {
      status: "not_found",
      stateVersion: "0",
      resource: "expedition"
    })
  };

  await page.goto("/expedition/missing-expedition");
  await expect(page.getByText("This expedition is unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to journal" })).toBeVisible();
});

test("a hard-loaded authored Guardian identity reaches its unavailable surface without hydration errors", async ({ page, mock }) => {
  mock.handlers = {
    "GET /guardian/*": () => status(404, {
      status: "not_found",
      stateVersion: "0",
      resource: "guardian"
    })
  };

  await page.goto("/guardian/critical-thinking/missing-guardian");
  await expect(page.getByText("This Guardian cannot be resumed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to trail" })).toBeVisible();
});

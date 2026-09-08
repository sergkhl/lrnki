import { test, expect, ok, signedOut, sessionPayload } from "./fixtures";

test("sign-in, signup and naming stay reachable at 320 pixels with enlarged text and reduced height", async ({ page, mock, pageErrors }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  mock.handlers = signedOut();
  await page.goto("/");
  const heading = page.getByText("Choose your explorer", { exact: true });
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toBeInViewport();
  const toggle = page.getByTestId("gate-toggle-intent");
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await toggle.click();
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toBeInViewport();
  await page.getByLabel("Explorer name", { exact: true }).fill("Small screen explorer");
  await page.getByLabel("Email", { exact: true }).fill("small-screen@e2e.invalid");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByTestId("gate-create").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("gate-create")).toBeInViewport();
  await page.screenshot({ path: "tmp/e2e-artifacts/focused-signup-320.png" });

  // Web reflow under a reduced visual area; actual software keyboards are exercised by native.
  await page.setViewportSize({ width: 320, height: 330 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toBeInViewport();
  await page.getByTestId("gate-create").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("gate-create")).toBeInViewport();
  await toggle.scrollIntoViewIfNeeded();
  await expect(toggle).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: "tmp/e2e-artifacts/focused-signup-text-scaling.png" });

  mock.handlers = { "GET /auth/get-session": () => ok({ ...sessionPayload, user: { ...sessionPayload.user, profileComplete: false } }) };
  await page.reload();
  const naming = page.getByText("Name your explorer", { exact: true });
  await naming.scrollIntoViewIfNeeded();
  await expect(naming).toBeInViewport();
  await page.getByLabel("Explorer name", { exact: true }).fill("Renamed explorer");
  await page.getByTestId("name-gate-submit").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("name-gate-submit")).toBeInViewport();
  expect(pageErrors).toEqual([]);
});

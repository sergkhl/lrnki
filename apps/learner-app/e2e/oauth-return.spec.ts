import { test, expect, signedOut } from "./fixtures";

const OAUTH_REFUSAL = "We couldn’t reach the trailhead. Check your connection and try again.";

test.afterEach(async ({ pageErrors }) => {
  expect(pageErrors, `unexpected runtime errors:\n${pageErrors.join("\n")}`).toEqual([]);
});

test("an OAuth refusal returns to the signed-out gate without consuming unrelated route state", async ({
  page,
  mock
}) => {
  mock.handlers = signedOut();

  await page.goto("/?error=state_mismatch&error_description=probe&topic=aqueducts");

  await expect(page.getByText("Choose your explorer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByText(OAUTH_REFUSAL)).toBeVisible();

  await expect.poll(() => new URL(page.url()).searchParams.get("error")).toBeNull();
  expect(new URL(page.url()).searchParams.get("error_description")).toBeNull();
  expect(new URL(page.url()).searchParams.get("topic")).toBe("aqueducts");
});

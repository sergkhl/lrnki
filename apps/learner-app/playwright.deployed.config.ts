import { defineConfig, devices } from "@playwright/test";

// The deployed smoke loads the real Pages artifact but intercepts its only API read. Keep this
// assignment in the config so every invocation uses the production API origin baked into that
// artifact while the shared fixture fulfills the request before it reaches the network.
process.env.E2E_API_ORIGIN = "https://api.lrnki.globesoul.com";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "oauth-return.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "tmp/e2e-deployed-report", open: "never" }]],
  outputDir: "tmp/e2e-deployed-artifacts",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: "https://lrnki.globesoul.com",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], browserName: "chromium", viewport: { width: 1280, height: 800 } }
    }
  ]
});

import { defineConfig, devices } from "@playwright/test";

// Durable web acceptance over the production-format client-rendered Expo SPA export
// (plan 2026-07-14-001 U5, KTD8; ADR-0035).
// The suite proves the two reproduced web failures (failed-login-then-signup session entry and
// the planning-sheet layer) plus the shared route-state contract against a real bundle, with the
// typed API origin fully intercepted by deterministic fixtures. It is NOT the real-use gate (U6):
// mocked transport can prove client behavior but never learner-experience quality.
const PORT = Number(process.env.E2E_WEB_PORT ?? 8099);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "tmp/e2e-report", open: "never" }]],
  outputDir: "tmp/e2e-artifacts",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  // Two viewports: a phone frame and a desktop frame. The layering and route-state contracts
  // must hold on both, and the sheet-relocation fix (U4) is a web-stacking concern that a phone
  // viewport exercises most directly.
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }
  ],
  webServer: {
    // The `e2e` script exports `dist-e2e` before Playwright starts, so this server usually just
    // serves (near-instant startup). The generous timeout only covers the fallback path where a
    // bare `playwright test` triggers a cold `--clear` export inside static-server.mjs.
    command: "node e2e/static-server.mjs",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe"
  }
});

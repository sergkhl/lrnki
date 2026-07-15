import { defineConfig, devices } from "@playwright/test";

// REAL-USE gate config (seed: plan 2026-07-14-001 U6). Unlike the committed `e2e/` suite, this
// drives the production Expo export against a REAL learner-api backed by Postgres + production
// LiteLLM — NOT intercepted fixtures. It is OPT-IN and NOT wired into `pnpm check`; see
// e2e-realuse/README.md for the standup steps and env vars.
//
// The web export must already be served at U6_WEB_PORT (default 8091). Use serve.mjs, or set
// U6_START_SERVER=1 to let this config start it (assumes dist-u6 has been exported first).
const PORT = Number(process.env.U6_WEB_PORT ?? 8091);

export default defineConfig({
  testDir: ".",
  testMatch: "realuse.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "../tmp/realuse-artifacts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    // Use `localhost` (not 127.0.0.1) so the browser Origin matches the API CORS allowlist
    // (LEARNER_WEB_ORIGIN=http://localhost:<PORT>); localhost resolves to the 127.0.0.1 server.
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "off"
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }
  ],
  ...(process.env.U6_START_SERVER
    ? {
        webServer: {
          // Playwright runs this from the config directory (e2e-realuse/).
          command: "node serve.mjs",
          url: `http://localhost:${PORT}`,
          reuseExistingServer: true,
          timeout: 60_000
        }
      }
    : {})
});

import { defineConfig, devices } from "@playwright/test";

// Durable real-backend web gate config (plan 2026-07-15-001 U2/U3). Unlike the intercepted `e2e/`
// suite, this drives the production Expo export against a REAL supervisor-free learner-api over
// Postgres — NOT fixtures. The runner (`e2e-realuse/run.ts`) owns process lifecycle: it exports
// the bundle, starts the API + static server, runs preflight, and cleans up. So this config has NO
// `webServer` block and assumes the server is already up at REALUSE_WEB_PORT.
//
// Tracing is OFF on purpose (R13): a Playwright trace captures request headers, which now carry
// the session cookie.
const PORT = Number(process.env.REALUSE_WEB_PORT ?? 8091);

export default defineConfig({
  testDir: ".",
  testMatch: "realuse.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  // Gitignored: only failure screenshots and sanitized diagnostics may land here (R13).
  outputDir: "../tmp/realuse-artifacts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    // `127.0.0.1` (not `localhost`) so the browser shares a HOST with the API and the session
    // cookie is same-site; `run.ts` owns that constraint and derives the CORS allowlist from it.
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }
  ]
});

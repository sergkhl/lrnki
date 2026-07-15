import { chromium } from "@playwright/test";

// Fail the gate with an actionable setup command when the pinned Chromium cannot launch, rather
// than downloading a browser at test time (plan 2026-07-14-001 U5). `pnpm check` runs this suite
// on every developer and CI host; a silent multi-hundred-MB download inside a normal check would
// be surprising and non-deterministic, so provisioning is one explicit one-time step
// (`e2e:setup`) and its absence is a clear, immediate failure.
//
// A real launch/close probe (not an executable-path string check) is used deliberately: it
// validates whatever binary Playwright will actually use — full build or headless shell —
// independent of how the host provisioned it.
export default async function globalSetup(): Promise<void> {
  try {
    const browser = await chromium.launch();
    await browser.close();
  } catch (cause) {
    throw new Error(
      "Pinned Chromium for the learner web gate could not launch.\n" +
        "Run the one-time provisioning step:\n\n" +
        "  pnpm --filter @lrnki/learner-app e2e:setup\n\n" +
        `Underlying error: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }
}

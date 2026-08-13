# Intercepted web

Use this layer for the production-format Expo web export with deterministic API responses supplied
inside Playwright.

## Canonical owners

- Root and app commands: [`package.json`](../../../../package.json) and
  [`apps/learner-app/package.json`](../../../../apps/learner-app/package.json)
- Browser, viewport, artifact, and report configuration:
  [`playwright.config.ts`](../../../../apps/learner-app/playwright.config.ts)
- Response fixtures and unmatched-request enforcement:
  [`e2e/fixtures.ts`](../../../../apps/learner-app/e2e/fixtures.ts)

## Run and inspect

1. Run `pnpm e2e:web` from the repository root. It is also part of `pnpm check`.
2. Read results per Playwright project and case. Inspect retained failure screenshots or traces under
   gitignored `tmp/` when a browser assertion fails.
3. Confirm the changed state is covered by semantic UI assertions and that no unexpected API call
   escaped interception. Do not replace a missing state assertion with transport-only evidence.
4. For important visible behavior, inspect the rendered output and add the
   [real-use quality](real-use-quality.md) verdict.

## Claim boundary

This gate proves the exported client bundle, browser rendering and interaction, route state, and
behavior against the checked-in responses on its configured viewports. It does not prove the real
API, Postgres persistence, live authentication, the published Pages artifact, native primitives,
or physical hardware.

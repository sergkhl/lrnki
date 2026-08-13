# Deployed validation

Use this layer only when the claim names a published artifact or deployed service. First distinguish
the target below; “deployed” is not a single interchangeable environment.

## Published web artifact with intercepted API read

The current deterministic Pages smoke is configured in
[`playwright.deployed.config.ts`](../../../../apps/learner-app/playwright.deployed.config.ts).

1. Run `pnpm e2e:web:deployed` from the repository root.
2. Record the public URL and the deployed revision or deployment run being exercised.
3. Read the selected Playwright cases and inspect failure artifacts under gitignored `tmp/`.
4. Report this as published-bundle evidence with an intercepted API read. It does not prove the
   deployed API, a real signed-in session, Postgres, or production persistence.

## Deployed API or full deployed path

There is no generic command whose success proves every deployed path. Select an owning route, plan,
or smoke for the exact claim and inspect the root [deployment guide](../../../../README.md#deployment)
before acting.

- Verify the running revision or artifact identity; local HEAD and a successful local build do not
  prove what is deployed.
- For a visible-flow claim, obtain browser evidence at the public origin. An HTTP response or backend
  receipt does not prove the rendered state.
- For a persistence claim, use a uniquely identifiable, authorized record and verify the before and
  after state without broad production mutation.
- State whether the browser used an intercepted response, a real deployed API, or production data.
  Keep those outcomes separate even when they share the same public URL.
- Do not use a local restore, emulator fixture, or local real-backend run as deployed evidence.

Load [real-use quality](real-use-quality.md) when the deployed run is intended to establish actual
user usefulness rather than availability alone.

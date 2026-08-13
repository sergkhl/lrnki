# Real-backend web

Use this layer when the claim requires a production-format web export talking to a real
supervisor-free learner API over the development Postgres database.

## Canonical owner

Read the gate's [`e2e-realuse/README.md`](../../../../apps/learner-app/e2e-realuse/README.md)
completely before running it. It owns prerequisites, ports, capability preflight, exact reserved
learner identities, cleanup, environment controls, and current journey claims.

## Run and inspect

1. Run `pnpm e2e:web:realuse` from the repository root. The runner loads the root `.env`; do not
   claim `DATABASE_URL` is unavailable without using the owning command.
2. Confirm preflight selected a suitable ready enrichment before interpreting the browser journey.
3. Read each phone and desktop case. Inspect the persisted behavior required by the claim rather
   than treating HTTP success as learner-visible success.
4. Confirm the runner removed its exact reserved learners on success or failure. If cleanup failed,
   use only the exact retry command printed for that run ID.
5. When the change is a meaningful user-facing milestone, add the
   [real-use quality](real-use-quality.md) verdict.

## Claim boundary

This gate proves its current web journey over real auth, the real local API, and Postgres. The owning
README states whether generation or model calls are absent. It does not prove the deployed API,
production data, the published web artifact, native behavior, or physical devices.

Treat an occupied port, unavailable database, failed preflight, interrupted child process, or failed
exact cleanup as an environment or harness finding unless the intended journey reached its owned
assertion. Preserve diagnostics, restore cleanliness, and rerun before making a product claim.

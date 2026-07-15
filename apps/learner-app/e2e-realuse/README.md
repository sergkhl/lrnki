# Real-use web e2e (opt-in) — scaffold

A durable seed of the plan 2026-07-14-001 **U6** real-use gate. Unlike the committed `../e2e/`
suite (which mocks the API and runs inside `pnpm check`), this drives the production Expo web
export against a **REAL** learner-api backed by Postgres + production LiteLLM — nothing is
intercepted. It proves the real learner experience, so it needs live services and is **NOT** part
of `pnpm check`.

> Status: **scaffold**, not yet a turnkey suite. It ran green end-to-end on 2026-07-15
> (8/8 tests, phone + desktop). The remaining productization work — a deterministic learner +
> expedition seed, an opt-in CI target, and credential handling — is tracked in
> `docs/plans/TODO.md` (Evidence-triggered follow-up). Treat the steps below as the manual runbook.

## Files

- `realuse.spec.ts` — the four real-backend scenarios (AE1 signup, AE3 route states, AE6 sheet scrim).
- `realuse.config.ts` — phone (Pixel 7) + desktop projects; `baseURL` uses `localhost` on purpose.
- `serve.mjs` — static server with SPA fallback for the export (`dist-u6/` by default).
- `cleanup-learner.sh` — FK-safe teardown of disposable learners by a `LIKE` pattern.

## Run it

From `apps/learner-app/`, with the repo-root `.env` providing `DATABASE_URL` + LiteLLM keys:

```bash
# 1. Start the working-tree learner-api on :8790. LEARNER_WEB_ORIGIN MUST equal the web origin
#    below EXACTLY — CORS is an exact-match allowlist (localhost != 127.0.0.1), and the bearer
#    flow is credentialed so it can never widen to "*".
LEARNER_API_PORT=8790 LEARNER_WEB_ORIGIN=http://localhost:8091 \
  pnpm --filter @lrnki/learner-api start &

# 2. Seed a real learner + a ready expedition. Either:
#    (a) register via POST /session {intent:"create"} and POST /expedition/start, then poll
#        /journal until READY (~5 min of real generation), or
#    (b) register and choose an existing shared enrichment from /catalog (no generation wait).
#    Export U6_EXPLORER + U6_PIN for that learner. Keep the PIN out of committed files.

# 3. Export the web bundle baked against the REAL api origin (:8790). `--clear` is REQUIRED:
#    Metro caches the inlined EXPO_PUBLIC_LEARNER_API_URL, so a stale cache bakes the wrong origin.
EXPO_PUBLIC_LEARNER_API_URL=http://127.0.0.1:8790 \
  npx expo export --clear --platform web --output-dir dist-u6

# 4. Serve it on :8091 (matches LEARNER_WEB_ORIGIN above).
node e2e-realuse/serve.mjs &

# 5. Run the gate.
U6_EXPLORER=<learner> U6_PIN=<pin> \
  npx playwright test --config=e2e-realuse/realuse.config.ts

# 6. Clean up EVERY disposable learner (weekly-board hygiene; AGENTS rule 14 / plan R2).
bash e2e-realuse/cleanup-learner.sh 'gate-u6-signup%'
bash e2e-realuse/cleanup-learner.sh '<learner>'
```

## Env vars

| Var | Required | Purpose |
|---|---|---|
| `U6_EXPLORER` / `U6_PIN` | yes | A real seeded learner with a populated journal. |
| `U6_WEB_PORT` | no (8091) | Port `serve.mjs` binds and the config targets. |
| `U6_DIST_DIR` | no (`../dist-u6`) | Export directory `serve.mjs` serves. |
| `U6_EVIDENCE_DIR` | no (`tmp/realuse-screenshots`) | Where screenshots land (gitignored). |
| `U6_CATALOG_MATCH` | no (`Expedition:`) | Substring proving a real catalog card rendered. |
| `U6_RUNID` | no (timestamp) | Stable suffix for the disposable AE1 signup name. |
| `U6_START_SERVER` | no | If set, the config starts `serve.mjs` itself (export must exist). |

## Gotchas (learned the hard way)

- **CORS is exact-match.** Drive from `http://localhost:8091`, not `127.0.0.1`, and set the api's
  `LEARNER_WEB_ORIGIN` to the same string. Otherwise every authenticated call is blocked at preflight.
- **AE1 persists a durable learner.** Its "failed Enter" needs the signup name to be UNREGISTERED,
  so the name carries a run-unique suffix — always run `cleanup-learner.sh 'gate-u6-signup%'` after.
- **Real HTTP 401/404/500 emit `Failed to load resource` console errors.** The console guard
  ignores exactly those statuses (they're intentional) but still fails on any other runtime error.
- **Route copy / DB column names can drift.** The spec asserts learner vocabulary strings and the
  cleanup script names learner-scoped tables; re-verify against `src/learn/vocabulary.ts` and the
  migration if the suite or teardown starts failing.

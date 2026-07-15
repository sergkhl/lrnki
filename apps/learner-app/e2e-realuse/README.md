# Real-backend web e2e (opt-in, one command)

A durable, opt-in gate that drives the production Expo web export against a **REAL** supervisor-free
learner-api over Postgres — nothing is intercepted. It is the integration counterpart to the
committed `../e2e/` suite (which mocks the API and runs inside `pnpm check`). Because it needs live
Postgres and a ready catalog enrichment, it is **NOT** part of `pnpm check`.

It proves one thin persisted spine — real auth, catalog selection, Study Session, one graded answer,
and persistence — on a phone and a desktop viewport. It performs **no generation** and makes **no
LiteLLM call**: it selects an existing ready enrichment by capability.

## Run it

From the repo root, with the repo `.env` providing `DATABASE_URL`:

```bash
pnpm e2e:web:realuse
```

That single command (`e2e-realuse/run.ts`) does everything:

1. Loads `.env` into its own process and prints a safe run id.
2. Verifies the API/web ports are free (fails rather than reusing an unknown process).
3. Exports the production web bundle baked against the real API origin.
4. Starts a **supervisor-free** learner-api (`realuseServer.ts`) over real Postgres and the shared
   static server for the export.
5. Runs capability **preflight** (`preflight.ts`): registers a disposable probe learner over public
   routes, reads `/catalog`, and selects the first ready enrichment with a reachable one-tap graded
   stop. An empty/unsuitable catalog fails with an actionable message and starts no journey.
6. Runs Playwright (`realuse.spec.ts`) on phone (Pixel 7) + desktop.
7. **Always** (success or failure) deletes exactly this run's three reserved learners and stops its
   children.

### First-time setup

```bash
pnpm --filter @lrnki/learner-app e2e:setup   # one-time: playwright install chromium
```

### If cleanup ever fails

The runner prints an exact retry command with the run id:

```bash
pnpm --filter @lrnki/learner-app run e2e:realuse -- --cleanup-run=<runId>
```

This derives only the three exact reserved names (`realuse-{probe,phone,desktop}-<runId>`) and
performs no other step. It cannot express a prefix or wildcard delete.

## Env vars (optional)

| Var | Default | Purpose |
|---|---|---|
| `REALUSE_API_PORT` | `8790` | Supervisor-free learner-api port (loopback). |
| `REALUSE_WEB_PORT` | `8091` | Static-server port; the browser Origin + API CORS use `http://localhost:<port>`. |

The runner sets `REALUSE_RUN_ID`, `REALUSE_PIN`, and the selected `REALUSE_ENRICHMENT_*` /
`REALUSE_GRADED_KIND` for the Playwright process. No pre-seeded learner or PIN is required, and no
credential is committed.

## Safety properties

- **No secret reaches the wrong child.** The base child env strips every secret-shaped key; only the
  API re-adds `DATABASE_URL`. The browser/export/static/Playwright processes never see a database or
  provider secret; the API never sees a LiteLLM/Expo secret.
- **No model call.** The API entrypoint composes the same Hono app without the generation
  supervisors, and the journey only reads a ready enrichment.
- **No bearer leakage.** Playwright tracing is off (a trace captures the Authorization header); only
  failure screenshots and sanitized diagnostics land in gitignored `tmp/`.
- **Exact-name teardown.** Cleanup is derived from the current migration's learner FK graph
  (`@lrnki/infrastructure-postgres/test-support`) and only ever deletes the three reserved names.

## Gotchas

- **CORS is exact-match.** The browser drives `http://localhost:<webPort>`, and the API's
  `LEARNER_WEB_ORIGIN` is set to the same string. `localhost` ≠ `127.0.0.1`.
- **`--clear` on export is required.** Metro caches the inlined `EXPO_PUBLIC_LEARNER_API_URL`.
- **The catalog must already contain a suitable ready enrichment.** This suite never generates one;
  preflight fails closed when none exists.

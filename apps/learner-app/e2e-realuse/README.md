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

This derives only the three exact reserved addresses
(`realuse-{probe,phone,desktop}-<runId>@realuse.invalid`) and performs no other step. It cannot
express a prefix or wildcard delete. The reserved shape is on the sign-up EMAIL because the learner
ref is now Better Auth's generated `user.id` (ADR-0041), which nothing outside the library chooses —
and because the phone/desktop learners register inside the browser, so the runner never sees their
ids at all.

## Env vars (optional)

| Var | Default | Purpose |
|---|---|---|
| `REALUSE_API_PORT` | `8790` | Supervisor-free learner-api port (loopback). |
| `REALUSE_WEB_PORT` | `8091` | Static-server port; the browser Origin + API CORS use `http://127.0.0.1:<port>`. |

The runner sets `REALUSE_RUN_ID`, `REALUSE_PASSWORD`, `REALUSE_API_BASE`, `REALUSE_EMAIL_{PHONE,DESKTOP}`,
and the selected `REALUSE_ENRICHMENT_*` / `REALUSE_GRADED_KIND` for the Playwright process. It also
mints a per-run `BETTER_AUTH_SECRET` for the API child, so this gate never handles the deployment's
signing key and runs before one exists. No pre-seeded learner is required and no credential is
committed.

## Safety properties

- **No secret reaches the wrong child.** The base child env strips every secret-shaped key; only the
  API re-adds `DATABASE_URL`. The browser/export/static/Playwright processes never see a database or
  provider secret; the API never sees a LiteLLM/Expo secret.
- **No model call.** The API entrypoint composes the same Hono app without the generation
  supervisors, and the journey only reads a ready enrichment.
- **No credential leakage.** Playwright tracing is off (a trace captures request headers, which now
  carry the session cookie); only failure screenshots and sanitized diagnostics land in gitignored
  `tmp/`. The suite asserts the page itself can read neither the cookie nor any stored mirror.
- **Exact-name teardown.** Cleanup is derived from the current migration's learner FK graph
  (`@lrnki/infrastructure-postgres/test-support`) and only ever deletes the three reserved names.

## Gotchas

- **Web and API must share a HOST, differing only in port.** The session is a cookie, and cookies
  are scoped by host and ignore port — so `127.0.0.1:<web>` ↔ `127.0.0.1:<api>` is same-SITE (the
  `SameSite=Lax` cookie rides the XHR) while still cross-ORIGIN (the credentialed CORS path stays
  under test). Using `localhost` for one side and `127.0.0.1` for the other makes them cross-site
  and the whole gate fails signed out, with no CORS error to point at it.
- **CORS is exact-match and credentialed.** The API's `LEARNER_WEB_ORIGIN` is set to the browser's
  origin string exactly; a credentialed request can never widen to `*`.
- **`--clear` on export is required.** Metro caches the inlined `EXPO_PUBLIC_LEARNER_API_URL`.
- **The catalog must already contain a suitable ready enrichment.** This suite never generates one;
  preflight fails closed when none exists.
- **`dist-realuse` only goes stale by hand.** `run.ts` re-exports the bundle on every run, so the
  one-command path cannot judge an old build. A *hand-driven* session that starts `realuseServer.ts`
  and serves an existing `dist-realuse` can, and it fails silently — rebuild with the same export
  command `run.ts` uses, baked against whatever `REALUSE_API_PORT` you started the API on.
- **Restart a hand-started API after editing a `.prompt`.** Prompt files are cached by path in module
  state; see `packages/infrastructure-litellm/README.md`.

## Real-backend app behaviours worth not rediscovering

Three behaviours that make a hand-driven or scripted journey fail in a way that looks like an app
defect:

- **The Guardian arrival dialog owns the pointer when a Leg falls** — drive the dialog, not the trail
  node behind it.
- **`activate` needs the calling learner's own `learner_expeditions` row**, not merely an existing
  expedition.
- **A theory read is only recorded for the learner's active expedition**, so reads against any other
  expedition leave no trace and no error.

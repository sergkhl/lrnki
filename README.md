# Lrnki

Turns curated learning resources into a Learner-Neutral Core Concept Graph, derives prerequisite
structure and study assets from it, and serves them to a learner app as a playable expedition.

## Documentation

- [AGENTS.md](AGENTS.md) — engineering workflow and enforcement rules
- [CONTEXT.md](CONTEXT.md) — project language and ambiguity resolution
- [docs/adr/](docs/adr/README.md) — durable architectural decisions
- [docs/plans/](docs/plans/README.md) — active plans, live TODO, and blockers

## Workspace

Apps:

- `apps/kg-worker`: extraction, graph-version build, and enrichment CLI
- `apps/learner-api`: typed learner HTTP API (Hono)
- `apps/learner-app`: universal Expo learner app (web + Android)
- `apps/admin-lab`: Next.js operator inspection surface

Packages:

- `packages/domain-core`: learner-neutral Concepts, Concept Evidence Profiles, and graph versions
- `packages/ports`: explicit application boundaries
- `packages/application`: use-cases, projections, and orchestration
- `packages/infrastructure-ingestion`: structured text, HTML, and Docling parser adapters
- `packages/infrastructure-litellm`: forced named tool-call gateway and stage descriptors
- `packages/infrastructure-postgres`: code-first persisted schema, its generated baseline, and the
  one schema migrator
- `packages/infrastructure-storage-local`: local curated-source object store adapter

## Commands

```bash
cp .env.example .env
docker compose up -d postgres litellm
pnpm install
set -a; . ./.env; set +a   # the shell does not auto-load .env; DB commands need DATABASE_URL
pnpm db:migrate
pnpm dev:admin      # Admin Lab (Next.js)
pnpm dev:learner    # Learner app web (Expo, no browser auto-open)
```

`docker compose up -d --build` starts the stack. Compose brings the application schema to current
through the one-shot `migrate` service after PostgreSQL becomes healthy, and starts the learner API
only after that migration and LiteLLM both succeed.

**Google sign-in does not work from `pnpm dev:learner` against the deployed API**, and no setting
fixes it: `localhost:8881` is cross-site with `api.lrnki.globesoul.com`, so the browser drops the
OAuth state cookie and every callback fails with `state_mismatch`
([ADR-0041](docs/adr/0041-own-learner-identity-with-self-hosted-better-auth.md)). Email + password —
the path the rigs drive — is unaffected. To exercise Google, run the API yourself so that it shares
the web origin's host *and* scheme:

```bash
pnpm dev:api            # the learner-api container, published on :8787 for this machine only
pnpm dev:learner:local  # web on :8881, pointed at it (--clear: Metro inlines and caches the origin)
```

One-time setup: register `http://localhost:8787/auth/callback/google` as an authorized redirect URI
on the Google client — Google exempts `localhost` from its https-only rule. The first API run needs
`pnpm dev:api:rebuild`; subsequent runs use the fast command above. See the canonical
[API dev loop](#api-dev-loop) for rebuild and live-reload behavior.

**An ambient `NODE_ENV` in your shell breaks `pnpm build`.** Next.js reads it directly, so a value
exported by a shell profile or left over from an earlier command sends the Admin Lab build down a
configuration path it was never meant to take, and the failure reads as a Next.js defect rather than
an environment one. Leave `NODE_ENV` unset and let each tool choose its own.

The `caddy` service is behind the `public` profile, so that command **skips it** on a development
machine — Caddy only makes sense where `api.lrnki.globesoul.com` resolves, and anywhere else it
retries ACME against the real VPS forever. The shared host opts in with `COMPOSE_PROFILES=public` in
its `.env`; `scripts/deploy-learner-api.sh` names `caddy` explicitly, which activates the profile on
its own, so the deploy works with or without that variable.

Run the quality checks:

```bash
pnpm check
```

`pnpm check` includes the intercepted production-web Playwright gate (`pnpm e2e:web`), which mocks
the API and runs deterministically. The OAuth-return case can also be rerun manually against the
deployed Pages artifact; it intercepts the deployed bundle's session read, performs no sign-in or
real API request, and touches no database:

```bash
pnpm e2e:web:deployed
```

Two heavier suites are **opt-in** and not part of `pnpm check`; the evidence boundaries are defined
in [AGENTS.md](AGENTS.md#validation-authority), and the single agent workflow entry point is the
[validation skill](.agents/skills/validate-lrnki/SKILL.md):

```bash
pnpm e2e:web:realuse    # real supervisor-free API over Postgres, no generation
pnpm e2e:native:maestro # real Android APK on an emulator, deterministic loopback fixture
```

The real-backend web gate needs live Postgres with at least one ready catalog enrichment; it
selects one by capability, never generates, and cleans up its disposable learners on success or
failure. See [apps/learner-app/e2e-realuse/README.md](apps/learner-app/e2e-realuse/README.md).

The native gate drives a standalone e2e-profile APK on a booted Android emulator with Maestro.
Its current scenario claims, prerequisites, and setup are in
[apps/learner-app/e2e-native/README.md](apps/learner-app/e2e-native/README.md).

Reclaim developer-toolchain disk space on a macOS host — orphaned iOS simulator runtimes, Xcode
build products, and package-manager caches:

```bash
pnpm clean:macos              # interactive picker; nothing is removed until you confirm
pnpm clean:macos --json       # print what it found and exit; never removes anything
```

The picker starts with the reversible targets checked — anything a lockfile or a re-download
restores — and leaves the costly ones (Gradle caches, iOS DeviceSupport, erasing simulators)
unchecked. The Android AVD and Docker are reported but never modified, and a target macOS will not
let the tool remove is shown as blocked rather than counted toward the total.
`scripts/cleanup-macos-dev.py` explains why each target is or is not collectable; `--help` lists the
non-interactive flags.

## Database schema

Persisted shape is code-first: edit the internal Drizzle schema, regenerate the sole baseline, and
reset rather than add a second migration
([ADR-0039](docs/adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md)). Four commands cover
the whole loop:

```bash
pnpm db:generate   # after editing packages/infrastructure-postgres/src/schema/ — offline
pnpm db:check      # offline drift gate; already runs inside `pnpm check`
pnpm db:migrate    # bring DATABASE_URL's database to current
pnpm db:reset      # drop + recreate its public/drizzle schemas, then migrate
```

`db:migrate` and `db:reset` need `DATABASE_URL`, which the shell does not auto-load
(`set -a; . ./.env; set +a`). `db:generate` replaces the SQL, snapshot, and journal together —
review all three, never hand-edit them, and never apply the SQL with `psql`.

The migrator applies the baseline to an empty database and is a no-op on a current one. Every other
state stops it **before any DDL** and names itself — `legacy-schema`, `partial-schema`,
`stale-baseline`, `metadata-without-schema`, or `unexpected-history`
([ADR-0039](docs/adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md) holds the normative
state machine). The operator response is the same for all five: reset.

Locally that is `pnpm db:reset`. On the shared environment it is the cutover runbook below. A deploy
never resolves these states by itself, and no fix is ever a volume deletion — `postgres_data` also
holds LiteLLM's database and its virtual keys.

## Deployment

Runbook for the topology decided in
[ADR-0035](docs/adr/0035-separate-learner-app-static-spa-typed-api.md) and
[ADR-0011](docs/adr/0011-retain-minimal-admin-lab.md).

| Surface | URL | How it deploys |
| --- | --- | --- |
| Learner web | `https://lrnki.globesoul.com` | `.github/workflows/deploy-learner-web.yml` on push to `main` |
| Learner API | `https://api.lrnki.globesoul.com` | `scripts/deploy-learner-api.sh` (manual, run on the VPS) |

Both hostnames are stable and hardcoded in the single file that consumes each (workflow
`EXPO_PUBLIC_LEARNER_API_URL`, the `apps/learner-api/src/app.ts` CORS default,
`scripts/docker/caddy/Caddyfile`).

There is one shared learner environment during testing, so `pnpm --filter @lrnki/learner-app start`
needs no configuration. `EXPO_PUBLIC_LEARNER_API_URL` is the single opt-in override for pointing the
app at some other API.

**Containers.** Plain `docker compose` runs `lrnki-postgres` (5433), `lrnki-litellm` (4000),
`lrnki-docling` (5001), `lrnki-caddy` (80/443), and `lrnki-learner-api`, which carries the generation
supervisors and **publishes no port** — reach it from inside:

```bash
docker exec lrnki-learner-api node -e '…fetch("http://127.0.0.1:8787"…)'
```

### API dev loop

The public hostname has exactly one upstream, the `learner-api` container
([ADR-0040](docs/adr/0040-serve-public-api-only-from-the-deployed-container.md)). Local development
edits on the host and runs in that container through the loopback-only `docker-compose.dev.yml`
overlay; it never starts a competing host API:

```bash
pnpm dev:api:rebuild  # first setup or an offline lockfile/build-input change: build, start, watch
pnpm dev:api          # normal loop: start the existing image without building, then watch
```

`pnpm dev:api` deliberately fails instead of silently building when no existing image is available.
At watcher startup, host files under `apps/learner-api/src` and `packages/` are synchronized into the
container; a later saved edit syncs and restarts it in ~1–3s without changing the image (a brief 502
during restart is expected). A `pnpm-lock.yaml` change made while watch is active triggers the real
image rebuild it requires. If that file changed while watch was stopped, use
`pnpm dev:api:rebuild` before resuming.

Both commands start Compose services detached and leave only the file watcher in the foreground. If
the watcher is not on screen, changes are not syncing; ending it leaves the detached API running.
Stop it before deploying: `scripts/deploy-learner-api.sh` refuses while one is attached because a
later sync would overwrite the image it just deployed.

The Caddyfile is baked into the built caddy image rather than bind-mounted (reason in
`scripts/docker/caddy/Dockerfile`), so a Caddy config change needs
`docker compose up -d --build caddy`.

**Every compose lifecycle command for the shared environment must be detached and must run from this
checkout on its host.** The local watcher above is only a foreground observer after its detached
start; do not attach it on the shared host. A bare `docker compose up` is attached: it takes the
whole stack down when its terminal or SSH session ends, which is how the shared environment went
dark on 2026-08-05. Running compose from an agent container that binds the workspace at a different
prefix is the other half of the same rule — the file binds set `create_host_path: false` and refuse
such a caller by name, but `watch` and `down` are not protected
([ADR-0040](docs/adr/0040-serve-public-api-only-from-the-deployed-container.md), `AGENTS.md` rule 23).

**API deploy** — from the repo checkout on the VPS (drives the local Docker daemon):

```bash
scripts/deploy-learner-api.sh   # git pull → build → migrate (verified) → up learner-api caddy → probe container, then public /health
```

The `learner-api` container reads `DATABASE_URL` and `LITELLM_BASE_URL` from compose;
`LITELLM_API_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, and
`GOOGLE_CLIENT_SECRET` come from the repo-root `.env`. The deploy brings the schema to current
through the one-shot `migrate` service and aborts before touching the API if that container exits
nonzero, so a healthy old API can never report a successful deploy over a failed migration. A
migration that reports reset-required is never resolved by the deploy — it waits for the explicit
reset runbook. Learner sessions are Better Auth rows in `session`
([ADR-0041](docs/adr/0041-own-learner-identity-with-self-hosted-better-auth.md)) and survive
restarts; `BETTER_AUTH_SECRET` signs their cookies, so **rotating it signs every learner out**.
`BETTER_AUTH_URL` must be the API's public origin. Better Auth derives both the Google redirect URI
it advertises (`${BETTER_AUTH_URL}/auth/callback/google`) and, from that URL's *scheme*, whether
session cookies carry `Secure` — so the `.env.example` dev default left on this host deploys an API
that health-checks green and serves the whole credential path while Google rejects the callback and
every session cookie ships without `Secure` over HTTPS. Nothing errors, because a wrong base URL
still resolves. The deploy now asserts the shipped value against the origin it serves and fails
loudly on a mismatch; `curl -sSI` the `Set-Cookie` from a sign-up if you need to confirm by hand.

**The deploy does not reload LiteLLM.** It rebuilds `migrate`, `learner-api`, and `caddy` only.
`litellm/config.yaml` is a read-only bind read once at process start, and `store_model_in_db` is
unset, so the file is authoritative *only at that moment* — a commit that repoints a
`model_group_alias` leaves the running router serving the previous model, with no error anywhere,
because the alias still resolves. That is a silent stale deploy, and it happened: the
`kg-independent-judge` → `deepseek-v4-flash-0731` swap of 2026-08-07 did not take effect on the
shared host until 2026-08-08, so every judge call in between ran the model it replaced. After a
deploy whose range touches `litellm/config.yaml`, reload it and confirm the new deployment is
actually served:

```bash
docker compose up -d --force-recreate --no-deps litellm   # never `down -v`: it holds LiteLLM's keys
curl -s -H "Authorization: Bearer $LITELLM_API_KEY" http://127.0.0.1:4000/models | grep -c <new-model>
```

A `200` from `/models` is not evidence the config is current — check for the deployment by name. The
`/models` response proves which deployment groups were loaded. For a served call,
`LiteLLM_SpendLogs.model_group` identifies the requested public alias or direct deployment group,
`model_id` resolves the selected loaded deployment through `/model/info`, and
`response->>'provider'` identifies the hosting provider. The `model` column proves the underlying
base model, but cannot distinguish primary and backup deployment groups that deliberately share it.

Before changing an OpenRouter-backed route in the canonical
[`litellm/config.yaml`](litellm/config.yaml), probe every provider with the complete effective
production-client body, including sampling fields and the exact forced-tool schema. With
`require_parameters: true`, OpenRouter can reject a provider before inference when any request
parameter is unsupported. A successful LiteLLM response can therefore be a fallback and does not
prove the primary ran. After reloading a route, send uniquely tagged calls and require matching
SpendLogs `model_group`, `model_id`, and `response->>'provider'` attribution before accepting the
cutover.

**Shared schema cutover** — the only response to a reset-required deploy, and deliberately manual.
It **discards the application data** in database `lrnki` (greenfield: no backup or data migration is
an acceptance dependency) and preserves everything else. From the repo checkout on the VPS:

```bash
docker compose stop learner-api                      # stop the writers
docker compose exec -T postgres \
  psql -U lrnki -d lrnki -X -v ON_ERROR_STOP=1 < scripts/reset-app-schema.sql
scripts/deploy-learner-api.sh                        # migrate applies 0000 once, then the API
```

Never pipe that `psql` into anything — a pipeline reports the last command's status, which would
hide the guard. `scripts/reset-app-schema.sql` aborts on any database other than `lrnki`/`lrnki_test`
(exit 3) and drops only the `public` and `drizzle` schemas, so the `litellm` database sharing the
`postgres_data` volume survives. **Never `docker compose down -v`**: that destroys LiteLLM's virtual
keys, and a dead `sk-…` then fails generation with `401` while `LITELLM_MASTER_KEY` still works.

Then confirm the cutover, including that the separate LiteLLM database survived:

```bash
docker compose exec -T postgres psql -U lrnki -d lrnki -X -Atqc \
  'select count(*) from drizzle.__drizzle_migrations;'          # exactly 1
curl -fsS https://api.lrnki.globesoul.com/health
curl -fsS -H "Authorization: Bearer ${LITELLM_API_KEY}" http://127.0.0.1:4000/models >/dev/null
```

plus one authenticated learner read/write against the API.

**Verifying a rebuild** — `learner-api` can look rebuilt and not be, in two independent ways:

- **Never pipe the build.** `docker compose up -d --build --no-deps learner-api | tail` reports
  *tail's* exit code, so a build that died on `no space left on device` still looks like exit 0.
  Reclaim with `docker builder prune -f`.
- **The container's `.Created` is not the image's.** Prove the recreate by comparing
  `docker inspect lrnki-learner-api --format '{{.Image}}'` against
  `docker image inspect lrnki-learner-api:latest --format '{{.Id}}'`. A stale container serves the
  previous behaviour while every probe passes.

**Telling a dead LiteLLM key from an upstream problem** — LiteLLM's virtual keys live in its own
database inside the shared `postgres_data` volume, so a re-initialised volume leaves the `sk-…` in
`.env` pointing at a key that no longer exists. The two failures are distinguishable:

| Symptom | Cause | Remedy |
| --- | --- | --- |
| Generation `401` while `LITELLM_MASTER_KEY` still works | Dead virtual key — the master key is validated from config rather than the key table, and that asymmetry is the tell | Mint one via `POST /key/generate` with the master key, write it to `.env`, and **recreate** the container: container env is fixed at creation, so `docker restart` will not pick it up |
| `429 "No deployments available"` | Upstream provider rate limit, not a key problem | Wait and retry; read the run against the [real-use throttling signatures](.agents/skills/validate-lrnki/references/real-use-quality.md#throttled-runs) |

Keep any `.env` backup **outside the repo**: `.gitignore` covers `.env` but not `.env.bak-*`.

**Reading `docker logs lrnki-litellm`** — tell host-run tools from the container by **source IP, not
message text**: the container is `172.18.0.5`, anything on the host (admin-lab, kg-worker) is the
gateway `172.18.0.1`. A host process reads `.env` once at start, so a session started before a key
repair keeps presenting the dead key while the container has already picked up the new one — and the
two are identical in the message text.

**Web deploy** — automatic on push to `main`. `lrnki.globesoul.com` is attached as the Pages custom
domain, so the default `sergkhl.github.io/lrnki/` URL 301s to it, and **Enforce HTTPS** is on.

**Mobile builds (Android)** — `.github/workflows/build-learner-android.yml`
(`workflow_dispatch`) runs `scripts/build-learner-android.sh` on a GitHub runner (`eas build
--local`, authenticated by the `EXPO_TOKEN` repo secret) and uploads the APK as a workflow
artifact; download and sideload it. Profiles come from `apps/learner-app/eas.json`: `preview`
(default; standalone APK against the live API) and `development` (dev client for `expo start`).
Local fallback on a machine with Java 17 + the Android SDK (`EXPO_TOKEN` is read from the
repo-root `.env`, else the environment):

```bash
pnpm build:android       # preview profile
pnpm build:android:dev   # development profile
```

**Native dev loop** — build, install, and launch a development build on a connected device (else
the emulator/simulator) and start Metro with the dev client. Both target the local API, so start it
first:

```bash
pnpm dev:api        # the learner-api they point at
pnpm dev:android    # needs Java 17 + Android SDK
pnpm dev:ios        # needs macOS + Xcode
```

`expo run:*` generates `apps/learner-app/android/` and `ios/` in-tree (gitignored); no `EXPO_TOKEN`
needed. These and `dev:learner:local` all go through `scripts/dev-learner-app.sh`, which points the
app at whatever `BETTER_AUTH_URL` names in `.env` — deliberately the same value the API signs and
advertises to Google, since a build pointed anywhere else cannot complete the sign-in leg
([ADR-0041](docs/adr/0041-own-learner-identity-with-self-hosted-better-auth.md)). Android also gets
an `adb reverse` for that port, so `localhost` inside the device means this machine; that works on a
USB-attached physical device too, where the `10.0.2.2` emulator alias does not. With no device
attached the script boots an AVD (`ANDROID_AVD`, else the first one) and blocks until it answers as
booted — `expo run:android` installs as soon as a serial appears, and treats every emulator as ready
whether or not it is. Because a quick-boot guest can still drop `system_server` during the build
that follows, the script re-runs once when the install fails with `Can't find service: package`, and
never for any other reason. Debug builds permit
cleartext HTTP, so no config change is needed. Export `EXPO_PUBLIC_LEARNER_API_URL` to override —
that is how you point a native build at the deployed API, which nothing binds locally
([ADR-0040](docs/adr/0040-serve-public-api-only-from-the-deployed-container.md)).

EAS iOS builds (distributable artifacts) — future work.

## Out of scope

Course planning, OCR, multimodal interpretation, and automatic ontology import.

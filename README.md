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
pnpm dev:api        # Learner API (tsx watch)
pnpm dev:learner    # Learner app web (Expo, no browser auto-open)
```

`docker compose up -d --build` starts the complete deployed stack. Compose brings the application
schema to current through the one-shot `migrate` service after PostgreSQL becomes healthy, and
starts the learner API only after that migration and LiteLLM both succeed.

Run the quality checks:

```bash
pnpm check
```

`pnpm check` includes the intercepted production-web Playwright gate (`pnpm e2e:web`), which mocks
the API and runs deterministically. Two heavier suites are **opt-in** and not part of `pnpm check`
([ADR-0038](docs/adr/0038-native-interaction-gate-scope-and-physical-authority.md)):

```bash
pnpm e2e:web:realuse    # real supervisor-free API over Postgres, no generation
pnpm e2e:native:maestro # real Android APK on an emulator, deterministic loopback fixture
```

The real-backend web gate needs live Postgres with at least one ready catalog enrichment; it
selects one by capability, never generates, and cleans up its disposable learners on success or
failure. See [apps/learner-app/e2e-realuse/README.md](apps/learner-app/e2e-realuse/README.md).

The native gate drives a standalone e2e-profile APK on a booted Android emulator with Maestro.
What a green run does and does not prove is owned by
[ADR-0038](docs/adr/0038-native-interaction-gate-scope-and-physical-authority.md); prerequisites and
setup are in [apps/learner-app/e2e-native/README.md](apps/learner-app/e2e-native/README.md).

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

There is one shared learner environment during testing
([ADR-0036](docs/adr/0036-run-single-shared-learner-environment-during-testing.md)), so
`pnpm --filter @lrnki/learner-app start` needs no configuration. Set `EXPO_PUBLIC_LEARNER_API_URL`
(e.g. `http://localhost:8787`) only to point the app at a local API instead.

**API dev loop** — Caddy's first upstream is a host-run dev API with a container fallback
(`lb_policy first` + `/health` checks in `scripts/docker/caddy/Caddyfile`). Start

```bash
pnpm --filter @lrnki/learner-api dev   # tsx watch, reads the repo-root .env
```

and within ~5s `https://api.lrnki.globesoul.com` serves the watched process — no image rebuild
per edit. Stop it and traffic falls back to the `learner-api` container within ~10s. One-time
VPS setup (ufw defaults to DROP, which silently times out the container→host hop):

```bash
ufw allow in on br-lrnki to any port 8787 proto tcp comment 'lrnki learner-api dev loop: caddy -> host dev process'
```

Both processes may run their topic-generation supervisors concurrently; the DB-claim fencing
([ADR-0029](docs/adr/0029-persist-shared-operation-stage-timelines.md)) makes that safe. The
Caddyfile is baked into the built caddy image (bind mounts break on this VPS — the daemon's FS
view diverges from the checkout), so a Caddy config change needs
`docker compose up -d --build caddy`.

**API deploy** — from the repo checkout on the VPS (drives the local Docker daemon):

```bash
scripts/deploy-learner-api.sh   # git pull → build → migrate (verified) → up learner-api caddy → poll /health
```

The `learner-api` container reads `DATABASE_URL` and `LITELLM_BASE_URL` from compose;
`LITELLM_API_KEY` comes from the repo-root `.env`. The deploy brings the schema to current through
the one-shot `migrate` service and aborts before touching the API if that container exits nonzero,
so a healthy old API can never report a successful deploy over a failed migration. A migration that
reports reset-required is never resolved by the deploy — it waits for the explicit reset runbook.
Learner sessions persist in `learner_sessions` and survive restarts.

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
the emulator/simulator) and start Metro with the dev client:

```bash
pnpm dev:android    # needs Java 17 + Android SDK
pnpm dev:ios        # needs macOS + Xcode
```

`expo run:*` generates `apps/learner-app/android/` and `ios/` in-tree (gitignored); no
`EXPO_TOKEN` needed. Builds default to the live API; to target a local `pnpm dev:api`, set
`EXPO_PUBLIC_LEARNER_API_URL=http://10.0.2.2:8787` (Android emulator) or `http://localhost:8787`
(iOS simulator) — debug builds permit cleartext HTTP, so no config change is needed.

EAS iOS builds (distributable artifacts) — future work.

## Out of scope

Course planning, OCR, multimodal interpretation, and automatic ontology import.

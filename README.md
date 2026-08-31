# lrnki

lrnki is a universal Expo learner app backed by a Hono API, Better Auth, PostgreSQL, and a directly
authored Expedition catalog. Codex CLI authors tracked content offline; neither builds nor runtime
processes call Codex or another model.

The repository has five workspaces:

- `packages/learner-runtime` — content qualification plus the two-method learner game runtime;
- `packages/infrastructure-postgres` — Better Auth schema and the learner aggregate adapter;
- `apps/learner-api` — authenticated Hono transport and startup composition;
- `apps/learner-app` — Expo web, Android, and iOS presentation;
- the repository root — content, deployment, validation, and coordination.

## Requirements

- Node.js 22 or newer;
- pnpm 11.4.0;
- Docker with Compose;
- PostgreSQL client tools (`psql`) for migration/reset checks;
- platform SDKs only for the native platform being exercised.

Install dependencies:

```sh
pnpm install
```

Create local configuration:

```sh
cp .env.example .env
openssl rand -base64 32
```

Put the generated value in `BETTER_AUTH_SECRET`. Keep `BETTER_AUTH_URL=http://localhost:8787` for
local development. Google credentials are optional; email/password auth and every automated rig work
without them.

## Directly authored content

The only content authorities are:

```text
content/catalog.json
content/expeditions/<expeditionKey>/expedition.json
content/expeditions/<expeditionKey>/source.md
```

`catalog.json` owns membership and order. Each Expedition document owns the exact runtime route,
lessons, activities, Support Paths, source disclosures, and Guardian pools. Its colocated primer is
the project-owned authoring and inspection basis. No content is compiled, installed, published to
Postgres, or requalified from a second representation.

Follow [content/AUTHORING.md](content/AUTHORING.md), then run:

```sh
pnpm content:check
```

The same all-or-nothing qualifier runs in `pnpm check` and before learner-api begins listening. It
checks structure and exact source-anchor existence; direct source inspection remains required for
semantic support and teaching quality.

Current catalog order:

1. Critical Thinking
2. Probability and Statistics
3. Personal Finance
4. Machine Learning
5. Neuroscience of Memory and Attention

## Local development

Start or rebuild the API container once, then attach the fast source/content watcher:

```sh
pnpm dev:api:rebuild
```

For later runs with no dependency or Dockerfile changes:

```sh
pnpm dev:api
```

Both commands keep the API in the Compose container. The development overlay publishes only
`127.0.0.1:8787`; there is no shadow host API. Source changes under `apps/learner-api/src`,
`packages/`, or `content/` sync and restart the container. A lockfile or image-input change requires
`pnpm dev:api:rebuild`.

Run Expo web in another terminal:

```sh
pnpm dev:learner:local
```

Native development uses the same API origin:

```sh
pnpm dev:android
pnpm dev:ios
```

The Android wrapper boots or detects an emulator/device and establishes `adb reverse` when the API
origin is loopback. A physical-device run is still user-initiated evidence; attaching a device does
not make an automated run physical-device acceptance.

## Learner API

Every learner read derives `learnerRef` from the Better Auth session. Public reads are:

- `GET /journal`
- `GET /catalog`
- `GET /expedition/:expeditionKey`
- `GET /guardian/:expeditionKey/:challengeId`
- `GET /leaderboard`

All mutations use `POST /game/commands` with a closed command union, `requestId`, and
`expectedStateVersion`. Hono validates/authenticates and delegates; private grading, idempotency,
stale-version refusal, mastery, Guardian combat, rewards, and leaderboard state belong to
`@lrnki/learner-runtime`. The Expo app imports only learner-api DTOs and receives no pre-answer key.

## Database

The exact valid public relation manifest is:

```text
account
learner_journey_state
session
user
verification
```

The first four are Better Auth tables. `learner_journey_state` is one versioned JSONB aggregate per
user; its payload is parsed fail-closed by learner-runtime on every load and proposed transition.
Authored content is never stored in PostgreSQL.

The Drizzle schema owns persisted shape. The `0000` SQL, snapshot, and journal are generated as one
baseline and must not be edited by hand.

Useful commands:

```sh
pnpm db:check      # compare the generated baseline with the Drizzle schema; no DB write
pnpm db:migrate    # apply only to empty schema or verify the exact current baseline
pnpm db:generate   # regenerate the one greenfield baseline after a schema edit
pnpm test:db       # reset and test lrnki_test only
```

### Guarded development reset

Schema changes use an explicit reset during greenfield development. Before resetting, resolve the
actual endpoint, database name, and row counts; the command intentionally destroys accounts,
sessions, journey progress, challenges, awards, and every application row in the named database.

```sh
pnpm db:reset
```

The script refuses any database except exactly `lrnki` or `lrnki_test`, confirms the connected name,
drops only the application schemas, and reapplies the sole baseline. It is not a shared-host or
production reset runbook. A shared or production reset requires separate explicit owner authority.

`DATABASE_URL` is read from `.env` by repository wrappers; the shell and generic test runner do not
load it automatically. DB-backed tests use `TEST_DATABASE_URL` and refuse any database except
`lrnki_test`.

## Validation

Fast and full gates:

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm e2e:web
pnpm check
pnpm test:db
```

`pnpm check` runs temporary-output cleanup, content and schema parity, typechecks, deterministic
tests, lint, API/Expo builds, and the fully intercepted phone/desktop web suite. It does not touch the
development database and does not substitute for real-backend, native, deployed, or physical-device
evidence.

Real-backend web:

```sh
pnpm e2e:web:realuse
```

This uses real Better Auth, Hono, `lrnki`, and server-side grading. The owning contract is
[apps/learner-app/e2e-realuse/README.md](apps/learner-app/e2e-realuse/README.md).

Android emulator evidence:

```sh
scripts/build-learner-android.sh e2e
pnpm e2e:native:maestro
EXPO_PUBLIC_LEARNER_API_URL=http://127.0.0.1:8799 pnpm dev:ios
pnpm e2e:native:maestro:ios
```

The owning scenario claims, APK requirements, 320 dp rig, and negative-control procedure are in
[apps/learner-app/e2e-native/README.md](apps/learner-app/e2e-native/README.md). Keep the iOS Debug
Metro process running while its Maestro command executes. Android emulator, iOS Debug simulator,
deployed, distributable, and physical-device results remain separately named evidence classes.

## Authentication

`BETTER_AUTH_SECRET` is mandatory and the API refuses to boot without it. Rotating it signs every
learner out. `BETTER_AUTH_URL` is the API's own public origin and must match the Google web-client
callback `${BETTER_AUTH_URL}/auth/callback/google`. One web-type Google client serves web and native;
native returns through the app deep link after the server callback.

Local email/password accounts are disposable. A greenfield database reset invalidates every cookie;
the app must recover through a fresh sign-up/sign-in rather than a compatibility reader.

## Deployment

The base Compose topology contains only:

- PostgreSQL;
- one-shot migration verification/application;
- learner-api;
- optional profiled Caddy.

The learner API has no host-published port in the base file. On the shared host, Caddy is the only
public route to the container under [ADR-0040](docs/adr/0040-serve-public-api-only-from-the-deployed-container.md).
Set deployment secrets and the real `BETTER_AUTH_URL`; use `COMPOSE_PROFILES=public` only on the host
whose DNS points to Caddy.

Deploy from the saved deploy checkout on that host:

```sh
scripts/deploy-learner-api.sh
```

The script refuses a running Compose watcher, optionally fast-forwards Git, builds the API/Caddy
images, waits for Postgres, runs the fail-closed one-shot migrator, then recreates and verifies the
API and public TLS route. A refused migration leaves the previous API running. It never resets a
database.

Run Compose only from the host checkout and always detached. Do not run shared-host Compose inside a
container that mounts the checkout at another path: Docker resolves bind sources in the daemon's
host filesystem. The tracked file binds use `create_host_path: false` to fail instead of silently
creating wrong directories.

Deployment, a shared-host reset, production writes, store/distributable builds, and physical-device
acceptance require authority beyond ordinary repository implementation work.

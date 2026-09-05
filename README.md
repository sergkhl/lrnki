# lrnki

lrnki is a universal Expo learner app backed by a Hono API, Better Auth, PostgreSQL, and a directly
authored Expedition catalog. Start with the [project glossary](CONTEXT.md),
[architecture decisions](docs/adr/README.md), and [development plan index](docs/plans/README.md).

## Requirements

- Node.js and pnpm versions declared in [package.json](package.json).
- Docker with Compose and PostgreSQL client tools (`psql`).
- Platform SDKs for the native platform being exercised.

Install dependencies and create local configuration:

```sh
pnpm install
cp .env.example .env
openssl rand -base64 32
```

Put the generated value in `BETTER_AUTH_SECRET`. Keep `BETTER_AUTH_URL=http://localhost:8787` for
local development. Google credentials are optional; email/password auth and the automated rigs work
without them.

## Directly authored content

Follow [the authoring guide](content/AUTHORING.md), then run:

```sh
pnpm content:check
```

[The catalog](content/catalog.json) owns membership and order;
[the content schema](packages/learner-runtime/src/contentSchema.ts) owns document shapes.
[ADR-0042](docs/adr/0042-author-expeditions-directly-without-runtime-models.md) defines qualification
and offline authoring; [ADR-0013](docs/adr/0013-verify-quality-by-real-source-inspection.md) defines
semantic inspection.

## Local development

Start or rebuild the API container once, then attach the source/content watcher:

```sh
pnpm dev:api:rebuild
```

For later runs with no dependency or Dockerfile changes:

```sh
pnpm dev:api
```

The development overlay publishes `127.0.0.1:8787`. Changes under `apps/learner-api/src`, `packages/`,
or `content/` sync and restart the container. Lockfile or image-input changes require a rebuild.

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
origin is loopback. Apply the [validation authority](AGENTS.md#validation-authority) when selecting
the target.

## Learner API

Use the [exported client contract](apps/learner-api/src/client.ts) for DTOs and
[the Hono application](apps/learner-api/src/app.ts) for routes and command transport. The
[runtime boundary](docs/adr/0035-separate-learner-app-static-spa-typed-api.md) owns the division of work.

## Database

[ADR-0003](docs/adr/0003-use-postgres-json-table-artifact-store.md) owns storage policy;
[the Drizzle schema](packages/infrastructure-postgres/src/schema/) owns relations and columns.
The [package guide](packages/infrastructure-postgres/README.md) covers Better Auth schema regeneration.

```sh
pnpm db:check      # compare the generated baseline with the Drizzle schema; no DB write
pnpm db:migrate    # apply to empty schema or verify the exact current baseline
pnpm db:generate   # regenerate the greenfield baseline after a schema edit
pnpm test:db       # reset and test lrnki_test only
```

[ADR-0039](docs/adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md) defines baseline lineage
and migration refusal. `DATABASE_URL` lives in the repo-root `.env` and repository wrappers load it;
the shell and generic test runner do not. For ad-hoc commands, use `node --env-file=.env …`,
`tsx --env-file=.env …`, or explicitly export it. DB-backed tests use `TEST_DATABASE_URL`.

### Guarded development reset

Before resetting, resolve the actual endpoint, database name, and row counts. The command destroys
accounts, sessions, journey progress, challenges, awards, and every application row in the target:

```sh
pnpm db:reset
```

The [reset guard](scripts/reset-db.sh) confirms the connected database and reapplies the
baseline after dropping the application schemas. Shared or production resets require separate
[execution authority](AGENTS.md#execution-authority).

## Validation

Choose the smallest gate through [validate-lrnki](.agents/skills/validate-lrnki/SKILL.md). The full
local automated gate and separate DB-backed gate are:

```sh
pnpm check
pnpm test:db
```

`pnpm check` runs temporary-output cleanup, content/schema parity, typechecks, deterministic tests,
lint, API/Expo builds, and intercepted phone/desktop web tests. It does not use the development DB.

For setup and execution beyond that gate, use the owning
[real-backend web](apps/learner-app/e2e-realuse/README.md) and
[native Maestro](apps/learner-app/e2e-native/README.md) runbooks. Evidence boundaries are defined in
[AGENTS.md](AGENTS.md#validation-authority).

## Authentication

`BETTER_AUTH_SECRET` is mandatory; rotating it signs every learner out. `BETTER_AUTH_URL` is the
API's public origin and must match the Google web-client callback
`${BETTER_AUTH_URL}/auth/callback/google`. One web-type Google client serves web and native; native
returns through the app deep link after the server callback.

Local email/password accounts are disposable. A greenfield reset invalidates their cookies and
requires fresh sign-up/sign-in. Cookie-origin constraints belong to
[ADR-0041](docs/adr/0041-own-learner-identity-with-self-hosted-better-auth.md).

## Deployment

Use the [base Compose topology](docker-compose.yml) and apply the
[shared-host execution rules](AGENTS.md#shared-host-compose). Caddy is the public route under
[ADR-0040](docs/adr/0040-serve-public-api-only-from-the-deployed-container.md); the base API has no
host-published port. Set deployment secrets and the real `BETTER_AUTH_URL`; use
`COMPOSE_PROFILES=public` only on the host whose DNS points to Caddy.

Deploy from the saved deploy checkout on that host:

```sh
scripts/deploy-learner-api.sh
```

The script refuses a running Compose watcher, optionally fast-forwards Git, builds the API/Caddy
images, waits for Postgres, verifies/applies the migration, and recreates and verifies the API and
public TLS route. A refused migration leaves the previous API running. It never resets a database.

# @lrnki/infrastructure-postgres

PostgreSQL adapters for the application ports, the persisted-shape authority, and the one migrator
that applies it.

## What is hand-edited and what is generated

`src/schema/` is the **only** hand-edited definition of persisted shape
([ADR-0039](../../docs/adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md)) — with one
generated exception, `auth.ts`, called out below. Its modules are ordered by lifecycle and import
one way only:

| Module | Owns |
| --- | --- |
| `auth.ts` | **generated** — Better Auth's `user`, `session`, `account`, `verification` |
| `sourcesAndExtraction.ts` | curated sources, run-local extraction, run evidence |
| `publishedGraph.ts` | graph versions, Concepts, publication evidence, artifacts |
| `derivedGraph.ts` | enrichments, grounding, prerequisites, dispositions, merges |
| `learningAssets.ts` | Study Items, Concept Lessons, their children and absence facts |
| `learnerState.ts` | expeditions, calibration, scaffold, response/recall, awards |
| `operations.ts` | operation runs and the stage timeline |
| `inspectionViews.ts` | the PostgreSQL 18 JSON_TABLE inspection views |

`index.ts` aggregates them for Drizzle Kit only. None of it is a package export, and **no store
imports a schema table** — the adapters here run raw `postgres` queries and keep doing so. The one
Drizzle handle that exists at runtime is `authDatabase.ts`, and only because Better Auth's adapter
requires one; it wraps the process's existing pool rather than opening a second.

`src/schema/auth.ts` is generated output and is never hand-tuned
([ADR-0041](../../docs/adr/0041-own-learner-identity-with-self-hosted-better-auth.md)). Regenerate
it whenever the Better Auth config in `apps/learner-api/src/auth.ts` changes, then regenerate the
baseline:

```bash
pnpm dlx @better-auth/cli generate \
  --config apps/learner-api/src/auth.ts \
  --output packages/infrastructure-postgres/src/schema/auth.ts -y
pnpm db:generate
```

The CLI is run through `dlx` rather than installed, deliberately: it publishes on its own release
line and pins an **older `better-auth` as a hard dependency**, so adding it to the workspace would
materialize a second copy of the auth core under the hoisted linker and generate a schema for a
version this repo does not run. Because of that same skew, treat its output as a candidate and
check it against the installed runtime's own table metadata (`getAuthTables(auth.options)` from
`better-auth/db`) before committing — property keys and the model set are what the adapter binds
to, and they must match field-for-field. Note that the Drizzle *property* is camelCase
(`emailVerified`) while the SQL *column* is snake_case (`email_verified`): raw-SQL callers such as
`testSupport.seedLearner` use the column names, the adapter uses the property names.

`learnerState.ts` declares no identity columns of its own. Every learner-state table FKs to
`user.id`, and nothing outside Better Auth creates or renames a learner — the two exceptions are
`testSupport.seedLearner` and the kg-worker's demo-learner insert, both of which mint an account
with no credential that cannot be signed into.

`src/migrations/` is generated output: one `0000_*.sql`, one `meta/0000_snapshot.json`, and one
journal entry, replaced together by `pnpm db:generate` and verified by `pnpm db:check`. Editing them
by hand, or applying the SQL with `psql`, defeats the drift gate.

## Migrator

`src/migrations/applicationSchemaMigration.ts` exposes one operation:

```ts
ensureApplicationSchemaCurrent(databaseUrl, migrationsFolder)
  -> { status: "applied" | "current" }
  throws ResetRequiredError(reason)
```

It classifies state before any DDL, holds one advisory lock on a single reserved connection across
classification and apply so concurrent invocations serialize, re-reads state afterwards, and closes
the client on every path. `applicationSchemaMigrationCli.ts` is the thin process wrapper the host
(`pnpm db:migrate`) and the Compose `migrate` service both run — one applicator, two callers. The
reason values and their operator response are documented once, in the root README's
`## Database schema` section.

## Tests

`src/applicationSchemaMigration.test.ts` covers the classifier as a pure function, with no database.
The store suites beside it and the `test:migrations:db` state matrix are DB-backed: run them through
`pnpm test:db` from the repo root, which targets only `lrnki_test` and resets it first. Never point
them at a development database.

**Never assert over a global table count.** Those suites share one `lrnki_test` database and run
concurrently, so a bare `SELECT COUNT(*) FROM <table>` brackets every *other* file's writes as well
as its own — it passes standalone and fails in the suite, which reads as flake rather than as the
scoping bug it is. Scope the count to a row the test itself created, normally its own seeded
`learner_state_ref`. That closes the window by construction; retrying or serializing the suite only
hides it.

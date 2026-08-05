# @lrnki/infrastructure-postgres

PostgreSQL adapters for the application ports, the persisted-shape authority, and the one migrator
that applies it.

## What is hand-edited and what is generated

`src/schema/` is the **only** hand-edited definition of persisted shape
([ADR-0039](../../docs/adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md)). Its modules
are ordered by lifecycle and import one way only:

| Module | Owns |
| --- | --- |
| `sourcesAndExtraction.ts` | curated sources, run-local extraction, run evidence |
| `publishedGraph.ts` | graph versions, Concepts, publication evidence, artifacts |
| `derivedGraph.ts` | enrichments, grounding, prerequisites, dispositions, merges |
| `learningAssets.ts` | Study Items, Concept Lessons, their children and absence facts |
| `learnerState.ts` | learners, sessions, expeditions, calibration, scaffold, response/recall |
| `operations.ts` | operation runs and the stage timeline |
| `inspectionViews.ts` | the PostgreSQL 18 JSON_TABLE inspection views |

`index.ts` aggregates them for Drizzle Kit only. None of it is a package export, and **no store
imports a schema table** — the adapters here run raw `postgres` queries and keep doing so.

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

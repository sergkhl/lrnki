---
title: Integrate Drizzle Migrations - Plan
type: refactor
date: 2026-08-04
execution: code
---

# Integrate Drizzle Migrations

**Status:** In progress

**Decision state:** Interview-locked. The user accepted decisions D1-D4 directly and delegated the
remaining questions to the recommended answers recorded in D5-D11 below.

**Implementation state:** U1 through U4 are complete; U5 is the remaining unit. The live handoff and
latest evidence are in [TODO.md](./TODO.md).

## Goal capsule

Replace the handwritten-schema / direct-`psql` migration path with one code-first Drizzle schema,
one generated greenfield baseline, and one programmatic migration entry point used by both host
commands and Compose. Keep the existing raw `postgres` stores and all learner/operator behavior
unchanged.

The developer experience after this work is deliberately small:

1. edit the internal Drizzle schema;
2. run `pnpm db:generate` to regenerate the sole `0000` baseline;
3. run `pnpm db:reset` for a rapid local hard reset;
4. let `pnpm db:check` reject schema/artifact drift before the ordinary quality suite.

An empty database initializes automatically. An initialized database whose sole baseline no longer
matches fails before application startup with a specific reset-required message. Neither Compose nor
deployment may erase an initialized database automatically.

## Canonical inputs

- Engineering and greenfield enforcement: [AGENTS.md](../../AGENTS.md), especially rules 1, 3, 8,
  9, 14, and 18.
- Project language: [CONTEXT.md](../../CONTEXT.md).
- Deep-module boundary: [ADR-0001](../adr/0001-adopt-greenfield-deep-module-architecture.md).
- PostgreSQL 18, relational/JSONB persistence, and JSON_TABLE inspection views:
  [ADR-0003](../adr/0003-use-postgres-json-table-artifact-store.md).
- Real-source inspection gate: [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md).
- Shared deployed environment and explicit reset consequence:
  [ADR-0036](../adr/0036-run-single-shared-learner-environment-during-testing.md) and
  [ADR-0037](../adr/0037-persist-learner-scoped-scaffold-detours.md).
- Test authority: [ADR-0038](../adr/0038-native-interaction-gate-scope-and-physical-authority.md).
- Current persisted shape and migration path:
  [`0000_initial_lrnki_schema.sql`](../../packages/infrastructure-postgres/src/migrations/0000_initial_lrnki_schema.sql),
  [`migrate-db.sh`](../../scripts/migrate-db.sh), and
  [`reset-db.sh`](../../scripts/reset-db.sh). The Compose-side `migrate-if-empty.sh` classifier this
  plan replaced was deleted in U4.

There is no linked brainstorm for this refactor. The task, constraints, and accepted boundaries came
directly from the planning interview; this ready plan owns their implementation design until the
work completes or is abandoned.

## Repository evidence and problem statement

The current baseline is approximately 1,300 lines of handwritten SQL. It creates 56 application
tables and nine JSON_TABLE inspection views, with checks, foreign keys, partial indexes, explicit
sort order, defaults, and delete actions that are behavioral contracts. The production stores query
those tables through raw `postgres` SQL; there is no runtime ORM seam to replace.

The current migration lifecycle has four conflicting properties:

- the SQL file declares itself the sole schema authority;
- `src/migrations/meta/_journal.json` contains an old Drizzle journal entry but no matching snapshot;
- host migration runs the SQL directly with `psql`;
- Compose has a second state classifier in `migrate-if-empty.sh` and also applies the SQL with
  `psql`.

The running application database inspected during planning contains the application relations but
no `drizzle.__drizzle_migrations` table. It is therefore a legacy initialized database at cutover,
not a Drizzle-managed current database.

A disposable `drizzle-kit pull` audit proved that stable Drizzle can describe all current tables and
the raw JSON_TABLE views, but it also emitted incorrect index operator-class metadata for several
columns. Introspection is therefore useful only as disposable scaffolding. The handwritten SQL and
PostgreSQL catalog remain the cutover oracle until exact parity is proven.

The repository previously removed a second Drizzle schema because it drifted from the handwritten
SQL. Reintroducing Drizzle is acceptable only if that failure mode is structurally removed: the
Drizzle schema becomes the authority and the SQL, snapshot, and journal become generated artifacts.

## Interview-locked decision ledger

### Directly accepted

**D1 — Boundary.** Drizzle owns code-first persisted shape and the migration lifecycle only. Existing
stores keep raw `postgres` queries. Do not migrate stores to Drizzle queries, add relations for query
use, or export the schema from the package root.

**D2 — Greenfield history.** Keep exactly one regenerated `0000` migration. Local development and
`lrnki_test` use hard reset rather than compatibility migration. Shared deployment never resets
automatically; a stale or legacy baseline blocks startup until an operator explicitly performs the
targeted reset. Data-preserving incremental migrations begin only when a later durable decision ends
the greenfield policy.

**D3 — One applicator.** A programmatic Drizzle migrator is the only final path that applies schema
DDL, for both host and Compose. Delete the direct-`psql` application path and the parallel
`migrate-if-empty.sh` classifier. Retain `psql` only for the explicit schema-drop reset operation. Do
not add `drizzle-kit push`.

**D4 — Version line.** Pin stable `drizzle-orm@0.45.2` and `drizzle-kit@0.31.10`. Do not adopt the
Drizzle v1 release candidate or its incompatible migration-folder format in this work.

### Recommended answers accepted by delegation

**D5 — Schema layout.** Use one internal schema directory split into a small number of lifecycle
modules, not one 1,300-line file and not one file per table. Dependencies flow from sources through
published/derived graph, learning assets, learner state, then inspection views. `schema/index.ts` is
the Drizzle Kit aggregation point but is not added to `packages/infrastructure-postgres` exports.

**D6 — Exact transfer, no redesign.** Transfer every current table, column, type, default,
nullability rule, check, primary/unique/foreign key, referential action, index ordering/operator
class/predicate, view column, and view query without changing domain behavior. Preserve current
constraint and index names where PostgreSQL exposes them. Do not introduce PostgreSQL enums, new
relations, or schema-derived runtime types as part of the transfer.

**D7 — Generated lineage.** The internal Drizzle schema is the sole persisted-shape authority. The
generated SQL, snapshot, and journal are one inseparable deployable lineage and are never edited by
hand. A safe regeneration command generates and validates a complete replacement in a temporary
directory before replacing the committed `0000` artifacts.

**D8 — State semantics.** The migration module owns one explicit state machine: empty applies,
current is an idempotent no-op, and every legacy/partial/stale/unexpected-history state returns a
typed reset-required failure before DDL runs. Do not stamp an existing legacy database as current and
do not depend on a later `relation already exists` error for diagnosis.

**D9 — Metadata and serialization.** Use Drizzle's default dedicated `drizzle` schema and
`__drizzle_migrations` table. Compare both the sole committed migration hash and its journal time to
the sole database log row before treating an initialized database as current. Serialize concurrent
invocations with one fixed PostgreSQL advisory lock held on a reserved connection across
classification and apply.

**D10 — Reset safety.** Reset only the application database's `public` and `drizzle` schemas, then
reapply the baseline. Never remove the PostgreSQL volume: that volume also contains LiteLLM's
separate database and virtual key state. The local/test reset is non-interactive for speed; the
shared reset remains an explicit operator runbook step.

**D11 — Cutover and quality.** Do one hard cutover with no dual path, compatibility adapter,
metadata backfill, or data copy. Prove catalog equivalence on `lrnki_test`, run the full DB suite from
the generated baseline, exercise the real source pipeline on a fresh migrated database, and prove
fresh/current/failure behavior in Compose before resetting the shared deployment.

## Target design

### Authority and data flow

```text
internal Drizzle schema
        |
        | drizzle-kit generate (safe wrapper)
        v
generated 0000 SQL + snapshot + journal
        |
        | one programmatic migrator
        +---------------------> host db:migrate / db:reset
        `---------------------> Compose one-shot migrate -> learner-api
```

Only the first node is edited. The three generated migration artifacts change together. Runtime
stores remain on the existing `postgres` client and do not import the schema.

### Internal schema module

Create the following unexported shape under `packages/infrastructure-postgres/src/schema/`:

```text
schema/
  sourcesAndExtraction.ts  curated sources, run-local extraction, run evidence
  publishedGraph.ts        graph versions, Concepts, publication evidence, artifacts
  derivedGraph.ts          enrichments, grounding, prerequisites, dispositions, merges
  learningAssets.ts        Study Items, Concept Lessons, their children and absence facts
  learnerState.ts          learners/sessions/expeditions, calibration, scaffold, response/recall
  operations.ts            operation runs and stage timeline
  inspectionViews.ts       all nine raw PostgreSQL 18 JSON_TABLE views
  index.ts                 internal aggregation for Drizzle Kit only
```

The grouping follows existing lifecycle ownership and dependency direction. A module may import an
earlier module to declare a foreign key; no backwards import or catch-all shared schema module is
introduced. Non-obvious constraints should carry a short ADR link or invariant comment rather than
copying domain definitions into schema comments.

Use Drizzle `pgTable`, `primaryKey`, `unique`, `foreignKey`, `check`, and `index` builders where they
faithfully generate the current catalog. Define the inspection surface with `pgView` and raw `sql`
templates so PostgreSQL 18 JSON_TABLE remains a final, generated part of the same schema. Do not
commit a pulled `relations.ts`. If stable Drizzle cannot represent an existing feature faithfully,
use a raw SQL expression inside the schema definition when supported; never hand-patch the generated
migration.

### Configuration and dependency placement

- Add the exact stable versions to the default catalog in `pnpm-workspace.yaml`.
- Add `drizzle-orm` to `@lrnki/infrastructure-postgres` runtime dependencies because the
  programmatic migrator uses it.
- Add `drizzle-kit` to that package's development dependencies.
- Retain `postgres`; it remains both the store driver and Drizzle's runtime driver.
- Add `packages/infrastructure-postgres/drizzle.config.ts` with PostgreSQL dialect, the internal
  schema aggregation path, and `src/migrations` output.
- Do not put a database URL or fallback DSN in the config. Generation/checking are offline;
  migration continues to use the repository's one `DATABASE_URL` loading boundary.

### Generated baseline workflow

Add `scripts/regenerate-initial-migration.sh` and expose it as `pnpm db:generate`. It must:

1. resolve and enter the repository root;
2. generate from the schema into a `mktemp -d` directory with the fixed name
   `initial_lrnki_schema`;
3. assert exactly one `0000_*.sql`, one `0000_snapshot.json`, and one journal entry;
4. run `drizzle-kit check` against the candidate lineage;
5. reject any `0001` or additional history;
6. replace only the explicit committed SQL/snapshot/journal targets after every assertion passes;
7. clean its temporary directory on success, failure, or interruption.

The command is intentionally baseline regeneration, not incremental generation. A changed journal
time/hash makes every initialized greenfield database stale and therefore reset-required.

Add `scripts/check-drizzle-schema.sh` and expose it as `pnpm db:check`. It copies the committed
migration directory to a temporary output, runs `drizzle-kit check`, runs `drizzle-kit generate`
against that copy, and fails if a new migration or any file difference appears. It also asserts the
single-SQL/single-snapshot/single-journal-entry invariant. The check requires no database and runs
near the start of `pnpm check`.

### Migration deep module

Create an internal module such as
`packages/infrastructure-postgres/src/migrations/applicationSchemaMigration.ts` with one narrow
operation:

```ts
ensureApplicationSchemaCurrent(databaseUrl, migrationsFolder)
  -> { status: "applied" | "current" }
  throws ResetRequiredError(reason)
```

The module owns manifest loading, state inspection, advisory-lock lifetime, Drizzle invocation,
post-apply verification, and connection cleanup. A thin CLI maps the success status or typed failure
to concise operator output and process exit status. It never logs the database URL or credentials.

Read the committed manifest through Drizzle's migration reader and assert it contains exactly one
entry. Inspect `public` relation count, the existing boundary sentinels (`source_resources` and
`operation_runs`), the metadata table's existence, and every metadata row. This avoids maintaining a
second list of 56 tables; exact shape belongs to the catalog parity gate.

The state table is normative:

| Public application state | Drizzle log state | Result |
| --- | --- | --- |
| No user relations | Absent/empty | Acquire lock, apply `0000`, verify, report `applied` |
| Both sentinels present | Exactly one row matching hash and journal time | Report `current`; no DDL |
| Relations exist | Metadata absent/empty | `legacy-schema`; reset required |
| Only one sentinel exists | Any | `partial-schema`; reset required |
| Both sentinels present | Hash or time differs | `stale-baseline`; reset required |
| No public relations | Metadata row exists | `metadata-without-schema`; reset required |
| Any state | More than one metadata row or manifest entry | `unexpected-history`; reset required |

Re-read state after Drizzle returns and accept only the matching current state. Keep the advisory
lock on one reserved `postgres` connection through the initial read, apply/no-op decision, and final
read; release it and close the client in `finally`.

The failure output names the detected reason and the next action:

- local or test: run `pnpm db:reset`;
- shared deployment: follow the targeted cutover section in the root README;
- never suggest deleting a Docker volume or stamping metadata.

Keep `scripts/migrate-db.sh` only as the host environment adapter: it resolves `DATABASE_URL` through
`scripts/lib/require-database-url.sh` and invokes the package CLI. It contains no DDL or state logic.

### Explicit reset path

Move the exact reset DDL into one small `scripts/reset-app-schema.sql` used by every reset path:

```sql
DO $reset$
BEGIN
  IF current_database() NOT IN ('lrnki', 'lrnki_test') THEN
    RAISE EXCEPTION 'refusing to reset database %', current_database();
  END IF;
END
$reset$;

DROP SCHEMA IF EXISTS drizzle CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
```

`scripts/reset-db.sh` prints the resolved host/database, verifies the connected database matches the
URL and is `lrnki` or `lrnki_test`, applies that file with `psql`, then invokes the programmatic
migrator. Add the discoverable root alias `pnpm db:reset`. `scripts/test-db.sh` keeps its stronger
hard guard that the target database is exactly `lrnki_test`, then uses the same reset path.

The shared one-time cutover must feed this same reset file to `psql` inside the existing `postgres`
container, then run the ordinary deploy. This targets only schemas in database `lrnki`; it must not
drop the `postgres_data` volume, the `litellm` database, or any LiteLLM key table.

### Compose and deploy

Rewrite `scripts/docker/postgres/Dockerfile.migrate` as a dedicated `node:22-alpine` image. Pin pnpm
to the root package-manager version, install only the `@lrnki/infrastructure-postgres...` workspace
closure, and run the internal migration CLI. The image must contain the generated migration folder
and runtime dependencies. Delete `scripts/docker/postgres/migrate-if-empty.sh` in the same change.

Change the Compose `migrate` service to receive only a container-network `DATABASE_URL` for database
`lrnki`; remove the five parallel `PG*` variables. Preserve its one-shot behavior and
`learner-api -> migrate: service_completed_successfully` dependency.

Update `scripts/deploy-learner-api.sh` so a deploy cannot report success from an old healthy API
container after a new migration failed. It must verify the newly created `migrate` container exited
zero before recreating/polling the API, and surface the migration reason on failure.

For the one-time legacy cutover, document this sequence without automating the destructive step:

1. pull/build the code containing the Drizzle baseline;
2. stop application writers;
3. explicitly apply `scripts/reset-app-schema.sql` to the `lrnki` database inside the Postgres
   container;
4. run the normal deploy and observe `migrate` apply the baseline once;
5. verify API health and one application read/write;
6. verify LiteLLM health and its existing virtual key, proving the separate database survived.

No application-data backup or restore is an acceptance dependency. A discretionary operator dump
may be taken for debugging, but it is not migrated into the new baseline.

## Implementation units

Execute in order. A unit does not pass merely because TypeScript compiles.

### U1 — Add the schema authority and generate a candidate baseline

**Work**

- Pin dependencies and add the Drizzle config.
- Build the internal lifecycle schema modules by translating the current SQL manually.
- Use disposable `drizzle-kit pull` output only to cross-check omissions; keep it under `tmp/` and
  do not commit it.
- Add raw SQL view definitions for all nine JSON_TABLE inspection views.
- Add the safe generation and offline drift-check commands.
- Generate a candidate lineage under `tmp/`; do not replace the handwritten baseline yet.

**Gate**

- Candidate has one SQL file, one snapshot, and one journal entry.
- It declares the same public relation inventory as the current baseline.
- Drizzle check passes.
- Schema/config/generation scripts typecheck or execute successfully.

**Stop condition**

Stop before replacing any authority if stable Drizzle cannot express a current PostgreSQL 18
feature, or if satisfying Drizzle would require changing a domain constraint.

### U2 — Prove catalog parity and replace the handwritten lineage

**Work**

- Against `lrnki_test` only, reset/apply the current SQL and export a sorted normalized catalog report
  to `tmp/`.
- Reset the same test database, apply the candidate baseline, and export the same report.
- Compare public tables/views, columns and formatted types, defaults/nullability, constraint names
  and definitions, FK actions, indexes including key order/sort/null positioning/operator class and
  predicates, and normalized view definitions. Ignore only object IDs and formatting that PostgreSQL
  itself normalizes.
- Exercise representative JSON payloads through every inspection view, not merely `SELECT * LIMIT
  0`.
- Correct the Drizzle schema, regenerate, and repeat until the catalog reports are equal.
- Replace the handwritten SQL and incomplete metadata with the generated SQL/snapshot/journal as one
  change. Remove the generated file's old hand-authored source-of-truth comments rather than
  carrying a false authority statement forward.

**Gate**

- Catalog comparison is empty and all nine view probes return the expected rows/types.
- `pnpm db:check` passes from the committed lineage.
- `pnpm test:db` passes after resetting entirely from that lineage.

**Stop condition**

Textual SQL similarity is not parity. Any catalog difference must be explained and accepted as a
separate domain change or fixed before U3; this plan authorizes no such domain change.

### U3 — Make one migrator own every runtime state

**Work**

- Implement the internal migration module, typed state classifier, CLI, advisory locking, and
  post-apply verification.
- Convert `scripts/migrate-db.sh` to the thin environment adapter.
- Add the single reset SQL file and `pnpm db:reset`; update the DB-test reset path.
- Add pure classifier tests plus DB-backed migration integration tests.
- Delete any transitional migration applicator introduced while proving U2.

**Gate**

- Fresh database applies once; a second invocation is a no-op with one metadata row.
- Two concurrent invocations serialize and still produce one metadata row.
- Legacy, partial, stale-hash, stale-time, metadata-without-schema, and extra-history fixtures each
  fail with the expected reason and leave public objects/data unchanged.
- Reset drops/recreates only `public` and `drizzle`, then returns the database to current.
- The migration client closes on success and every failure path.

**Real-use gate**

After the generated baseline and migrator are foundationally green, apply
`.agents/skills/real-use-quality-evaluation/SKILL.md`. On a freshly migrated development database,
run one small stable curated fixture through the real production extraction path, publish its graph,
and complete the existing derived-graph/study-asset path with production LiteLLM aliases. Inspect the
persisted artifacts, normalized store reads, operation timeline, and JSON_TABLE views. The gate is
about real persistence usability and lost schema behavior; do not tune neural output as part of this
refactor.

### U4 — Replace the Compose migration path and prove deployment behavior

**Work**

- Rewrite the migration image and Compose environment.
- Delete `migrate-if-empty.sh`.
- Harden the deploy script's migration result check.
- Exercise the final images, commands, and dependency graph through a temporary Compose isolation
  override that changes only service/container names, host ports, volume, and database URL. It must
  not replace migration behavior with a test implementation. Keep the override/evidence in `tmp/`
  and do not use the named shared/local `postgres_data` volume for negative controls.

**Gate**

- `docker compose config --quiet` passes.
- Fresh Compose state: Postgres becomes healthy, migration applies, learner API starts and is healthy.
- Second startup: migration reports current and API starts without DDL.
- Legacy/stale/partial negative controls: migration exits nonzero, API does not start from the new
  image, the actionable reason is visible, and pre-existing rows/object counts are unchanged.
- A failed new migration cannot be hidden by the old API container's health.

### U5 — Consolidate durable policy, execute cutover, and close the plan

**Work**

- Add ADR-0039 for the durable Drizzle code-first schema/migration decision and rationale; omit this
  plan's implementation transcript.
- Update the authority statement in `AGENTS.md`. Source types continue to own implemented
  interfaces; the internal Drizzle schema owns persisted shapes; generated SQL/snapshot/journal are
  mechanical migration artifacts.
- Remove duplicate/stale authority wording from `docs/adr/README.md`, `docs/plans/README.md`,
  ADR-0026, and ADR-0031, linking to the canonical authority instead.
- Update the root README and `packages/infrastructure-postgres/README.md` with the four-command dev
  workflow, failure semantics, and targeted shared cutover runbook.
- Run the full validation contract before touching the shared database.
- Explicitly reset only the shared `lrnki` application schemas, deploy, and run the cutover checks.
- Fold the completed outcome and latest evidence into `TODO.md`, delete this plan, and remove its
  active-plan link in the same closing change.

**Gate**

- No repository documentation tells contributors to edit or apply the generated SQL directly.
- No unresolved manual action remains in `BLOCKERS.md`; if the shared reset has not actually been
  performed, record that action there and keep the plan in progress rather than claiming completion.

## Validation contract

Run the generator once for each intentional schema edit and review all three lineage artifacts it
changes:

```bash
pnpm db:generate
```

Then run the required final gates from the repository root with database environment loaded where
required:

```bash
pnpm db:check
pnpm --filter @lrnki/infrastructure-postgres typecheck
pnpm --filter @lrnki/infrastructure-postgres test
pnpm test:db
docker compose config --quiet
env -u NODE_ENV pnpm check
```

Also retain the U2 catalog reports and U3/U4 state-matrix evidence under gitignored `tmp/` for the
implementation session's inspection. Do not link those ephemeral files from `TODO.md`.

Before the shared reset, the implementation owner must be able to answer yes to all of these:

- Is the committed schema-to-migration drift check green?
- Is the old-vs-generated public catalog comparison empty?
- Did all DB tests start from the generated baseline?
- Did the real-source pipeline persist and read through the final stores/views?
- Did Compose fresh/current and every negative control behave as specified?
- Does the reset target only database `lrnki` schemas and preserve the PostgreSQL volume/LiteLLM
  database?

After shared cutover, validate the new migration row/hash, application relation counts, learner API
health, one authenticated application read/write, LiteLLM liveness, and one authenticated LiteLLM
request using the existing app key.

## Acceptance criteria

- The internal Drizzle schema is the only hand-edited persisted-shape definition.
- Exactly one generated `0000` SQL file, one matching snapshot, and one journal entry are committed.
- Generated artifacts have no manual edits and `pnpm db:check` detects drift.
- Raw `postgres` stores and package public exports are unchanged except for migration internals.
- Host and Compose both invoke the same programmatic migration module.
- The direct-`psql` migration application and `migrate-if-empty.sh` paths are gone.
- Empty/current/legacy/partial/stale/unexpected-history behavior matches the normative state table.
- Local/test reset is one fast command; deployment never resets implicitly.
- Public catalog and JSON_TABLE view semantics match the pre-cutover schema exactly.
- The shared cutover preserves the volume and LiteLLM database while intentionally discarding the
  greenfield application data.
- The full validation contract and post-cutover health/read-write checks pass.
- Durable authority/rationale are consolidated, the completed plan is deleted, and TODO/validation
  stay within their retention limits.

## Explicitly out of scope

- Rewriting stores or application queries to Drizzle ORM.
- Exporting schema tables/relations as a package API.
- Drizzle relations, Studio, `push`, or committed `pull` output.
- Drizzle v1 RC adoption.
- Incremental/compatibility migrations, data preservation, legacy metadata stamping, or dual reads.
- Any table/view/constraint behavior change.
- A second migration after `0000` while the greenfield rule remains active.
- Automatic shared resets or any PostgreSQL-volume deletion.

## Global stop conditions

Stop and return the plan to design if any of the following occurs:

- stable Drizzle cannot generate a faithful PostgreSQL 18 construct;
- catalog parity reveals that the checked-in SQL and the intended source/runtime contract already
  disagree;
- the generated baseline changes learner/operator behavior or a DB-backed test contract;
- the migrator can partially mutate a reset-required state;
- Compose cannot prevent API startup after migration failure;
- the shared reset cannot be scoped away from the LiteLLM database.

Do not silently solve a stop condition with hand-edited SQL, an RC upgrade, a compatibility layer,
or a broader destructive reset.

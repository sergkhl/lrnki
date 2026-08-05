# 0039 — Own persisted shape in a code-first Drizzle schema

Date: 2026-08-05. Status: accepted. Origin: replacing the handwritten-SQL migration path.

## Context

The persisted shape was a large handwritten SQL baseline that declared itself the schema authority
while a second Drizzle schema existed alongside it. The two drifted, and the duplicate was deleted
rather than reconciled — a second hand-maintained representation of one fact cannot stay true
([AGENTS.md](../../AGENTS.md) rule 18). Schema DDL also had two independent applicators, a host
`psql` invocation and a Compose-side state classifier, so "is this database current?" had two
answers that could disagree.

Introspection does not resolve this. A disposable `drizzle-kit pull` over the live catalog emits
incorrect index operator-class metadata, so generated-from-database output is scaffolding for
cross-checking omissions, never an authority.

## Decision

**The internal Drizzle schema is the only hand-edited definition of persisted shape.** It lives in
`packages/infrastructure-postgres/src/schema/`, split into lifecycle modules whose imports flow one
way — sources and extraction, published graph, derived graph, learning assets, learner state,
operations, then the PostgreSQL 18 JSON_TABLE inspection views
([ADR-0003](0003-use-postgres-json-table-artifact-store.md)). `schema/index.ts` aggregates for
Drizzle Kit only and is **not** a package export.

**Drizzle owns code-first shape and the migration lifecycle, nothing else.** Stores keep their raw
`postgres` queries and import no schema table. Drizzle relations, query builders, Studio, `push`,
and committed `pull` output stay out ([ADR-0001](0001-adopt-greenfield-deep-module-architecture.md)
deep-module boundary: the package's public surface is its ports, not its tables).

**The generated `0000` SQL, snapshot, and journal are one inseparable mechanical lineage.** They are
regenerated together, never hand-edited, and never applied directly by a contributor. An offline
drift check regenerates from the committed schema and fails on any difference, so a hand edit or a
stale artifact cannot reach a database.

**One programmatic migrator is the only path that applies DDL**, for host commands and Compose
alike. It resolves exactly one committed migration, holds a fixed advisory lock on one reserved
connection across classification and apply, and re-reads state afterwards. `psql` is retained only
for the explicit reset operation.

**Its state machine is normative.** Classification precedes any DDL; no state is inferred from a
failed statement, and no existing database is ever stamped as current:

| Application relations | Migration log | Result |
| --- | --- | --- |
| None | Absent or empty | Apply the baseline, verify, report `applied` |
| Both boundary sentinels present | One row matching hash and journal time | Report `current`; no DDL |
| Present | Absent or empty | `legacy-schema` — reset required |
| One sentinel only | Any | `partial-schema` — reset required |
| Both sentinels present | Hash or time differs | `stale-baseline` — reset required |
| None | A row exists | `metadata-without-schema` — reset required |
| Any | More than one row or manifest entry | `unexpected-history` — reset required |

**Every reset-required state fails closed before DDL.** The migrator is never destructive on its own
and never resolves these states; an operator does, explicitly.

**Greenfield keeps exactly one baseline.** Changing the schema regenerates `0000`, which makes every
initialized database stale and therefore reset-required — allowed without approval during development
([AGENTS.md](../../AGENTS.md) rules 1 and 9).
Data-preserving incremental migrations begin only when a later ADR ends the greenfield policy.

**Reset is schema-scoped, never volume-scoped.** It drops and recreates only `public` and `drizzle`
in a database named `lrnki` or `lrnki_test`, guarded inside the SQL itself. Removing the PostgreSQL
volume is prohibited: it also holds LiteLLM's separate database and its virtual keys, which no
application reset may destroy. Local and test resets are one non-interactive command; the shared
environment ([ADR-0036](0036-run-single-shared-learner-environment-during-testing.md)) resets only
through the explicit runbook in the root README.

## Consequences

- Persisted shape has one editable source. The SQL baseline is an output, so the drift class that
  killed the previous Drizzle schema cannot recur silently — it becomes a failing offline check.
- Faithfulness to PostgreSQL is a gate, not a hope. A construct the stable Drizzle builders cannot
  express is declared with raw `sql` inside the schema; the generated migration is never patched.
- Deployment cannot start an application against a schema the code did not produce, and cannot erase
  one it does not recognize. A migration failure stops the deploy instead of leaving an older healthy
  process to report success.
- Schema changes cost a reset during greenfield. That is the accepted price of one baseline, and it
  is why the reset path is fast, guarded, and documented rather than improvised.
- Runtime behavior is unchanged by this decision: the same relations, constraints, indexes, and
  JSON_TABLE view semantics are expected from the generated baseline as from any predecessor.

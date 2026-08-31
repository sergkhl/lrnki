# Own persisted shape in a code-first Drizzle schema

Status: Accepted

## Decision

The internal Drizzle schema under `packages/infrastructure-postgres/src/schema` is the only
hand-edited persisted-shape definition. Runtime adapters do not expose schema tables as a public
interface.

The generated baseline SQL, snapshot, and journal are one mechanical lineage. They are regenerated
together, never edited or applied by hand, and an offline drift check compares them with source.

One programmatic migrator applies the baseline only to an empty application schema, is a no-op only
for the exact current lineage, serializes classification/application with an advisory lock, and fails
before DDL for every unrecognized state.

Greenfield development keeps one regenerated baseline. Schema changes make existing development
databases reset-required; a data-preserving incremental migration policy requires a later decision.
The explicit guarded reset is schema-scoped and refuses database names other than `lrnki` and
`lrnki_test`.

## Context

Code-first shape, generated artifacts, and one fail-closed applicator prevent drift and competing DDL
authorities while the product remains greenfield.

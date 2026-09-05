# Own persisted shape in a code-first Drizzle schema

Status: Accepted

The internal [Drizzle schema](../../packages/infrastructure-postgres/src/schema/) owns persisted
shape; adapters do not expose its tables as public interfaces. Baseline SQL, snapshot, and journal
are regenerated together, never edited or applied by hand, and checked offline against the source.

One programmatic migrator serializes classification/application with an advisory lock. It applies
only to an empty application schema, accepts only the exact current lineage as a no-op, and refuses
every other state before DDL.

Greenfield development keeps one regenerated baseline, making schema changes reset-required for
existing development databases. The guarded reset is schema-scoped and permits only `lrnki` and
`lrnki_test`. Data-preserving incremental migrations require a later decision.

This trades preservation of disposable development data for one verifiable schema lineage.
[Database operations](../../README.md#database) and
[Better Auth schema generation](../../packages/infrastructure-postgres/README.md) own the procedures.

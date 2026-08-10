# Own persisted shape in a code-first Drizzle schema

Status: Accepted

## Decision

The internal Drizzle schema under packages/infrastructure-postgres/src/schema is the only hand-edited
definition of persisted shape. Runtime stores continue to satisfy ports and do not expose schema
tables as a public package interface.

The generated baseline SQL, snapshot, and journal are one mechanical lineage. They are regenerated
together, never edited or applied by hand, and an offline drift check compares them with the schema.

One programmatic migrator is the only DDL application path for commands and Compose. It applies the
baseline only to an empty application schema, is a no-op only on the exact current lineage, holds one
advisory lock through classification and verification, and fails before DDL for every unrecognized
state.

Greenfield development keeps one regenerated baseline. Existing development databases therefore
become reset-required after schema changes; data-preserving incremental migrations require a later
decision that ends this policy.

Reset is explicit and schema-scoped. The guarded reset may recreate only the application schemas in
the named lrnki development or test databases; it must never delete the PostgreSQL volume that also
contains LiteLLM data. Commands and the shared-host runbook live in the root README.

## Context

A handwritten SQL baseline and a separate Drizzle model had drifted, while two DDL applicators gave
different answers about schema currency. Code-first shape, generated artifacts, and one fail-closed
migrator remove both duplicate authorities.

# Use PostgreSQL 18 as the only required database

Status: Accepted

## Decision

Store authoritative graph state relationally and immutable artifacts as JSONB. Declare JSON_TABLE
inspection views in the persisted-shape authority alongside the tables they read
([ADR-0039](./0039-own-persisted-shape-in-code-first-drizzle-schema.md)).

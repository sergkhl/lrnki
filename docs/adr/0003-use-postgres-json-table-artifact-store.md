# Use PostgreSQL only for identity and learner journey state

Status: Accepted

## Decision

PostgreSQL is the only required database. It persists Better Auth identity/session records and one
versioned learner journey aggregate per learner. Authored content remains tracked files and is never
installed or duplicated into database tables.

The aggregate is validated at the runtime boundary on every load and proposed transition. A
normalized learner model is deferred until measured aggregate size, write latency, or cohort-read
cost justifies the added joins and migration surface.

## Context

The learner game needs atomic cross-device progress but the directly authored catalog does not need
publication, installation, or relational inspection. One aggregate makes the consistency boundary
explicit while keeping future normalization possible if evidence demands it.

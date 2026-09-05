# Use PostgreSQL only for identity and learner journey state

Status: Accepted

PostgreSQL is the only required database. It persists Better Auth identity/session records and one
versioned learner journey aggregate per learner. Authored content stays in tracked files under
[ADR-0042](0042-author-expeditions-directly-without-runtime-models.md).

The runtime validates the aggregate on every load and proposed transition. One aggregate makes
cross-device progress atomic; normalization is deferred until measured aggregate size, write
latency, or cohort-read cost justifies additional joins and migrations.

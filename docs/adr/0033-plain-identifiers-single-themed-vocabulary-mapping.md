# Keep themed vocabulary downstream of content identity

Status: Accepted

Documents, types, commands, persistence, and API DTOs use plain engineering names. Learner-facing
language is rendered through the Expo vocabulary mapping; raw enums, database details, and internal
identifiers are not displayed directly.

A theme change updates this presentation mapping without changing content identity, runtime commands,
or persisted state. This keeps game copy from becoming a durable storage or API contract. Authored
key policy belongs to [ADR-0042](0042-author-expeditions-directly-without-runtime-models.md).

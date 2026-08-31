# Use authored keys and one themed learner vocabulary mapping

Status: Accepted

## Decision

Authored documents, TypeScript types, commands, persistence, and API DTOs use plain engineering names
and human-readable authored keys. Learner-facing theme language is rendered only through the Expo
vocabulary mapping.

Raw enums, database details, and internal identifiers are not displayed directly. A theme change
updates presentation vocabulary, not content identity, runtime commands, or persisted state.

## Context

The game needs a coherent voice without allowing theme copy to become durable architecture. One
downstream mapping keeps identifiers stable and searchable.

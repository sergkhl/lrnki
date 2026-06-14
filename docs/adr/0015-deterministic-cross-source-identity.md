# Resolve cross-source concept identity deterministically with domain-scoped merges

Status: Accepted

## Decision

Every curated source receives a human-assigned Declared Domain at registration. Concepts from different sources merge only on normalized-label exact match within the same Declared Domain. The same label across different Declared Domains remains separate and is flagged as a homograph for inspection; it is not quarantined and does not block publication. Quarantine is reserved for unresolved identity or meaning conflicts within an identity scope. Every merge is recorded. Embeddings are never an identity or merge authority. Concept IRIs are readable slugs minted once at first publication and never re-derived from labels; collisions get numeric suffixes.

## Context

Pre-rebuild experiments showed neural name-embedding merge losing to deterministic merge. A published graph that is mostly per-source islands is the intended conservative outcome; cross-source bridging is a deferred measured inference experiment, not an identity shortcut.

# Resolve cross-source concept identity deterministically with domain-scoped merges

Status: Accepted

## Decision

Every curated source receives a human-assigned Declared Domain at registration. Concepts from different sources merge only on normalized-label exact match within the same Declared Domain; the same label across different Declared Domains is automatically quarantined as a possible homograph. Every merge is a recorded refinement decision. Embeddings are never an identity or merge authority. Concept IRIs are readable slugs minted once at first publication and never re-derived from labels; collisions get numeric suffixes.

## Context

Pre-rebuild experiments showed neural name-embedding merge losing to deterministic merge. A published graph that is mostly per-source islands is the intended conservative outcome; cross-source bridging is a deferred measured inference experiment, not an identity shortcut.

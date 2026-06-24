# Resolve cross-source concept identity deterministically with domain-scoped merges

Status: Accepted

## Decision

Every curated source receives a human-assigned Declared Domain at registration. Concepts from different sources merge on normalized-label exact match within the same Declared Domain, or through an adjudicated semantic-deduplication decision (ADR-0012). The same label across different Declared Domains remains separate and is flagged as a homograph for inspection; it is not quarantined and does not block publication. Quarantine is reserved for unresolved identity or meaning conflicts within an identity scope. Every merge is recorded. Embeddings never auto-merge on raw similarity and are never the deciding merge authority; they may only *propose* near-duplicate candidates for separate adjudication (ADR-0012). Candidate Discovery is also not an alias authority: unadjudicated model-proposed aliases are discarded, and only a discovered source label replaced by a source-grounded admitted canonical label is retained automatically. Qualified variants and subsets require an explicit later identity decision. Concept IRIs are readable slugs minted once at first publication and never re-derived from labels; collisions get numeric suffixes.

## Context

Pre-rebuild experiments showed a *propose-and-decide* embedding merge (one mechanism both proposing and committing merges on raw cosine) losing to deterministic merge — the failure was the coupling, not embeddings as a signal. Semantic deduplication is now permitted as a proposal signal with a separate adjudicator (ADR-0012, 2026-06-23), because exact-label-only identity demonstrably leaves obvious same-domain synonyms unmerged and fragments the graph. A published graph that is mostly per-source islands remains the intended conservative outcome; cross-source bridging stays a measured inference decision, not a raw-similarity shortcut.

# Resolve cross-source concept identity deterministically with domain-scoped merges

Status: Accepted

## Decision

Every curated source receives a human-assigned Declared Domain at registration. Concepts from
different sources merge on normalized-label exact match within the same Declared Domain, or through
an adjudicated semantic-deduplication decision under ADR-0012. The same label across different
Declared Domains remains separate and is flagged as a homograph for inspection; it is not
quarantined and does not block publication. Quarantine is reserved for unresolved identity or
meaning conflicts within an identity scope. Every merge is recorded.

Candidate Discovery is not an alias authority: unadjudicated model-proposed aliases are discarded,
and only a discovered source label replaced by a source-grounded admitted canonical label is retained
automatically. Qualified variants and subsets require an explicit later identity decision.

Concept IRIs are readable slugs minted once at first publication and never re-derived from labels;
collisions get numeric suffixes.

## Context

Exact-label-only identity leaves obvious same-domain synonyms unmerged and fragments the graph.
ADR-0012 owns the permitted proposal-and-adjudication mechanism. A published graph that is mostly
per-source islands remains the intended conservative outcome; cross-source bridging stays a measured
identity decision.

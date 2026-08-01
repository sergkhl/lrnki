# Apply conservative provenance-preserving refinement

Status: Accepted

## Decision

Static Graph Refinement is the evidence step of the Graph-Version Build
([ADR-0017](0017-split-extraction-runs-from-graph-version-builds.md)): it unions each Concept's
Concept Evidence Profile evidence across the base version and the newly selected runs,
exact-deduplicates that cumulative evidence, and preserves provenance on every retained element. It
creates no inferred facts; the asserted/derived graph boundary is owned by
[ADR-0019](0019-graph-enrichment-derived-layer.md) and Concept identity by
[ADR-0015](0015-deterministic-cross-source-identity.md).

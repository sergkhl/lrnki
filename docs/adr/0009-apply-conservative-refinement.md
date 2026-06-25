# Apply conservative provenance-preserving refinement

Status: Accepted

## Decision

The deterministic Graph-Version Build resolves stable Concept identity (ADR-0015), unions each
Concept's Concept Evidence Profile evidence across the base version and newly selected runs,
exact-deduplicates that cumulative evidence, records contradictions, and preserves provenance.
The asserted/derived graph boundary is owned by ADR-0019.

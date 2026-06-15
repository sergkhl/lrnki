# Apply conservative provenance-preserving refinement

Status: Accepted

## Decision

The deterministic Graph-Version Build resolves stable Concept identity (ADR-0015), unions each Concept's Concept Evidence Profile evidence across the base version and the newly selected runs, exact-deduplicates that cumulative evidence, records contradictions, and preserves provenance — without creating any inferred graph facts and without asserted edges. Graph Enrichment exclusively owns facts not asserted by a source (ADR-0019).

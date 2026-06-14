# Give Graph Enrichment exclusive ownership of inferred graph facts

Status: Accepted

## Decision

Graph Enrichment is the only operation that creates learner-neutral graph facts not asserted by a source. Each execution is an immutable **Enrichment Run** over one explicit published graph version and one enrichment configuration. It produces one **Derived Graph Layer** stored separately from the asserted graph.

An Enrichment Run records its model identities, pair judgments, and deterministic dispositions such as weak-edge cutting, cycle removal, and transitive reduction. The relational Derived Graph Layer is the query surface; one immutable JSONB artifact retains the complete trace. Repeated executions with the same version and configuration remain distinct runs.

Graph Enrichment never mutates the asserted graph and never reuses an asserted relation name. Prerequisite Candidate Selection may use contextual embeddings to bound model judgments, but it is not Concept Canonicalization (ADR-0012).

## Context

Inferred prerequisite structure requires graph-global judgment and does not belong in a per-source Extraction Run or the deterministic asserted Graph-Version Build. Separate Enrichment Runs keep publication provenance-pure while making inferred structure inspectable and independently replaceable by later methods.

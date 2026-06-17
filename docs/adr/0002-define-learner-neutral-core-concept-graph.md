# Define the Learner-Neutral Core Concept Graph

Status: Accepted

## Decision

Store durable reusable Concepts, each carrying one source-grounded **Concept Evidence Profile** (its composition is owned by ADR-0007), together with provenance, stable cross-source identity (ADR-0015), a categorical trust tier, and refinement decisions (ADR-0009). The published asserted layer exposes **no asserted edges** and no node-level confidence score: all prerequisite structure is derived separately by Graph Enrichment (ADR-0019). Exclude learner-specific state.

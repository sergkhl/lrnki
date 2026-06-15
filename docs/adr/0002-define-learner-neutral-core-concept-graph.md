# Define the Learner-Neutral Core Concept Graph

Status: Accepted

## Decision

Store durable reusable Concepts, each carrying a source-grounded **Concept Evidence Profile** (definition passages, salience-ordered mention passages, and optional guarded typed assertions), together with provenance, confidence, stable cross-source identity, and refinement decisions. The published asserted layer exposes **no asserted edges**: all prerequisite structure is derived separately by Graph Enrichment (ADR-0019). Exclude learner-specific state.

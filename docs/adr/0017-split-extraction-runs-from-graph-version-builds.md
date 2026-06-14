# Split per-source extraction runs from deterministic graph-version builds

Status: Accepted

## Decision

An Extraction Run processes one registered source with one pipeline configuration and persists run-scoped artifacts; it never publishes. A Graph-Version Build is deterministic and LLM-free: an operator explicitly selects inspected successful run IDs, then the build applies Static Graph Refinement, mints stable Concept identities when needed, runs quality gates, and publishes an immutable asserted graph-version snapshot atomically (ADR-0010). Publication never auto-selects the latest run.

## Context

Every LLM judgment is captured in extraction runs, so any published graph version is a replayable pure function of (selected runs + refinement rules) — rebuildable, diffable, and auditable without new model calls. Re-running one source never touches another source's runs; a refinement-rule change re-derives the graph from existing runs instead of re-extracting all sources.

# Split per-source extraction runs from deterministic graph-version builds

Status: Accepted

## Decision

Orchestration has two decoupled operations. An Extraction Run processes one registered source with one pipeline configuration (discovery, admission, claim extraction, evidence validation) and persists run-scoped artifacts — it never publishes. A Graph-Version Build is deterministic and LLM-free: it selects the latest successful run per registered source, applies Static Graph Refinement (including ADR-0015 merge/quarantine), mints IRIs for first-published concepts, runs quality gates, and publishes the complete version atomically (ADR-0010), recording its run memberships.

## Context

Every LLM judgment is captured in extraction runs, so any published graph version is a replayable pure function of (selected runs + refinement rules) — rebuildable, diffable, and auditable without new model calls. Re-running one source never touches another source's runs; a refinement-rule change re-derives the graph from existing runs instead of re-extracting all sources.

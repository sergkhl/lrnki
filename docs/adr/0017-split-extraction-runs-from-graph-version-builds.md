# Separate Extraction Runs, Concept Canonicalization, and Graph-Version Builds

Status: Accepted

## Decision

An Extraction Run processes one registered source with one pipeline configuration and persists
run-scoped artifacts; it never publishes. Concept Canonicalization is a separate operation that
records its explicit base graph version, ordered inspected Extraction Runs, captured published
Concept identities, and identity outcomes in one immutable artifact.

A Graph-Version Build is an LLM-free deterministic function of the explicit base graph version,
ordered selected Extraction Runs, selected Concept Canonicalization artifact, and Static Graph
Refinement rules. It applies the inspected artifact, runs publication quality gates, and atomically
publishes an immutable asserted graph-version snapshot under
[ADR-0010](0010-publish-static-graph-versions-atomically.md). Publication never auto-selects the
latest run or canonicalization result.

## Context

Separating neural identity decisions from publication makes the inspected decisions independently
replayable, diffable, and auditable without new model calls. Re-running one source never touches
another source's runs; a refinement-rule change re-derives the graph from existing records instead
of re-extracting all sources.

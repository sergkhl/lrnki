# Retain a minimal Admin Lab

Status: Accepted

## Decision

Admin Lab is an operator and inspection surface, not an independent owner of domain behavior.

It may:

- inspect sources, Extraction Runs, graph versions, Enrichment Runs, Derived Graph Layers, learner
  projections, study items, and recorded learner state;
- trigger explicit versioned operations through application use-cases; and
- expose experimental learner workflows needed to evaluate the current graph.

It must not embed domain decisions, own storage queries that belong behind read boundaries
(ADR-0027), silently select or publish model output, or mutate an immutable published graph or
Derived Graph Layer. Learner-state writes are explicit and remain downstream of the learner-neutral
graph.

## Context

The project needs a compact place to inspect provenance and evaluate end-to-end behavior before
separate product surfaces stabilize. Keeping Admin Lab thin prevents the UI from becoming a second
application or persistence layer.

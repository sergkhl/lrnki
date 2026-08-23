# Retain a minimal Admin Lab

Status: Accepted

## Decision

Admin Lab is a read-only operator and inspection surface, not an independent owner of domain
behavior. It inspects sources, Extraction Runs, graph versions, Enrichment Runs, Derived Graph
Layers, learner projections, study items, and recorded learner state. Operations are triggered
through the `kg-worker` CLI and learner writes through the learner API, so the lab holds no route
handlers, server actions, or mutating requests.

It must not embed domain decisions, own storage queries that belong behind read boundaries
([ADR-0027](0027-serve-inspection-through-read-model-ports.md)), silently select or publish model
output, or mutate an immutable published graph or Derived Graph Layer.

A concrete need for an operator mutation that cannot remain in the CLI or owning API triggers a new
review of an authenticated, authorized, and audited action boundary. That trigger starts a decision;
it does not authorize Admin Lab mutation by itself.

## Context

The project needs a compact place to inspect provenance and evaluate end-to-end behavior before
separate product surfaces stabilize. Keeping Admin Lab thin prevents the UI from becoming a second
application or persistence layer.

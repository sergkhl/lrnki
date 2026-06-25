# Persist shared operation-stage timelines

Status: Accepted

## Decision

Triggered extraction, graph-version build, enrichment, and study-item operations report progress
through one injected application port into a shared durable operation-stage timeline.

Timeline writes commit incrementally outside each operation's terminal artifact transaction so
in-flight progress and crashed operations remain inspectable. Long-running stages update a
heartbeat and item counts. The operation split defined by ADR-0017 remains unchanged; the timeline
observes those operations and does not create a unified pipeline identity.

Inspection uses finished read models under ADR-0027. Per-stage wall-clock comes from the persisted
timeline. Per-stage cost remains owned by LiteLLM and is read on demand by stage tag; the application
does not compute or persist cost.

## Context

Terminal artifact rows previously appeared only when an operation completed, while stage timing was
process-local output. A shared incremental timeline gives operators one durable liveness and
bottleneck surface without moving orchestration or cost ownership into Admin Lab.

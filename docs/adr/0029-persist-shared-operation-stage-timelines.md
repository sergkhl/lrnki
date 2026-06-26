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
timeline. Every LLM request carries its operation id as request-scoped telemetry alongside its stage
tag. Per-operation calls, tokens, and cost remain owned by LiteLLM and are read on demand from
LiteLLM's request log; the application does not compute or persist cost.

The bottleneck report supports one operation or one **Processing Journey** anchored on an Enrichment
Run. Journey resolution walks existing graph-version and Extraction Run lineage; it does not create a
pipeline identity or orchestration boundary. Enrichment and study-item operations share an operation
id, so timeline reads retain operation type. Application-owned Operation Timeline catalog semantics
define reportable stage ownership and stage kind, keeping shared-id spend separate without creating a
unified workflow identity.

## Context

Terminal artifact rows previously appeared only when an operation completed, while stage timing was
process-local output. A shared incremental timeline gives operators one durable liveness and
bottleneck surface without moving orchestration or cost ownership into Admin Lab.

The earlier global per-stage LiteLLM aggregate could not answer which operation incurred a cost.
Request-scoped operation tags and request-log aggregation provide the operation-stage intersection
without adding application-side cost persistence.

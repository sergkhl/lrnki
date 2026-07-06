# Persist shared operation-stage timelines

Status: Accepted

## Decision

Triggered extraction, graph-version build, enrichment, and study-item operations report progress
through one injected application port into a shared durable operation-stage timeline.

Timeline writes commit incrementally outside each operation's terminal artifact transaction so
in-flight progress and crashed operations remain inspectable. Long-running stages update a
heartbeat and item counts. A failed stage also persists a redacted structured failure reason so an
operator sees why it failed, not just that it did (the forced-tool exhaustion trail of
[ADR-0006](0006-use-forced-named-tool-schemas.md), or a bounded message for any other throw). The
operation split defined by ADR-0017 remains unchanged; the timeline observes those operations and
does not create a unified pipeline identity.

Inspection uses finished read models under ADR-0027. Per-stage wall-clock comes from the persisted
timeline. Every LLM request carries its operation id as request-scoped telemetry alongside its stage
tag. Per-operation calls, tokens, and cost remain owned by LiteLLM and are read on demand from
LiteLLM's request log; the application does not compute or persist cost.

Any change that adds, removes, or renames an operation stage must update the shared stage vocabulary,
the operation timeline catalog's stage ownership, and bottleneck-report coverage in the same change.
No new LLM or non-LLM pipeline stage may ship unregistered, because unregistered stages break the
wall-clock to spend join and make usage reports silently incomplete.

The bottleneck report supports one operation or one **Processing Journey** as defined in
[CONTEXT.md](../../CONTEXT.md). Journey-scoped reporting resolves existing lineage read-only; it does
not create a pipeline identity or orchestration boundary. Enrichment and study-item operations share
an operation id, so timeline reads retain operation type. Application-owned Operation Timeline catalog
semantics define reportable stage ownership and stage kind, keeping shared-id spend separate without
creating a unified workflow identity.

Learner topic-expedition generation is supervised by database claiming over the learner expedition
row plus the operation heartbeat. The expedition row owns launch attempts and claim timestamps; the
operation timeline owns liveness. A future durable orchestrator replaces this supervisor seam without
changing the application generation activity.

## Context

Terminal artifact rows previously appeared only when an operation completed, while stage timing was
process-local output. A shared incremental timeline gives operators one durable liveness and
bottleneck surface without moving orchestration or cost ownership into Admin Lab.

The earlier global per-stage LiteLLM aggregate could not answer which operation incurred a cost.
Request-scoped operation tags and request-log aggregation provide the operation-stage intersection
without adding application-side cost persistence.

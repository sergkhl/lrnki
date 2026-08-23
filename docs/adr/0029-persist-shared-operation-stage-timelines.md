# Persist shared operation-stage timelines

Status: Accepted

## Decision

Long-running extraction, canonicalization, publication, enrichment, study-asset, and scaffold
operations report through one injected application port into a shared durable operation-stage
timeline.

Timeline progress commits independently from a terminal artifact transaction so in-flight work,
heartbeats, and failures remain inspectable after a crash. Failure details are bounded and redacted;
the timeline observes existing operations and never creates a unified pipeline identity.

The application Operation Timeline catalog is the sole owner of operation-to-stage membership. Its
allowed stages travel through the ambient operation context; timeline reporting and neural clients
fail closed when an ambient operation attempts a stage it does not own. Measurement calls with no
ambient operation remain outside the timeline.

Every operation-scoped LLM request carries operation and stage attribution. LiteLLM remains the owner
of call, token, and cost records, which reports join on demand rather than duplicating
application-side cost data. Neural Stage Descriptor membership and mechanical configuration identity
remain separate infrastructure concerns under
[ADR-0034](0034-neural-stage-descriptors-dotprompt-config-hashes.md).

A Processing Journey is a read-only reporting scope over existing lineage, not a durable workflow.
Current supervisor and operational mechanics belong to their source modules and deployment runbooks.

## Context

Terminal artifact rows alone could not explain in-flight or crashed work, and global provider totals
could not attribute spend to one operation. A shared timeline supplies liveness and join keys without
moving orchestration or cost ownership into Admin Lab.

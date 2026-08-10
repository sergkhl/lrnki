# Persist shared operation-stage timelines

Status: Accepted

## Decision

Long-running extraction, publication, enrichment, study-asset, and scaffold operations report through
one injected application port into a shared durable operation-stage timeline.

Timeline progress commits independently from a terminal artifact transaction so in-flight work,
heartbeats, and failures remain inspectable after a crash. Failure details are bounded and redacted;
the timeline observes existing operations and never creates a unified pipeline identity.

Every LLM request carries operation and stage attribution. LiteLLM remains the owner of call, token,
and cost records, which reports join on demand rather than duplicating application-side cost data.
Adding or renaming a stage must update the application stage catalog and descriptor registration in
the same change so timing and spend coverage cannot silently diverge.

A Processing Journey is a read-only reporting scope over existing lineage, not a durable workflow.
Current supervisor and operational mechanics belong to their source modules and deployment runbooks.

## Context

Terminal artifact rows alone could not explain in-flight or crashed work, and global provider totals
could not attribute spend to one operation. A shared timeline supplies liveness and join keys without
moving orchestration or cost ownership into Admin Lab.

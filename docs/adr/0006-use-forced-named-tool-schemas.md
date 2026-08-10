# Use forced named LLM tool schemas

Status: Accepted

## Decision

Structured LLM output uses forced named tools, never free-form JSON. The owning zod validator is the
single source for both provider-facing schema and application-boundary validation; provider dialect
normalization stays behind the LiteLLM adapter seam.

Invalid or exhausted output fails closed. The transport retains a bounded, redacted failure trail
containing only the information needed to diagnose the failed attempts, and exposes it through the
operation timeline defined by
[ADR-0029](0029-persist-shared-operation-stage-timelines.md).

## Context

Forced tools make output shape enforceable without spreading provider-specific schema behavior into
application modules, while the redacted trail keeps strict rejection operable.

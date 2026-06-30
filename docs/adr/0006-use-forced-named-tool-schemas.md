# Use forced named LLM tool schemas

Status: Accepted

## Decision

Structured LLM output must use forced **named tool schemas**. Do not depend on free-form JSON
output. Validate all tool arguments at the application boundary and fail closed.

Forced-tool schemas are single-sourced from the owning zod validators. The provider-facing JSON
Schema is mechanically generated through the LiteLLM provider-dialect seam (`toForcedToolSchema`),
which preserves `strict:true` function parameters while localizing dialect normalization such as
draft metadata removal, scalar nullable form, and zod numeric sentinels. Runtime-bounded tools must
derive both the generation schema and the boundary validator from the same bounded zod source.

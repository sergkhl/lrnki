# Use forced named LLM tool schemas

Status: Accepted

## Decision

Structured LLM output must use forced **named tool schemas**. Do not depend on free-form JSON
output. Validate all tool arguments at the application boundary and fail closed.

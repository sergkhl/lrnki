# Adopt greenfield deep-module architecture

Status: Accepted

## Decision

Breaking changes are allowed and obsolete paths are deleted when replaced. Modules expose small,
cohesive interfaces while hiding their implementation mechanics, and dependencies continue to point
inward.

Use ports at real external or replaceable seams, such as persistence, model, or service boundaries.
Internal helpers and test-only seams remain private unless they become a genuine replaceable
boundary; a helper or function does not require its own port merely to be isolated in a test.

## Context

Deep modules reduce the knowledge a caller must carry. Treating every function as a port instead
creates shallow indirection, expands the public surface, and makes replacement boundaries harder to
see.

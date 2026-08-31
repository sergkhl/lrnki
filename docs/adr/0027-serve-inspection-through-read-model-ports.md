# Serve learner projections through one runtime boundary

Status: Accepted

## Decision

All learner reads and transitions cross the `LearnerRuntime` boundary. It combines qualified authored
content with validated Learner State and returns finished discriminated views; neither Hono nor Expo
stitches persistence rows or content documents.

The Hono adapter derives identity, validates transport, and maps results. The Expo app consumes only
typed learner-api DTOs. There is no general inspection surface or read-model port for deleted content
pipelines.

## Context

Learner projections require policy and computation, not raw storage reads. A single deep runtime seam
keeps grading, state transitions, and projections consistent across transport and test adapters.

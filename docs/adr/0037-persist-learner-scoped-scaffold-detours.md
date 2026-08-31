# Persist only authored Support visibility in Learner State

Status: Accepted

## Decision

Support Paths are authored content that explicitly reference existing option-select Activities in
other Stops. Learner State persists only whether a named path is open or hidden; it never persists a
generated branch, copied lesson, search result, or alternate answer key.

Answering through Support uses the referenced Activity's ordinary acquisition identity. It may repair
that target Stop's evidence, but the branch itself cannot award parent progress, Guardian evidence,
or duplicate score.

## Context

The learner needs immediate repair without a generation lifecycle or a second knowledge system.
Explicit references make Support inspectable, deterministic, replay-safe, and small in persistence.

# Plain identifiers with one themed learner vocabulary mapping

Status: Accepted

## Decision

Persisted names, TypeScript types, ports, component symbols, operation statuses, and stage tags use
plain engineering identifiers. Learner-facing theme language is rendered only through the Learner
App vocabulary mapping, or through the stage-copy mapping for operation-stage lines.

Raw enums and internal identifiers are not displayed directly to learners. A learner-visible theme
swap changes the vocabulary and stage-copy mappings, not database values, ports, or application
use-case names. Operator-facing surfaces may render engineering terms when they are inspecting
implementation state.

## Context

The Learner App has a game UX mandate
([ADR-0032](0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md)), but theme vocabulary
must not leak upstream into learner-neutral core concepts, persistence, or shared application
contracts. Plain identifiers keep durable interfaces stable and searchable while still allowing
downstream learner projections to feel themed.

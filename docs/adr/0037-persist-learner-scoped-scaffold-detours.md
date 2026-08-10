# Persist learner-scoped Scaffold Detours outside the neutral graph

Status: Accepted

## Decision

Scaffold Detours persist in learner-scoped tables that are structurally separate from the
Learner-Neutral Core Concept Graph, Derived Graph Layers, and neutral Study Item Bank. Their generation
dependencies cannot write those neutral assets, so personalized support cannot leak into mastery,
prerequisite gating, or rewards by convention alone.

One learner's repeated request for the same term under the same parent reuses a durable detour.
Publication is atomic: a complete safe branch becomes visible, while a failed attempt exposes no
partial branch.

A Support Step is either a reference to exact existing neutral study identities or immutable generated
learner-scoped content. Exact reuse creates a reference rather than a cloned Concept; generated steps
pass the source-less synthesis policy in
[ADR-0030](0030-confidence-gated-synthesis.md).

Reference steps retain neutral response identity and evidence semantics. Generated steps use a
scaffold-scoped response identity, and every neutral mastery, progress, reward, and Recall Challenge
fold excludes those observations. Exact payloads, lifecycle states, and constraints belong to source
types and the Drizzle schema under
[ADR-0039](0039-own-persisted-shape-in-code-first-drizzle-schema.md).

## Context

A learner may need a missing sub-concept while studying the current stop. Durable, structurally
separate detours make that support replayable without creating a second neutral graph or allowing
personalized content to redefine shared knowledge.

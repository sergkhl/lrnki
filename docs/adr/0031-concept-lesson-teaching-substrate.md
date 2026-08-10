# Make the Concept Lesson the learner-neutral teaching substrate

Status: Accepted

## Decision

Each derived node has at most one current Concept Lesson: a learner-neutral, regenerable teaching
artifact keyed to that node. Superseded lessons remain addressable only when a durable Support Step
already pins them; ordinary reads select the current lesson. Source types and
[ADR-0039](0039-own-persisted-shape-in-code-first-drizzle-schema.md) own the exact section and storage
shapes.

The Concept Lesson is the single grounding substrate for downstream Study Items. Source-cited lesson
content must verify against its grounding; generated content is labeled generated and may not acquire
source identifiers. Unsupported or redundant optional material is omitted, and an unusable lesson is
recorded absent rather than filled with a placeholder.

Lessons teach before activities test. Reading a lesson is ungraded, and neither lesson generation nor
consumption may mutate the asserted graph or Derived Graph Layer.

## Context

The system previously generated quizzes directly from raw grounding but gave learners no teaching
surface, while multiple item producers selected grounding independently. One verified teaching
substrate closes both gaps and gives downstream assets a single dependency.

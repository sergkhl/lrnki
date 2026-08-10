# Define the typed Study Item Bank and learner-response identity

Status: Accepted

## Decision

The learner loop uses the derived node within one Derived Graph Layer as its subject identity. A
learner-neutral Study Item Bank is a typed union of option-select, matching, and impostor activities
keyed to that subject; source types own exact payloads and
[ADR-0039](0039-own-persisted-shape-in-code-first-drizzle-schema.md) owns their persistence.

A per-node blueprint may select a sparse set of suitable item types. Deterministic guards enforce only
provable structure and provenance, while semantic suitability remains neural and measurable. A
missing type is a valid, inspectable absence rather than permission to fabricate an activity.

Learner-facing projections never expose answer keys. The server resolves the persisted key, grades
every type through one grading-neutral path, and appends observations to the Response Log. Calibration
is a separate mutable self-report over a derived node, never a Study Item or graded observation.

Study Items retain whether their grounding is source CEP evidence, rescued source evidence, or
generated grounding. Source citations require verified source text; generated citations are labeled
generated and cannot masquerade as quotes.

Two semantic verification questions remain distinct:

- Study Item Key Verification checks truth and answer-key uniqueness for option-select and impostor
  candidates.
- Matching Assignment Verification checks whether a whole matching board has exactly one defensible
  assignment; individually true pairs do not answer that question.

Both use a cross-family judge and may veto only their named harm class. Unclear or unavailable
judgment is not converted into a lexical hard veto; deterministic rules continue to own only
provable guarantees under AGENTS rule 16.

The Response Log is append-only and graded-only for neutral activities. Learner-scoped Support Steps
share grading mechanics but use the discriminated scoped identity and evidence-isolation rules in
[ADR-0037](0037-persist-learner-scoped-scaffold-detours.md).

## Context

Concept-only identity excluded rescued and generated nodes, while one untyped card could not support
several mechanics. Typed activities, server-owned keys, explicit grounding, and scoped observations
keep learner evidence trustworthy without moving learner state into the neutral graph.

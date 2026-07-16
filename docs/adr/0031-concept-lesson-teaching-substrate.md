# Make the Concept Lesson the single learner-neutral teaching substrate

Status: Accepted

## Decision

Every derived node carries at most one current **Concept Lesson**: an ordered, source-grounded
teaching artifact generated alongside the Study Item Bank as a learner-neutral, regenerable asset
keyed to `derived_node_id`. Regeneration supersedes and retains prior lesson identities rather than
deleting them, because an immutable reference Support Step may pin the exact neutral lesson it made
playable ([ADR-0037](0037-persist-learner-scoped-scaffold-detours.md)). Ordinary Study Session reads
select the current lesson; reference hydration may select a pinned superseded lesson by identity. A
lesson is an ordered set of typed, independently-optional sections — gist,
intuition, definition, examples, applications, formulas/methods — that *teach* the concept before it
is tested.

Sections may carry generated list `items` for examples/applications. These fields are
learner-neutral display structure inside the section, not separate claims or citations; source types
and the initial migration own their exact persisted shape.

The Concept Lesson is the **single source of grounding** for downstream study assets. Option-select
items derive from the lesson's source-cited sections, not from raw passages; no study-item type reads
raw grounding once a lesson exists ([ADR-0001](0001-adopt-greenfield-deep-module-architecture.md),
[AGENTS.md](../../AGENTS.md)). Per-node grounding selection has exactly one consumer — the lesson
stage.

Sections are honest by reuse, not by editorial convention. A section reuses the Study Item Bank's
provenance and citation contract ([ADR-0026](0026-typed-study-item-bank.md)). A section is
`source`-cited only when its quote verifies verbatim against the cited grounding passage at the pure
assembly boundary; any unverifiable citation is demoted to `generated` and never persisted as a
source quote. A `generated` section carries no source identifiers. Definition, examples, and formulas
are source-cited where the source supports them; gist, intuition, and applications are synthesized
and labeled `generated`. The gist is a framing hook — the concept's core idea, the problem it
solves, or why it matters — and is deliberately distinct from the definition's formal statement of
what the concept is; a gist that restates the definition is a defect, not a valid section.

A section that cannot be produced or grounded is **absent, not placeholder**. A lesson is valid when
it has at least one substantive section (definition, examples, or formulas). The generator still
aims for a compact teaching arc, but gist, intuition, and applications are optional hooks; dropping
one must not turn a usable lesson into a **lesson-absent** node. A minted (`llm_grounded`) node's
substantive section may be generated and still satisfy the minimum; a node is recorded
**lesson-absent** with a reason only when its grounding is entirely unusable or no substantive
section survives.

Lesson generation is a stage **within** the existing `study_items` operation, before the option-select
stage in the same per-node pass — one worker run, no new `operation_type`. It carries its own
LiteLLM spend tag (`concept-lesson-generation`) so its cost and wall-clock are separately attributable
([ADR-0029](0029-persist-shared-operation-stage-timelines.md)).

Synthesized sections are generated only when the current lesson grounding supports them and are
labeled `generated`. `gist`, `intuition`, and `applications` appear only when they add distinct
instructional information rather than repeating the substantive section. A cross-family redundancy
judge checks section distinctness after assembly. If a non-substantive section is redundant, lesson
generation retries once with named feedback; if the retry still repeats, the redundant
non-substantive section is dropped before persistence. The judge may remove hooks, never cited
substantive sections. Knowledge-boundary gating for source-less concept synthesis belongs to
[ADR-0030](0030-confidence-gated-synthesis-with-web-grounding.md).

The Study Session shows a node's Concept Lesson before its Study Item Bank segments; reading a lesson
writes no Response Log row. The lesson rides down the `composeStudySession` projection from lessons
loaded through a `ConceptLessonStorePort`; it is not served *through* a read port
([ADR-0027](0027-serve-inspection-through-read-model-ports.md)).

Lesson generation imports no graph or enrichment write port: it is a derived asset that never mutates
the asserted graph or the Derived Graph Layer
([ADR-0002](0002-define-learner-neutral-core-concept-graph.md), [AGENTS.md](../../AGENTS.md)).
Optional diagram descriptors are learner-neutral lesson content; their exact persisted shape is owned
by source types and the initial migration, and rendering belongs to downstream UI.

## Context

The system already extracted rich per-node grounding — CEP definitions, source mentions, generated
bundles — but consumed it only to manufacture an option-select quiz. A learner could be *tested* but
never *taught*. The teaching surface itself was the gap.

Manufacturing items directly from raw passages also left two study-asset producers reading the same
raw grounding independently, a second source of truth under [AGENTS.md](../../AGENTS.md). Introducing
the lesson as the substrate and re-pointing option-select at it collapses that to one: the lesson
grounds once, verifies once, and every downstream asset projects from it. The verbatim chain holds
transitively — an option's citation traces to a lesson section's already-verified source quote.

A separate operation for lessons was considered (cleaner separation) but rejected: it would add an
`operation_type`, a second worker command, and a read-after-write coupling for no benefit, since the
lesson and its option-select projection are produced in the same per-node pass.

## Consequences

- One canonical teaching artifact per node, regenerable and learner-neutral, that all item types and
  Learner App projections consume.
- Superseded Concept Lessons remain hydratable only for durable identity references; current Study
  Session and generation reads continue to select one current lesson per node.
- A second per-node LLM call roughly doubles per-node generation work; the dedicated stage tag makes
  the cost regression immediately visible at the real-use gate owned by [AGENTS.md](../../AGENTS.md).
- Option-select quality now depends on the lesson's source citations; the assembler demotes any
  unverifiable citation before persistence, so an item can never cite a quote the lesson did not verify.
- List items make lessons scan-friendly for learners without changing the grounding contract.
- Lesson redundancy adds another neural judge call inside `study_items`, but prevents duplicated
  hooks from reaching the learner and fails open only by preserving the assembled lesson.
- The substrate is game-ready but ungraded; per-learner personalization stays in downstream projections
  and the Learner App, never in this learner-neutral core.

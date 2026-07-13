# 0037 — Persist learner-scoped Scaffold Detours outside the neutral graph

Date: 2026-07-12. Status: accepted.

## Decision

A **Scaffold Detour** is a durable, learner-owned, optional one-level support branch off one parent
node of a Derived Graph Layer. It is persisted in learner-scoped tables that are structurally
incapable of becoming neutral graph knowledge, and it never feeds neutral mastery, prerequisite
gating, crystals, leaderboard points, or base expedition progress
([ADR-0032](0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md),
[ADR-0002](0002-define-learner-neutral-core-concept-graph.md)).

- **Aggregate and identity.** The detour aggregate owns request identity, parent attachment,
  lifecycle, and claim/fence data. Its idempotency key is `(learner, enrichment, parent node,
  normalized term)`: the same term under the same parent reuses one detour; different terms create
  separate immutable detours. The stable detour id survives retries; the latest generation operation
  id (which is also the fencing token) is tracked separately and cleared on retry.

- **Four lifecycle states, atomic publication.** A detour is exactly `generating`, `ready`, `failed`,
  or `hidden`. Generation validates all candidate Support Steps in memory, drops boundary or unsafe
  steps, and commits the one-to-three surviving steps and the `ready` transition in one
  claim-token-fenced transaction, or records `failed` with no partial visible branch. Retry reuses
  the identity and returns to `generating`; hide/dismiss preserves content and evidence; reselecting
  a hidden term restores `ready` when complete content exists and `generating` otherwise.

- **Support Steps are payload-on-step.** A step is EITHER a reference to an existing neutral node or a
  generated learner-scoped node whose whole content (a citation-free micro-lesson and one four-option
  option-select) lives inline on the step; a database CHECK enforces exactly one of the two shapes.
  Generated steps are immutable once published, so the neutral tables' supersede lifecycle, partial
  unique indexes, and citation CHECKs are deliberately not mirrored; the option-shape invariants
  (four options, exactly one server-keyed correct, key never shipped) are enforced by the generation
  validator before publish and re-checked at hydration.

- **Exact reuse creates a reference, never a clone.** A reference step is only created for a unique,
  usable, exact label/alias match within the parent's OWN Derived Graph Layer and the parent node's
  Declared Domain — cross-layer reuse is out of scope (it is the
  [ADR-0015](0015-deterministic-cross-source-identity.md) semantic-identity problem). Reuse requires
  exactly one non-parent match that is not a locked included node and already has a Concept Lesson
  plus an option-select item; frontier, mastered, and confidently floored matches are usable. An
  ambiguous or unusable collision is never cloned — a genuinely lower-level concept is generated
  instead, or the detour fails if no safe step survives. A reference is not a second concept identity
  and studies the existing node through its own lesson and option-select, recording normal neutral
  evidence; the node's canonical mastery rule is unchanged.

- **One scoped response identity.** A Response Log observation's subject/item identity is a
  discriminated neutral-or-scaffold reference over mutually exclusive foreign keys: the neutral
  `(study_item_id, derived_node_id)` pair ([ADR-0026](0026-typed-study-item-bank.md)) or one
  `scaffold_step_id`. Reference steps keep neutral identities, so scaffold-scoped rows exist only for
  generated steps. Every neutral fold — mastery, calibration, leaderboard, duel, journal — consumes
  neutral observations only; shared grading mechanics handle both scopes; one append-only monotonic
  sequence per learner spans both.

- **Grounding and observability.** Generated steps reuse verified parent/layer grounding when
  sufficient and pass the existing Knowledge-Boundary Probe before synthesizing source-less concepts
  ([ADR-0030](0030-confidence-gated-synthesis-with-web-grounding.md)); boundary steps are omitted and
  generation fails when none survive. Scaffold generation reuses the shared operation-timeline and
  spend infrastructure ([ADR-0029](0029-persist-shared-operation-stage-timelines.md)) — the
  Knowledge-Boundary Probe and grounding-generation stages are shared, owned by both `enrichment` and
  `scaffold`, and the Study Session projection maps internal stages to broad learner phases without
  exposing raw stage tags ([ADR-0033](0033-plain-identifiers-single-themed-vocabulary-mapping.md)).

## Context

Concept Lessons and questions sometimes introduce a specialized term necessary to understand the
current stop but unfamiliar to the learner. The learner needs a durable way to study the missing
sub-concept as part of the expedition, on demand, without turning personalization into neutral graph
knowledge and without a second graph UI. Text selection is not a portable cross-platform trigger and
permanent inline highlighting makes dense study content noisier, so support is discovered through a
quiet **Explorable Term** overflow action and stays optional.

The tension this ADR resolves is keeping learner-scoped generated support fully replayable and
studyable while the Learner-Neutral Core Concept Graph and neutral Study Item Bank remain untouched.
Separate learner-scoped tables, discriminated response identity, prohibiting Derived Graph Layer and
Study Item Bank writes in the generation use-case dependencies, and exact-reuse-as-reference (rather
than clone) together make an accidental leak into neutral knowledge structurally impossible rather
than merely discouraged.

## Consequences

- Learner-scoped scaffold content and its scoped responses persist and remain inspectable for a later
  fixed-budget Boss Fight recall challenge that samples completed visible detours — without
  implementing that feature now.
- Neutral mastery, prerequisite semantics, crystals, leaderboard points, duel behavior, and
  expedition progress are provably unaffected by generated scaffold work; existing-node references
  behave exactly like studying that node elsewhere.
- Admin learner-response inspection must resolve neutral versus scaffold subjects without assuming
  every observation joins `study_items`.
- Development data is reset rather than migrated when the single initial schema gains the detour and
  step tables and the scoped Response Log reference; no compatibility migration or dual-read path is
  kept ([ADR-0003](0003-use-postgres-json-table-artifact-store.md), greenfield rule).

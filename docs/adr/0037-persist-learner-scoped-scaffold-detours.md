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
  a hidden term restores `ready` when complete content exists and `generating` otherwise. A claimed
  generation attempt resolves successfully only after that fenced `ready` transition. Claim loss
  writes no detour state; infrastructure-transient exhaustion releases the claim to the bounded
  attempt budget; deterministic or no-safe-step failure records `failed`. Every non-ready attempt
  rejects so its Operation Timeline cannot report success for a failed detour.

- **Support Steps are payload-on-step.** A step is EITHER a reference that pins an existing neutral
  node, Concept Lesson, and option-select identity without copying their payloads, or a generated
  learner-scoped node whose whole content (a citation-free micro-lesson and one four-option
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
  evidence; the node's canonical mastery rule is unchanged. Pinning the concrete lesson and item
  identities makes the immutable Support Step replayable across neutral asset regeneration;
  superseded Concept Lessons and Study Items remain hydratable by those identities. Each claimed
  generation attempt samples exact-reuse eligibility once from its opening Study Session. A node
  that is locked in that snapshot is ineligible; once a reference is atomically published, it
  remains playable even if later Learner State recomputation would lock the referenced node again.
  That stable support access does not mark the node mastered or relax prerequisite gating elsewhere.
  An included, currently playable reference routes to its canonical neutral checkpoint while its
  pinned lesson and item remain current. A confidently floored, later-locked, or superseded
  reference instead opens a Support-Path-only neutral activity hydrated by the pinned identities.
  The response retains its neutral identity and evidence semantics; this access does not insert the
  node into the trail or change gating, crystals, or base expedition progress.

- **One scoped response identity.** A Response Log observation's subject/item identity is a
  discriminated neutral-or-scaffold reference over mutually exclusive foreign keys: the neutral
  `(study_item_id, derived_node_id)` pair ([ADR-0026](0026-typed-study-item-bank.md)) or one
  `scaffold_step_id`. Reference steps keep neutral identities, so scaffold-scoped rows exist only for
  generated steps. Every neutral fold — mastery, calibration, leaderboard, Recall Challenge,
  journal — consumes neutral observations only; shared grading mechanics handle both scopes; one
  append-only monotonic sequence per learner spans both.

- **Grounding and observability.** Every generated step is a source-less child concept, so it passes
  the existing Knowledge-Boundary Probe and receives its own Generated Grounding Bundle
  ([ADR-0030](0030-confidence-gated-synthesis-with-web-grounding.md)). Verified parent definitions
  may scaffold that generation but never substitute as evidence for the child; no text-length
  shortcut establishes relevance. Boundary steps are omitted and generation fails when none
  survive. Scaffold generation reuses the shared operation-timeline and
  spend infrastructure ([ADR-0029](0029-persist-shared-operation-stage-timelines.md)) — the
  Knowledge-Boundary Probe and grounding-generation stages are shared, owned by both `enrichment` and
  `scaffold`, and the Study Session projection maps internal stages to broad learner phases without
  exposing raw stage tags ([ADR-0033](0033-plain-identifiers-single-themed-vocabulary-mapping.md)).

## Context

Concept Lessons and questions sometimes introduce a specialized term necessary to understand the
current stop but unfamiliar to the learner. The learner needs a durable way to study the missing
sub-concept as part of the expedition, on demand, without turning personalization into neutral graph
knowledge and without a second graph UI. Text selection is not a portable cross-platform trigger, so
support is discovered through server-advertised **Explorable Term** metadata rendered as a quiet
first-occurrence cue in theory prose plus a compact post-content Support Paths panel (below the
question stem in graded activities); both open one state-aware dialog, the request stays optional,
and an active detour's term is suppressed from the panel while a hidden detour's term returns and
restores the same durable detour. On the trail each active detour is one
always-visible compact side-branch node under its parent, and its ordered Support Steps play inside
one full-screen Support Path flow. Reference steps never render copied content: an included node
routes to its canonical neutral checkpoint while it is playable and its pinned assets are current;
a confidently floored, later-locked, or superseded reference uses the Support-Path-only neutral
activity defined above.

The tension this ADR resolves is keeping learner-scoped generated support fully replayable and
studyable while the Learner-Neutral Core Concept Graph and neutral Study Item Bank remain untouched.
Separate learner-scoped tables, discriminated response identity, prohibiting Derived Graph Layer and
Study Item Bank writes in the generation use-case dependencies, and exact-reuse-as-reference (rather
than clone) together make an accidental leak into neutral knowledge structurally impossible rather
than merely discouraged.

## Consequences

- Learner-scoped scaffold content and its scoped responses persist and remain inspectable for the
  planned later fixed-budget Recall Challenge extension that samples completed visible detours;
  implementing that extension remains deferred under
  [ADR-0032](0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).
- Neutral mastery, prerequisite semantics, crystals, leaderboard points, Recall Challenge behavior,
  and expedition progress are provably unaffected by generated scaffold work; existing-node
  references retain the same neutral evidence identity and canonical mastery semantics even when
  stable Support Path access hydrates pinned assets.
- Admin learner-response inspection must resolve neutral versus scaffold subjects without assuming
  every observation joins `study_items`.
- Development data is reset rather than migrated when the single initial schema gains the detour and
  step tables and the scoped Response Log reference; no compatibility migration or dual-read path is
  kept ([ADR-0003](0003-use-postgres-json-table-artifact-store.md), greenfield rule).
- Generated Support Step content quality is measured by a standing instrument, the durable
  `kg-worker audit-scaffold-content <enrichmentId> [--k <n>] [--out <dir>]` command. It reads the
  persisted `generated` steps (never regenerating — one composition root owns production generation,
  rule 18) and classifies each with the epistemics its defect class demands: a deterministic markdown
  artifact detector that only REPORTS (never a gate — rule 16), and a K-sampled label↔content
  congruence judgment by the cross-family independent judge with human inspection deciding
  ([ADR-0028](0028-measure-non-deterministic-quality-with-non-deterministic-methods.md),
  [ADR-0013](0013-verify-quality-by-real-source-inspection.md)). Re-run it after any change to the
  scaffold outline/content/grounding prompts, the persisted scaffold shapes, or the extraction model
  alias, and inspect the report against the actual generated content.
- Two generation-time quality guards keep fresh content clean, both licensed by the 2026-07-16
  fresh-generation sweep that measured each defect recurring: (1) the content-generation prompt now
  carries an explicit plain-prose / no-markup output contract, because the plain-text learner surface
  renders any Markdown verbatim; (2) `runScaffoldGeneration` gates every drafted step with a bounded
  congruence re-pick over the SAME independent judge the audit uses (K=1) — a step whose content does
  not teach its own label or is not a genuinely simpler prerequisite of the term is dropped and
  retried once, then skipped. The re-pick fails OPEN on judge infra error (rule 16: congruence is not
  a provable guarantee, so a flaky judge call never drops otherwise-valid support). Its judge calls
  carry the scaffold operation id and aggregate under that operation's cost report; the same descriptor
  run by the audit carries no operation id.

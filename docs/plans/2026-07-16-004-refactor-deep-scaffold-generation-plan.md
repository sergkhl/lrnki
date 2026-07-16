---
title: Deep Scaffold Generation and Closed Attribution - Plan
type: refactor
date: 2026-07-16
execution: code
---

# Deep Scaffold Generation and Closed Attribution - Plan

## Goal Capsule

- **Objective:** Execute accepted Candidate 1 and its agreed Candidate 2 dependency from the
  [architecture deepening review](../brainstorms/2026-07-16-architecture-deepening-review.md): make
  one process-lived application callable own the complete claimed Scaffold Generation lifecycle,
  repair exact-reuse behavior through the authoritative Study Session, preserve durable neutral
  references across asset regeneration, and close operation-level neural/config attribution.
- **Authority:** Follow [CONTEXT.md](../../CONTEXT.md),
  [ADR-0001](../adr/0001-adopt-greenfield-deep-module-architecture.md),
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md),
  [ADR-0030](../adr/0030-confidence-gated-synthesis-with-web-grounding.md),
  [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md),
  [ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md), and
  [ADR-0037](../adr/0037-persist-learner-scoped-scaffold-detours.md). The brainstorm owns accepted
  problem framing, scope, and G1–G11; this plan owns implementation design only.
- **Execution profile:** Cross-package refactor spanning domain types, the single initial migration,
  Postgres adapters, Study Session projection, application generation/grading, LiteLLM descriptor
  registration, learner-api composition, and Support Path presentation. Reset/reinitialize the
  development database; do not add a compatibility migration, dual-read path, or transitional DTO.
- **Scheduling:** Next up. Plan 2026-07-16-003 (Learner UX polish) shipped 2026-07-16, so its
  `CheckpointPath.tsx` trail-wave + `useIsFocused` arrival-focus work is now in the tree (its
  `useIsFocused` fix is uncommitted at handoff). Re-read the current `CheckpointPath.tsx` before U5
  and preserve that trail-wave/overlay/arrival-focus behavior.
- **Stop conditions:** Stop and re-plan if a reference cannot remain a foreign-key-backed neutral
  identity without copying payload; if the finished Study Session cannot express locked, included,
  and confidently floored reuse from one projection; if descriptor membership cannot be compared
  mechanically with the application Operation Timeline catalog; or if the rule-14 gate finds
  generated Support Steps that are not genuinely simpler, child-specific, and useful. Candidate 3,
  Recall Challenge expansion, new reward behavior, and learner-neutral graph writes are out of scope.
- **Tail ownership:** Complete U1–U6, record validation/current status in `TODO.md`, consolidate any
  implementation-discovered durable decision into its owning ADR, then delete this plan and its
  accepted brainstorm. Do not leave superseded exports, store methods, schema columns, or docs.

## Rule-21 Research Basis

The defects are conventional classes; implementation should use their conventional remedies:

- **Information-hiding failure:** policy is split by processing phase between an application module
  and its sole caller. Parnas' module criterion puts likely-to-change design decisions behind one
  interface; the one-call factory follows that information-hiding remedy rather than extracting more
  pass-through functions ([Parnas, 1972](https://doi.org/10.1145/361598.361623)).
- **Mutable-decision TOCTOU:** reuse eligibility is checked from learner state that can change while
  an immutable result is generated. G1 selects one opening Study Session snapshot and a fenced
  terminal write; no second publication-time policy check is introduced.
- **Dangling reference to a regenerable asset:** a node-only reference does not identify the lesson
  and item the learner was promised. Pin immutable primary-key identities and retain referenced
  versions; foreign keys are the database's continuously maintained referential-integrity mechanism
  ([PostgreSQL constraints](https://www.postgresql.org/docs/17/ddl-constraints.html#DDL-CONSTRAINTS-FK)).
  The existing Recall Challenge lineup is the local precedent.
- **Claim/evidence mismatch:** text length is not evidence that parent prose supports a different
  child concept. Citation research distinguishes correctness from whether cited passages actually
  support the generated claims; child-specific grounding follows that support/completeness model
  ([Gao et al., EMNLP 2023](https://aclanthology.org/2023.emnlp-main.398/)).
- **Unsafe retry side effects:** retries need a stable request identity and idempotent/fenced writes.
  Preserve the detour identity, use each claimed operation id as the attempt/fence, classify only
  infrastructure-transient exhaustion for bounded retry, and make terminal writes idempotent under
  the fence ([AWS Builders' Library](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)).
- **Configuration-provenance drift:** manual parallel descriptor inventories are an open registry.
  Use one operation-centric registry and a mechanically derived content hash under ADR-0034.

## Locked Technical Design

### KTD1 — One request-shaped application seam

`packages/application/src/learnerScaffoldGeneration.ts` will expose only:

- `createScaffoldGeneration(construction)`, which binds process-lived adapters, reporter,
  configuration, and optional identity factory; and
- the returned `ScaffoldGeneration` callable, shaped as
  `(request: { detourId: string; operationId: string }) => Promise<void>`.

The operation id is the attempt identity and fencing value. The callable loads the claimed detour,
verifies that it is still the active generating attempt before neural spend, reads exactly one
opening Study Session, and owns exact reuse, bounded re-outline, child grounding, content generation,
congruence re-pick, validation, failure classification, stage ordering, and the fenced terminal
write. Construction accepts a lifecycle-shaped subset with only claimed-read, release, fail, and
publish capabilities; tests never implement unrelated request, hide, audit, grading, or supervisor
methods.

Delete the public `ScaffoldGenerationDeps`, `ScaffoldParentContext`, `ScaffoldReuseCandidate`,
`ScaffoldGroundResult`, `ScaffoldGenerationOutcome`, `resolveExactMatch`,
`buildScaffoldNodePayload`, and `runScaffoldGeneration` exports. Helpers remain private to the module.

### KTD2 — The Study Session is the exact-reuse authority

The construction-bound reader calls `getStudySession` with production adapters and returns the
finished `StudySession`; it does not return an app-assembled context DTO. Generation derives:

- parent label, Declared Domain, aliases, and same-layer membership from `detail`;
- included-node state from `classification.stateByNode`;
- confidently floored membership from `flooredNodeIds`; and
- current reusable neutral lesson/item identities from one key-free
  `neutralReferenceAssetsByNode` projection.

`neutralReferenceAssetsByNode` contains only nodes with one current Concept Lesson and one current
option-select item. It carries their stable ids, not duplicated content or an `isLocked` flag.
Generation combines that substrate with the existing classification: locked included nodes are
ineligible; frontier, mastered, and confidently floored nodes are eligible; absent, parent,
cross-domain, ambiguous, or payload-incomplete matches are unusable. The map is safe if serialized
to the Learner App because it contains no answer key.

One claimed call retains that opening projection even if the fake or database-backed learner state
changes during neural work. Publication does not recompute eligibility. A published reference stays
playable through the pinned neutral identities in KTD3.

### KTD3 — Pin neutral reference assets; never copy them

Give every `ConceptLesson` a stable `conceptLessonId` generated in the application before
persistence. Concept Lesson regeneration becomes supersede-and-insert, matching Study Item Bank
history:

- `concept_lessons` gains `superseded_at`;
- the unconditional per-node uniqueness becomes a partial one-current-per-node index;
- ordinary `ConceptLessonStorePort` reads filter to current rows; and
- a focused Scaffold reference read hydrates pinned rows, including superseded rows, only through
  an owning reference step.

A reference `learner_scaffold_steps` row stores three non-null foreign keys:
`referenced_derived_node_id`, `referenced_concept_lesson_id`, and
`referenced_study_item_id`. The lesson FK targets `concept_lessons`; the item FK targets a persisted
`option_select` Study Item. The step-shape CHECK requires all three reference ids and no generated
payload, or a generated payload and no reference ids. Publication writes the ids selected from the
opening Study Session atomically with the ready transition.

Add a narrow `ScaffoldReferenceActivityReadPort` that can list pinned activities for one learner and
enrichment and resolve one learner-owned reference step for grading. Its Postgres implementation
hydrates the exact lesson/item rows without a current-row filter, reusing the same row-stitch helpers
as ordinary lesson/item reads. It never offers an arbitrary “read any superseded asset” interface.

Lesson-read evidence remains keyed to `(learner, derived node)`. Option-select evidence keeps the
pinned neutral `(study_item_id, derived_node_id)` identity. A Support-Path submission against a
pinned superseded item resolves its server key through the reference-read port and appends the same
neutral Response Log shape; no third response scope or copied answer key is introduced.

### KTD4 — Project a finished reference destination

`composeStudySession` loads pinned reference activities before composing detours and projects each
reference `ScaffoldStepView` with a finished destination:

- `{ kind: "checkpoint", stopId }` when the node is included, currently playable, and both pinned
  asset ids are still current; or
- `{ kind: "support_activity", lesson, item }` when the node is confidently floored, has become
  locked since publication, or either pinned asset has been superseded.

The support-activity arm carries a key-free `ConceptLessonView` and `StudyOptionSelectView` hydrated
from the pinned identities. Reference completion is the pinned node's lesson-read fact plus the
latest-correct response for the pinned Study Item id; it is never conditioned on difficulty-floor
inclusion. The neutral trail, classification, gating, and rewards continue to exclude confidently
floored nodes. If a future floor policy includes that node, its ordinary neutral evidence remains
ordinary evidence rather than a hidden scaffold copy.

Build the neutral classification and trail destination facts before detour composition so the
projection does not call back into a client helper. Delete `resolveReferenceStopId` and its barrel
exports; the Learner App switches exhaustively on the projected destination.

### KTD5 — Exact collisions and grounding remain internal policy

Use one private exact-match resolver for both the selected term and every outline label. A unique
eligible match pins a reference. Any parent, locked, ambiguous, cross-domain, or payload-incomplete
collision is added to the outline's exclusion set and can never become a generated node with the
same normalized label/alias.

Use the already-defined `ScaffoldOutlinePort.retryFeedback` for one application-level re-outline
when an outline repeats an unusable collision or duplicates another proposed step. Feedback names
the rejected labels and asks for distinct, strictly simpler prerequisites. A second colliding label
is dropped; if no safe step remains, generation fails. Direct usable selected-term reuse still makes
zero neural calls.

Every non-reference outline step passes the Knowledge-Boundary Probe. A `boundary` result drops the
step. A `core_knowledge` result proceeds through Grounding Generation to obtain that child's own
Generated Grounding Bundle. Verified parent definition passages may be passed as
`scaffoldedAnchors`, but are never returned directly as child grounding and no character threshold
can bypass the probe. Content generation consumes the child-specific generated definitions. Preserve
the accepted two-draft congruence re-pick and fail-open judge-unavailability behavior in ADR-0037.

### KTD6 — One honest failure protocol

Wrap the whole claimed call in `runInstrumentedOperation`. It resolves only after a fenced `ready`
write. Internally:

- a missing/mismatched attempt or any false fenced write raises an internal claim-lost error and
  writes no detour state;
- a forced-tool exhaustion whose entire classified attempt trail is network, timeout, HTTP 429, or
  HTTP 5xx releases the claim under the same fence and rejects for bounded supervisor retry;
- deterministic model/schema/content failure and “no safe Support Step survived” record `failed`
  under the fence and reject; and
- a failed release/fail write caused by losing the fence does not overwrite the original error or
  mutate the new owner's state.

Extract the existing Topic Expedition transient classifier into one package-internal application
module and reuse it; do not export it from `@lrnki/application`. Stage errors are no longer swallowed
into a successful operation result. The supervisor remains a scheduler that logs rejected attempts.

Add a fenced `releaseClaim` store capability. Delete the production-unused direct `claim` method,
its implementation, and test-only fakes. Keep process-level `claimNextGenerating`, stale reaping,
attempt budgets, and concurrency in the supervisor/store adapters.

### KTD7 — Closed operation registry and complete config identity

Replace the five exported manual descriptor arrays in
`packages/infrastructure-litellm/src/configHashes.ts` with one `neuralOperationRegistry`. Each entry
owns its operation-config seed, corresponding Operation Timeline type, and descriptor set. Keep
Graph Enrichment and Synthetic Topic Generation as separate neural-operation entries that both map
to `enrichment`; union entries by timeline type when checking catalog completeness. Derive:

- each existing operation hash;
- a deduplicated all-operation descriptor inventory for schema-shape checks;
- descriptor-to-timeline membership/completeness tests; and
- the package's registry/inventory export surface.

Keep measurement-only descriptors explicit in a separate inventory; do not pretend a quality audit
is an Operation Timeline run. A descriptor reused by several operations appears in every relevant
operation entry, while the all-descriptor inventory deduplicates it by descriptor identity.

Define typed `ScaffoldGenerationConfig` in application code with the operation-level behavior knobs:
maximum Support Steps, initial-plus-one outline attempts, content/congruence draft attempts, and the
Knowledge-Boundary Probe config. The infrastructure `scaffoldGenerationConfigHash(config)` includes
all five runtime forced-tool descriptors—outline, Knowledge-Boundary Probe, Grounding Generation,
content, and congruence—plus those application knobs and the embedding model. The removed parent-text
threshold is absent.

Add nullable `config_hash` to `operation_runs` with a database CHECK requiring it for
`operation_type = 'scaffold'`. Extend `RunProgressReporterPort.beginOperation`,
`runInstrumentedOperation`, the Postgres reporter, and `OperationTimelineSummary` so the Scaffold
call writes and inspection reads that hash at operation start. Existing operations may keep null
there because their canonical config identities remain on their owning run/artifact rows. Direct
reference reuse still writes a config hash even though it opens no neural stage.

### KTD8 — Production composition is construction only

Replace `runLearnerScaffoldGeneration(input, sql)` with
`createLearnerScaffoldGeneration(sql): ScaffoldGeneration`. It constructs neural clients, Postgres
adapters, reporter, complete config hash, and the `getStudySession` reader once. It contains no
parent-context assembly, candidate filtering, grounding threshold, probe branch, stage wrapper, or
terminal policy.

Cache the returned callable lazily at process scope in `scaffoldGenerationSupervisor.ts`, matching
Topic Expedition generation so DB-free imports remain hermetic. A claimed row contributes only
`detourId` and its non-null latest operation id. The deep callable re-verifies the active claim and
uses that one id as its fence; the supervisor does not pass a duplicated dependency bag or
`claimToken` request field.

### KTD9 — Learner flow consumes projected destinations

`CheckpointPath` passes the selected `ScaffoldStepView` destination into `SupportPathSheet`; it does
not search the trail. A checkpoint destination closes the Support Path, scrolls to the projected
stop, and opens the ordinary `ActivitySheet`. A support-activity destination stays inside the
Support Path and reuses `LessonSections` plus `OptionSelectBody`:

- mark the neutral lesson read through the existing node-scoped action;
- grade through a learner-owned reference option-select route that resolves the pinned key and
  appends a neutral response; and
- refresh the Study Session so authoritative completion/Continue state replaces the local optimistic
  marker.

Refactor the existing generated-step body only enough to share key-free lesson/question rendering;
generated steps retain scaffold-scoped grading and their generated badge. Do not nest another
full-screen dialog, copy neutral content into local state, or derive floor/currentness in React.

## Implementation Units

### U1 — Versioned neutral reference identities and persistence

- **Depends on:** plan 003 completion.
- **Primary files:**
  - `packages/domain-core/src/index.ts`
  - `packages/domain-core/src/learnerScaffold.ts`
  - `packages/application/src/assembleConceptLesson.ts`
  - `packages/application/src/generateStudyItemBank.ts`
  - corresponding domain/application tests
  - `packages/ports/src/index.ts`
  - `packages/infrastructure-postgres/src/migrations/0000_initial_lrnki_schema.sql`
  - `packages/infrastructure-postgres/src/PostgresLearnerLoopStores.ts`
  - `packages/infrastructure-postgres/src/PostgresLearnerScaffoldStore.ts`
  - their focused Postgres tests and infrastructure barrel
- **Work:** Implement KTD3's lesson identity/supersede model, reference-step FKs/CHECK, pinned
  hydration port, fenced `releaseClaim`, and removal of direct `claim`. Generate lesson ids before
  persistence and reuse existing lesson/item hydrators for current and pinned reads.
- **Tests:**
  1. Regeneration leaves the prior lesson and sections hydratable by id while ordinary reads return
     only the new current lesson.
  2. A reference row cannot omit any pinned id, mix reference ids with generated payload, point to a
     non-option-select item, or point outside the detour's enrichment/domain invariants enforced by
     the publishing application check.
  3. A ready reference survives both lesson and Study Item Bank regeneration and hydrates exactly
     the pinned content; no payload bytes appear on the scaffold row.
  4. Fenced release affects only the active attempt; a stale token cannot release, fail, or publish.
  5. Existing generated-step persistence, audit reads, hide/restore, and response FKs remain intact.
- **Gate:** Hard-reset/reinitialize with `.env` loaded and pass domain, application assembly/bank, and
  Postgres learner-loop/scaffold suites before U2.

### U2 — Finished Study Session references and neutral grading

- **Depends on:** U1.
- **Primary files:**
  - `packages/application/src/getStudySession.ts`
  - `packages/application/src/studySessionProjection.ts`
  - `packages/application/src/studySessionTrail.ts`
  - `packages/application/src/gradeStudyResponse.ts`
  - their focused tests and `index.ts` / `projection.ts` barrels
  - `apps/learner-api/src/app.ts` and API tests
- **Work:** Implement KTD2/KTD4's current neutral-reference asset map, pinned activity load,
  destination union, pinned completion fold, and reference option-select grading. Reorder pure
  projection steps as needed so classification/trail facts exist before detour destinations. Delete
  `resolveReferenceStopId` in the same unit.
- **Tests:**
  1. The same Study Session classifies an included locked candidate as locked, an included
     frontier/mastered candidate as usable, and a confidently floored candidate as usable only when
     current lesson+option ids exist.
  2. Included/current/playable pins project a concrete checkpoint stop; floored, later-locked, and
     superseded pins project a key-free support activity.
  3. A floored reference opens and completes from its pinned lesson read plus pinned neutral
     latest-correct item response while remaining absent from the trail/classification/gating.
  4. A later incorrect response reopens only that reference completion; a response to a replacement
     current item does not complete the pinned reference.
  5. Reference grading rejects foreign/non-reference/generated/malformed steps and appends a neutral,
     never scaffold-scoped, observation for the pinned item/node.
  6. No answer key appears in the Study Session JSON or projection exports.
- **Gate:** Application projection/grading and learner-api suites pass; inspect one serialized
  session fixture for key-free current, floored, and superseded destinations.

### U3 — Closed Neural Operation registry and attempt attribution

- **Depends on:** U1 schema reset; may proceed in parallel with U2 after U1.
- **Primary files:**
  - `packages/application/src/runProgressReporter.ts`
  - `packages/application/src/operationTimelineCatalog.ts`
  - related application tests and `packages/ports/src/index.ts`
  - `packages/infrastructure-litellm/src/configHashes.ts`
  - `packages/infrastructure-litellm/src/configHashes.test.ts`
  - `packages/infrastructure-litellm/src/mimoDescriptorShape.test.ts`
  - `packages/infrastructure-litellm/src/index.ts`
  - `packages/infrastructure-postgres/src/PostgresRunProgressReporter.ts`
  - `packages/infrastructure-postgres/src/PostgresOperationTimelineRead.ts`
  - their tests and the initial migration
- **Work:** Implement KTD7. Derive hashes/inventories from the registry, include every Scaffold
  runtime descriptor and knob, persist the hash on Scaffold operation start, and expose it through
  the timeline read model. Delete superseded arrays/exports in the same unit.
- **Tests:**
  1. For each timeline operation type, the union of registered operation descriptors equals—not
     merely subsets—the catalog's LLM stage set; shared stages have exactly the accepted owners.
  2. The Scaffold entry contains outline, probe, grounding, content, and congruence exactly once;
     changing any descriptor hash, probe/config knob, or embedding model changes its operation hash.
  3. The MiMo shape test consumes the derived all-descriptor inventory plus explicitly classified
     measurement descriptors; no manual operation spread remains.
  4. Postgres rejects a Scaffold operation with no config hash, preserves hashes across separate
     attempts, and reads the hash in timeline summary/detail; other operation types retain their
     existing attribution homes.
  5. A no-stage direct-reference operation still records its config hash and succeeds.
- **Gate:** Infrastructure-LiteLLM, operation-catalog/reporter, and Postgres timeline suites pass.

### U4 — Deep process-lived Scaffold Generation module

- **Depends on:** U2 and U3.
- **Primary files:**
  - `packages/application/src/learnerScaffoldGeneration.ts`
  - `packages/application/src/learnerScaffoldGeneration.test.ts`
  - new package-internal failure-classification module if needed
  - `packages/application/src/generateTopicExpedition.ts` and its tests
  - `packages/application/src/index.ts`
- **Work:** Implement KTD1/KTD5/KTD6 through the one factory/callable seam. Move all policy from the
  learner-api callback shell, use one opening Study Session, pin exact assets, activate bounded
  outline retry feedback, always probe/generate child grounding, internalize stages, and make every
  non-ready outcome reject after the correct fenced action. Reuse one internal transient classifier
  with Topic Expedition generation.
- **Tests (all through the factory's returned callable):**
  1. Unique direct eligible selected-term match publishes one pinned reference with zero neural calls;
     frontier, mastered, and floored cases are covered.
  2. Parent, locked, ambiguous, cross-domain, and payload-incomplete collisions never reference or
     clone; one feedback re-outline may choose a distinct lower-level label, while a repeated
     collision fails with no child rows.
  3. One opening Study Session is read per attempt; mutating fake learner state after that read does
     not change publication, and two interleaved calls share no per-attempt state.
  4. Every generated label runs probe then child grounding; parent definitions appear only as
     grounding anchors. Boundary steps drop, mixed reference/generated order survives, and empty
     generated definitions cannot publish.
  5. Existing payload-shape and congruence re-pick behavior remains: invalid/NO drafts retry within
     the configured bound, judge unavailability fails open, and no unsafe partial branch publishes.
  6. Ready is the only resolution; deterministic/no-safe marks failed then rejects, all-transient
     exhaustion releases then rejects, and claim loss writes nothing and stops later neural spend.
  7. The reporter sees the complete stage order and config hash; failed detours produce failed—not
     succeeded—operation timelines.
  8. The focused fake implements only the lifecycle/read/neural/reporter capabilities construction
     actually accepts; removed helper/context/dependency exports are absent from the package barrel.
- **Gate:** Apply `.agents/skills/real-use-quality-evaluation/SKILL.md` immediately after this
  behavior milestone. Run fresh production adapters against disposable learners before U5; stop if
  generated steps are not clearly simpler, child-grounded, coherent, and recallable.

### U5 — Thin production composition and playable reference destinations

- **Depends on:** U4 and completion/reconciliation of plan 003.
- **Primary files:**
  - `apps/learner-api/src/learnerScaffoldGeneration.ts`
  - `apps/learner-api/src/scaffoldGenerationSupervisor.ts`
  - focused supervisor/composition tests
  - `apps/learner-api/src/app.ts`
  - `apps/learner-app/src/lib/actions.ts`
  - `apps/learner-app/src/components/CheckpointPath.tsx`
  - `apps/learner-app/src/components/SupportPathSheet.tsx`
  - their interaction tests
- **Work:** Implement KTD8/KTD9. Construct once, lazily cache, pass only claimed identity, and delete
  the app policy shell. Route current references through the projected checkpoint and render pinned
  floored/superseded neutral activities inside the existing Support Path. Share render primitives,
  not evidence semantics, between generated and neutral step bodies.
- **Tests:**
  1. Concurrent supervisor claims reuse one process-lived callable while each receives its own
     detour/operation identity; DB-free module import constructs neither SQL nor neural clients.
  2. The production composition binds all required adapters/config exactly once and contains no
     candidate, grounding, retry, stage, or terminal branching.
  3. An included/current reference closes the Support Path and opens exactly the projected stop.
  4. Floored and superseded references stay in the Support Path, show the pinned neutral lesson and
     option-select, record lesson/answer, refresh completion, and Continue to the next incomplete
     Support Step.
  5. Generated Support Steps retain generated labeling, scaffold-scoped grading, resume behavior,
     and hide/restore; no nested full-screen dialog or answer key appears.
  6. The deleted resolver, callback shell, threshold, direct claim path, and obsolete action/test
     assumptions have zero imports or references.
- **Gate:** Learner-api, learner-app Jest, production web export, and intercepted Playwright gates
  pass before the real-use browser gate.

### U6 — Database, real-use, browser, and cleanup gate

- **Depends on:** U1–U5.
- **Automated envelope:** With `DATABASE_URL` loaded from `.env`, hard-reset the development schema;
  run focused domain/application/LiteLLM/Postgres/API/app suites, then `pnpm typecheck`, `pnpm test`,
  `pnpm lint`, `pnpm build`, `pnpm e2e:web`, and finally `pnpm check` after temporary evidence is
  organized under `tmp/`.
- **Generation quality gate:** Through the production process-lived factory, exercise at least six
  difficult terms across at least three mixed domains, including direct included reuse, confidently
  floored reuse, locked collision with distinct re-outline, generated one-step support, mixed
  reference/generated support, boundary omission, transient/deterministic failure evidence, and a
  parent with long but child-irrelevant grounding. Inspect operation config hashes, stage/spend
  attribution, generated grounding, and final content. Run the standing
  `kg-worker audit-scaffold-content` instrument over every generated result.
- **Durability/browser gate:** In a disposable real learner flow, prove: current included reference
  routing; floored pinned activity completion; later Learner State re-lock without loss of access;
  Concept Lesson and Study Item regeneration followed by successful pinned fallback replay; neutral
  response identity; Support Path resume/Continue/hide/restore; phone and desktop layouts; reduced
  motion; and no console/accessibility errors. Use `pnpm e2e:web:realuse` where it covers the flow and
  retain human inspection notes for the generation output.
- **Evidence:** Write concrete defects, fixes, remaining caveats, operation ids/config hashes, and
  screenshots to `tmp/2026-07-16-deep-scaffold-generation/EVALUATION.md`. Clean disposable learner
  state. A green suite without this inspection is not completion evidence.
- **Documentation cleanup:** Reconcile implemented source/migration shapes with ADR-0030, ADR-0031,
  ADR-0034, and ADR-0037 without duplicating them; update `TODO.md` with the grouped outcome and
  latest validation; remove this plan from `docs/plans/README.md`; delete this plan and the accepted
  brainstorm. Keep only git history as provenance.

## Acceptance

- Production and focused tests cross the same process-lived Scaffold Generation interface; the
  learner-api composition contains adapters only.
- Exact reuse cannot admit a locked included node, cannot clone an unusable collision, and can play
  a confidently floored neutral reference.
- Every published reference pins valid neutral lesson/item identities, survives regeneration, and
  records neutral evidence without copied payload.
- Every generated child is probed and grounded specifically; no parent-text-length shortcut exists.
- Ready is the only successful operation result; claim loss, transient release, deterministic
  failure, and no-safe-step failure produce the agreed fenced state and honest timeline status.
- One operation registry owns descriptor membership; Scaffold config identity covers all runtime
  descriptors/knobs and is persisted/read on every attempt.
- Superseded helper/context/dependency exports, app policy callbacks, direct scaffold `claim`, manual
  descriptor arrays, node-only reference shape, delete-on-regenerate lesson behavior, and
  `resolveReferenceStopId` are gone in their replacement units.
- Hard-reset Postgres integration, full deterministic envelope, production-model real-use judgment,
  standing scaffold-content audit, and real learner browser replay all pass with evidence recorded.

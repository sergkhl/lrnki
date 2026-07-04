# TODO

## TODO

1. **Address broad, evidence-thin intrinsic-difficulty distortion.** Real full-manifest inspection
   found plausible ordering overall but over-weighted some broad or relation-like labels with sparse
   evidence.
   - Prefer a measured neural judge over fixture-specific prompt tuning or deterministic proxies.
   - Keep population calibration deferred until stable real learner-response data exists
     ([ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md)).

2. **Calibrate the knowledge-boundary probe so the `boundary`/`uncertain` route actually fires.** The
   synthetic arm's real-use gate scored **0 `boundary` verdicts across 38 concepts** spanning
   textbook (Photosynthesis, Quantum error correction) to frontier (Mechanistic interpretability): the
   shipped default K / temperature / agreement threshold never routed a real concept to `boundary`, so
   the boundary disposition is exercised by unit tests only. Measure-first: probe deliberately fringe or
   contested concepts, inspect the K-draw semantic dispersion, and tune temperature/threshold (or
   confirm the concepts are genuinely core knowledge) before any `web_grounded` retrieval plan or
   source-less lesson gating depends on this seam. Decision:
   [ADR-0030](../adr/0030-confidence-gated-synthesis-with-web-grounding.md).

3. **Learner App map-centered trail, one-activity flow, and charting onboarding.** Make the trail
   the single home surface with in-place fog reveal, open activities one at a time as a full-screen
   sheet, merge journal and gems into one surface, and ship one-field charting with inferred
   Declared Domain and fiction-voiced stage copy. Requirements:
   [brainstorm](../brainstorms/2026-07-04-learner-app-map-center-ux-requirements.md). Decision:
   [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

4. **Use corrected bottleneck reports for the next latency/cost improvement.** The corrected
   metering pass made Study Item Bank stage cost trustworthy and showed bounded per-node concurrency
   can reduce wall-clock without changing cost ownership. The next optimization pass should start
   from the latest ranked report, target the measured largest contributor, and record wall-clock,
   calls, tokens, cost, and inspected real-use output before changing prompts, models, batching, or
   cache-token reporting. Current evidence points at enrichment/prerequisite-ordering as the next
   wall-clock candidate after Study Item Bank concurrency.
   Decision: [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md). Validation trail:
   `tmp/2026-06-30-generation-metering/`.

## COMPLETED

- **Learner App Expedition Journal surface.** `/learn` is now the learner-facing Expedition Journal:
  readiness-ranked expedition entry, learner-owned expedition persistence, active selection, playable
  trail/activity screen over `getStudySession`, journal/gem/map rewards, a learner-entered course-data
  charting door, and progress/failure cards over ADR-0029 timelines. It supersedes the earlier Quest
  Subgraph Admin Lab study surface; that milestone's target recommendations, trusted prerequisite
  cones, and stateful Learner Path ladder live on as the application projections serving this route.
  The superseded operator `/admin/lab/study` route, calibration shell, study components, and study
  libs were deleted; the prior calibration shell alignment TODO is resolved by deletion. The learner
  PDF/Docling door was removed before completion, so learner-created expeditions currently use the
  synthetic course-data path only. Decisions:
  [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md),
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md), and
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Operation lifecycle wrapper and application barrel prune.** The ADR-0029 operation lifecycle now
  has one application wrapper for operation-tag scope, begin-at-entry, and terminal succeeded/failed
  status; stage bracketing owns only stage close/error detail. `generateStudyItemBank` precondition
  failures now persist a failed `study_items` timeline with a failed `load` stage. The
  `@lrnki/application` barrel is pruned to the mechanically consumed external surface. Decisions:
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md) and
  [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md). Framing:
  [architecture review](../brainstorms/2026-07-03-architecture-deepening-review.md).

- **Study Item Bank and Concept Lesson generation quality.** The learner-facing bank attributes
  rejected study-item rows, retries source-grounded lessons once when no substantive source citation
  survives, falls back to generated-labeled lesson sections when citation grounding is absent, binds
  impostor reveal/source metadata to the keyed lie statement, runs a fail-closed cross-family
  lie-validity judge with one informed retry, and ranks recommended quests by full readiness before
  cone size while showing missing-item counts. The Concept Lesson `gist` is generated as a framing
  hook distinct from the definition's formal statement, with `intuition` emitted only when it adds a
  distinct mental model. Decisions: [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md), and
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Legacy persisted Learner Path stack retired.** The pre-Quest-Subgraph persisted path write/read
  stack is gone: worker path commands, path tables, path store/read adapters, Admin Lab `/paths`, and
  learner-loop path/coverage panels were deleted. The live Study Session remains the Learner Path
  projection for source-grounded and anchor-less synthetic Derived Graph Layers. Decision:
  [ADR-0019](../adr/0019-graph-enrichment-derived-layer.md).

- **Synthetic Topic Generation.** A `topic` plus Declared Domain now creates an anchor-less Derived
  Graph Layer of `synthetic_primary` `llm_grounded` nodes. The Knowledge-Boundary Probe gates
  source-less concept synthesis; `boundary` concepts are retained as inspectable `uncertain`
  dispositions and held out of trusted learner surfaces. Decisions:
  [ADR-0019](../adr/0019-graph-enrichment-derived-layer.md),
  [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md), and
  [ADR-0030](../adr/0030-confidence-gated-synthesis-with-web-grounding.md).

- **Source-grounded asserted graph baseline.** Curated mixed-format sources normalize into structured
  blocks; atomic Concept Admission selects core Concepts; CEP extraction preserves verified
  definitions, mentions, and the single permitted typed assertion; explicitly selected Extraction
  Runs build immutable asserted graph versions with zero asserted edges. Decisions:
  [ADR-0004](../adr/0004-normalize-curated-sources.md),
  [ADR-0005](../adr/0005-admit-atomic-concepts-before-evidence-profiles.md),
  [ADR-0007](../adr/0007-extract-concept-evidence-profiles-in-concept-context.md),
  [ADR-0016](../adr/0016-retire-relation-registry-keep-one-cep-assertion.md), and
  [ADR-0017](../adr/0017-split-extraction-runs-from-graph-version-builds.md).

- **Derived Graph Enrichment.** Enrichment rescues source-mentioned nodes, mints generated nodes only
  for source-absent prerequisites, records grounding origin structurally, derives prerequisite
  structure through sampled whole-domain ordering, and keeps uncertainty inspectable. Decisions:
  [ADR-0019](../adr/0019-graph-enrichment-derived-layer.md),
  [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md),
  [ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md), and
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md).

- **Study assets and learner state.** The learner loop keys study assets and responses to
  `derived_node_id`; Concept Lessons ground downstream study assets; the Study Item Bank supports
  `option_select` and `impostor`; graded selections append to the Response Log while calibration
  remains separate. Decisions: [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md), and
  [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md).

- **Forced-tool reliability, observability, and cost reporting.** Forced-tool schemas are
  single-sourced from zod, and neural judge gates share one fail-safe boundary for bounded
  concurrency, index-aligned results, and fail-closed pass-through behavior. Forced-tool exhaustion
  is inspectable without relaxing fail-closed behavior, citation match fidelity is visible, and
  shared operation-stage timelines support liveness plus bottleneck reports over one operation or one
  Processing Journey. Routing production extraction aliases to DeepSeek first-party resolved the
  prior extraction latency blocker and removed the dedicated OpenRouter-key blocker. Decisions:
  [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md),
  [ADR-0007](../adr/0007-extract-concept-evidence-profiles-in-concept-context.md),
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md),
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md), and
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md).

- **Inspection and learner-projection boundaries.** Inspection surfaces use read-model ports, while
  learner-facing projections compose reads with adaptation compute behind application use-cases;
  Admin Lab remains a thin operator surface. Decisions:
  [ADR-0011](../adr/0011-retain-minimal-admin-lab.md) and
  [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md).

## VALIDATION

- **Learner App Expedition Journal surface, 2026-07-04.** Deterministic envelope:
  `pnpm run check` exit 0 after the review-fix pass (full workspace typecheck, recursive tests,
  ESLint with 2 pre-existing warnings, and Admin Lab production build). Focused checks also passed:
  `@lrnki/admin-lab` tests/typecheck, `@lrnki/application` tests/typecheck, and
  `@lrnki/infrastructure-postgres` typecheck. DB reset and the single initial migration succeeded
  with the `learner_expeditions` indexes; `PostgresLearnerExpeditionStore` DB-backed tests passed
  with `.env` loaded. Reference sweep over `apps`, `packages`, and `scripts` found no remaining
  `/admin/lab/study`, `components/study`, `lib/studySession`, or `lib/calibrationSession`
  references; a focused learner/admin-lab sweep found no remaining PDF upload, learner Docling, or
  source-charting path. Review hardening fixed active-expedition idempotency, per-learner enrichment
  uniqueness, operation-type-scoped progress reads, charting auto-refresh, caught background charting
  failures, learner-facing failure-message sanitization, ready-expedition validation on study
  actions, and activity progression that keeps a stop active until this learner answers all its
  activities. **Real-use quality evaluation:** with DeepSeek balance restored, the learner
  course-data charting path ran through production aliases under the $0.50/M output cap and produced
  a ready expedition for enrichment `26c04779-f807-46f5-a63b-004e5ca88b3f`: 10 derived nodes, 10
  lessons, 19 current study items, succeeded enrichment and study-item timelines, and a live
  `getStudySession` projection with a 4-step path, selected frontier, and 2 first-frontier activity
  segments. **Result: PASS for the learner course-data path.** The learner PDF/Docling path was
  intentionally removed and not evaluated. Trail: `tmp/2026-07-03-learner-expedition-gate/`.

- **Operation lifecycle wrapper and application barrel prune, 2026-07-03.** Deterministic envelope:
  `pnpm run check` exit 0 (full workspace typecheck, recursive tests, ESLint with 2 pre-existing
  warnings, and Admin Lab production build). Mechanical public-surface check found 42 external
  `@lrnki/application` consumers across `apps`, `scripts`, and non-application packages, with zero
  missing or extra barrel exports. `rg` found no remaining `runWithOperationTag` operation call sites
  outside `runProgressReporter.ts`; `beginOperation`/`completeOperation` callers are limited to the
  wrapper, tests, and the Postgres adapter. **Real-use quality evaluation:** with `.env` loaded, a
  real `generate-study-items` run against nonexistent enrichment
  `bcdd6e8f-459f-4f66-97b4-ae0eca0a5a54` failed as expected and persisted a `study_items` operation
  with status `failed`, current stage `load`, and a failed `load` stage whose redacted `error_detail`
  names the missing enrichment. A real graph-version build
  `710c2dc0-d1b8-4844-a67b-211288456d89` from the existing succeeded extraction run published
  successfully with `BUILD_DISABLE_IDENTITY_RESOLUTION=1`; its persisted `minting` timeline shows
  completed `load`, `refine`, and `persist` stages with `ok=true` and terminal `succeeded`. Admin Lab
  operations and bottleneck pages rendered both operation ids, statuses, and stages from the same DB.
  **Result: PASS.** Trail: `tmp/real-use-missing-enrichment-id.txt`,
  `tmp/real-use-build-graph-output.txt`, `tmp/admin-operations.html`, and `tmp/admin-bottleneck.html`.

- **Persisted Learner Path retirement, 2026-07-03.** Deterministic envelope: `pnpm run check` exit 0
  after the deletion (0 ESLint errors, 2 pre-existing warnings outside this diff). Targeted gates also
  passed: `@lrnki/application` tests/typecheck, `@lrnki/kg-worker` tests/typecheck,
  `@lrnki/infrastructure-postgres` tests with `.env` loaded, and Admin Lab tests/typecheck/build.
  Schema reset/migration succeeded; `to_regclass('public.learner_paths')` and
  `to_regclass('public.learner_path_steps')` both returned null. Reference sweep over `apps`,
  `packages`, and `scripts` found no deleted path commands, stores, read models, tables, or legacy
  projection helpers. **Real-use gate (rule 14):** a source-grounded Rust fixture ran through real
  extraction, graph version build, enrichment, Study Item Bank generation, and synthetic learner
  verdict seeding. A separate anchor-less synthetic `introductory fractions` layer generated with
  `graphVersionId: null`, 12 nodes, 11 committed edges, and study items. Direct `getStudySession`
  inspection showed the source-grounded Copy trait quest and synthetic Addition/Subtraction of
  Fractions quest both project live stateful paths, frontier targets, and study segments without any
  persisted path row. **Result: PASS.** Trail: `tmp/real-use-rust-manifest.json` and
  `tmp/real-use-study-session-inspection.json`.

- Tests remain deterministic-envelope evidence only under
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md); quality claims come from
  inspected real model output. Older validation trails live in git history and generated artifacts
  under `tmp/`.

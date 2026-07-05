# TODO

## TODO

1. **Address broad, evidence-thin intrinsic-difficulty distortion.** Real full-manifest inspection
   found plausible ordering overall but over-weighted some broad or relation-like labels with sparse
   evidence. Learner-facing symptom (2026-07-05): relation-like concepts (e.g. "Compositional
   relationship") reach the trail as trivially easy stops, so the score cannot yet be trusted as a
   gating signal — a difficulty floor for trail inclusion was considered and deferred until this
   fix lands; the trivial-question half of that symptom is answer-leakage at item generation and is
   handled there, not here.
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

3. **Use corrected bottleneck reports for the next latency/cost improvement.** The corrected
   metering pass made Study Item Bank stage cost trustworthy and showed bounded per-node concurrency
   can reduce wall-clock without changing cost ownership. The next optimization pass should start
   from the latest ranked report, target the measured largest contributor, and record wall-clock,
   calls, tokens, cost, and inspected real-use output before changing prompts, models, batching, or
   cache-token reporting. Current evidence points at enrichment/prerequisite-ordering as the next
   wall-clock candidate after Study Item Bank concurrency.
   Decision: [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md). Validation trail:
   `tmp/2026-06-30-generation-metering/`.

## COMPLETED

- **Learner trail polish.** The learner trail now uses opaque portal surfaces, one-tap option-select
  grading with generated explanations, persisted lesson-read completion, a linear next-pointer,
  type-stable stop icons, gem-only capstone state, expedition domain/progress rows, and no Journal
  route. Study-item generation and validation require option-select explanations, Study Session
  projections expose lesson-read and explanation state, and learner expedition rows compute live
  item progress from the study bank and latest responses. Requirements:
  [brainstorm](../brainstorms/2026-07-04-learner-trail-polish-requirements.md). Decision:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Learner App checkpoint trail, activity sheet, and charting onboarding.** `/learn` now centers
  the learner expedition on a Duolingo-style per-item checkpoint path, with fog display and per-item
  completion derived from Study Session state, one stop opening one full-screen activity sheet with a
  single primary footer action, opaque learner surfaces, headed lesson sections, icon-only grounded
  provenance, concept-level skip popovers, topic-first charting with editable inferred Declared
  Domain, fiction-voiced charting stage copy, and an Admin Lab door that ensures a playable `admin`
  expedition before redirecting. Requirements:
  [brainstorm](../brainstorms/2026-07-04-learner-app-map-center-ux-requirements.md). Decision:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Learner App expedition entry surface.** `/learn` is now the learner-facing expedition entry:
  readiness-ranked expedition entry, learner-owned expedition persistence, active selection, playable
  trail/activity screen over `getStudySession`, a learner-entered course-data charting door, and
  progress/failure cards over ADR-0029 timelines. It supersedes the earlier Quest Subgraph Admin Lab
  study surface; that milestone's target recommendations, trusted prerequisite cones, and stateful
  Learner Path ladder live on as the application projections serving this route. The superseded
  operator `/admin/lab/study` route, calibration shell, study components, and study libs were
  deleted; the prior calibration shell alignment TODO is resolved by deletion. The learner
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

## VALIDATION

- **Learner trail polish, 2026-07-04.** Deterministic envelope: `pnpm run check` exit 0 (full
  workspace typecheck, recursive tests, ESLint with 2 pre-existing warnings, and Admin Lab
  production build). The single initial migration reset succeeded with `study_items.explanation` and
  `lesson_reads`. Real-use gate: `scripts/seed-demo.sh` ran production LLM extraction, graph build,
  enrichment, and Study Item Bank generation across the curated fixture set, publishing graph version
  `e2e4ecd8-305c-4568-b35c-8e9582c698a0`, enrichment
  `e7771ca2-51e4-42ab-8caa-bad614d2ad9a`, 91 lessons, and 160 current study items; 22 generated
  study-item rows were rejected by the existing fail-closed gates. Browser inspection on
  `http://localhost:3001` passed for the seeded `admin` expedition: expedition rows showed declared
  domain and item progress, the trail showed gem count and no Journal navigation, the retired
  Journal route returned 404, theory Continue persisted a lesson read, one-tap grading persisted a
  response and showed explanation feedback, 390px mobile had no horizontal overflow, and concept
  popovers remained opaque/readable. Caveat: Playwright observed one React hydration warning on form
  control styling in the charting form, outside this trail flow. **Result: PASS.** Screenshots and
  report: `tmp/learner-trail-polish/`.

- **Learner App checkpoint trail, activity sheet, and charting onboarding, 2026-07-04.**
  Deterministic envelope: `pnpm run check` exit 0 (full workspace typecheck, recursive tests, ESLint
  with 2 pre-existing warnings, and Admin Lab production build). Focused checks also passed:
  `@lrnki/admin-lab` tests/typecheck, `@lrnki/application` tests, and
  `@lrnki/infrastructure-litellm` tests. Browser checks on `http://localhost:3000` passed for the
  real seeded enrichment `aa0e5b08-1510-4969-92b5-d2aabdf4f1b6`: desktop and 390px mobile expedition
  pages showed checkpoint circles, concept markers, the fog band, and no visible raw provenance/item
  enums; the theory sheet showed headed single-block notes with Continue-only footer and no skip
  action; the question sheet enforced select → Check → feedback → Continue, wrapped option text at
  390px, and filled the question circle after a latest-correct retry; the concept-marker skip action
  reduced locked activity buttons from 32 to 28. **Real-use quality evaluation:** PASS for the seeded
  `admin` learner expedition. Screenshots and reports: `tmp/learner-checkpoint-ux/`.

- **Learner App expedition entry surface, 2026-07-04.** Deterministic envelope:
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

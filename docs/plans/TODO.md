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

3. **Use corrected bottleneck reports for the next latency/cost improvement.** The corrected
   metering pass made Study Item Bank stage cost trustworthy and showed bounded per-node concurrency
   can reduce wall-clock without changing cost ownership. The next optimization pass should start
   from the latest ranked report, target the measured largest contributor, and record wall-clock,
   calls, tokens, cost, and inspected real-use output before changing prompts, models, batching, or
   cache-token reporting. Current evidence points at enrichment/prerequisite-ordering as the next
   wall-clock candidate after Study Item Bank concurrency.
   Decision: [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md). Validation trail:
   `tmp/2026-06-30-generation-metering/`.

4. **Align the calibration shell to the study use-case shape (optional fast-follow).** The
   learner-facing reads now follow the ADR-0027 split (see COMPLETED), but
   `composeCalibrationSession` / `calibrationSession.ts` still use the older pure-compose +
   shell-wiring shape. Bring it onto the same injected-ports use-case shape as `getStudySession` so
   both learner projections share one boundary before the Learner App is built. This is
   behavior-preserving and does not require a new ADR.
   Decision: [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md).

## COMPLETED

- **Quest-quality defects in Study Item Bank generation.** The learner-facing quest bank now
  attributes rejected study-item rows, retries source-grounded lessons once when no substantive
  source citation survives, falls back to generated-labeled lesson sections when citation grounding
  is absent, binds impostor reveal/source metadata to the keyed lie statement, runs a fail-closed
  cross-family lie-validity judge with one informed retry, and ranks recommended quests by full
  readiness before cone size while showing missing-item counts. Decisions:
  [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md), and
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Legacy persisted Learner Path stack retired.** The pre-Quest-Subgraph persisted path write/read
  stack is gone: worker path commands, path tables, path store/read adapters, Admin Lab `/paths`, and
  learner-loop path/coverage panels were deleted. The live Study Session remains the Learner Path
  projection for source-grounded and anchor-less synthetic Derived Graph Layers. Requirements:
  [brainstorm](../brainstorms/2026-07-03-anchor-less-learner-path-audit-requirements.md). Decision:
  [ADR-0019](../adr/0019-graph-enrichment-derived-layer.md).

- **Concept Lesson gist as a framing hook distinct from the definition.** The `gist` is now
  generated as the concept's framing hook — the problem it solves, why it matters, or the tension it
  resolves — explicitly forbidden from restating the definition's formal "what it is", fixing the
  lead-in for 100% of nodes (gist is the ADR-0031 required minimum). The change is in generation, not
  presentation: the concept-lesson system prompt and the forced-tool `kind` description carry the
  sharpened, domain-neutral role, `intuition` stays conditional (emitted only when it adds a distinct
  mental model), and the ADR-0031 "unconditional" wording is reconciled with the conditional prompt.
  The superseded display-only gist suppression in the Admin Lab lesson card is removed, so the gist
  always leads. Decision: [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md).

- **Quest Subgraph study mechanic.** Admin Lab study now starts from target recommendations and
  search backed by trusted prerequisite cones. `StudySession` projects a stateful Learner Path ladder
  with focused-map and full-map context, while graph-only enrichments remain inspectable with a
  no-items warning. Decisions: [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md),
  [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md), and
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

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

- **Operator observability and cost reporting.** Forced-tool exhaustion is inspectable without
  relaxing fail-closed behavior, citation match fidelity is visible, and shared operation-stage
  timelines support liveness plus bottleneck reports over one operation or one Processing Journey.
  Decisions: [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md),
  [ADR-0007](../adr/0007-extract-concept-evidence-profiles-in-concept-context.md), and
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md).

- **Inspection and learner-projection boundaries.** Inspection surfaces use read-model ports, while
  learner-facing projections compose reads with adaptation compute behind application use-cases;
  Admin Lab remains a thin operator surface. Decisions:
  [ADR-0011](../adr/0011-retain-minimal-admin-lab.md) and
  [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md).

- **Quality gates and forced-tool reliability.** Forced-tool schemas are single-sourced from zod, and
  neural judge gates share one fail-safe boundary for bounded concurrency, index-aligned results, and
  fail-closed pass-through behavior. Decisions:
  [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md),
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md), and
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md).

- **Extraction provider latency fix.** Routing production extraction aliases to DeepSeek first-party
  resolved the prior extraction latency blocker and removed the dedicated OpenRouter-key blocker.

## VALIDATION

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

- **Quest-quality Study Item Bank fixes, 2026-07-03.** Deterministic envelope: `pnpm run check`
  exit 0 after the final prompt and comment cleanup (0 ESLint errors, 2 pre-existing warnings
  outside this diff); targeted application, LiteLLM, and domain-core checks also passed while
  iterating. **Real regenerate-and-inspect gate (rule 14):** enrichment `90768af5` was regenerated
  with production aliases after the strict lie-validity prompt (`generate-study-items
  90768af5-a9f5-4e0a-9dc0-0be71abfffdf --concurrency 6`, clean exit `lessons=63 lessonAbsent=1
  items=104 rejected=24`). Stored rows show 59 option-select items and 45 impostors; generated
  fallback is active for 23 items. Rejection reasons are inspectable: 14 citation-verification
  rejects, 7 forced-tool shape/exhaustion rejects, 2 lesson-absent rejects, and 1 lie rejected by
  the new judge. The inspected Rust false-by-attribution defect now drops: `Variable binding`
  rejected because the proposed lie was true-but-misattributed; persisted `Owner`, `Variable Scope`,
  `Clone`, and related impostors are plainly false for their target nodes with reveal/source metadata
  attached to the keyed lie row. Real recommendation output for the same enrichment ranks fully
  ready quests first (`INSTRUCTKG framework`, `DEBUG operator`, `IMPROVE operator`, etc., all
  `missing=0`). **Defects found by the gate and fixed before pass:** nested forced-tool lie objects
  caused invalid-JSON regressions, so the production wire schema stays shallow while the adapter
  binds scalars into the domain lie object; the first stricter pass exposed true-but-misattributed
  lie wording, so the generator and judge now require contradiction/impossibility rather than
  "belongs to sibling." **Review:** CE subagent review dispatch was attempted but unavailable due
  usage quota; fallback manual diff review found and fixed a pre-existing NUL-byte comment in
  `domain-core` by replacing it with literal `\u0000`. **Result: PASS.** Trail:
  `tmp/2026-07-02-quest-quality-regen-strict-lie.log` and
  `tmp/2026-07-02-rejection-attribution/`.

- **Concept Lesson gist distinctiveness, 2026-07-02.** Deterministic envelope: `pnpm run check`
  exit 0 (0 ESLint errors, 2 pre-existing warnings outside this diff); `@lrnki/infrastructure-litellm`
  102 tests and `@lrnki/admin-lab` 79 tests green, including the adapter's pinned system-prompt
  substrings and no-fixture-leak assertions. **Real regenerate-and-inspect gate (rule 14):** the
  Study Item Bank for enrichment `90768af5` (64 derived nodes; 63 lessons + 1 genuinely ungroundable
  node) was regenerated on real production DeepSeek calls (`generate-study-items … --concurrency 6`,
  clean exit `lessons=63 lessonAbsent=1 items=104 rejected=24`). Per-node gist-vs-definition snapshots
  before/after show the lead-in is now durably distinct: mean lexical similarity `0.325 → 0.175`,
  median `0.266 → 0.115`, near-restatements (ratio ≥ 0.6) `8 → 0`, max `0.736 → 0.500`; only one
  trivially-mechanical node ("Pushing onto the stack") stays at 0.50 and even it adds a "why it
  matters" clause. Real reading confirms the metric — new gists lead with the problem/motivation
  (Clone, Allocating on the heap, Assignment semantics, Artifact, Move, Search policy) rather than
  paraphrasing the definition. R3 minimum holds 63/63 and `lesson_absent` stayed at the same 1
  ungroundable node — no regression; `intuition` coverage moved `10 → 3` as the sharper gist absorbs
  more distinct-framing space (expected). **Defect found by the gate (pre-existing, out of scope):**
  `generate-study-items` regeneration first failed on `response_log_study_item_id_fkey` because a
  learner-answered item cannot be deleted (no `ON DELETE CASCADE`); lessons persist in a prior stage
  and had already committed the new gists. Cleared the single dev response row (rule 9) and re-ran to
  a clean exit. **Result: PASS.** Trail: `tmp/2026-07-02-gist-distinctiveness/`.

- **Quest Subgraph study mechanic, 2026-07-01.** `pnpm run check` passed: full workspace typecheck,
  recursive test suite, ESLint (0 errors / 2 pre-existing warnings outside the diff), and Admin Lab
  production build. **Real-use gate (rule 14):** three existing real DB enrichments were inspected
  through the application read model: mechanistic interpretability [machine learning] (`02afc709`),
  quantum error correction [physics] (`21b8c077`), and photosynthesis [biology] (`eb6e5ac1`).
  Recommended targets read as plausible milestones; ladders preserved prerequisite waves and
  target-last ordering; focused map scope matched ladder scope. **Defect found and fixed by the
  gate:** graph-only enrichments now render the quest ladder/map with an inline no-items warning.
  **Result: PASS.** Caveat: inspected enrichments had zero study items, so graded card-completion UX
  was not re-exercised. Trail: `tmp/2026-07-01-quest-subgraph-eval/`.

- **Synthetic Topic Generation, 2026-07-01.** Three topics ran end to end on real production calls on
  a live DB: Photosynthesis [biology] (`eb6e5ac1`), Quantum error correction [physics] (`21b8c077`),
  and Mechanistic interpretability of neural networks [machine learning] (`02afc709`). The real-use
  gate verified anchor-less layers with null `graph_version_id`, whole-set prerequisite ordering,
  intrinsic difficulty, no asserted graph writes, and no source-block citations or evidence quotes on
  `llm_grounded` nodes. **Defect found and fixed by the gate:** the generated-grounding schema cap was
  too low for first-class synthetic concepts. **Result: PASS** for the core arm. Caveat: the
  `boundary` -> `uncertain` route did not fire on any real run (0 / 38 concepts); probe calibration
  remains in TODO. Trail: `tmp/2026-07-01-synthetic-topic-rule14/`.

- Tests remain deterministic-envelope evidence only under
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md); quality claims come from
  inspected real model output. Older validation trails live in git history and generated artifacts
  under `tmp/`.

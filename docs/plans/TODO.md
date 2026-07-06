# TODO

## TODO

1. **Calibrate the knowledge-boundary probe so the `boundary`/`uncertain` route actually fires.** The
   synthetic arm's real-use gate scored **0 `boundary` verdicts across 38 concepts** spanning
   textbook (Photosynthesis, Quantum error correction) to frontier (Mechanistic interpretability): the
   shipped default K / temperature / agreement threshold never routed a real concept to `boundary`, so
   the boundary disposition is exercised by unit tests only. Measure-first: probe deliberately fringe or
   contested concepts, inspect the K-draw semantic dispersion, and tune temperature/threshold (or
   confirm the concepts are genuinely core knowledge) before any `web_grounded` retrieval plan or
   source-less lesson gating depends on this seam. Decision:
   [ADR-0030](../adr/0030-confidence-gated-synthesis-with-web-grounding.md).

2. **Use corrected bottleneck reports for the next latency/cost improvement.** The corrected
   metering pass made Study Item Bank stage cost trustworthy and showed bounded per-node concurrency
   can reduce wall-clock without changing cost ownership. The next optimization pass should start
   from the latest ranked report, target the measured largest contributor, and record wall-clock,
   calls, tokens, cost, and inspected real-use output before changing prompts, models, batching, or
   cache-token reporting. Current evidence points at enrichment/prerequisite-ordering as the next
   wall-clock candidate after Study Item Bank concurrency.
   Decision: [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md). Validation trail:
   `tmp/2026-06-30-generation-metering/`.

## COMPLETED

- **Generation queue reliability, probe routing, and queued-state UX.** Expedition generation now
  runs bounded-parallel (cap 2) behind the DB-claim seam with a visible Queued card, a single
  staleness predicate shared by claim and fail, operation-id fencing with a 30s heartbeat, a unified
  transient-vs-terminal error classification (network/5xx/429/timeout release the claim to the
  attempt budget; schema/no-concept failures fail immediately), a `failed`-only `resetGeneration`
  guard, and a shared transport retry helper/dispatcher. Header/body timeouts are terminal at the
  transport. The knowledge-boundary probe alias deny-lists Google (Vertex 400s on forced
  tool_choice) and gains a LiteLLM ordered fallback to a small cross-family model
  (`qwen/qwen3-30b-a3b-instruct-2507`) so a sustained Groq rate-limit no longer stalls generation.
  Decisions: [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md) and
  [ADR-0030](../adr/0030-confidence-gated-synthesis-with-web-grounding.md).

- **Expedition planning durability and entry UX.** Topic-expedition generation now starts as a
  durable learner expedition row and is completed by the Admin Lab supervisor through claimed
  `generating` work, stale-operation relaunch, bounded failure, and manual retry. `/learn` uses a
  one-step Plan expedition dialog with example chips, one themed Scouting progress surface, immediate
  return after submit, and Begin/Resume labels that account for lesson reads as well as answered
  items. LiteLLM transport now uses an undici dispatcher with the production 300s header timeout, and
  synthetic generation infers Declared Domain during generation instead of requiring it at entry.
  Decisions: [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md),
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md), and
  [ADR-0033](../adr/0033-plain-identifiers-single-themed-vocabulary-mapping.md).

- **Growing crystals and Crystal Vista.** Per-concept procedural growing crystals now replace the
  gem icon across the learner trail, with deterministic crystal geometry, facet-by-facet growth for
  mastered activity segments, skipped-known ghost crystals, section-divider and overview strips, and
  mastery reveal animation. The Crystal Vista gives a view-only bedrock-up formation for the
  expedition and opens from the header tally or section-completion celebration. Accepted framing:
  [2026-07-06 brainstorm](../brainstorms/2026-07-06-growing-crystals-and-vista-requirements.md).
  Decision: [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Learner App UX polish pass.** The learner entry and expedition flow now use static `/learn` and
  `/learn/expedition/{enrichmentId}` URLs with an httpOnly learner-ref cookie set by
  `/learn/session`, plus a Switch explorer control. The expedition entry uses Begin/Resume labels,
  domain-eyebrow candidate cards, and a shadcn Dialog for one-step "Plan expedition" topic creation
  with server-side Declared Domain inference. Generation cards show fixed-denominator `k / N`
  Surveying progress. Known-skipped concepts can be unmarked, render as "Known ground" ghost
  crystals, stay complete for gating, and are excluded from collected-crystal tallies and Crystal
  Vista growth. Matching activities now keep 3/4 matched pairs locked and incomplete until the final
  pair, with completed pair styling distinct from ordinary primary buttons. Decision:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Dedicated Rescued-Node Canonical Labeling step.** The rescued-node concept re-label is now a
  dedicated measured step instead of an under-attended optional field on the rescue durability
  judge. A new `RescuedNodeLabelingPort` runs one whole-set forced-tool call per Declared Domain
  (on `kg-independent-judge`, `rescued-node-labeling` stage tag) over the domain's *durable*
  rescued nodes, unconditionally returning a concept-shaped label for each (which may equal the
  current one), number-cited and position-mapped fail-open. The durability judge's
  `canonicalLabelProposal` field is deleted end-to-end (type, validator, prompt, application
  surfacing, tests). Minting keeps the single adoption authority — the collision guard against the
  domain's taken labels, alias demotion, reservation, and `relabeledFrom` recording are unchanged.
  No migration and no `litellm` config change. Decision:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Adaptive sectioned expedition trail and game-honesty pass.** The Study Session projection is now
  layer-wide and sectioned: milestone-anchored sections over the whole floored Derived Graph Layer,
  ordered easiest-first, with the summit derived at read time (the last section's milestone). The
  persisted expedition target column and its ready CHECK are deleted; expeditions generate/ensure and
  offer one Begin candidate per enrichment, and every learner-facing count derives from the shared
  trail scope. A node masters only when its lesson is read and every activity segment is
  latest-correct (one rule for gating, gem, and per-stop visuals). The learner trail renders sections
  with a non-blocking on-demand overview (prerequisite-gated jumping), matching is two-column
  tap-pairs, key terms are deleted end-to-end (generation, schema, types, render), and rescued
  `source_mentioned` nodes adopt a concept-shaped canonical label from the durability judge (original
  demoted to an alias, fail-open on collision). Terminology folded into
  [CONTEXT.md](../../CONTEXT.md) (Study Session, Expedition Section). Decisions:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md) and
  [ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md) (target exemption removed).

- **Learner theory quality, sparse item blueprint, and game-flow polish.** Concept Lessons carry
  list-structured examples/applications (key-term highlighting was later deleted end-to-end); a
  cross-family redundancy judge retries then
  drops redundant non-substantive sections; the lesson minimum is one substantive section; Study
  Item Blueprint generation has a structural sparse pre-gate; itemless lesson nodes master through
  lesson reads; and the Learner App remembers the learner name, uses a mobile-first matching layout,
  and routes through the capstone reward before advancing. Decisions:
  [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md), and
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Comparative banded intrinsic difficulty and trail floor.** Intrinsic difficulty is now a
  K-sampled comparative in-set banded prior: one forced-tool call per Declared Domain bands every
  concept 1–5 relative to that domain's set, dispersion marks contested bands, and a bounded
  pairwise bracket against uncontested anchors calibrates them. The pointwise absolute judge, the
  neural+structural fusion, and `dagDepthDifficulty` were deleted; the persisted score is
  `(band − 1)/4`, the exact inverse of the diamond mapping, so the learner UI is unchanged. The
  Study Session projection now floors confident band-1 non-target nodes out of the trail via edge
  contraction (gating preserved), exposing `flooredNodeIds` for inspection. Decision:
  [ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md) (amended).

- **Learner trail polish.** The learner trail now uses opaque portal surfaces, one-tap option-select
  grading with generated explanations, persisted lesson-read completion, a linear next-pointer,
  type-stable stop icons, gem-only capstone state, expedition domain/progress rows, and no Journal
  route. Study-item generation and validation require option-select explanations, Study Session
  projections expose lesson-read and explanation state, and learner expedition rows compute live
  item progress from the study bank and latest responses. Requirements:
  [brainstorm](../brainstorms/2026-07-04-learner-trail-polish-requirements.md). Decision:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Learner App checkpoint trail, activity sheet, and generation onboarding.** `/learn` now centers
  the learner expedition on a Duolingo-style per-item checkpoint path, with fog display and per-item
  completion derived from Study Session state, one stop opening one full-screen activity sheet with a
  single primary footer action, opaque learner surfaces, headed lesson sections, icon-only grounded
  provenance, concept-level skip popovers, topic-first generation with editable inferred Declared
  Domain, fiction-voiced generation stage copy, and an Admin Lab door that ensures a playable `admin`
  expedition before redirecting. Requirements:
  [brainstorm](../brainstorms/2026-07-04-learner-app-map-center-ux-requirements.md). Decision:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Learner App expedition entry surface.** `/learn` is now the learner-facing expedition entry:
  readiness-ranked expedition entry, learner-owned expedition persistence, active selection, playable
  trail/activity screen over `getStudySession`, a learner-entered course-data generation door, and
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

- **Study assets and learner state.** The learner loop keys study assets and responses to
  `derived_node_id`; Concept Lessons ground downstream study assets; the Study Item Bank supports
  option-select, matching, and impostor through per-node blueprints; keyless learner views submit
  ids while server-side grading appends to the Response Log, and calibration remains separate.
  Decisions: [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md), and
  [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md).

## VALIDATION

- **Generation queue reliability, probe routing, and queued-state UX, 2026-07-06.** Deterministic
  envelope: full workspace `typecheck` exit 0; recursive `test` exit 0 with `.env` loaded (0
  failures — admin-lab 118 incl. new queued-card/progress-denominator/fence tests, application,
  infrastructure-litellm incl. shared retry/terminal-timeout, infrastructure-postgres DB-backed
  predicate/fence/guard tests); `lint` 0 errors (6 pre-existing warnings); `@lrnki/admin-lab`
  production build exit 0. **Real-use gate (rule 14): PASS.** Three fresh topics (Nash Equilibrium
  Basics, Fourier Series, Enzyme Kinetics) submitted at once under one learner: the concurrency cap
  held at 2 (two Scouting cards + one distinct **Queued** card confirmed in a 390px browser pass —
  "Your expedition is in line… Waiting for a scout"), a transient Groq 429 released a claim to the
  attempt budget without failing, the `resetGeneration` failed-only guard re-queued cleanly, and
  **all three reached `ready`** with real content (Game Theory 12 lessons/30 items, Biochemistry
  19/43, Mathematics 8/18). The probe alias logged **0 Vertex 400s**; the added qwen3-30b fallback
  gave 10/10 probe availability through a flaky Groq window. Defect found and fixed during the gate:
  `require_parameters: true` over-restricted probe routing to Groq alone (frequently 429) and still
  allowed a Vertex 400 fallback — replaced with an explicit Google provider deny-list plus the
  ordered probe fallback. Evidence: `tmp/2026-07-06-generation-queue-gate/rule14-evidence.md` and
  `queued-vs-scouting-390.png`.

- **Expedition planning durability and entry UX, 2026-07-06.** Deterministic envelope:
  `@lrnki/infrastructure-postgres` typecheck and DB-backed test suite green (63 tests, `.env`
  loaded), full workspace `typecheck` exit 0, full recursive `test` exit 0 with `.env` loaded, full
  workspace `lint` exit 0 with 6 pre-existing warnings, and `@lrnki/admin-lab` production build exit
  0. **Real-use gate (rule 14): PASS with caveats.** Browser and DB inspection over real generated
  topics proved instant submit, Scouting progress, failed-card Retry, stale-operation relaunch after
  dev-server kill/restart, manual retry to ready, ready desktop/mobile `/learn` rendering, and
  lesson-read-only Resume. Final real rows: Game Theory ready with 16 lessons and 35 study items;
  Bayesian Statistics ready after relaunch/retry with 29 study items. Defects found and fixed during
  the gate: undici dispatcher mismatch with global fetch, claim SQL ambiguity and nullable-join
  locking, insufficient intrinsic-difficulty corrective retry budget, and retry active-row
  unique-index handling. Caveats: one intermittent LiteLLM 400 failed the first Game Theory attempt
  before Retry succeeded; a stale Next dev server-action id appeared only after live code edits and
  cleared with dev-server restart. Evidence: `tmp/2026-07-06-expedition-durability-gate/`.

- **Learner App UX polish pass, 2026-07-06.** Deterministic envelope: `@lrnki/admin-lab` test suite
  green (113 tests including generationProgress, matchingProgress, resumeLabel, skipped-known trail and
  vista coverage), `@lrnki/admin-lab` typecheck exit 0, `@lrnki/application` typecheck exit 0,
  `@lrnki/application` test suite green (466 tests), root ESLint exit 0 with 6 pre-existing warnings,
  and `@lrnki/admin-lab` production build exit 0 with `/learn`, `/learn/expedition/[enrichmentId]`,
  and `/learn/session` dynamic routes. **Real-use gate (rule 14): PASS.** A hard reset seeded the
  Rust ownership fixture through real production LLM calls, publishing graph version
  `84832116-a228-447e-be7f-3e8162b28c4b` and enrichment
  `99c2d017-90db-42c1-b532-970f84732c0d` with 19 lessons and 35 accepted study items. Playwright
  verification on `http://127.0.0.1:3010` proved the cookie session, static learner URLs, Switch
  explorer, domain-eyebrow candidate cards, and static expedition URL; real generated Copy trait
  matching stayed at `3 of 4 matched` with no graded result; real known-skip UI changed from Ready to
  "Known ground" and exposed "Un-mark known." Defects found and fixed during the gate: server-action
  form data/cookie path replaced with `/learn/session`, absolute redirect host mismatch, DialogTrigger
  hydration mismatch, stale "Generation produced no concepts" persisted failure copy, and skipped-known
  popover copy saying Collected. Evidence: `tmp/2026-07-06-learner-ux/`.

- **Growing crystals and Crystal Vista, 2026-07-06.** Deterministic envelope: full workspace
  `typecheck` exit 0, recursive test suite green (admin-lab 101 incl. new crystalGeometry 7 /
  crystalVistaView 3 / trailView growth 3 / capstone activity 2), ESLint 0 errors. **Real-use gate
  (rule 14): PASS.** 390px Playwright pass over real enrichment
  `e8ba6143-be10-40bc-b941-b88acbf22c13` (heap-allocation domain, 11 trail concepts, 20 edges)
  through the real Begin charter flow: per-concept crystals render visually distinct and
  byte-identical across reloads (determinism probe STABLE); the Heap node was mastered through real
  graded play (option-select first-try, matching brute-then-replay to clean sweep, impostor
  first-try) with the capstone crystal growing facet-by-facet; the mastery reveal played the
  facet-assembly + glint; marking one remaining Leg-1 concept known auto-opened the vista with the
  "Leg 1 crystallized ✦" celebration; the header tally, section-divider strips, and overview strips
  all tracked the same counts. One defect found and fixed during the gate: the vista formation
  scaled down to thumbnail size on a wide layout — now floored at ~58% layout scale with horizontal
  pan. Caveat: partial multi-segment growth mid-crystal was verified on the live trail visuals and
  unit tests, not screenshot-archived per stop. Evidence: `tmp/2026-07-06-crystals-gate/*.png` +
  drive scripts.

- **Dedicated Rescued-Node Canonical Labeling step, 2026-07-06.** Deterministic envelope: full
  workspace `typecheck` exit 0; recursive `test` exit 0 with `.env` loaded (0 failures — domain-core
  36, application 465, infrastructure-litellm 115, infrastructure-postgres 59, kg-worker 8, admin-lab
  87); `lint` 0 errors (3 pre-existing warnings); `build` exit 0. **Real-use gate (rule 14):** a hard
  reset re-seeded the Rust ownership fixture through real production LLM, publishing graph version
  `af23eb46-a2a5-468c-b8d8-51e309f944af` and enrichment `e8ba6143-be10-40bc-b941-b88acbf22c13`.
  Inspection over the real enrichment: **all 15 derived node labels are concept-shaped noun phrases —
  0 propositional/sentence labels survive** (the 2026-07-05 baseline left 1). Two rescued nodes were
  re-labeled with the original demoted to an alias ("Heap allocation" ← "Allocating on the heap";
  "Stack and heap" ← "The Stack and the Heap"); accepted rescue dispositions carry the post-relabel
  `canonical_label`. The new `rescued-node-labeling` stage fired once (`ok`, 4.3s) — one whole-set
  call for the single Declared Domain. Rename-only invariant held: rescue accepted 6, the layer holds
  5 `source_mentioned` nodes, the single reduction being the pre-existing dedup merge of "Ownership
  Rules" into the anchor "Ownership". Caveat: extraction is non-deterministic so the exact 2026-07-05
  offender ("Each value in Rust has an owner") did not recur; the defect *class* is verified. The
  learner trail renders `canonical_label AS label` (unchanged, test-covered path); no `/learn`
  app-expedition browser pass because the seed's learner-loop path creates no `/learn` expedition row.
  **Result: PASS.** Trail: `tmp/todo1-rescued-labeling-evidence.md`, `tmp/todo1-seed.log`.

- **Adaptive sectioned expedition trail and game-honesty pass, 2026-07-05.** Deterministic envelope:
  full workspace `typecheck` exit 0 and the recursive test suite green (domain-core 36, ports,
  application 462, infrastructure-litellm 111, infrastructure-postgres 59 with `.env` loaded,
  kg-worker 8, admin-lab 87). **Real-use gate (rule 14):** a hard reset re-seeded the Rust ownership
  fixture through real production LLM (extraction → build → banded enrichment → Study Item Bank +
  Concept Lessons; ~1467s), publishing graph version `c38f1ebd-1bd0-45d9-b7b8-dbc03ec92a5e` and
  enrichment `f8105160-cebf-4f80-bd3f-70e57b0e337a` (27 nodes, 21 trusted edges, 27 lessons, 64 study
  items). The reset applied the single migration cleanly with `learner_expeditions.target_derived_node_id`
  and `concept_lesson_sections.key_terms` both absent (`rg -i keyterm` empty). Projection over the real
  enrichment: 23 trail steps == 23 non-floored nodes (every node in exactly one section), **0
  validity-invariant violations**, summit "Memory and Allocation" derived, 4 confident band-1 nodes
  floored, every within-section difficulty decrease prerequisite-forced (R14). 390px browser pass on
  the running trail: section dividers, header "Leg 1/15" + gem count, and the on-demand Trail-map
  overlay listing all 15 legs with per-leg state/progress — locked legs naming their gate ("Clears
  after: Ownership"). Rescue re-label fired (18 accepted; most labels concept-shaped). **Result: PASS
  with one follow-up** — one propositional label ("Each value in Rust has an owner") survived because
  the durability judge returned an empty re-label proposal (TODO #1). Trail: `tmp/u9-rule14-evidence.md`,
  `tmp/u9-trail-390.png`, `tmp/u9-overview-390.png`, `tmp/u9-trail-desktop.png`, `tmp/u9-seed.log`.

- **Learner theory quality, sparse item blueprint, and game-flow polish, 2026-07-05.** Deterministic
  envelope: `pnpm run typecheck`, `pnpm run test`, `pnpm run lint` (exit 0 with 3 pre-existing
  warnings), `pnpm run build`, `@lrnki/application` tests, and `@lrnki/admin-lab` tests all passed;
  `git diff --check` was clean. DB reset and the single initial migration succeeded. **Real-use
  quality evaluation:** `SEED_MANIFEST=tmp/real-use-rust-manifest.json scripts/seed-demo.sh` ran the
  Rust ownership fixture through real production LLM extraction, graph build, enrichment, Study
  Item Bank generation, and demo learner seeding: graph version
  `7fea20b6-a5e4-4ba5-94d2-e60ea5e2b479`, enrichment
  `8a016179-6888-43da-babd-0c61f83a3ae8`, 20 lessons, 76 lesson sections, 58 sections with key
  terms, 36 sections with list items, 44 current study items, and sparse blueprint/guard rejections
  recorded for unsuitable item types. Artifact inspection showed list items/key terms on real
  lessons such as "Allocating on the heap" and blueprint absences for lesson-absent nodes. Browser
  verification on the built app at `http://localhost:3001` passed at 390px: `/learn` remembered
  `demo-seeded-1`, created the first expedition through Begin, rendered the expedition trail, and
  logged no console errors. **Result: PASS.** Screenshot: `tmp/learner-mobile-390.png`; seed log:
  `tmp/real-use-seed.log`.

- **Comparative banded intrinsic difficulty and trail floor, 2026-07-05.** Deterministic envelope:
  `pnpm run check` exit 0 (full workspace typecheck, recursive tests including DB-backed
  integration tests with `.env` loaded, ESLint with 3 pre-existing warnings, Admin Lab production
  build). **Real-use gate (rule 14):** baseline captured with the pristine fused judge (enrichment
  `5384f4f1-5b4c-4842-81e8-e5dff11ce042`), then a hard reset re-seeded `rust-book-ch04-01` and
  `aira-dojo-2507-02554v1-md` through real production LLM calls into banded enrichment
  `dce4c6d4-4155-480f-8cc1-b99887b12eac` (36 scored nodes, 3 contested, 1 anchor-less unresolved).
  Human inspection: evidence-thin rescued labels ("Ownership Rules", "Ownership") now band 1 with
  rationales naming their evidence-thinness; the baseline's clearest scale-use-bias case
  ("operator policy", neural 0.70 on one quote) was flagged contested and bracket-calibrated with
  an evidence-grounded rationale; contested rows record their comparisons and uncontested rows
  record zero; `round(score × 4) + 1 = band` on all 36 rows with the ConceptMarker diamonds
  matching in the browser; on the seeded expedition 11 confident band-1 nodes vanished from the
  trail with gating intact through contracted edges, and a band-1 node chosen as the target stayed
  playable. A silent NaN-sample-count → zero-draws → garbage-persist path found during baselining
  now fails loudly. **Result: PASS.** Trail: `tmp/2026-07-05-difficulty-baseline/`
  (`rule14-report.md`, dumps, annotation, screenshots).

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
  control styling in the generation form, outside this trail flow. **Result: PASS.** Screenshots and
  report: `tmp/learner-trail-polish/`.

- **Learner App checkpoint trail, activity sheet, and generation onboarding, 2026-07-04.**
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
  source-generation path. Review hardening fixed active-expedition idempotency, per-learner enrichment
  uniqueness, operation-type-scoped progress reads, generation auto-refresh, caught background generation
  failures, learner-facing failure-message sanitization, ready-expedition validation on study
  actions, and activity progression that keeps a stop active until this learner answers all its
  activities. **Real-use quality evaluation:** with DeepSeek balance restored, the learner
  course-data generation path ran through production aliases under the $0.50/M output cap and produced
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

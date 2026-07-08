# TODO

## TODO

- Run U8 real-use quality evaluation for the neural stage descriptor refactor:
  [plan 2026-07-08-001](./2026-07-08-001-refactor-neural-stage-descriptors-dotprompt-plan.md).

## COMPLETED

- **Neural stage descriptors with dotprompt files and mechanical config hashes.** Forced-tool LLM
  stage knowledge now lives in Neural Stage Descriptors: `.prompt` files own model aliases, tool
  names, tool descriptions, and prompt templates; typed rims own schemas, validators, stage tags,
  sentinels, retry budgets, and result mapping. Adapter classes and forced-tool `*_MODEL` constants
  were replaced by port factories, while application use-case seams stayed unchanged. Extraction,
  graph enrichment, synthetic generation, and Study Item Bank config hashes are derived
  mechanically from descriptor content and app-level knobs in both composition roots; fixed
  hand-bumped strings were removed from root wiring. Descriptor stage tags are now tested against
  `OPERATION_TIMELINE_CATALOG`. Decision: [ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md).
  U8 real-use evaluation is intentionally left to the next session per user request.

- **Shared neural client-construction policy.** The LiteLLM client-construction policy — env base
  config plus the measured discovery/deterministic/probe/embedding sampling decisions and their
  rationale comments — now lives once in `createNeuralClients()`
  (`packages/infrastructure-litellm/src/neuralClients.ts`, with `resolveNeuralClientBaseOptions()`
  for the boundary-probe calibration sweep that varies temperature deliberately). Both composition
  roots (`kg-worker` `buildContext`, Admin Lab `learnerGeneration`) consume it; the near-verbatim
  duplicated blocks and the comment-less Admin Lab copy are deleted (rule 18). The policy is pinned
  by request-body tests. Per-root adapter/store wiring stays explicit at each root. No CONTEXT.md
  term (user decision — infrastructure policy, not domain language). Accepted framing: Candidate 4
  (client-policy half) of the
  [2026-07-07 architecture deepening review](../brainstorms/2026-07-07-architecture-deepening-review.md);
  the review records the rejection of the candidate's `runGraphEnrichment` input-grouping half
  (premise refuted — one caller).

- **Learner-state cleanup, `/learn` read-path dedup, and operations cost/timing visibility.** A
  one-time transactional wipe cleared the accumulated test/junk learners (the five learner-state
  tables and `learners`), and the source is closed: DB-touching integration tests and gate scripts
  now delete exactly the learners they create (a per-suite cleanup hook keyed by tracked refs; the
  real-use skill gained the gate-cleanup rule). The weekly board hides zero-point non-viewers
  before windowing, so dormant learners never surround the viewer. The logged-in `/learn` read path
  keeps its eager render but reads each distinct enrichment's projection inputs once (not per
  learner-expedition), skips learners with no study evidence via one existence read
  (`LearnerStorePort.listRefsWithStudyEvidence`), derives the viewer's lifetime crystal count from
  that same pass, and guards the previous-week podium recompute — no parallel mastery SQL (KTD2 of
  005 preserved). The operations page preloads one live LiteLLM spend read to show
  cost/tokens/calls chips on every card (degrading to wall-clock when cost is unavailable) and
  collapses finished cards to header + chips, server-rendering the full stage table only on
  demand. The operator "bottleneck" surface is renamed to **Cost & timings** end-to-end
  (`bottleneckReport` → `costTimingReport`, its types and view component, the CLI subcommand, and
  the UI copy; `rankBottleneckTargets` keeps its name). No schema change; cost stays
  read-live-never-stored. Decision:
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md).

- **Leaderboard dialog, cohort-of-10, single login/register gate, and enriched-DAG links.** The
  leaderboard renders through one base-ui Dialog for both the seam-triggered splash and an
  on-demand header trigger (the standalone `/learn/leaderboard` route deleted, rule 18). The board
  is always exactly 10 rows — real rows windowed to the viewer's nearest neighbors, then filled
  with seeded rivals — with cohort-local ranks. A themed **division** ladder (Basecamp → Foothills
  → Ridge → Summit, provisional thresholds 0/10/30/75) derives at read time from the viewer's
  lifetime mastered-crystal count reusing the graded-outcome derivation the weekly score uses — no
  persisted tiers, no parallel mastery SQL, accepted through the ADR-0032 flow gate as progress
  clarity rather than a parallel objective. Rival nicknames use Faker's person-first correlated
  derivation for realistic usernames. The login gate collapses to one form (name + PIN) with Login
  and Register buttons plus a logout intent on `/learn/session` (the sole PIN-aware route, KTD8 of
  005); the browser-known-refs cookie machinery, the picker, and dead vocabulary keys are deleted.
  Admin learner-loop and enrichment-scoped operations cards link to the existing
  `DerivedGraphExplorer` DAG. No new persistence. Decision:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

- **Learner registry, weekly leaderboard, and Crystal Duel shipped.** Free-text learner identity is
  replaced by a `learners` registry with uniqueness-at-creation and a PIN-gated pick-or-create gate;
  the four learner-state tables gained real FKs to it (`/learn/session` is the sole PIN-aware route,
  the swap point for real auth, KTD8). A global weekly leaderboard (ISO week, cohort of 10) reads the
  difficulty-banded weekly score off the SAME Study Session projection every surface reads — no
  parallel mastery SQL (KTD2) — and fills the board with deterministic seeded `@faker-js/faker`
  rivals rubber-banded around the viewer (KTD1), with a chase banner, seam-triggered splash
  (localStorage nav memory, KTD5), and a scheduler-free idempotent `weekly_podium` recomputed from
  timestamps (KTD6). The Crystal Duel is a five-question retrieval sprint over already-mastered
  crystals orchestrated by a pure exhaustive `duelMachine` transition function (XState rejected,
  KTD4); grading reuses the keyed-selection logic behind a grade-only path that persists nothing, so
  a duel can never touch mastery state (KTD3, proven: `response_log` byte-identical across a duel).
  Losing costs nothing; winning earns a durable `duel_win` crest (`learner_awards`). Rule-14 real-use
  gate PASS against a really-seeded Rust-ownership graph (21 nodes, 50 study items): AE1–AE5 all
  asserted via the real use-cases, plus UI screenshots. Evidence:
  `tmp/2026-07-07-leaderboard-duel/`.

- **Expedition generation latency and operation-run liveness fixed.** Study-item generation now
  defaults to bounded per-node concurrency 4, cutting the measured Bayesian-inference
  `study_items` operation from 261.5s to 94.5s on the changed tree. Operation-run liveness uses one
  application-owned two-minute stale predicate across the supervisor and UI, and the supervisor now
  reaps orphaned `running` operation timeline rows before claiming more expedition work. The
  approved dev cleanup removed failed/phantom operation history while preserving succeeded reports.
  The Qwen3-235B ordering candidate was forced-tool OK and faster but failed quality parity, so
  `kg-prerequisite-ordering` stays on `gpt-oss-120b` and the stale DeepSeek Pro candidate note is
  deleted. Decisions: [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md) and
  [ADR-0030](../adr/0030-confidence-gated-synthesis-with-web-grounding.md). Evidence:
  `tmp/2026-07-07-expedition-latency/`.

- **Learner grading moved behind an application use-case.** The seven raw-SQL learner-grading server
  actions in `apps/admin-lab/src/app/learn/actions.ts` are collapsed to thin mappers over one tested
  `gradeStudyResponse` application use-case
  (`gradeStudyResponse`/`checkMatchingAttempt`/`recordLearnerVerdict`/`recordLessonRead` + one
  internal active-expedition/node-membership guard helper and refusal reason codes; copy stays UI-side
  per [ADR-0033](../adr/0033-plain-identifiers-single-themed-vocabulary-mapping.md)). Two existing
  ports gained one read each — `StudyItemBankStorePort.getStudyItemById` and
  `EnrichmentInspectionReadPort.derivedNodeBelongsToEnrichment` — with Postgres adapters and
  integration tests; the former single-join guard becomes two composed reads (benign read-then-append
  race, user-accepted). Every `sql\`` block and the duplicate `MatchingItem` rebuild under
  `apps/admin-lab/src/app/learn/` are deleted (rule 18; AE1 verified); exported result types and
  learner copy strings are byte-identical so `ActivitySheet`/`ConceptMarker` are untouched. Consumes
  the read model per [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md); no CONTEXT.md term
  added (KTD5). Accepted framing: Candidate 2 of the
  [2026-07-07 architecture deepening review](../brainstorms/2026-07-07-architecture-deepening-review.md).

- **Operation-timeline catalog made provably complete.** The four live-but-uncatalogued LLM stage
  tags now belong to their owning operation — `concept-set-synthesis`, `knowledge-boundary-probe`,
  and `rescued-node-labeling` under `enrichment`, `impostor-lie-validity-judgment` under
  `study_items` — so `spendStageBelongsToOperation` returns `true` and `bottleneckReport` stops
  nulling their cost. The two dead measurement-mode tags (`answer-grading`, `learner-simulation`)
  are deleted end-to-end (`STAGE_TAGS` + learner `stageCopy`; rule 18). The catalog test no longer
  restates the stage lists by hand: a set-equality + pairwise-disjointness assertion now fails the
  build whenever the union of catalog LLM stages differs from `Object.values(STAGE_TAGS)` in either
  direction or two operations claim one stage — installing the machine enforcement that ADR-0029's
  same-change registration rule previously lacked. The two test-only catalog exports
  (`operationTimelineStagesForOperation`, `isKnownOperationTimelineStage`) are removed. No interface,
  schema, or `OperationType` change; synthetic generation keeps reporting as `enrichment` (user
  decision, 2026-07-07). Accepted framing: Candidate 1 of the
  [2026-07-07 architecture deepening review](../brainstorms/2026-07-07-architecture-deepening-review.md).
  Decision: [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md).

- **Knowledge-boundary probe calibration.** The probe now has a repeatable `kg-worker`
  `calibrate-boundary-probe` command and measured defaults for synthetic generation: K=10, worker
  temperature 0.7, and mean-pairwise embedding threshold 0.89. The measurement ladder covered
  established-core, fringe-contested, and fabricated tiers across mixed domains on both probe
  deployments. The production-path gate now routes a fabricated Mathematics concept to `boundary`
  / trace-only uncertain while a textbook Photosynthesis control keeps every synthesized concept
  `core_knowledge`. Decision:
  [ADR-0030](../adr/0030-confidence-gated-synthesis-with-web-grounding.md).

- **Admin run visibility and Learner App UX polish.** Operations page groups running/stalled
  operations in an always-first Active section with `N running · M stalled · K failed` header chips
  and auto-refreshes while any run is active (shared `AutoRefresh` replaces the learner-only
  component). The journey and bottleneck report routes are folded into the Operations page as inline
  per-card panels driven by `?report`/`?type`/`?journey` search params (both standalone routes
  deleted); the Run Inspector list is merged into Source Explorer as a per-source "Extraction runs"
  table (run *detail* retained under the Sources sidebar section, list route + sidebar entry
  deleted, `SourceInspection` gained a `runs` field, `listRunSummaries` port method removed).
  Learner fixes: `ActivitySheet` clears its in-sheet advance memory on close (extracted to a tested
  `advanceMemory` helper) so re-opening an earlier stop opens that stop; generating card reads
  "Planning progress" (dead `progress` vocabulary key deleted); the expedition H1 is the learner's
  topic with the derived summit demoted to a secondary line; crystal contrast raised via same-hue
  hairlines, higher silhouette opacity, and a dark vista rock-face panel (geometry untouched); the
  journal palette maps onto the shadcn semantic tokens inside the learner scope (portaled
  sheets/dialogs/popovers carry `learn-theme`), admin lab stays stock; and Crystal Vista crystals
  are tappable to reveal a floating concept-name chip (mastered/known-ghost only, view-only per
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md)).

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

## VALIDATION

- **Shared neural client-construction policy, 2026-07-08.** Deterministic envelope: workspace
  `typecheck` exit 0 (all 10 projects); `lint` 0 errors (6 pre-existing warnings);
  `@lrnki/infrastructure-litellm` tests pass (128, incl. 4 new `neuralClients` policy tests
  asserting through the request body that the deterministic client sends `temperature 0, seed 7`,
  the probe client sends `0.7` with no seed, the discovery client sends neither, and overrides win
  over env). Behavior-identical wiring move — the constructed clients are argument-identical to
  the deleted per-root copies — so no separate rule-14 real-use run; the next real extraction and
  expedition runs exercise both roots through the factory.

- **Learner-state cleanup, `/learn` read path, and operations cost/timing visibility, 2026-07-08.**
  Deterministic envelope: workspace `typecheck` exit 0 (all 10 projects); `lint` 0 errors
  (pre-existing warnings only); tests green with `.env` loaded — `@lrnki/application` 514 (new
  `getWeeklyLeaderboard` read-dedup counting-double + zero-point board tests),
  `apps/admin-lab` 148 (new zero-point-hiding board test), `@lrnki/infrastructure-postgres`
  learner suites 40 with the `learners` row count unchanged before/after the run (AE2). The
  one-time wipe transaction moved the five learner-state tables and `learners` from
  {21,63,4,9,6,54} to all zero, leaving graphs/enrichments/study-banks/timelines untouched (AE1).
  **Real-use gate (rule 14): PASS.** Against the post-wipe dev DB with 10 learners registered
  through the real gate, `/learn` (logged-in, warm) loaded in **2.59 s** vs the pre-change 10.5 s
  baseline with no UUID-shaped player names (residual UUIDs are React key props, not display
  names) and dormant non-viewers hidden; `/admin/lab/operations` loaded in **2.17 s / 735 KB** vs
  ~4 s / 1.5 MB, rendering 43 finished cards all collapsed (0 stage tables in the HTML) with 43
  live cost/tokens/calls chip sets, `?expand=<id>` disclosing a card's stage table server-side and
  `?report=<id>` the "Cost & timings" per-stage breakdown; zero literal "bottleneck" remains on
  the surface. Timings are dev-mode warm curl (same method as the baselines); production loads are
  lower. Gate learners were deleted afterward. Evidence:
  `tmp/2026-07-07-learner-cleanup-ops-visibility/`.

- **Leaderboard dialog, cohort-of-10, single gate, and DAG links, 2026-07-08.** Implementation
  verified present in the committed tree (leaderboard Dialog with the standalone route removed,
  `assembleWeeklyBoard` cohort windowing, derived division ladder, single-form gate with logout,
  Faker person-first rivals, enrichment DAG links) and covered by the shared deterministic envelope
  above (typecheck 10/10, `apps/admin-lab` 148 incl. the board tests, lint clean). Its changed
  gate and board surfaces were exercised live during the cleanup gate: the single two-field
  gate registered 10 learners and logged one in, and the cohort board rendered as a dialog on
  `/learn` filled to 10 with no UUID-shaped names. A dedicated 006 screenshot gate (division-badge
  thresholds, dialog `Esc`/scroll, DAG canvas render) was not separately captured.

- **Learner registry, weekly leaderboard, and Crystal Duel, 2026-07-07.** Deterministic envelope:
  workspace `typecheck` exit 0; `lint` exit 0 (6 pre-existing warnings); all tests pass with `.env`
  loaded — `@lrnki/application` 510, `@lrnki/infrastructure-postgres` 71, `apps/admin-lab` 137, plus
  the rest of the workspace. New unit coverage: PIN/registry use-cases, ISO-week + banded-score
  arithmetic and week-boundary edges, exhaustive `duelMachine` state×event sweep (AE6), seeded-rival
  determinism, seam classifier, and grade-only duel grading; new integration coverage for the two
  Postgres registry stores and the R1 FK. **Real-use gate (rule 14): PASS.** Seeded a real graph from
  the Rust-ownership fixture through the production worker pipeline (extraction → build → enrich → 21
  derived nodes / 26 edges → 50 study items) and drove AE1–AE5 through the real application use-cases
  and Postgres stores: registration + name-taken + PIN switch + disjoint state (AE1); mastering a
  band-2 crystal moved the weekly score 0→2 exactly (AE2); duel locked at 1/6, unlocked after
  mastering 6 crystals with ≥10 pooled items (AE3); a full duel left `response_log` byte-identical
  (15→15) and recorded one idempotent `duel_win` (AE4); the week rollover recorded an idempotent
  `weekly_podium` and reset the new week to 0 (AE5). UI screenshots confirm the pick-or-create gate,
  the 10-row board with the viewer highlighted, award crests, the chase banner, the unlock splash, and
  the live duel arena. Evidence: `tmp/2026-07-07-leaderboard-duel/`.

- **Expedition latency and operation-run liveness, 2026-07-07.** Deterministic envelope:
  `@lrnki/application` tests pass (497), `@lrnki/infrastructure-postgres` tests pass with `.env`
  loaded (68), `apps/admin-lab` tests pass (122), workspace `typecheck` exit 0, and `lint` exit 0
  with 6 pre-existing warnings. **Real-use gate (rule 14): PASS.** Fresh Bayesian-inference
  expedition after the change (`enrichment 47f7e898-…`) completed with `study_items` at 94.5s vs
  the baseline same-topic run's 261.5s (`enrichment 6fe87e5d-…`); sampled output contained 9 lessons
  and 20 study items across option-select, matching, and impostor types, with no concurrency-induced
  ordering/content corruption observed. The operation-run reaper marked a synthetic stale row failed
  from the supervisor tick; invoking that tick also claimed old dev `generating` rows, and later
  polling showed externally driven rows with fresh heartbeats, so those were treated as healthy
  active work rather than phantom operation rows.
  Qwen3-235B ordering experiment evidence shows forced-tool OK but failed parity (kept-edge recovery
  33% and 0%), so the incumbent stayed. Evidence:
  `tmp/2026-07-07-expedition-latency/`.

- **Learner grading use-case, 2026-07-07.** Deterministic envelope: affected-package `typecheck`
  exit 0; `@lrnki/application`, `@lrnki/infrastructure-postgres`, and `apps/admin-lab` tests pass with
  `.env` loaded. **Real-use gate (rule 14): PASS.** Drove the real Admin Lab learner app (Next dev on
  `localhost:3000`) as learner `13caf547-…` over the Game Theory expedition
  (`enrichment 88721332-…`, all three graded item types). Walk covered theory/option_select/matching/
  impostor/capstone; the four `response_log` rows the use-case appended are shape-identical to the
  pre-refactor baseline (`attempt_seq` 1–4 store-allocated; selection rows `submitted_answer=null`,
  `grader_identity=auto`, `response_source=human`; matching row carries the `[{promptId,chosenMatchId}]`
  trace JSON) — AE4 satisfied. Verdict set then clear left one `calibration_verdicts` row at
  `verdict=learn` (clear is an upsert, not a delete). Switching the active expedition to "Already
  active" in a second tab flipped Game Theory to `active=f`; a graded submit then rendered
  "This expedition is no longer active…" with the option ungraded and **no** row appended (stayed at
  4 rows), and a post-switch lesson-read was silently blocked by the guard (`lesson_reads=2`, not 3) —
  AE2/AE3 demonstrated live. Evidence + screenshots: `tmp/2026-07-07-learner-grading-use-case/`.

- **Operation-timeline catalog completeness, 2026-07-07.** Deterministic envelope: workspace
  `typecheck` exit 0 (all 10 projects); `@lrnki/application` tests pass (481). The rewritten catalog
  test's drift assertion was mutation-checked by hand: orphaning a live tag fails the set-equality
  property, and double-claiming a stage fails naming the offender ("LLM stage admission is claimed
  by both extraction and enrichment"); mutations discarded after. **Real-use gate (rule 14): PASS.**
  Driving the same `bottleneckReport` use-case the Operations page renders
  (`getBottleneckReport` → `PostgresOperationTimelineRead` + `LiteLlmSpendLogsReadAdapter`, `.env`
  loaded) over synthetic-generation operation `ae19c226-3a30-470b-86e5-2a47dd5a51d9` recovered 141
  formerly-dropped calls / $0.01873 / 140,565 tokens — the report had been showing ~37% of that
  operation's true LLM cost, with the entire K-sampled `knowledge-boundary-probe` (140 calls,
  $0.0185) invisible. Study-items operation `be06d8e3-3cc1-48a6-b568-765680ee629c` recovered
  `impostor-lie-validity-judgment` (13 calls, $0.00296). Evidence:
  `tmp/2026-07-07-catalog-completeness-gate/evidence.md`.

- **Knowledge-boundary probe calibration, 2026-07-07.** Deterministic envelope: `@lrnki/application`
  tests pass (479 tests), `@lrnki/application` typecheck pass, `@lrnki/kg-worker` typecheck pass.
  **Real-use gate (rule 14): PASS.** Calibration reports under
  `tmp/2026-07-07-boundary-probe-calibration/` measured both probe deployments at temperatures 0.7
  and 1.0 over a 30-concept ladder. The final production-path synthetic runs used
  `Caldrin-Voss continuity theorem` / Mathematics
  (`24b6e5c1-5b3b-4ef2-8907-d0b427ab08aa`) and `Photosynthesis` / Biology
  (`ae19c226-3a30-470b-86e5-2a47dd5a51d9`): the fabricated theorem persisted as `boundary` with
  `derivedNodeId: null`, and the Biology control persisted 14/14 concepts as `core_knowledge`.
  Evidence: `tmp/2026-07-07-boundary-probe-calibration/evidence.md` and
  `tmp/2026-07-07-boundary-probe-calibration/gate/evidence.md`. Caveat: embedding agreement still
  misses consistent hallucinations; this calibration proves the boundary route fires without
  starving the textbook control, not complete fabricated-concept detection.

- **Admin run visibility and Learner App UX polish, 2026-07-06.** Deterministic envelope: workspace
  `typecheck` exit 0 (stale `.next/types` cleared for the deleted routes); recursive `test` exit 0
  with `.env` loaded (admin-lab 122, incl. new `advanceMemory` stale-stop regression + vista
  `labelChipFor`/`isNameableCrystal` tests); `lint` 0 errors (6 pre-existing warnings); production
  build exit 0 with `/admin/lab/runs`, `/operations/bottleneck`, `/operations/journey` gone from the
  route list. **Real-use gate (rule 14): PASS.** 390px + desktop browser pass: Operations page shows
  Active (5) first with "5 running · 3 stalled · 137 failed" chips and a `stalled?` badge, re-polls
  live without reload, and renders bottleneck/journey reports inline on their card; deleted routes
  404; Sources shows a per-source Extraction runs table opening the retained run detail; re-clicking
  an advanced-from stop reopens that stop; a live generating card reads "Planning progress 8 / 11";
  the header H1 is "Bayesian statistics" with "Summit: Markov chain Monte Carlo" demoted; crystals
  render on a dark vista rock face with hairline-outlined shards; learner buttons are trail-green
  (themed tokens); tapping the known-ghost "Ownership" crystal shows its name chip and toggles off.
  Evidence: `tmp/2026-07-06-admin-learner-polish-gate/` (screenshots + `evidence.md`). Caveat: the
  vista chip check used a DB-seeded `known` verdict because the automated skip-known click did not
  persist for that node; the skip-known flow itself is unchanged by this pass.

- Tests remain deterministic-envelope evidence only under
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md); quality claims come from
  inspected real model output. Older validation trails live in git history and generated artifacts
  under `tmp/`.

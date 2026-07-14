# TODO

## TODO

### Active implementation

- **Learner App native parity fix (IN PROGRESS — U1–U4 implemented; web/automated gate PASS
  2026-07-14).** See the [active plan](./2026-07-13-004-fix-learner-app-native-parity-plan.md)
  for implementation scope and KTD2 design. Focused split-boundary proofs, all 161 learner-app
  tests, learner typecheck, web export, and `pnpm check` pass. The plan's representative Playwright
  web gate also passed with zero page/console errors or strict shared-value warnings; evidence:
  `tmp/2026-07-13-learner-app-native-parity/EVALUATION.md`. The native real-use gate remains
  **BLOCKED** on the user-owned preview-APK/physical-device pass in [BLOCKERS.md](./BLOCKERS.md),
  so this remains first before Guardian builds new native surfaces on the same UI kit.

- **Crystal Guardian Challenges (IN PROGRESS — U1–U4 shipped + Gate A PASS 2026-07-13; U5–U7
  remain).**
  Implement the accepted
  [requirements](../brainstorms/2026-07-13-crystal-guardian-challenges-requirements.md) through the
  [ready plan](./2026-07-13-003-feat-crystal-guardian-challenges-plan.md). **Done this session
  (server side, uncommitted working tree):**
  - **U1** — pure module `packages/application/src/recallChallenge.ts`: KTD5 coverage-first
    lineup selection (anchor reservation, distinct concepts / distinct Legs before repeats,
    least-exposure rank + FNV challenge-identity tie-break, 5/7 maxima, empty = unavailable),
    KTD6 combat fold (3-segment miss buffer, queue-ward rotation, Last Stand restore-exactly-one,
    Matching one-miss-per-dirty-round with `roundIndex` reshuffle key and mid-board resume,
    out-of-turn events ignored), `latestCorrectStudyItemIds` eligibility fold, key-free
    discriminated `RecallChallengeView` (reuses `studyItemToView`), and `RecallAnswerFeedback`.
    Key resolution was extracted to persistence-neutral `keyedCorrectIdFor`/`keyedMatchIdFor` in
    `gradedSelectionOutcome.ts`; `gradeStudyResponse` now consumes them (KTD4 share-semantics-
    not-write-path). 24 table-driven tests.
  - **U2** — `RecallChallengeStorePort` (+ record/event types) in `@lrnki/ports`; three tables in
    the single initial migration (`recall_challenges` with the one-active-per-scope partial
    unique, immutable `recall_challenge_lineup` FK'd to `study_items` PK so lineups survive
    supersession, `recall_challenge_events` with per-kind CHECK shapes, bounded
    `response_duration_ms`, and attempt/operation-ref idempotency partial uniques);
    `PostgresLearnerRecallChallengeStore` (row-locked `appendEvent` with expectedSeq
    serialization → appended/duplicate/stale/conflict, duplicate checked BEFORE the status gate
    so a replayed final-ward answer reads as its committed self, `hydrateLineupItems` without the
    superseded filter via the extracted `hydrateStudyItemRows`). 7 integration tests incl. the
    `response_log`-untouched assertion. The three tables were ALSO applied incrementally to the
    current shared dev DB (no hard reset yet — Gate A owns that).
  - **U3** — `createRecallChallenge(deps)` deep-module factory (scopeStatus / create / read /
    answerSelection / answerMatchingPair / retreat / resume / abandon; scope = section milestone
    or enrichment summit via `deriveFlooredExpedition`; enrichment scope `locked` until every Leg
    won; state-edge lifecycle no-ops so polling can't inflate events; duplicate attempt replays
    the committed view with `feedback: null`), bound once in
    `apps/learner-api/src/recallChallenge.ts` and exposed as typed `/challenge/*` routes
    (UUID/zod bounds, 404/409/422 mapping). DB-gated end-to-end API test drives
    create → 3 misses → Last Stand → retreat/resume → recovery win → idempotent replay →
    summit unlock → rematch → abandon, asserting no `isCorrect` on the wire and `response_log`
    count identical.
  - **U4 (done 2026-07-13, second session)** — server-owned scope views ride the projection:
    the pure `projectRecallScopeStatuses` + `eligibleRecallItems` were extracted from the
    module's closure (the module's `scopeStatus` now delegates), `getStudySession` composes
    `StudySession.recallScopes` from the SAME pure functions over the rows it already loads
    (optional `challengeStore` dep — only the three cheap challenge reads are added; Admin Lab
    composes unchanged/empty), `buildTrailView` attaches `TrailSectionView.recallScope` (by
    section index) and `TrailView.enrichmentScope`, and `/expedition/:id` wires the store.
    `RecallScopeStatus` reaches the client-safe `./projection` barrel type-only (the defining
    module pulls `node:crypto`; Expo web export stays green). A projection test proves the
    neutral fold is byte-identical under arbitrary scope input (KTD3/KTD4); scope-status
    scenario tests (mastered-unfused, active-after-refetch, won-after-later-miss, zero-item Leg
    blocking the summit, all-Legs-won unlock, FIRST-win-wins rematch identity) are table-driven
    on the pure function.
  **Validation this session (U4 + Gate A):** workspace typecheck green; lint 0 errors (9
  pre-existing warnings); tests green EVERYWHERE incl. infrastructure-postgres 84/84 against a
  fresh migration (the 2026-07-12 dirty-DB `claimNextGenerating` caveat is CLEARED — it was the
  dirty shared DB, as suspected); application 672, learner-api 20 (live-DB E2E), learner-app
  149, admin-lab 62; `pnpm build` green (Expo web export proves the client bundle stays
  Node-free). **Rule-14 Gate A PASS** on a hard-reset DB + fresh production "Tides and lunar
  gravitation" expedition (14 nodes / 31 items / 6 Legs, READY in 486 s): honest all-unavailable
  + locked-summit initial scopes; real acquisition flipped exactly one Leg available (7
  eligible); coverage-first anchor-led 5/7 lineup; misses→Last Stand→retreat→**byte-identical
  resume on a freshly restarted API process**→recovery win→victory; duplicate-attempt replay,
  state-edge lifecycle no-ops, 409 out-of-turn (incl. organic ward rotation), live dirty
  Matching round (per-pair corrective feedback, ONE shield hit, `roundIndex` 0→1 reshuffle with
  reset board), rematch + abandon + second victory all leaving the formation at the FIRST win,
  later acquisition miss dropping eligibility 7→6 with the scope still won;
  `session.recallScopes` deep-equals `/challenge/scopes` at every stage; `response_log`
  md5 + mastery gating + points **identical** across ~60 challenge events. Evidence + required
  note: `tmp/2026-07-13-crystal-guardian-challenges/EVALUATION.md`. Post-gate hard reset ran;
  deployed container restarted; DB is fresh/empty.
  **Remaining for the next session, in order:**
  1. **U5–U6** — Guardian fight surface + arrival/trail/formation/summit integration. BLOCKED on
     the physical Android acceptance gate of the
     [native parity fix plan](./2026-07-13-004-fix-learner-app-native-parity-plan.md). U6 replaces
     the client's mastery-equals-fusion /
     final-Leg-keystone helpers with `TrailSectionView.recallScope` / `TrailView.enrichmentScope`
     (server facts already shipped by U4 — nothing client-side consumes them yet).
  2. **U7** — hard-delete Crystal Duel (code, routes, `duel_win` award/badge, migration enum,
     vocabulary; keep weekly podium + rival simulation), consolidate docs (CONTEXT.md, affected
     ADRs), run Gate B, then close the plan + brainstorm lifecycle per `docs/plans/README.md`.

### Evidence-triggered follow-up

- **Scaffold step content polish (measure-first).** Two model-variance observations from the
  2026-07-13 U6 gate, in the scaffold content generator (not the Support Path UX contract): a
  micro-lesson emitted literal `**bold**` markdown rendered raw, and one step's label mismatched
  its own (accurate, easier) lesson/question. If real use shows these recur, address them in the
  scaffold generation prompt or an ADR-0028-style congruence judge — not a lexical gate (rule 16).

- **Support Path Study Items in Guardian selection.** After real use justifies the breadth, define a
  richer learner-scoped typed Study Item set and passed-item semantics for Support Steps, then extend
  fixed-budget Guardian coverage to completed visible Support Paths as anticipated by ADR-0037. Do
  not treat the current single inline generated option as equivalent to the neutral Study Item Bank.

## COMPLETED

- **Learner Support Path UX shipped (2026-07-13, plan 2026-07-13-002; plan DELETED).** Unfamiliar
  terms are now discoverable in context and each Scaffold Detour reads as one compact, playable
  Support Path. Explorable Term capacity is five everywhere it is authoritative (validator,
  forced-tool schemas, prompts, `CONTEXT.md`) while Support Steps stay one-to-three; the Study
  Session projection is the single authority for term support state (`ExplorableTermView` with
  `available`/`generating`/`failed`/`ready+complete`, correlated by parent node + normalized term,
  lesson `sectionKind` preserved) and for path navigation (`completedStepCount`/`totalStepCount`/
  `firstIncompleteStepId` replacing the deleted `ScaffoldDetourGroup`/`masteredParentNodeIds`
  grouping; new `resolveReferenceStopId`). The Learner App renders first-occurrence dotted-underline
  theory highlights (pure `buildTermRuns`, byte-exact slices), a compact available-only Support
  Paths panel (post-content in theory, between stem and answers in graded activities), ONE
  state-aware `SupportPathDialog` (restored-ready never flashes generating; ready offers
  `Open support path`/`Keep exploring`, never lesson content), one always-visible `SupportPathNode`
  side branch per active detour, and a full-screen `SupportPathSheet` owning resume/overview/
  generated study/reference routing/hide. Shared centered-dialog anatomy per KTD9 (`DialogBody`
  shrinkable scroll region + `DialogFooter`) replaced per-consumer bounded wrappers, and the U6
  gate found and fixed a web-only defect in it: the dialog primitive's unstyled focus wrapper made
  `max-h-[85%]` resolve against the dialog's own natural height, always clipping ~15% — fixed with
  a web `maxHeight: "85vh"` inline cap in `ui/overlays.tsx`. DELETED in the same change:
  `TermExplorationMenu`, `ScaffoldDetour`, `ScaffoldProgressDialog`, `ScaffoldStepSheet` (+tests,
  vocabulary, exports). Persisted shapes unchanged; ADR-0037's discovery/presentation context and
  the `CONTEXT.md` Explorable Term definition updated. Both rule-14 gates PASS (U1 term contract,
  U6 whole flow); evidence `tmp/2026-07-13-learner-support-path-ux/`.

- **Topic Expedition generation is one deep process-lived module (2026-07-13, plan
  2026-07-13-001; plan DELETED; architecture review Candidate 3 complete).**
  `createTopicExpeditionGeneration` in `@lrnki/application` binds a narrow fenced-progress
  adapter, lifecycle-shaped Synthetic Topic Generation (concept count + fenced Declared
  Domain callback) and Study Item Bank (completion-only) adapters, and an enrichment-ID
  factory once, returning one callable that takes only expedition lifecycle facts and
  resolves `void`. The claim-fencing protocol, phase order, early Declared Domain
  persistence, readiness rule (≥1 concept + completed bank, sparse banks ready per
  ADR-0026), and failure classification (claim-loss abort, infrastructure-only release,
  deterministic bounded-redacted failure) are unchanged; best-effort terminal writes now
  swallow their own store rejections so the original generation error always rejects. The
  one-shot dependency-union interface, `deps` test bag, success payload, and public
  `GenerationClaimLostError`/`isTransientGenerationError` exports are deleted; the focused
  lifecycle suite drives only the factory interface (no `as never`) including an
  interleaved two-request isolation scenario. Production binding lives in
  `createLearnerTopicExpeditionGeneration` (learner API composition root), cached lazily at
  process scope by the topic supervisor — DB-free route imports stay hermetic and
  supervisor claim/reap/staleness/attempt policy is untouched (ADR-0029). Rule-14 gate
  PASS: two fresh concurrent topics ("Baroque fugue counterpoint" → Music Theory 15
  nodes/21 edges/26 items, "Glacier mass balance" → Glaciology 11 nodes/12 edges/25 items)
  generated through one process with fully overlapping timelines, distinct operation
  identities, inferred domains persisted mid-fence, all lessons present and spot-checked
  accurate; evidence in `tmp/2026-07-13-topic-expedition-generation-module/`.

- **Adaptive Learner Scaffold Detours shipped (2026-07-12, plan 2026-07-12-002; plan DELETED).** A
  learner can turn an unfamiliar Explorable Term in a lesson or question into a durable, optional,
  one-level Scaffold Detour of one-to-three easier Support Steps, without ever mutating neutral graph
  assets. Server-owned Explorable Term metadata rides into the projection item/lesson views; the
  Study Session projection is now the single trail authority (`buildTrailView`/`resolveStopActivity`
  moved into `@lrnki/application/projection`; the Learner App's `trailView.ts`/`activityProgress.ts`
  are deleted and all importers consume the projection). Generated Support Steps carry a KEY-FREE
  option-select view (`ScaffoldStepItemView` drops `isCorrect`); the shared Concept-Lesson section
  mapper lives in a leaf `conceptLessonSectionView` module (no runtime import cycle). The Learner App
  gained `TermExplorationMenu`, `ScaffoldDetour`, `ScaffoldProgressDialog`, and `ScaffoldStepSheet`,
  a More overflow in the Activity Sheet, indented detour rows composed under each parent before the
  capstone, a root-owned progress dialog, event-bound ready-reveal motion with reduced-motion
  equivalence, and 5s polling only while a finished session reports generating detours. Durable
  decisions: [ADR-0037](../adr/0037-persist-learner-scoped-scaffold-detours.md) (new), amended
  [ADR-0026](../adr/0026-typed-study-item-bank.md) (response identity cedes the scaffold side) and
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md)
  (learner-requested support starts immediately; Flow Design Gate folded in); CONTEXT.md verified.
  Three rule-14 gates PASS (U1 term metadata, U3 scaffold generation, U6 browser); one real defect
  found and fixed (the `microLesson` `.max(600)` cap was clipping the model's natural output and
  failing whole detours — raised to `.max(1200)`). Evidence: `tmp/2026-07-12-scaffold-detours/`.

- **Expedition Journal is one finished application projection (2026-07-12, plan 2026-07-12-001).**
  A single `@lrnki/application` module (`expeditionJournal.ts`) owns candidate derivation,
  trail-scoped progress, generation facts, the tier partition, and Explore curation behind two
  entry points (`getExpeditionJournal`, `getExpeditionCatalog`). Owned rows cross the HTTP seam as a
  status-discriminated finished union (ready carries `progress`/`layerPurpose`; generating/failed
  carries `failureMessage` and a finished `generation` block); raw `LearnerExpedition` rows, fencing
  fields, and `OperationTimelineDetail` no longer reach the wire. The `/journal` and `/catalog`
  routes became thin bearer/adapter mappers; the absorbed `listExpeditionCandidates` use-case and
  the Learner App's `generationProgress.ts` + `expeditionJournalView.ts` policy modules were
  deleted. The app now derives its journal/catalog types mechanically from the hono `AppType` via
  `InferResponseType` (no hand-built `JournalView` alias, no per-call `unwrap<T>` generic for these
  reads), has zero `@lrnki/ports` imports, and uses `STAGE_TAGS` only as `stageCopy` keys. Two
  accepted learner-visible changes: the topic-generation progress denominator is the full 14-stage
  plan (adds `layerPurposeGeneration`, `lessonRedundancyJudgment`, `impostorLieValidityJudgment`, so
  the bar no longer blanks during layer-purpose generation — [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md)
  seam), and Explore curation filters adopted candidates before taking its top five. The journal
  builds on the 2026-07-11 expedition-discoverability outcome (plan 2026-07-10-005, since deleted):
  explicitly curated top-five Explore plus the lazy `/catalog` route exposing every shared,
  beginnable ≥2-stop expedition with case-insensitive search across the persisted trail vocabulary,
  with degenerate development data removed (its own rule-14 Playwright gate PASS; evidence
  `tmp/2026-07-10-expedition-catalog-cleanup/`). Rule-14 PASS: a fresh production "Enzyme kinetics"
  generation polled every 5s stayed determinate across the enrichment→study_items boundary
  (`indet=False` on all 34 generating snapshots, `n/14` counter), reached READY at 22 items, moved
  `yours`→`started` on one server-keyed correct grade, Explore excluded the adopted expedition,
  `/catalog` returned all 19 candidates with trail-vocabulary search, and `response_log` stayed 0
  across reads (1 only after the graded answer). Evidence:
  `tmp/2026-07-12-expedition-journal-projection/`.

- **Derived Graph Layer completion consolidated into one deep module (2026-07-11, plan
  2026-07-11-001).** The duplicated Graph Enrichment / Synthetic Topic Generation back halves
  (judgment-context construction, evidence-free exclusions, K-sampled consensus ordering, symbolic
  transitive reduction, intrinsic difficulty, common trace dispositions, layer/artifact assembly,
  atomic persistence) now live in one internal `completeDerivedGraphLayer` application module with
  a factory-bound `complete` operation over a discriminated source-grounded/synthetic contribution.
  Shared completion config has one type and one default authority composed into both producer
  configs with byte-stable identities (`graph-enrichment-1886ba82e2e5`,
  `synthetic-topic-generation-978cefbca6ed`, locked by an exact-hash regression test). The one
  intentional behavior change: provable lifecycle-aware structural violations (duplicate node IDs,
  contribution/version mismatch, unproven trace references, unknown edge endpoints, inexact
  difficulty coverage) now fail closed with zero persistence; well-formed neural output is never
  normalized or reinterpreted. The completion suite is the shared-policy test surface; producer
  suites keep their front halves plus one handoff contract each. Rule-14 gates PASS for both
  variants (fresh production enrichment over the curated Rust ownership source and a fresh
  synthetic "Rust ownership and borrowing" layer, persisted artifacts inspected). Evidence:
  `tmp/2026-07-11-derived-graph-layer-completion/`.

- **Production extraction on Xiaomi MiMo v2.5 — cutover, follow-ups, DeepSeek retired
  (2026-07-10/11, plans 2026-07-10-002 and 2026-07-10-004).** The six extraction aliases route to
  `openrouter/xiaomi/mimo-v2.5` (single-host provider pin for prefix-cache reuse, reasoning
  disabled); all DeepSeek deployments and `DEEPSEEK_API_KEY` plumbing deleted; AGENTS rule 5 names
  the `model_group_alias` block as the source of truth; config hashes proved alias-stable across
  the cutover. Two MiMo wire-schema defects are locked down: the impostor wire schema went fully
  flat (MiMo's constrained tool decoder intermittently stringifies nested array-of-object arguments
  and truncates before a trailing literal `null`), and a config-derived congruence test — parsing
  the MiMo-routed aliases from `litellm/config.yaml` — locks the proven-fatal trailing-nullable
  shape; it caught and fixed two LIVE offenders (`concept-lesson` sections, `study-item-blueprint`
  plans). A durable `kg-worker audit-discovery-coverage` command runs the cross-family independent
  judge (gpt-oss-120b, K=3) over an extraction run's admitted set and the source's teachable
  blocks; auditing fresh extractions of all five `fixtures/manifest.json` sources found zero
  domains with a human-confirmed principal-concept miss, so discovery tuning was skipped
  (production stays on OpenRouter Xiaomi BYOK; native Xiaomi remains experiments-only). BYOK cost
  attribution is restored in the ADR-0029 read path: an explicitly labeled `estimatedSpend` derived
  from versioned deployment prices, reconciled exactly against OpenRouter's retained
  `upstream_inference_cost`, rendered `≈…est.`, distinct from provider-billed spend. Rule-14 gates
  PASS; evidence `tmp/2026-07-10-extraction-model-switch-mimo/` and
  `tmp/2026-07-10-mimo-extraction-follow-ups/`.

- **Learner interaction system and deferred native surfaces (2026-07-10/11, plan 2026-07-10-003).**
  Hard-cut the Learner App to one app-owned NativeWind component system (`src/ui/`: Screen, Text,
  PressableSurface, Button, IconButton, Card, Input, Progress, Dialog, BottomSheet, SideSheet,
  FullScreenDialog, OverlayHeader; single token source; lint-enforced boundary), restored the
  deferred journal overlays (right SideSheet menu, self-contained Board dialog, splash coordinator),
  gave every overlay a circular semantic icon header and one dismissal contract, and added
  restrained event-bound Reanimated motion with a single reduced-motion policy and selective
  semantic haptics. The initial native investigation located the shared class-bearing animated
  surface boundary; its current static/animated separation contract is owned by
  [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md). A second web-only leak
  (react-native-svg `origin` → raw `transform-origin`
  DOM attribute on the crystal-assembly path) was found on the fresh-generation gate and fixed with
  an explicit pivot-decomposition transform. Decisions:
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md) (amended) and
  [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md) (amended). Rule-14 web gates
  PASS: session-3 migrated-UI gate (51 server-keyed grades, evidence
  `tmp/2026-07-10-learner-interaction-system/`) and session-4 fresh-production-generation gate
  (cold topic → 137s → 8 nodes / 19 study items / 8 lessons → 16/16 server-keyed correct grades,
  plus normal/reduced-motion recordings, evidence
  `tmp/2026-07-11-learner-interaction-fresh-gen/`), resolving the earlier MiMo `441 risk_control`
  block via OpenRouter Xiaomi BYOK. The Android preview build + physical-device pass is a manual
  step in [BLOCKERS.md](./BLOCKERS.md) (web correctness is the completion bar); iOS runtime
  validation is deferred.

- **Learner goal gradient, constructive Crystal Vista, and duel arena (2026-07-10, plan
  2026-07-10-001).** Advance-visible goal hierarchy: layer-purpose Neural Stage Descriptor
  (`layer-purpose-generation` under `study_items`, fail-open to a mechanical template, one
  `enrichment_layer_purposes` row per enrichment), merged summit header, leg banners, summit-push
  eyebrow, and trail terminus. Constructive Crystal Vista on RN primitives (leg-cluster fusion
  auras, summit keystone, memory door replacing the bare label chip), tiered fog-naming, and the
  `/duel` re-port over the pure `duelMachine`. Rule-14 web-first gate PASS (7/7 nodes mastered via
  server-keyed grading; `response_log` byte-identical across 5 duel grades); flow-evaluation
  method established as the difficulty follow-up baseline. Zero new persistence beyond the one
  purpose row. Evidence: `tmp/2026-07-10-goal-gradient/`.

- **Learner App separation, live deployment, and universal Expo cutover (2026-07-08→10, plans
  2026-07-08-003 and 2026-07-09-001).** The learner surface moved out of Admin Lab:
  `apps/learner-api` (Hono + zod thin mappers over `@lrnki/application`, opaque hashed bearer
  sessions in the new `learner_sessions` table, PIN + rate limit, relocated topic-generation
  supervisor, one shared pool) behind Caddy TLS at `https://api.lrnki.globesoul.com`; static
  learner web at `https://lrnki.globesoul.com` (GitHub Pages); internal litellm/docling/postgres
  ports bound VPS-local; Admin Lab lost every learner route and stays SSH-tunnel-private. The
  client became one Expo universal app `apps/learner-app` (Expo Router + NativeWind +
  react-native-svg) rendering full v1 parity over the unchanged typed API, with the client-safe
  `@lrnki/application` `./projection` subpath; the interim `apps/learner-web` SPA was deleted at
  cutover on web-only evidence (user decision; the native check is backed by the Android
  local-build pipeline). Caddy routes the API dev-first to a host-run tsx watch process with
  container fallback, and the Caddyfile is baked into a built caddy image. Decisions:
  [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md) and
  [ADR-0036](../adr/0036-run-single-shared-learner-environment-during-testing.md). Rule-14 gates
  PASS; evidence `tmp/2026-07-08-learner-app-separation/`,
  `tmp/2026-07-09-learner-app-deployment/`, and `tmp/2026-07-09-learner-app-universal-expo/`;
  runbook in the [README](../../README.md#deployment).

- **Operations, observability, architecture deepening, and the learner registry / weekly
  leaderboard / Crystal Duel (2026-07-07/08).** Journey-first Operations page with one merged
  stage table (`mergeOperationStageRows`), live cost/tokens/calls chips, collapsed finished cards,
  and the operator "bottleneck" surface renamed **Cost & timings**; the operation-timeline catalog
  made provably complete via a set-equality + disjointness assertion
  ([ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md)); Neural Stage Descriptors
  with dotprompt files and mechanical config hashes replacing adapter classes and hand-bumped
  hashes ([ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md)), proven
  byte-identical across both composition roots; the shared neural client-construction policy in
  `createNeuralClients()`; learner grading collapsed behind one tested `gradeStudyResponse`
  application use-case consuming the read model per
  [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md); and the one-time
  learner-state wipe + `/learn` read-path dedup (10.5s → 2.59s warm). Free-text identity was
  replaced by a `learners` registry with PIN gate and real FKs on the learner-state tables
  (`/learn/session` is the sole PIN-aware route, the swap point for real auth); the weekly
  ISO-week banded score reads off the SAME Study Session projection every surface reads, rendered
  as a cohort-of-10 Dialog with seeded Faker rivals, a derived division ladder (0/10/30/75), chase
  banner, seam-triggered splash, and idempotent `weekly_podium`; the Crystal Duel is a
  five-question grade-only retrieval sprint over a pure exhaustive `duelMachine` that persists
  nothing (`response_log` byte-identical across a duel) and awards a durable `duel_win` crest
  ([ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md)). The
  completed 2026-07-07 architecture review's rejected-findings ledger is preserved by the
  [2026-07-11 review](../brainstorms/2026-07-11-architecture-deepening-review.md). Rule-14 gates
  PASS per change; evidence under `tmp/2026-07-07-*/` and `tmp/2026-07-08-*/`.

- **Learner study experience and generation durability foundations (2026-07-02→07).** The Study
  Session projection became layer-wide and sectioned with a derived summit and the single
  completion rule (terminology in [CONTEXT.md](../../CONTEXT.md); the persisted expedition target
  was deleted); per-concept procedural growing crystals and the Crystal Vista replaced the gem
  icon; the trail gained opaque portals, one-tap grading with explanations, known-ground ghost
  crystals, two-column tap-pair matching, Begin/Resume entry with one-step topic planning, and
  journal theming. Concept Lessons carry list-structured examples/applications with a cross-family
  redundancy judge and a one-substantive-section minimum; Study Item Blueprints have a structural
  sparse pre-gate; a dedicated Rescued-Node Canonical Labeling step replaced the durability-judge
  field; intrinsic difficulty became a comparative in-set banded prior with a confident-floor
  trail floor ([ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md), amended).
  Topic-expedition generation became a durable claimed row completed by the supervisor:
  bounded-parallel (cap 2), one staleness predicate shared by claim and fail, operation-id fencing
  with heartbeat, transient-vs-terminal error classification, an orphaned-row reaper, and a
  two-minute liveness predicate shared with the UI
  ([ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md)); study-item generation
  runs bounded per-node concurrency 4 (measured 261.5s → 94.5s); the Knowledge-Boundary Probe
  gained a repeatable `calibrate-boundary-probe` command and measured defaults (K=10, temperature
  0.7, threshold 0.89), plus a deny-listed alias with a cross-family ordered fallback
  ([ADR-0030](../adr/0030-confidence-gated-synthesis-with-web-grounding.md)). Decisions:
  [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md), and
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

## VALIDATION

- **Learner Support Path UX whole-flow gate, 2026-07-13 (U6).** Hard DB reset, three fresh
  mixed-domain synthetic expeditions over production LiteLLM (Macroeconomics / Volcanology /
  Computer Science): 131 emitted Explorable Terms, 0 anchor failures, 0–5 distribution with no
  padding; 8 real detours (16 steps, all 4-option/1-correct, key-free client). Playwright at
  390×844, 320×568, and a 160×284 200%-zoom-equivalent viewport drove create→suppress→ready→
  study→complete→overview→hide→restore (same detour id), reference routing to the canonical
  checkpoint with no copied content, a six-node accumulation with the main trail still navigable,
  zero-term activities rendering no panel, and a reduced-motion pass — zero console/page errors
  in every flow. One launch-blocking defect found by the gate and fixed in-session (the shared
  dialog anatomy's web percentage-cap clip; re-proven unclipped at all viewports). U1's
  compound-parent sub-phrase caveat inspected live: it generated genuinely easier prerequisite
  steps, no action needed. Neutrality queries after all support work: `response_log` 2 rows both
  scaffold-scoped, 0 neutral `lesson_reads`, 0 awards, no generated label in the neutral graph,
  Study Item Bank untouched. Gate learner removed via post-gate hard reset; deployed container
  restarted. Evidence and the required evaluation note:
  `tmp/2026-07-13-learner-support-path-ux/EVALUATION.md`.

- **Adaptive Learner Scaffold Detours gate, 2026-07-12.** Deterministic envelope (post-fix, fresh
  migration): workspace `typecheck` all packages Done; `lint` 0 errors / 9 pre-existing warnings;
  `test` green (domain-core 39, application 623 — incl. the moved neutral-trail characterization
  tests and generated-step content projection, infrastructure-litellm 148 after the `microLesson`
  cap change, infrastructure-postgres 77 vs a FRESH migration, learner-app 137 incl. the four new
  scaffold component suites + the Activity Sheet AE1 integration, learner-api 18, admin-lab 62,
  kg-worker 8); `build` green (Expo web export all 6 routes; no require-cycle after extracting the
  `conceptLessonSectionView` leaf). Real-use (production LiteLLM, four cold synthetic expeditions
  across Plant Biology / Computer Networking / Financial Engineering / Geology): **U1** term metadata
  is restrained and useful in biology and networking (RuBisCO, ssthresh, ECN, AIMD, abbreviation
  pairs), exact-substring/distinct/≤3/parent-excluded verified — recorded caveat that Black-Scholes
  emitted zero terms (valid AE2 outcome, wiring confirmed correct, no domain tuning); **U3** ≥10
  detours exercised direct reuse→reference (subduction, congestion window), generated single- and
  multi-step (all genuinely easier, coherent, one concrete example, 4-option/1-correct, no key
  leak), and a natural terminal failure (`asthenosphere`) whose root cause — the `microLesson`
  `.max(600)` cap clipping the model's 495–593-char natural output — was fixed to `.max(1200)` and
  confirmed by a successful retry; **U6** Playwright at a 390×844 phone viewport drove the full loop
  (term menu → create → progress dialog → durable placeholder → generate to ready → study a
  generated step → grade correct through the scaffold path → hide → restore) plus a reduced-motion
  pass, all with zero console/page errors. Disposable learner state removed (DB reset before and
  after). Evidence and the required evaluation note: `tmp/2026-07-12-scaffold-detours/`.

- **Expedition Journal projection gate, 2026-07-12.** Deterministic envelope: workspace `typecheck`
  exit 0, workspace `test` green (application 568 including the new `expeditionJournal.test.ts`
  suite — stage-plan catalog lock, queued/stalled facts, offset/clamp/indeterminate folds, AE1
  layer-purpose determinacy, tiers, curation, candidate narrowing; learner-app 137 after deleting
  the two client policy suites), `lint` 0 errors (8 pre-existing warnings), `build` green (Expo web
  export all routes; projection barrel stayed client-safe after dropping `isStaleOperation`/
  `ExpeditionCandidate` from it). AE7 negative check: renaming a projection field failed the
  learner-app typecheck, then reverted. Real-use: fresh production "Enzyme kinetics" +
  "Coral reef symbiosis" generations over production LiteLLM, journal polled at the app's 5s
  cadence; determinate bar across the phase boundary, `yours`→`started` transition on one
  server-keyed grade, adopted-expedition curation, `/catalog` search, and read-write purity all
  inspected; disposable learner deleted (0 rows remaining), enrichments retained. Evidence and the
  required evaluation note: `tmp/2026-07-12-expedition-journal-projection/`.

- Each COMPLETED outcome above names its rule-14 real-use gate result and `tmp/` evidence
  directory; the full per-change validation transcripts live in git history. Tests remain
  deterministic-envelope evidence only under
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md); quality claims come from
  inspected real model output.

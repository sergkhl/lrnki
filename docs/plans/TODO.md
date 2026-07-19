# TODO

## TODO

_No active plan. See the evidence-triggered follow-ups below and
[plans/README.md](./README.md)._

### Evidence-triggered follow-up

- **Progressive readiness / keep the learner busy under ~1 minute.** If ~3-minute full-ready
  generation still feels slow in real use, design one of: earliest-section
  readiness (learner enters while later sections still generate; owns the readiness-rule and
  Study Session composition change), enrichment/study-items phase overlap (the shipped sequential
  operation boundary has no in-memory handoff seam), or an engaging waiting surface (e.g.
  calibration or topic preview during generation). Real-use judgment after the speedup ships
  triggers this, not a timer.

- **Support Path Study Items in Guardian selection.** After real use justifies the breadth, define a
  richer learner-scoped typed Study Item set and passed-item semantics for Support Steps, then extend
  fixed-budget Guardian coverage to completed visible Support Paths as anticipated by ADR-0037. Do
  not treat the current single inline generated option as equivalent to the neutral Study Item Bank.

## COMPLETED

- **Treasure-map trail restyle shipped (2026-07-19, plan 2026-07-18-001; plan DELETED).** The
  Expedition trail screen is now one explorer's field-chart: a single parchment map artifact behind
  the whole trail column (aged wash, one seeded SVG `<Pattern>` grain tile, edge/border weathering),
  a continuous hand-drawn route through every measured checkpoint center with progressive inking
  (solid `map-ink` behind the learner, faint `map-ink-soft` irregular dashes ahead — shape, never
  color, never gold, no route motion), ink-ring-on-parchment checkpoint circles, double-rule
  display-font (`@expo-google-fonts/im-fell-english` via `expo-font`) Leg cartouches, uncharted
  `map-parchment-deep` bands + faded lock circles for fogged/locked legs, one X+peak terminus
  cartouche, and sparse seeded margin-only doodles. Pure downstream presentation: **zero API,
  projection, persisted-shape, copy, or motion change**; gold stays earned-only; trail structure and
  state come unchanged from `buildTrailView`. U1–U3 committed `ce807e3`; U4 changed no source. New
  map tokens + contrast assertions, the pure `treasureMap.ts` layout module, `MapGround`, `TrailRoute`
  (replacing `TrailWave`, superseded constants deleted), and the restyled `CheckpointCircle` /
  `SectionDivider` cartouche / `TrailTerminus` / uncharted fog / panel surfaces all ship with updated
  suites. Durable policy folded into [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md)
  ("Trail map presentation"). All three validation layers PASS (deterministic envelope + rule-14
  browser gate 2026-07-19; native emulator regression + parity screenshots 2026-07-19 — see
  VALIDATION). Evidence: `tmp/2026-07-18-treasure-map-trail/EVALUATION.md`.

- **Topic Expedition speed and generated-grounding reliability shipped (2026-07-19, plan
  2026-07-18-002; plan DELETED; uncommitted).** Groq is the forced-tool-compatible gpt-oss-120b
  provider lock; Derived Graph ordering overlaps difficulty; lesson/blueprint and concept fan-out
  are 8; all three Study Item families run concurrent degree-4 brackets and merge canonically.
  Source-less grounding admission now uses claim-targeted question planning, structurally
  draft-blind answering, one adapter-guaranteed open-ended identity/nearest-confusions check, and a
  monotonic exact-span drop-only review. A wholly rejected draft receives one critique-guided
  selective redraft and complete re-verification; exhaustion fails before persistence. Concept
  synthesis emits atomic concepts within a 16-node operating bound, the verification waves use
  execution-only width 16, and Concept Lesson synthesis may not infer mechanistic/universal claims
  from graph adjacency. Durable policy lives in ADR-0030/0031 and existing ADR-0002/0019/0034; the
  final production expedition reached ready in **183.886s**, all 20 stage brackets were `ok:true`,
  and direct inspection classified the 16-node / 19-edge / 16-lesson / 27-item artifact **PASS**.
  Journey cost was **$0.1450095** versus **$0.0650480** baseline. Evidence:
  `tmp/2026-07-18-expedition-speedup/EVALUATION.md`. Validation in VALIDATION below.

- **Topic-generation claim reliability and DB-test isolation shipped (2026-07-18).** Topic claims
  now mint and persist the enrichment operation/fencing UUID atomically in the queue claim;
  lifecycle generation receives that claimed identity and verifies it before neural spend, so the
  former claim-with-NULL handoff window is gone. Topic and Scaffold claim loss share one expected
  cancellation signal, which the shared supervisor reports without a failure stack. DB integration
  suites now opt in through `TEST_DATABASE_URL`; `pnpm test:db` serializes, validates, resets, and
  migrates only `lrnki_test`, preventing a live learner-api from consuming or losing test fixtures.
  No schema or prompt changed. Rule-14 gate PASS; evidence and caveat:
  `tmp/2026-07-18-topic-claim-fix/EVALUATION.md`. Validation in VALIDATION below.

- **Dead module cleanup and durable keep decisions shipped (2026-07-17, plan 2026-07-17-001; plan
  DELETED).** Purely subtractive (rule 18) with zero-consumer evidence re-verified at execution
  time: deleted `verifyEvidenceQuote.ts`, `targetCandidates.ts` + test + barrel block,
  `calibrationList.ts` + test + barrel block, the whole `packages/infrastructure-rdf-export`
  package (README line removed, lockfile settled), the per-Leg sphere-grid test block whose
  subject died with the Crystal Formation minimal redesign (the whole-enrichment regression and
  its real-shape fixture stay), the stale `composeCalibrationSession` comment reference in
  `studySessionProjection.ts`, and the empty untracked `apps/admin-lab/src/app/learn/` directories.
  Durable keep decisions recorded: ADR-0008 now owns the stable-IRI-only boundary (no standing
  JSON-LD exporter until a real consumer exists); ADR-0032 now owns the provisional
  leaderboard-MVP decision (simulated rivals stay presentation-side fiction; beta learner response
  decides retention; real multiplayer post-beta). The plan's interview-locked KEPT ledger
  (leaderboard stack, `sphereGridLayout.ts` in application, symbol-level exports, test suite) is
  final — do not re-propose those removals. No runtime behavior, schema, prompt, port semantics,
  or wire shape changed. Validation in VALIDATION below.

- **Deep Scaffold Generation and closed attribution shipped (2026-07-16→17, plan 2026-07-16-004;
  plan + accepted brainstorm DELETED).** One process-lived `createScaffoldGeneration(construction)`
  factory now owns the entire claimed Scaffold Generation lifecycle behind a
  `(request: {detourId, operationId}) => Promise<void>` callable (KTD1): the opening Study Session
  is the sole exact-reuse authority (KTD2), neutral reference assets are pinned by three non-null
  FKs and never copied — Concept Lessons gained an application-minted `conceptLessonId` +
  supersede-and-insert history so a ready reference survives lesson/item regeneration (KTD3), the
  finished projection emits a `checkpoint`|`support_activity` reference `destination` union (KTD4),
  exact collisions/child grounding stay internal policy with the bounded `retryFeedback` re-outline
  and always-probe/child-ground path (KTD5), failure is fenced-and-honest with a shared transient
  classifier and a fenced `releaseClaim` replacing the deleted direct `claim` (KTD6), one
  `neuralOperationRegistry` + `scaffoldGenerationConfigHash` close descriptor/config attribution
  with a `operation_runs.config_hash` CHECK required for `scaffold` (KTD7), the learner-api
  composition is construction-only + lazily cached in the supervisor (KTD8), and the Learner App
  consumes the projected destinations exhaustively — the new `support_activity` arm renders the
  pinned neutral lesson + key-free option-select in place with a "From your map" note and neutral
  node-scoped grading, while generated steps keep the "Extra support" badge and scaffold-scoped
  grading (KTD9). Deleted in their replacement units: `ScaffoldGenerationDeps`/`ScaffoldParentContext`/
  `ScaffoldReuseCandidate`/`ScaffoldGroundResult`/`ScaffoldGenerationOutcome`/`resolveExactMatch`/
  `buildScaffoldNodePayload`/`runScaffoldGeneration`/`resolveReferenceStopId`, the direct scaffold
  `claim`, the parent-text grounding threshold, and the five manual descriptor arrays. U1–U5
  committed `9391169`/`64c0ce4`/`3e11f3b`/`9aa4f7e`/`31f821e`. Durable decisions live in ADR-0030/
  0031/0034/0037 and the initial migration; U6 changed no code. All rule-14 gates PASS (U1
  persistence, U2 projection/grading, U3 registry/attribution, U4 generation behavior, U6 full gate
  — see VALIDATION). Evidence: `tmp/2026-07-16-deep-scaffold-generation/EVALUATION.md`.

- **Learner UX polish shipped (2026-07-16, plan 2026-07-16-003; plan DELETED).** Five reported
  learner-facing UX defects fixed as pure downstream presentation/client behavior (zero API,
  projection, or persisted-shape change). **U1** deleted the Guardian reward action gating
  (`actionsReady`/`settledEventKey`/settle timer/`rewardDuration`/both `disabled` props) and made
  the route controller classify only after `isFetchedAfterMount`, so `Explore formation` /
  `Continue expedition` are always usable after first-win AND rematch while the sweep stays keyed
  and the first-win haptic stays one-shot (KTD2). **U2** moved `BADGE_RADIUS` into
  `crystalFormationLayout.ts` and grew the emitted island frame by the ~8-unit above-apex overhang
  so every consumer viewBox contains the whole gold seal (containment test across four shapes).
  **U3** applied one 2 px `non-scaling-stroke` policy in `CrystalSpecimen` (ghost 0.55 / growing
  0.7 / collected) so uncollected specimens read beside the 2 px lucide icons at any scale. **U4**
  replaced `CheckpointPath`'s straight center bar + `WINDING_OFFSETS` table (both DELETED, KTD4)
  with one static dashed SVG serpentine through every checkpoint circle's measured center
  (offsets `56·sin(stopIndex·π/4)`, `measureLayout`-relative anchors, container-resize re-measure).
  **U5** fixed two Android-only overlay defects: a literal `scrim: "rgba(0,0,0,0.4)"` token
  replacing both `bg-black/40` scrims the native styler dropped (D6), and a frame-yielding
  menu→board handoff so the Board dialog's entering animation never mounts during a portal
  teardown (D7); a D8d board-content step joined the durable maestro flow. **U6 (this gate)** found
  and fixed one real in-gate defect — `CheckpointPath`'s Guardian-arrival effect fired while the
  trail sat mounted under a pushed `/guardian/[id]` route, popping the next Leg's arrival over the
  reward; conventional `useIsFocused()` gating (React Navigation "stays mounted under a push") plus
  a red→green regression test. Both rule-14 evidence layers PASS (see VALIDATION). U1–U5 committed
  by the user in `782d095`/`26524ba`; the U6 `useIsFocused` fix + regression are currently
  UNCOMMITTED (user has not asked to commit). Evidence + evaluation:
  `tmp/2026-07-16-learner-ux-polish/EVALUATION.md`.

- **Crystal Formation Minimal Redesign shipped (2026-07-16, plan 2026-07-16-002; plan DELETED).**
  The Crystal Formation now uses a curated intrinsic-difficulty mineral library, compact
  width-driven mound islands, one smooth nonsemantic ascent spine, junction badges, and a peak-held
  summit keystone; the former procedural habits, Sphere Grid, veins, seam, branch, nested contours,
  fit/overflow path, crop-to-focus, and crown wording are deleted. U5's first screenshot judgment
  found two genuine visual-composition defects: the spine crossed reserved header text and Future
  islands read as heavy gray panels. Conventional paint-order masks now protect each layout-owned
  header band while preserving one continuous underlying spine, and Future islands use the quiet
  scene surface with dashed rim + ghost silhouettes. Final review also caught and fixed a
  narrow-screen sizing defect where the Guardian reward's former floor plus container padding
  overflowed 320 px; one shared formation minimum now governs the responsive scene. A real
  production-generated Signal Processing expedition (13 concepts / 9 Legs) passed the real
  API/Postgres browser gate at phone, desktop, reduced motion, and 200% page scale: all structural
  states, real available→engaged Guardian copy, memory-door content, one-time contextualization,
  64–80 px specimens, zero horizontal overflow, and earned-only gold were inspected; the disposable
  learner was deleted. The 32-scenario production-export matrix separately re-proved collection /
  binding / rematch / keystone choreography, Guardian substates, and 320 px reward containment.
  Deterministic envelope green; commit `8c58877` owns U1–U4 and the U5/review fixes are currently
  uncommitted. Evidence + evaluation:
  `tmp/2026-07-16-crystal-formation-minimal-redesign/EVALUATION.md`.

- **Scaffold Content Quality Audit shipped (2026-07-16, plan 2026-07-16-001; plan DELETED).**
  Generated Support Step content now has a standing quality instrument AND two generation-time
  guards, both licensed by a fresh-generation sweep that measured each 2026-07-13 defect recurring.
  **U1–U4 (durable command, commit `2c56302`):** `kg-worker audit-scaffold-content <enrichmentId>
  [--k <n>] [--out <dir>]` reads persisted `generated` steps (never regenerates — rule 18) and
  classifies each with the epistemics its defect class demands — a deterministic markdown artifact
  detector that only REPORTS (rule 16) and a K-sampled label↔content congruence judgment by
  `kg-independent-judge` with human inspection deciding (ADR-0013/0028); read seam
  `listGeneratedStepsForAudit`, pure `auditScaffoldContent.ts`, `scaffold-content-congruence.prompt`
  + port, and the `scaffoldContentCongruence` STAGE_TAG in the `scaffold` catalog arm. **U5 (this
  session):** the fresh-generation gate ran, both KTD4 triggers fired against human-confirmed genuine
  defects, and both licensed fixes shipped — (a) an explicit plain-prose/no-markup output contract in
  `learner-scaffold-content-generation.prompt`, and (b) a bounded congruence re-pick in
  `runScaffoldGeneration` over the SAME independent judge the audit uses (K=1; congruence NO → drop +
  retry once → skip; fails OPEN on judge infra error, rule 16; instrumented under the scaffold
  operation). One congruence definition, two call sites. ADR-0037 Consequences amended to name the
  command as the standing scaffold-content quality instrument (re-run after any scaffold prompt /
  schema / model change). Working tree UNCOMMITTED for the U5 fixes (user did not ask to commit; U1–U4
  are committed). Rule-14 gate PASS (see VALIDATION); evidence
  `tmp/2026-07-16-scaffold-content-audit/EVALUATION.md`.

- **Crystal Formation Reward UX shipped (2026-07-15, plan 2026-07-15-002; plan DELETED).** Crystal
  collection, Leg binding after a Guardian first win, honest rematches, the summit crown, and
  Crystal Vista now speak one mineral-geode formation language, owned durably by the amended
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md) Crystal
  Formation reward-presentation contract. **(U1)** Pure `mineralSpecimen.ts` (balanced
  quartz/fluorite/calcite habit cycle keyed on section-stable offset + `sectionPositionIndex`,
  node-seeded cosmetic variation, honest `formationProgress` where known ground never inflates
  crystals) + `CrystalSpecimen`; compact surfaces migrated to Gem/status icons, exact counts, and
  `Progress` (no specimen below 40 px; `SectionCrystalStrip` deleted);
  `TrailCluster.sectionPositionIndex` copied from the expedition step (neutral ordering metadata).
  **(U2)** Pure `crystalFormationLayout.ts`: per-Leg Sphere Grid over trusted same-Leg edges only,
  four structural states (`bound`/`crowned` ONLY from durable `wonChallengeId`), irregular matrix +
  seam containing every slot, flagged-Leg vein omission, alternating non-overlapping ascent +
  nonsemantic winding spine + terminus, 40-px floor with horizontal overflow; per-Leg zero-crossing
  regression locked over the 59-node real-shape fixture (17 Legs). **(U3)** Shared
  `LegFormationScene` (overview/collection/binding modes, one-shot event-keyed rise, reduced motion
  = immediate final state); ActivitySheet capstone renders the focused shared Leg crop with one
  mount-scoped mastery haptic. **(U4)** `CrystalFormationScene` + rebuilt `CrystalVista` (explicit
  open/focus intent consumed on close, `leg:<sectionIndex>`/`summit` seen-snapshot navigation
  memory with native/web parity, memory doors + 44 px targets); legacy `crystalVistaView`,
  `crystalGeometry`, `CrystalGlyph`, fusion auras/sockets, and the floating keystone deleted.
  **(U5)** GuardianFight renders the pending keyed reveal ahead of the committed `won` view and
  hands a mount-local transition token through `See your formation`; `GuardianReward` classifies
  first/rematch only from the refreshed scope's durable `wonChallengeId`, plays binding/crown once
  with one first-win-only fusion/unlock haptic, keeps direct/refreshed wins static, preserves
  victory + Continue through preview loading/error/inconsistent, and Explore replaces with explicit
  Vista focus; Guardian entry closes the Activity Sheet only after success. **(U6)** Full
  production-web Playwright exercise (13 scenarios × phone/desktop, normal + reduced motion) found
  and fixed two in-gate defects: reduced motion still ran the reward sweep/binding overlay
  (R20 violation), and the one-time Vista contextualization banner auto-scrolled out of view (now
  pinned below the header). Evidence + evaluation notes under
  `tmp/2026-07-15-crystal-formation-reward-ux/` (milestone-a/b/c + `u6-final/EVALUATION.md`).

- **Durable Learner E2E Gates shipped (2026-07-15, plan 2026-07-15-001; plan DELETED).** Three
  learner test layers with three distinct claims now exist, folded into
  [ADR-0038](../adr/0038-native-interaction-gate-scope-and-physical-authority.md). **(U1)**
  `@lrnki/infrastructure-postgres` test support covers the whole learner FK graph of the current
  migration (drift-fixed `recall_challenges`/`learner_sessions`) and adds guarded exact-name teardown
  (`cleanupReservedLearners`/`reservedLearnerRefs`, pre-SQL rejection of empty/duplicate/malformed/
  non-reserved/wildcard input) behind a new `./test-support` subpath; the intercepted static server
  was parameterized so both web suites share it, and the duplicate `serve.mjs`/`cleanup-learner.sh`
  were deleted. **(U2–U3)** One opt-in `pnpm e2e:web:realuse` command owns the full lifecycle
  (supervisor-free loopback API composing the real Hono app with no generation supervisors, `.env`
  load, run-id + ephemeral PIN, free-port checks, production Expo export baked against the real
  origin, shared static server, capability preflight over `/catalog`, Playwright, and `finally`
  cleanup + `--cleanup-run=<id>` retry) with a secret-stripped per-child env; the four U6 scenario
  specs collapsed into one project-parameterized phone+desktop integration journey with three
  content-neutral testID seams. **(U4)** Real-use quality gate passed on two mixed-domain enrichments
  with H1 domain-neutrality confirmed and fail-closed empty-catalog behavior verified. **(U5)** A
  portable `pnpm e2e:native:maestro` gate drives the real standalone e2e-profile APK on an Android
  emulator against a deterministic `10.0.2.2` loopback fixture; a canonical dynamic `app.config.ts`
  (static `app.json` deleted) adds an `LRNKI_E2E_BUILD`-gated `expo-build-properties` cleartext seam
  enabled only in the disposable `e2e` profile. **(U6)** Negative-control sensitivity: the Support
  Path dialog scenario is **ADOPTED** (its geometry mutant fails deterministically 3/3), the Theory
  touch-responder scenario is **REJECTED** as automatic authority (emulator-flaky, stays physically
  owned); EAS Workflows **deferred** (alpha, consumes a build-id not the local APK, hosted cost).
  Evidence and evaluations under `tmp/2026-07-15-durable-learner-e2e-gates/` (`web/EVALUATION.md`,
  `native/EVALUATION.md`, `native/u6-run-log.md`).

- **Learner Runtime Reliability Fix shipped (2026-07-14→15, plan 2026-07-14-001; plan DELETED;
  Android blocker CLEARED).** Learner entry, asynchronous route states, Android Theory scrolling,
  Support Path dialog geometry, and the web planning-sheet layer are now reliable on their real
  runtimes, proven by both an automatic production-web gate and the user-owned physical-Android
  preview-APK pass. U1 made the `me` query the sole session truth with one `["learner", …]` cache
  prefix and atomic session replacement (`hasToken`, `LearnerNameGate.onEntered`, and
  `queryClient.clear()` deleted); U2 added the app-owned `RouteStatus` surface so bootstrap and
  every query-driven route renders explicit loading/error/unavailable states with recovery actions;
  U4 portals the web `BottomSheet` through the root `PortalHost` so the vaul scrim out-ranks every
  journal stacking context (native sheet untouched); U5 checked the intercepted `@playwright/test`
  production-export suite into `pnpm check` (phone + desktop Chromium). U3 plus the device loop
  fixed **two distinct Android-only overlay defect classes** on the same surfaces: (1) Yoga
  *grow-from-zero* collapse — one window-derived NUMERIC px dialog cap, shrink-from-natural
  `DialogBody`/entrance, and a bounded native flex chain in `FullScreenDialog`; and (2) found by
  the first failed APK pass, the `@rn-primitives/dialog` native **touch-responder claim**
  (`Content` hardwires `onStartShouldSetResponder → true` and `Overlay` is a Pressable, so a JS
  ancestor claimed drags before the activity ScrollView could scroll) — overridden in the
  app-owned `FullScreenDialog` native branch only (Overlay `disabled` + `onStartShouldSetResponder`
  `={undefined}` via the primitive's own props-spread; jest responder-contract lock; the centered
  `Dialog` deliberately keeps its claim to shield `closeOnPress` — a deepest-claim wrapper inside
  `DialogBody` is the designed fix if a long body ever proves scroll-dead on device). Also fixed en
  route: any `.test.tsx` under `src/app/` is globbed as an Expo Router route and breaks native
  Android bundling (`require("console")`), so the U2 route test moved to
  `src/components/IndexRoute.test.tsx`. Neither defect class is observable by web gates (the web
  build is the responderless Radix path) or jest (classes inert, no real gestures) — the durable
  answer is the native interaction gate
  ([ADR-0038](../adr/0038-native-interaction-gate-scope-and-physical-authority.md)).
  Commits `d0e8928`/`0b1c9d3`/`9c2e44f`/`623a53d`/`ddc0ec9`. Both U6 gates PASS (see VALIDATION);
  evidence `tmp/2026-07-14-learner-runtime-reliability/`.

- **Crystal Guardian Challenges shipped (2026-07-14, plan 2026-07-13-003; plan + accepted
  brainstorm DELETED).** A Leg and the whole Topic Expedition now culminate in a durable,
  mastery-aligned **Recall Challenge** — the **Crystal Guardian** (Leg) and **Expedition Guardian**
  (summit) duel — that proves passed crystals can be recalled together without ever turning a miss
  into lost Concept Mastery or a blocked next stop. One neutrally named application deep module
  (`recallChallenge.ts`) owns coverage-first lineup selection (KTD5: anchor reservation, distinct
  concepts / Legs before repeats, least-exposure + FNV tie-break, 5/7 maxima, empty = unavailable),
  the combat fold (KTD6: 3-segment shield, queue-ward rotation, Last Stand restore-exactly-one,
  one-miss-per-dirty-Matching-round with `roundIndex` reshuffle + mid-board resume, out-of-turn
  rejection), neutral passed-item eligibility (`eligibleRecallItems`/`latestCorrectStudyItemIds`
  folding only `neutralResponses`), and a key-free `RecallChallengeView`. Three new tables
  (`recall_challenges` one-active-per-scope, immutable `recall_challenge_lineup` FK'd to
  `study_items`, `recall_challenge_events` with per-kind CHECK shapes + idempotency uniques) in the
  single migration; a row-locked `appendEvent` (expectedSeq → appended/duplicate/stale/conflict).
  The `createRecallChallenge` factory exposes typed `/challenge/*` routes; the server-owned
  `recallScopes` projection rides the Study Session (`buildTrailView` attaches
  `TrailSectionView.recallScope` + `TrailView.enrichmentScope` from the SAME pure functions the
  challenge module uses, so `/challenge/scopes` and `/expedition/:id` are byte-identical). The
  Learner App gained a full-screen Guardian fight surface (`app/guardian/[challengeId].tsx`,
  `GuardianFight`, `CrystalGuardian`) and trail/summit integration (`GuardianTrailNode`,
  `GuardianArrivalDialog`, keystone terminus). **U7 removed Crystal Duel entirely** (module +
  screen + components + machine + `duel_win` award + `duelWins` badge + splash/vocabulary/navMemory);
  weekly podium + rival simulation intact. Durable decisions folded into
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md) (amended) and a
  new **Recall Challenge** term in [CONTEXT.md](../../CONTEXT.md). Two rule-14 gates PASS (Gate A
  U1–U4 durable contract 2026-07-13; Gate B U5–U7 live browser 2026-07-14 — see VALIDATION). The
  native device acceptance rides the shared Android blocker of the native-parity plan, not a
  Guardian-specific one; web correctness is this scope's completion bar. Support Path inclusion in
  Guardian selection is deferred (R16 — see the evidence-triggered follow-up).

- **Learner scaffolding, Support Path UX, journal, and deep generation modules (2026-07-12→13,
  plans 2026-07-12-001/002 and 2026-07-13-001/002; all DELETED).** A learner can turn an unfamiliar
  Explorable Term into a durable one-level Scaffold Detour of one-to-three Support Steps without
  mutating neutral assets ([ADR-0037](../adr/0037-persist-learner-scoped-scaffold-detours.md) new;
  [ADR-0026](../adr/0026-typed-study-item-bank.md)/[ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md)
  amended); the Study Session projection became the single trail and term-support authority
  (client `trailView`/`activityProgress` deleted), and detours render as first-occurrence theory
  highlights, one state-aware `SupportPathDialog`, per-detour `SupportPathNode` branches, and a
  full-screen `SupportPathSheet` (Explorable Term cap five; the U6 gate found and fixed the web
  dialog percentage-cap clip via an 85vh inline cap in `ui/overlays.tsx`). The Expedition Journal
  became one finished `@lrnki/application` projection (`expeditionJournal.ts`) with a
  status-discriminated wire union, thin `/journal`/`/catalog` routes, app types inferred from the
  hono `AppType`, and the full 14-stage progress denominator. Topic Expedition generation became
  one deep process-lived `createTopicExpeditionGeneration` factory (architecture review Candidate 3;
  claim-fencing/readiness/failure classification unchanged, dependency-union interface and public
  error exports deleted), lazily cached in the learner-api composition root. All rule-14 gates PASS
  (incl. the fixed `microLesson` `.max(600)`→`.max(1200)` clipping defect); evidence
  `tmp/2026-07-12-scaffold-detours/`, `tmp/2026-07-12-expedition-journal-projection/`,
  `tmp/2026-07-13-learner-support-path-ux/`, `tmp/2026-07-13-topic-expedition-generation-module/`.

- **MiMo cutover, derived-layer completion module, and the learner interaction system
  (2026-07-10→11, plans 2026-07-10-001/002/003/004 and 2026-07-11-001; all DELETED).** Production
  extraction moved to `openrouter/xiaomi/mimo-v2.5` (DeepSeek fully retired; flat impostor wire
  schema + config-parsed trailing-nullable congruence test locking the two MiMo tool-decoder defect
  shapes; durable `kg-worker audit-discovery-coverage` command found zero confirmed principal-miss
  domains so discovery tuning was skipped; BYOK `estimatedSpend` restored in the
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md) read path). Both derived-layer
  producers' back halves consolidated into one internal `completeDerivedGraphLayer` module with
  byte-stable config identities and fail-closed structural lifecycle validation. The Learner App
  hard-cut to one app-owned NativeWind component system with the overlay/motion/haptics contract and
  reduced-motion policy, plus the advance-visible goal hierarchy (layer-purpose descriptor row,
  summit header/banners/terminus) and constructive Crystal Vista
  ([ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md)/[ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md)
  amended). All rule-14 gates PASS; evidence under `tmp/2026-07-10-*/` and `tmp/2026-07-11-*/`.

- **Learner platform foundations: study experience, durability, operations, registry, and the
  separated deployed Learner App (2026-07-02→10).** The Study Session projection became layer-wide
  and sectioned with a derived summit and the single completion rule
  ([CONTEXT.md](../../CONTEXT.md)); Concept Lessons, sparse Study Item Blueprints, the comparative
  banded intrinsic-difficulty prior, and the calibrated Knowledge-Boundary Probe shipped
  ([ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md),
  [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0030](../adr/0030-confidence-gated-synthesis-with-web-grounding.md),
  [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md)). Topic-expedition generation became
  a durable claimed/fenced supervised row ([ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md));
  Neural Stage Descriptors with mechanical config hashes replaced adapter classes
  ([ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md)); the journey-first
  Operations page and Cost & timings surface shipped; free-text identity became the `learners`
  registry with PIN gate, weekly cohort leaderboard, and (since superseded) Crystal Duel. The
  learner surface then split into the deployed `apps/learner-api` + universal Expo `apps/learner-app`
  (GitHub Pages web, Caddy TLS API, Admin Lab learner routes deleted;
  [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md),
  [ADR-0036](../adr/0036-run-single-shared-learner-environment-during-testing.md); runbook in the
  [README](../../README.md#deployment)). Rule-14 gates PASS per change; evidence under
  `tmp/2026-07-02-*/` … `tmp/2026-07-09-*/`.

## VALIDATION

- **Treasure-map trail restyle — U4 full gate (deterministic + real-use web + native), 2026-07-19.
  ALL PASS.** Deterministic envelope green: `pnpm check` typecheck
  clean, learner-app jest 52 suites / **242** (one `LearnerMenuSheet` D7 `requestAnimationFrame`
  flake — unrelated to this change — green on isolated + full re-run), lint 0 errors / 8
  pre-existing warnings, admin-lab + learner-app web builds OK, intercepted `pnpm e2e:web`
  **48/48**. Rule-14 real-use gate: a production Expo web export baked to a supervisor-free
  learner-api over the real development Postgres (nothing intercepted), driven in Chromium at phone
  390×844, desktop 1280×800, reduced motion, and 200% page zoom on two real production-generated
  expeditions — long `87c2e793…` (Biology, 19 concepts / 8 Legs / 39 items, driven to 2 completed
  Leg-1 stops) and short `a320cb5b…` (CS, 6 concepts / 1 Leg). Human screenshot judgment confirmed:
  one parchment map artifact with `<Pattern>` grain + weathered edge; the seeded route through every
  measured checkpoint with solid `map-ink` behind the learner and `map-ink-soft` dashes splitting at
  the first incomplete stop; double-rule display-font Leg cartouches; uncharted `map-parchment-deep`
  bands with faded lock circles for deeper locked legs; the single terminus X+peak cartouche;
  margin-only nonsemantic doodles; no horizontal overflow at any condition incl. 200%; gold reserved
  to earned rewards (teal gem on completed stops). **Zero unexpected console/page errors** across all
  captures; the disposable reserved learner was FK-safely deleted each run. The required
  `pnpm e2e:native:maestro` + emulator trail parity screenshot could NOT run — this environment has
  no Android SDK/emulator/adb/Maestro — and is tracked in BLOCKERS.md; the change is parity-safe by
  construction (no SVG filters, `<Pattern>` grain, literal color tokens, no forked styling or
  interaction/testID change). **Native regression PASS (emulator `Medium_Phone_API_36.1`, Android
  36.1/arm64, Maestro 2.6.1, JDK 17):** a fresh e2e-profile APK built from the post-restyle tree
  (`scripts/build-learner-android.sh e2e`, commit `ac082d9`, `LRNKI_E2E_BUILD=1`) ran
  `pnpm e2e:native:maestro` → **1/1 Flow Passed (44s)** through the restyled map trail (name gate →
  Explore/Catalog → Field-notes Theory checkpoint → long-Theory device scroll → ADOPTED Support Path
  dialog geometry gate → menu → board content), no app ANR. Emulator trail parity screenshots
  (`native/emulator-trail-{top,mid,deep}.png`) confirm the two historically Android-divergent
  react-native-svg features render: the `<Pattern>` grain fills paint across the parchment ground,
  and the bundled IM Fell English display font renders on the Leg cartouches — plus route-through-
  centers, all-dashed ahead-of-progress split, ink-ring circles, orange next-stop halo, teal peak
  terminus, uncharted `map-parchment-deep` locked bands, margin-only doodle, no gold, no horizontal
  overflow. Web/native visual parity of ground, route, and markers confirmed. Evidence + reproducible
  harness: `tmp/2026-07-18-treasure-map-trail/EVALUATION.md`.

- **Topic Expedition speed + factuality final gate, 2026-07-19. PASS.** The live learner-api
  supervisor generated the baseline topic “Cellular Respiration” as operation `97ddffe4…` in
  **183.886s** request-to-ready: enrichment **128.999s**, Study Item generation **54.754s**, all 20
  durable stage brackets `ok:true`. Claim planning / draft-blind answering / exact-span review took
  **18.101s / 9.510s / 5.524s** for 16 concepts; ordering **47.688s** overlapped difficulty
  **53.810s**. Journey attribution: 392 calls, 707,988 tokens, **$0.1450095** total
  (**+$0.0799616** versus baseline; extra factuality stages explain the delta). Human inspection
  confirmed separate correct Anaerobic Respiration and Fermentation definitions, a modern 30–32 Net
  ATP estimate, adjacency-safe lesson applications, coherent committed DAG paths, and useful
  examples of all three Study Item families; 27 items admitted and 21 rejected explicitly. Final
  real-use quality **PASS**. `pnpm check` exits 0 (workspace suites/typechecks, lint 0 errors,
  production builds, web E2E **48/48**); isolated `pnpm test:db` reset/migrated only `lrnki_test` and
  exits 0. Evidence: `tmp/2026-07-18-expedition-speedup/EVALUATION.md`.

- **Speed Up Topic Expedition Generation — U1 provider-lock experiment + live alias gate,
  2026-07-18. PASS.** Baseline operation `9b67cd64…` supplied the full persisted 15-node Cellular
  Respiration/Biology ordering fixture. Both price-locked candidates were probed with a live forced
  named tool before representative spend: Groq passed; Baseten returned OpenRouter 404 “No
  endpoints found that support the provided `tool_choice` value” despite endpoint metadata
  advertising support, so ADR-0006 correctly disqualified it. Groq's direct representative draw
  completed in **6.944s**, returned 31 parsed edges, and cost **$0.0026412** (5,420 input / 3,047
  output). After the single-host/no-fallback lock and proxy restart, the production
  `kg-prerequisite-ordering` alias reported provider **Groq**, completed the same draw in **8.147s**,
  returned a parsed 28-edge forced call, and its durable LiteLLM spend row recorded **8.100s / 5,420
  input / 3,680 output / $0.003021**. Human inspection found a coherent acyclic draw: Glycolysis →
  Pyruvate oxidation → Acetyl-CoA → Citric acid cycle; NADH and FADH₂ → Electron transport chain →
  Proton-motive force → Chemiosmosis/ATP synthase → Oxidative phosphorylation; mitochondrial
  compartments precede the compartment-dependent mechanisms. This is a stochastic single draw,
  not a published DAG—the unchanged K=8 consensus remains the quality authority. The proxy is
  healthy; infrastructure-LiteLLM **155/155** passed. Evidence:
  `tmp/2026-07-18-gptoss-provider-lock/EVALUATION.md`.

- **Topic-generation claim reliability — isolated DB + real-use gate, 2026-07-18. PASS.** Focused
  lifecycle **13/13** and learner-api **20/20** green; guarded `pnpm test:db` reset/migrated only
  `lrnki_test` and all workspace suites passed while the live `lrnki` expedition queue stayed
  unchanged and the deployed API logged no claim loss. Repository-wide `pnpm typecheck`,
  `pnpm lint`, and `pnpm build` passed. A fresh production-model “Binary search invariants” run
  lasted beyond the two-minute stale window with a fresh heartbeat, retained one claim/enrichment
  UUID, completed in one attempt, and published 6 concepts, 5 certain edges, 6 lessons, and 10 study
  items. The disposable learner was removed. Human inspection found a coherent, useful trail and
  one pre-existing content caveat: sorted input appeared in an example but not as its own
  prerequisite. No fixture-specific tuning was introduced. Evidence:
  `tmp/2026-07-18-topic-claim-fix/EVALUATION.md`.

- **Dead module cleanup — deterministic envelope + explorer smoke, 2026-07-17. PASS.** Full
  envelope on the post-deletion tree: `pnpm typecheck` all 11 remaining projects clean (proves
  nothing imported the deleted symbols); full `pnpm test` green — application **677/677** (down
  from 694 by exactly the deleted `targetCandidates`/`calibrationList` suites and the per-Leg
  sphere-grid block), learner-app 51 suites / 232, all other packages green with rdf-export gone;
  `pnpm lint` 0 errors / 8 pre-existing warnings; `pnpm build` (admin-lab Next + learner-app web
  export) OK; intercepted `pnpm e2e:web` **48/48**. Manual Admin Lab smoke (headless Chromium
  against the dev server + real Postgres): the derived-graph explorer rendered sphere-grid
  positions (right-angle tracks, one dashed domain region, zero crossings) on an existing
  3-concept enrichment, and a Nodes-and-edges row click recentered the viewport with the drawer
  closing and **zero console/page errors**; the flagged-loop banner path is code-untouched and
  stays locked by the surviving whole-enrichment regression. **No rule-14 LLM gate applies**: a
  zero-consumer deletion is not a behavior-changing milestone — no model call, no projection
  change, no persisted shape change (per the plan's validation bar). Dev server stopped;
  no database change.

- **Deep Scaffold Generation — U6 database/real-use/browser/cleanup gate, 2026-07-17. PASS.** U6 is
  a verification-only gate (zero source changes; working tree clean). **Deterministic envelope** on a
  hard-reset, freshly migrated database with `.env` loaded: `pnpm typecheck` all 12 projects clean;
  full `pnpm test` green — domain-core 39, infrastructure-postgres 94, application **694**,
  infrastructure-litellm 155, kg-worker 8, admin-lab 62, learner-api 18, learner-app 51 suites /
  **232**, ingestion 10, rdf-export 2; `pnpm lint` 0 errors / 8 pre-existing warnings; `pnpm build`
  (admin-lab Next + learner-app web export) OK; intercepted `pnpm e2e:web` **48/48**.
  **Real-use generation gate** (production LiteLLM + Postgres, learner-api `:8899`): two fresh
  mixed-domain synthetic expeditions generated end to end — Cellular respiration / Biology
  (`0af38412…`, 14 concepts) and Digital signal filtering / DSP (`7024fba3…`, 20 concepts). Four
  BIO detours driven over the real HTTP `/scaffold/request` path exercised the required cases live:
  a **frontier reference → `checkpoint`** (`electron carriers` → NADH node, destination captured
  pre-supersession), three **generated** detours, and a live **locked collision** (`oxidative
  phosphorylation` matched a locked node → NOT referenced, NOT cloned → two distinct simpler
  prerequisites *Phosphorylation* + *Oxidation-reduction (redox) reactions* generated instead — the
  live collision case U4 lacked). Human inspection: all generated micro-lessons are plain-prose,
  child-specific, conceptually correct, with key-free four-option items; the whole projection scanned
  **0 answer-key leaks**. Standing `kg-worker audit-scaffold-content` (K=3) independently scored
  **6/6 steps teaches=true simpler=true, artifact-steps=0, congruence-recurring=0**. **Closed
  attribution (KTD7 live)**: all 4 scaffold ops carry `learner-scaffold-generation-19f397f70cd0`,
  **0** null `config_hash`, and the checkpoint-reference op recorded the hash while opening **0** LLM
  stages. **Durability/browser gate** (production Expo web export baked against `:8899`, served on
  the CORS-allowed `localhost:8081`, real Chromium, no interception): logged in as a disposable
  learner, opened the real trail (all four support-path nodes present), and proved end-to-end with
  **zero console/page errors** across desktop 1280×800, phone 390×844, and reduced motion — (a) a
  **generated Support Step** played read→answer→grade→continue with the "Extra support" badge, and
  its DB response is **scaffold-scoped** (`scaffold_step_id` set, item/node NULL); (b) after a real
  `kg-worker generate-study-items` regenerated the whole BIO bank (14 lessons / 31 items;
  supersede-and-insert confirmed: NADH node = 1 current + 1 superseded lesson), the `electron
  carriers` reference **flipped to `support_activity`** and replayed the **pinned (superseded)**
  neutral NADH lesson + key-free option-select in place with the "From your map" note and no
  generated badge; its grading appended ordinary **neutral** evidence keyed to the NADH
  `derived_node_id` + the **superseded** pinned `study_item_id` (`scaffold_step_id` NULL) — the exact
  KTD3 pinned-fallback + neutral-identity contract, live. Honest caveats: the live in-app
  `support-path-reference-go` checkpoint *route* was not clicked because the sole checkpoint
  reference was intentionally superseded into `support_activity` during the regeneration scenario —
  checkpoint routing stays proven by the pre-regen projection (`destination.kind=checkpoint`) + the
  `SupportPathSheet` jest suite; the `support_activity` **re-locked** trigger and hide/restore share
  the same render/route paths and stay proven by jest + U2 data-level; live boundary-omission and
  transient/deterministic failure did not occur this run and remain covered by the 694-test
  application factory suite (as in U4). Disposable learner + leftover test-fixture enrichments
  cleaned FK-safely; local servers stopped. Evidence + screenshots:
  `tmp/2026-07-16-deep-scaffold-generation/EVALUATION.md` (U6 section) and `u6/`.

- **Deep Scaffold Generation — U4 deep-module behavior + real-use quality gate, 2026-07-17. PASS.**
  Two fresh mixed-domain synthetic expeditions were generated end to end by the real supervisors on
  `:8899` against production LiteLLM + Postgres (TCP congestion control / Networking,
  `0948bb4a…`, 15 concepts; Enzyme kinetics / Biochemistry, `d7a7eb63…`, 16 concepts), then 12
  detours were driven over the real HTTP `/scaffold/request` path — every one reached `ready` with
  zero failures. **Exact reuse proved across all three inclusion states**: included-frontier (Fast
  Recovery, Michaelis constant (Km)) AND the new confidently-floored capability (slow start,
  maximum reaction velocity (Vmax), sawtooth→cwnd) each pinned a reference whose lesson/item FKs
  resolve to a CURRENT `concept_lessons` row and an `option_select` `study_items` row with no copied
  payload. **13 generated Support Steps** across 7 detours were human-inspected and are genuinely
  simpler, child-specific (each teaches its own prerequisite, not the parent term), coherent,
  plain-prose (no markdown artifacts), with numerically-correct recall items (e.g. RTT 150 ms; pKa
  4.2 at pH 7.0 → deprotonated). The standing `kg-worker audit-scaffold-content` instrument (K=1)
  independently scored **all 13 teaches=true simpler=true, 0 artifact-steps, 0 congruence-recurring**
  (artifacts under `tmp/2026-07-16-deep-scaffold-generation/u4-realuse/`). **Closed attribution
  (KTD7 live)**: all 12 scaffold operations carry the current hash
  `learner-scaffold-generation-19f397f70cd0` (the `outlineAttempts: 2` bump), 0 scaffold rows have
  a null `config_hash`, and direct-reference reuse ops record the hash while opening zero LLM
  stages. Deterministic envelope: `packages/application` 694/694 (rewritten
  `learnerScaffoldGeneration.test.ts` — 20 factory-callable tests incl. removed-export barrel
  assertion), `infrastructure-litellm` + `learner-api` green (1 opt-in DB skip); workspace typecheck
  all 12 projects; lint 0 errors / 8 pre-existing warnings. Disposable learner removed FK-safely;
  server stopped. U4 is UNCOMMITTED. Evidence:
  `tmp/2026-07-16-deep-scaffold-generation/EVALUATION.md` (U4 section).

- **Deep Scaffold Generation — U3 closed-registry/attribution gate, 2026-07-17. PASS.** Hard-reset
  the development database with repo-root `.env` loaded and applied the amended single migration
  (`operation_runs.config_hash` + scaffold CHECK) cleanly. Registry↔catalog LLM stage sets proved
  union-equal for every timeline operation type with shared stages owned by exactly
  {enrichment, scaffold}; the scaffold entry carries outline/probe/grounding/content/congruence
  exactly once; every scaffold knob (incl. the nested probe config), the embedding model, and each
  descriptor perturb the operation hash while the locked graph-enrichment/synthetic identities
  stayed byte-stable (`graph-enrichment-1886ba82e2e5`, `synthetic-topic-generation-978cefbca6ed`).
  Against real Postgres: a scaffold begin without a hash is rejected by the CHECK with zero rows; a
  no-stage direct-reference attempt records its hash and succeeds; separate attempts keep their own
  hashes and a racing re-begin cannot overwrite one; the hash rides both timeline reads;
  non-scaffold rows stay null. Full workspace suite green after the reset: domain-core 39,
  infrastructure-postgres **94/94** (3 new), application **688/688** (new `runInstrumentedOperation`
  config-hash pass-through), infrastructure-litellm **155/155** (rewritten registry suite + derived
  MiMo inventory), learner-api 18, admin-lab 62, learner-app 230 (one transient recursive-run jest
  flake re-ran green); workspace typecheck all projects; lint 0 errors / 8 pre-existing warnings.
  No model call applies to this deterministic registry/attribution milestone; the mandatory
  real-use gate lands with U4's behavior milestone.

- **Deep Scaffold Generation — U2 finished-reference projection/grading gate, 2026-07-16. PASS.**
  One serialized mixed Study Session proved a current playable reference resolves to its exact first
  incomplete checkpoint while confidently floored and superseded references carry pinned key-free
  lesson/option-select activities. Pinned latest-correct completed the Support Step; a later pinned
  incorrect reopened it; a replacement-current correct response did not complete the pin. Reference
  grading appended ordinary neutral `(study_item_id, derived_node_id)` evidence and rejected foreign,
  generated/non-reference, malformed, and invalid requests. No `isCorrect` or pinned lesson identity
  serialized. Application **687/687**, learner-api **17 pass / 1 unrelated opt-in DB skip**, focused
  Learner App **9/9**, real Postgres pinned-reference suite with `.env` **8/8**, workspace typecheck
  pass, lint **0 errors / 8 pre-existing warnings**. Real-use quality **PASS**; no model call applies
  to this deterministic projection/grading milestone. Evidence:
  `tmp/2026-07-16-deep-scaffold-generation/EVALUATION.md`.

- **Deep Scaffold Generation — U1 persistence gate, 2026-07-16. PASS.** Hard-reset the development
  database with repo-root `.env` loaded and applied the single initial migration cleanly. Stable
  application-minted Concept Lesson ids now supersede instead of delete; ordinary reads return only
  current rows, while the learner-scoped reference adapter replays exact pinned lesson +
  option-select content after both asset families regenerate. Composite foreign keys and the
  fenced publisher reject incomplete/mixed, non-option-select, cross-node, cross-layer, and
  cross-domain references; scaffold rows carry no copied neutral payload. Direct claim is deleted;
  stale release/fail/publish fences cannot affect a new attempt. Final envelope: domain-core 39/39,
  application 680/680, infrastructure-postgres 91/91 (two consecutive final full-package passes),
  workspace typecheck 12/12, lint 0 errors / 8 pre-existing warnings. The test-support global-count
  assertion was made concurrency-safe by checking preservation of snapshotted shared identities.

- **Learner UX polish — U6 rule-14 gate, 2026-07-16. PASS.** Two evidence layers over the shipped
  U1–U5 plus the in-gate `useIsFocused` fix. **Web (real learner-api + Postgres, no interception):**
  an existing production expedition driven server-graded at phone 390×844, desktop 1280×800,
  reduced motion, and Chromium 200% page scale — the dashed sine wave passes through every
  checkpoint circle with zero horizontal overflow across the full scrolled trail, uncollected
  specimens legible beside the 2 px icon strokes, the whole gold seal in both first-win and rematch
  reward cards, reward actions immediately usable after first-win AND rematch, and no reward replay
  after a full reload. The gate itself caught a real defect (post-win session refetch on the
  still-mounted trail popped the next Leg's arrival over the reward) — fixed with `useIsFocused()`
  gating in `CheckpointPath`, regression proven red-without/green-with, full web gate re-run PASS.
  **Android (ADR-0038 authority):** `pnpm e2e:native:maestro` against a FRESH e2e APK built from
  the post-fix tree, emulator `Medium_Phone_API_36.1` — first run failed on a transient SystemUI
  ANR over a correctly-rendered name gate (host flake, not app; cleared and confirmed by
  `dumpsys window lastanr`), re-run **PASS 1m 2s** through name gate → Explore/Catalog → Theory →
  Support Path dialog (ADOPTED geometry gate) → Menu → board-content (D8d). U5's session-3
  screenshots remain the scrim/board visual evidence. **Envelope:** `CheckpointPath.test.tsx` 3/3
  incl. the focus regression; full learner-app jest 51 suites / 230 tests, typecheck, lint clean
  (prior session, tree unchanged since). Gate cleanup: 9 `*-u6gate`/`uxgate-u6-probe` learners
  deleted FK-safely in one transaction (only pre-existing `Content Owner` remains); enrichments
  retained. Evidence: `tmp/2026-07-16-learner-ux-polish/EVALUATION.md` (+ `u6-web/`, `u6-android/`,
  `u5-android/`).

- **Crystal Formation Minimal Redesign — U5 real-use gate, 2026-07-16.** Initial production-export
  screenshots were `FIX_FIRST`: Future islands' opaque gray fill overwhelmed the quiet state
  hierarchy, and the decorative ascent spine visibly crossed multiple header labels. Added
  proof-first component contracts, then fixed the root paint-order/state-surface issues with one
  background-token SVG mask per reserved header and a quiet-background Future island. Final review
  then found the 280 px Guardian reward floor could overflow a 320 px viewport after its 56 px
  container padding; a red sizing contract led to the shared 140 px formation minimum, and the
  production browser now asserts zero overflow at 320×568. Focused tests pass; the regenerated
  phone/desktop screenshots are clean; Crystal Formation production-export Playwright is **32/32
  PASS** with zero unexpected runtime errors. Real-backend gate: existing
  production-generated “Fourier transform” (Signal Processing) expedition, 13 concepts / 18 current
  Study Items / 9 Legs; real learner API + Postgres, no interception, one real won Recall Challenge.
  Phone 390×844, desktop 1280×800, reduced-motion, and Chromium 200% page scale all PASS: Bound /
  Guardian-ready / Collecting / Future states, available→engaged copy, real lesson memory door,
  first-open-only contextualization, 9 masks + 9 spine segments, specimen sizes 64–80 px, 0
  horizontal overflow, and gold only in the earned Bound Leg. Full learner Jest 51 suites / 226
  tests; workspace typecheck all 12 projects; lint 0 errors / 8 pre-existing warnings. Disposable
  learner removed by exact-name cleanup; local servers stopped. Real-use quality **PASS**. Evidence:
  `tmp/2026-07-16-crystal-formation-minimal-redesign/EVALUATION.md`.

- **Scaffold Content Quality Audit — U5 fresh-generation gate, 2026-07-16.** Working-tree
  learner-api (`:8899`, both supervisors, production LiteLLM) generated three mixed-domain synthetic
  expeditions distinct from prior gates (Options/Greeks → Financial Engineering, Adaptive immune
  response → Immunology, Fourier transforms → Signal Processing; rule 17). Detours driven over HTTP
  through the real learner-api path so audited steps are what a learner would generate.
  **Pre-fix sweep (15 detours / 27 generated steps):** 1 formatting artifact (raw Markdown italic
  `*when*`) + 3 recurring (≥2/3 NO) congruence mismatches — **all confirmed genuine by human
  inspection of the actual persisted content**, spanning three distinct sub-modes (content-drift
  "Option pricing basics"→taught Vega itself; outline-synonym "Somatic recombination
  mechanism"≈V(D)J recombination; question-drift "Expected value…"→tested risk-neutral). Both KTD4
  triggers fired → both fixes applied. **Post-fix re-sweep (12 fresh detours on unused terms / 23
  generated steps, pre-fix steps deleted first):** **0 formatting artifacts, 0 recurring congruence
  problems** across both enrichments. The re-pick provably executed — `operation_run_stages` recorded
  **25 `scaffold-content-congruence`** runs over the 23 accepted steps (every draft judged + ~2
  retries after a NO), and **0/12 detours were starved**. Honest caveat: the post-fix sweep uses
  different terms than the baseline, so it verifies non-recurrence over fresh generation (ADR-0028),
  not a controlled A/B. Deterministic envelope: typecheck all 12 projects Done; application 680
  (+3 congruence-re-pick tests), infrastructure-litellm/learner-api/kg-worker green; lint 0 errors.
  Real-use quality gate **PASS**. Disposable learner + gate state removed; server stopped. Evidence
  and evaluation note: `tmp/2026-07-16-scaffold-content-audit/EVALUATION.md`.

- **Crystal Formation Reward UX — U6 production-web gate, 2026-07-15.** `pnpm e2e:web` over the
  fresh production Expo static export with the typed API intercepted by production-shaped
  domain-neutral fixtures: **46/46 PASS** (13 crystal-formation scenarios × Pixel-7-phone +
  1280×800 desktop, plus the shared runtime suite), zero unexpected page/console errors. Scenario
  coverage: honest compact progress with known ground; mastery collection + settled reopen;
  Guardian-ready available/engaged/zero-eligible copy; keyed final reveal preceding the first Leg
  binding reward and Explore landing on `?vista=1&formationFocus=leg:1`; Leg rematch endurance;
  four-state multi-Leg Vista with memory door; first summit crown; summit rematch (crown stays
  seated, no first-reward panel); preview refetch failure preserving victory/Retry/Continue;
  reduced-motion equivalents for collection, binding, crown, and Vista contextualization. Screenshot
  inspection at both viewports judged Leg boundaries, states, spine-vs-vein distinction, mineral
  habits, and the crown identifiable from stills (AE12) and caught one defect semantic assertions
  could not (the contextualization banner scrolling out of view); the reduced-motion spec design
  caught the second (reward sweep/binding overlay animating under reduced motion). Both fixed and
  re-proven in the same gate; real-use quality evaluation **PASS**. No API/schema/persistence/LLM
  change; jest (application 670-suite + full learner-app) and learner typecheck green. Evidence:
  `tmp/2026-07-15-crystal-formation-reward-ux/u6-final/EVALUATION.md`.

- **Durable Learner E2E Gates — native-gate sensitivity (U6), 2026-07-15.** Emulator
  `Medium_Phone_API_36.1` (Android 36.1/arm64), Maestro 2.6.1, one checked-in flow/fixture/selectors
  throughout; negative controls applied one at a time in a throwaway worktree at `a0e4f08` (main
  worktree never mutated). **Support Path dialog scenario → ADOPT:** the `0b1c9d3`-reverse mutant
  (grow-from-zero `flex-1` + percentage cap) collapses the dialog content to zero height and fails
  `"Add support path" is visible` **3/3 deterministically** (live capture: no overlay paints, panel
  stays visible); the current APK passes; navigation reached the panel every run (isolation).
  **Theory touch-responder scenario → REJECT as automatic authority:** the `ddc0ec9`-reverse mutant
  fails only intermittently (~1/5 default swipe, ~1/2 slow swipe) because Maestro-injected emulator
  swipes usually win the JS-thread responder race a real finger loses — so the touch-responder class
  stays PHYSICALLY owned (emulator evidence does not narrow it). Failure distinguishability proven:
  an unreachable fixture fails early at journey entry (`"Choose an expedition"`), never miscounted as
  sensitivity. Current unmutated APK: 2/2 clean passes (plus U5's 3/3). EAS Workflows DEFERRED. The
  checked-in flow is byte-identical (temporary swipe-speed probe reverted); the worktree and both
  mutant APKs were removed. `docs/plans/BLOCKERS.md` untouched. Evidence:
  `tmp/2026-07-15-durable-learner-e2e-gates/native/EVALUATION.md` + `u6-run-log.md`.

- **Learner Runtime Reliability Fix — U6 gates, 2026-07-15: automatic real-use WEB gate PLUS
  user-owned physical-Android preview-APK pass (U1–U6, plan completed).** Working-tree
  learner-api (`:8790`, over Postgres + production LiteLLM) + a fresh production Expo web export
  baked against it, served on `localhost:8091`, driven by Playwright on phone (Pixel 7) + desktop
  (1280×800). A real "Photosynthesis light reactions" expedition (Plant Biology, 14 items / 3
  sections) was generated end-to-end by production extraction; the app was then driven against the
  REAL api with NOTHING intercepted. **8/8 tests PASS (34.4s), zero unexpected page/console errors.**
  Real backend states (each verified by curl first): **AE1** stale token → real `/me` 401 clears it →
  failed `Enter` (real 401) does not block a following `Set out` → immediate Journal, new token, no
  reload; **AE3** `/expedition/<uuid>` real 404 → "isn't available" (unavailable, no Retry),
  `/guardian/<uuid>` real 404 → "This fight is over", `/guardian/not-a-uuid` real 500 → error +
  Retry, `/catalog` real candidates; **AE6** the planning-sheet vaul scrim covers the full viewport
  and `elementFromPoint` over the Menu resolves into `[data-vaul-overlay]` (page inert), scrim press
  dismisses without activating the Menu and leaves the URL unchanged — screenshots show the scrim
  dimming the real journal incl. the generated expedition card. **Neutral invariant proven**:
  `gate-u6-explorer` wrote 0 `response_log` and 0 `learner_awards` (Concept Mastery + weekly points
  provably unchanged); no API/schema/content change (R16). Two GATE-HARNESS defects found+fixed
  (exact-match CORS origin; durable-signup test-data leakage → run-unique names + FK-safe cleanup) —
  not product defects. Injected-failure AE2 stays proven by the committed deterministic suite (U5);
  live Guardian COMBAT was proven in Crystal Guardian Gate B (2026-07-14). Disposable learners
  removed (only pre-existing data remains); enrichments retained. **Physical Android (user-owned,
  preview APK):** the FIRST pass (2026-07-15) FAILED AE4 — Theory drags did nothing, no overscroll
  glow — while confirming U3's dialog geometry held on device (Support Path dialog fully rendered,
  journal/trail scrolled); root cause was the native `@rn-primitives/dialog` touch-responder claim
  (see COMPLETED), fixed in `ui/overlays.tsx` (`ddc0ec9`) and scroll-verified on the phone through
  a dev client + Metro. A FRESH preview APK then **PASSED the full U6 scenario set (user-recorded,
  2026-07-15)**: failed entry → successful signup reaching the Journal, visible loading/error
  recovery, real long-Theory scrolling with fixed header/footer, the Support Path `Preparing
  support` dialog fully visible through generation, and the button/checkpoint/motion/
  reduced-motion/strict-log/Crystal Guardian regression samples. Blocker CLEARED; plan deleted per
  the Verification Contract. Evidence + evaluation note:
  `tmp/2026-07-14-learner-runtime-reliability/EVALUATION.md`.

- Each COMPLETED outcome above names its rule-14 real-use gate result and `tmp/` evidence
  directory; the full per-change validation transcripts live in git history. Tests remain
  deterministic-envelope evidence only under
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md); quality claims come from
  inspected real model output.

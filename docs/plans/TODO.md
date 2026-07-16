# TODO

## TODO

### Deep Scaffold Generation and closed attribution (plan 2026-07-16-004 — IN PROGRESS, U2 NEXT)

[Plan](./2026-07-16-004-refactor-deep-scaffold-generation-plan.md). U1 is complete and uncommitted:
versioned Concept Lesson identities, pinned reference persistence/hydration, and fenced release are
in place on a fresh schema. U2 is next; U3 is also unblocked after U1 and may follow if the session
budget permits. Preserve plan 003's shipped `CheckpointPath` trail-wave + arrival-focus behavior
when U5 begins.

### Evidence-triggered follow-up

- **Support Path Study Items in Guardian selection.** After real use justifies the breadth, define a
  richer learner-scoped typed Study Item set and passed-item semantics for Support Steps, then extend
  fixed-budget Guardian coverage to completed visible Support Paths as anticipated by ADR-0037. Do
  not treat the current single inline generated option as equivalent to the neutral Study Item Bank.

## COMPLETED

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
  completed 2026-07-07 architecture review's rejected-findings ledger lives in git history (the
  2026-07-11 architecture-deepening review brainstorm, deleted on completion per the brainstorms
  archival policy). Rule-14 gates PASS per change; evidence under `tmp/2026-07-07-*/` and
  `tmp/2026-07-08-*/`.

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

- **Crystal Guardian Challenges Gate B — live real-use browser evaluation, 2026-07-14 (U5–U7).**
  Working-tree learner-api (`:8790`) + static Expo web export (`:8082`) driven by Playwright against
  a fresh production "Plate tectonics and continental drift" expedition (Geology, 13 nodes / 11 study
  items / 5 Legs + summit Paleomagnetism, READY 335 s) on a hard-reset DB. Every acquisition and
  Guardian answer graded server-side (the browser oracle only reads which choice to click, then
  clicks the real DOM). PASS: Guardian arrival → Face the Guardian → misses → **Last Stand** →
  **retreat + full page reload → exact resume** → recovery win (drive1 sec0 + drive2 sec3 Orogeny,
  incl. a dirty Matching round with `roundIndex` reshuffle and one shield hit); **rematch spawned a
  distinct challenge yet the durable reward stayed the FIRST win (KTD3)**; the summit unlocked only
  after all 5 Legs won and its **Expedition Guardian** (7 ward maxima vs 5 for Legs) drove to the
  **"Summit reached" keystone**; an enlarged-text (200%-equivalent viewport) + reduced-motion pass
  reflowed every ward/shield/Last-Stand/answer surface with zero console/page errors. **Neutral
  invariant proven byte-identical**: across ~47 new `recall_challenge_events` over 7 won challenges,
  `response_log` (16 rows md5 `83fa4371…`) and `lesson_reads` (10 rows md5 `5c91d080…`) were
  unchanged and `learner_awards` stayed 0 — so Concept Mastery + weekly points (pure functions of
  those tables) are provably unchanged. Support Path exclusion verified at the contract level
  (`eligibleRecallItems` pools only neutral bank items; `neutralResponses` drops scaffold rows;
  lineup FKs to `study_items`) and empirically (0 detours; 27/27 lineup rows neutral). **Recorded
  caveat:** this sparse expedition emitted no impostor items (a valid content outcome, not a Guardian
  bug); accepted because Gate A exercised 9 impostor items through the same contract, `GuardianFight`
  reuses the shared `ImpostorBody`, and the `impostor` answer path is identical to `option_select`.
  Disposable `gateb-guardian` learner removed via post-gate hard reset; deployed container restarted
  (`/health` OK on the fresh DB). Evidence and the required evaluation note:
  `tmp/2026-07-13-crystal-guardian-challenges/gateB/EVALUATION.md`.

- **Crystal Guardian Challenges Gate A — durable recall-challenge contract, 2026-07-13 (U1–U4).**
  Hard-reset DB + fresh production "Tides and lunar gravitation" expedition (14 nodes / 31 items —
  incl. 9 impostor — / 6 Legs, READY 486 s). PASS: honest all-unavailable + locked-summit initial
  scopes; real acquisition flipped exactly one Leg available; coverage-first 5/7 lineup;
  misses → Last Stand → retreat → **byte-identical resume on a freshly restarted API process** →
  recovery win; duplicate-attempt replay, state-edge lifecycle no-ops, 409 out-of-turn (incl. organic
  ward rotation), live dirty Matching (`roundIndex` 0→1 reshuffle), rematch + abandon leaving the
  formation at the FIRST win; `session.recallScopes` deep-equals `/challenge/scopes` at every stage;
  `response_log` md5 + mastery + points identical across ~60 challenge events. Evidence:
  `tmp/2026-07-13-crystal-guardian-challenges/EVALUATION.md`.

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

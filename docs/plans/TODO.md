# TODO

## TODO

### Active implementation

- **Learner Runtime Reliability Fix (IN PROGRESS — U1–U6 web gate DONE; only physical-Android
  remains).** Execute the
  [active plan](./2026-07-14-001-fix-learner-runtime-reliability-plan.md) to repair
  failed-login-then-signup session entry, blank query states, Android Theory scrolling and Support
  Path generation-dialog geometry, and the web expedition-planning scrim layer. The prior
  native-parity plan was deleted because physical Android observations disproved its dialog/scroll
  acceptance despite its passing automated and web evidence. Web acceptance becomes a checked-in
  automatic production-export gate; the final preview APK build and physical-Android pass remain
  user-owned in [BLOCKERS.md](./BLOCKERS.md).

  **Status (2026-07-15):** U1–U5 are implemented **and committed** (`d0e8928` session/RouteStatus,
  `0b1c9d3` overlay dialog+sheet geometry, `9c2e44f` Playwright web gate). The follow-on
  native-bundling fix is applied in the working tree (uncommitted): the U2 route test moved from
  `src/app/index.test.tsx` to `src/components/IndexRoute.test.tsx`, because any `.test.tsx` under
  `src/app/` is globbed as an Expo Router route and breaks native Android bundling
  (`require("console")`) — the web export tolerated it, so U5's web gate never caught it. **U6's
  rule-14 real-use WEB gate is DONE and PASSED (2026-07-15)** — see VALIDATION below; evidence in
  `tmp/2026-07-14-learner-runtime-reliability/EVALUATION.md`. **The plan and the Android blocker stay
  OPEN**: the Verification Contract forbids declaring the plan complete or deleting it until the
  user-owned physical-Android preview-APK pass is recorded in [BLOCKERS.md](./BLOCKERS.md).

  **Status (2026-07-15b): physical-Android gate FAILED on Theory scroll — diagnosis in progress.**
  The user's fresh post-U3 preview APK shows the U3 geometry fix working on device (Support Path
  `Preparing support` dialog renders fully; journal/trail scrolls), but dragging Theory prose in the
  full-screen activity does **nothing at all — no overscroll glow** — so the ScrollView never
  acquires the gesture: this is touch-responder acquisition, not geometry (U3's target). Prime
  suspect: native `@rn-primitives/dialog@1.5.2` hardwires `onStartShouldSetResponder → () => true`
  on `Content` (and `Overlay` is a Pressable), so a JS ancestor claims every touch at START and
  blocks the descendant ScrollView's native move interception (problem class: JS gesture responder
  vs native ScrollView interception, Android-only; web uses the responderless Radix build — exactly
  why every web gate passed). **Probe applied, UNCOMMITTED, in `ui/overlays.tsx`
  `FullScreenDialog` native branch**: Overlay `disabled` (it has no backdrop-close to lose) +
  `onStartShouldSetResponder={undefined}` on Content (the primitive spreads `{...props}` after its
  own responder prop, so this is a sanctioned consumer override — no node_modules patch).
  Typecheck clean, 187/187 tests green. NEXT: user verifies the probe via dev client + Metro on the
  device. If fixed: keep as root-cause fix, add a jest responder-contract lock, and check
  `DialogBody` scroll with long content on device (same problem class is latent in the centered
  `Dialog`, whose Content claim shields `closeOnPress` — fix there would be the deepest-claim
  wrapper inside `DialogBody`, not an Overlay disable). If not fixed: fall back in order to the
  deepest-claim wrapper (`onStartShouldSetResponder={() => true}` View inside the ScrollView),
  then the absolute-ancestor class (facebook/react-native#38730) with `onLayout` instrumentation
  over adb. Also: the working tree carries an unexplained revert of BLOCKERS.md to pre-U6 wording —
  restore the committed version unless intentional.

  **Handoff (session 2026-07-14a):**
  - **U1 DONE — atomic, query-owned session (`apps/learner-app`).** `me` is now the sole signed-in
    source of truth. Removed the duplicate `hasToken` state and `LearnerNameGate.onEntered`; replaced
    `queryClient.clear()` with a scoped swap. All signed-in reads (journal/catalog/leaderboard/
    expedition/challenge) sit under one `["learner", …]` prefix (`LEARNER_SCOPE`/`learnerScopeKey` in
    `lib/queries.ts`); `me` stays outside it. `enterSession` (`lib/session.ts`) now
    cancels+removes the learner prefix, writes the token, and seeds `me` from the response (no second
    `/me`). `meQuery` on 401 clears the token + removes the learner prefix (KTD1). `logout` removes
    the prefix + sets `me` null (still re-throws a revoke failure after local cleanup — matches the
    original `try/finally`). `actions.ts` invalidations reference `journalQuery.queryKey` /
    `expeditionQuery(id).queryKey` (KTD3). `guardianEntry.ts` + guardian route already used
    `challengeQuery(...).queryKey`, so they inherited the prefix automatically. Tests:
    `lib/session.test.ts` (401 purge, AE1 failed-then-success seed + old-data-absent, in-flight
    cancellation, logout cleanup incl. revoke failure, key-prefix invariant).
  - **U2 DONE — exhaustive route states.** New app-owned `ui/routeStatus.tsx` (`RouteStatus`,
    exported from `ui/index.ts`; loading/error/unavailable tones, copy+actions stay at the route
    boundary per KTD4) + `ui/routeStatus.test.tsx`. Wired into `_layout.tsx` (visible bootstrap
    loading, now rendered INSIDE the providers so `Screen` reads safe-area), `app/index.tsx` (session
    validating / session error+retry+token-retained / gate / journal loading / journal error with
    Retry+Log out — AE2), `app/catalog.tsx`, `app/expedition/[enrichmentId].tsx` (loading / error+retry
    / 404-unavailable distinct), and `app/guardian/[challengeId].tsx` (migrated its existing
    pending/error/over copy onto RouteStatus). New vocabulary keys (bootstrap/session/journal/catalog/
    expedition status copy + `retryAction`) in `learn/vocabulary.ts` (+ test). Route test:
    `app/index.test.tsx` (relocated to `src/components/IndexRoute.test.tsx` on 2026-07-15 — see Status).
  - **Gate so far:** learner-app `typecheck` clean, `test` 185/185 (was 137), `eslint` 0 errors
    (3 pre-existing warnings). No API/schema/content changes touched. Nothing committed (user hasn't
    asked).
  **Handoff (session 2026-07-14b):**
  - **U3 DONE — bounded Android activity + dialog geometry (`ui/overlays.tsx`, `ui/overlays.test.tsx`).**
    Root cause of the border-only Android dialog = Yoga *grow-from-zero* collapse: `flex-1` (`flex:1 1
    0%`) children under a max-height-ONLY column satisfy at zero intrinsic height. Fixes: (1) the
    centered `Dialog` now caps with ONE window-derived NUMERIC px maximum (`Math.round(height*0.85)`
    via `useWindowDimensions`), replacing the `max-h-[85%]` class + web-only `85vh` inline dual cap —
    a numeric px cap resolves identically on Yoga and behind the web focus wrapper. (2) `DialogBody`
    and the centered `Dialog`'s `OverlayEntrance` wrapper went `flex-1 min-h-0` → `shrink min-h-0`
    (shrink-from-natural: content-height when short, body scrolls when the cap bites; header/footer
    stay `shrink-0`). (3) `FullScreenDialog` native branch is now `flex-1 bg-background` (bounded flex
    chain under the definite-height inset-0 Overlay) instead of `absolute inset-0`, which did NOT hand
    the activity ScrollView a definite height on native (Theory couldn't scroll) — WEB keeps `absolute
    inset-0` for the focus-wrapper compensation (`Platform.OS==="web"` split). No consumer heights/
    platform checks added (Support Path/Theory/Board untouched). Added `testID="dialog-content"` +
    `"fullscreen-content"` to lock the numeric cap and the native flex branch in tests.
  - **U4 DONE — web planning sheet in the root modal layer (`ui/sheets.tsx`, `ui/overlays.test.tsx`).**
    `BottomSheet` now wraps the Expo primitive in `<Portal name={useId()}>` from `@rn-primitives/portal`
    on web ONLY (the same root-`PortalHost` escape the RN-Primitives dialogs already use), so the vaul
    scrim+content out-rank every journal/Browse/expedition/Guardian stacking context with ZERO consumer
    z-index change and no `node_modules` patch. Native returns the primitive in place unchanged
    (system modal sheet, pan-down, safe-area, keyboard, dismissal guard all intact — R13). New test
    flips `Platform.OS` to `"web"` and proves relocation (no host → nothing renders; root host present
    → renders). The actual top-layer hit-testing proof is deferred to U5's Playwright suite per plan.
  - **Gate so far:** learner-app `typecheck` clean, `test` 187/187 (was 185; +2 new: numeric-cap +
    web-portal), `eslint` 0 errors on changed files, Expo **web export builds** (all 7 routes). jest
    runs the NATIVE branch, so real Android scroll gestures + measured dialog pixels + the web top-layer
    scrim remain U6/U5 proofs, not covered here (see U3/U4 risk mitigations). Nothing committed.
  **Handoff (session 2026-07-14c):**
  - **U5 DONE — durable automatic web acceptance (`apps/learner-app/e2e/`, `playwright.config.ts`).**
    Checked-in `@playwright/test` suite over the REAL production Expo web export, 14 tests green on
    Chromium phone (Pixel 7) + desktop (1280×800), zero page/console errors. Files:
    `playwright.config.ts` (two viewport projects, `globalSetup`, html+list reporters → gitignored
    `tmp/`), `e2e/static-server.mjs` (webServer: exports to `dist-e2e` on demand then serves with SPA
    fallback), `e2e/global-setup.ts` (real launch/close probe → actionable `e2e:setup` message, NEVER
    downloads at test time), `e2e/fixtures.ts` (typed-API interception + fixtures + console-error
    guard), `e2e/learner-runtime.spec.ts` (AE1 stale-token→failed-Enter→Set-out→Journal; AE2
    journal-fail→Retry/Log-out recovery; AE3 catalog loading/error/Retry-recover + expedition +
    guardian error surfaces; AE6 vaul `[data-vaul-overlay]` covers viewport + `elementFromPoint` over
    the Menu control resolves into the modal layer + scrim-dismiss with unchanged URL; R12
    pending-mutation blocks Escape dismissal). Wired: root `check` → `e2e:web` → learner `e2e`
    (`E2E_FORCE_EXPORT=1 playwright test`, forces a fresh `--clear` export so the gate never serves a
    stale bundle). `e2e:setup` = `playwright install chromium` (one-time). **Two gotchas solved:**
    (1) the export bakes `EXPO_PUBLIC_LEARNER_API_URL` — a sentinel `http://127.0.0.1:8788` that is
    only ever intercepted, never served, so any un-mocked call fails fast instead of hitting
    production; **Metro caches that inlined value**, so the export MUST run `expo export --clear` or a
    prior dev export's `:8790` origin silently persists (this bit me — fixed in static-server.mjs).
    (2) cross-origin (web `:8099` ↔ api `:8788`) means authenticated GET / JSON POST preflight, so
    the interceptor answers `OPTIONS` 204 with CORS headers or the real request never fires. Removed
    the unused direct `playwright` root devDep + catalog entry (no tracked importer); added
    `@playwright/test` (catalog) to learner-app; eslint override turns off `react-hooks/rules-of-hooks`
    + `no-restricted-imports` for `e2e/**` (Playwright's `use()` fixture is not a React hook). Env
    note: this sandbox pre-bakes `chromium_headless_shell-1223` in root-owned `/ms-playwright`
    (`PLAYWRIGHT_BROWSERS_PATH`), so `e2e:setup` errors on write-permission there but the browser is
    already present and launches fine — the actionable failure path is for fresh hosts.
    The gate export is DECOUPLED from Playwright's webServer: `e2e` = `export:web:e2e`
    (`expo export --clear` with the sentinel origin) THEN `playwright test`, so the webServer just
    serves an existing `dist-e2e` and starts instantly. (First attempt ran the `--clear` cold export
    INSIDE the webServer and blew its 180s startup cap — hence the pre-export step; webServer timeout
    still raised to 300s as a fallback for a bare `playwright test`.) `--clear` is REQUIRED in `check`
    because the preceding `build` step's `export:web` warms the Metro cache with the PRODUCTION
    origin. Also: `dist-e2e/**` added to eslint `ignores` (else `eslint .` OOMs walking the 4.6MB
    bundle) and to `.gitignore` + tsconfig `exclude`.
  - **Gate:** FULL `pnpm check` GREEN end-to-end (exit 0): tmp-clean, typecheck (all pkgs), test (all
    suites incl. learner-app 187/187), lint (0 errors / 9 pre-existing warnings), build (admin-lab +
    learner export), and the new production-web Playwright gate 14/14 both viewports. Nothing
    committed (user hasn't asked).
  - **NEXT: U6** — rule-14 real-use WEB gate (`.agents/skills/real-use-quality-evaluation/SKILL.md`):
    stand up the working-tree learner-api against Postgres (load `.env`; API on `:8790`) + production
    LiteLLM, generate ONE real expedition, drive the REAL app (served export against the REAL api, NOT
    the intercepted fixtures) through failed-entry→signup, all route states, and the planning-sheet
    scrim over a populated page; keep the disposable learner/PIN/bearer out of screenshots/logs and
    hard-reset it after; evidence in `tmp/2026-07-14-learner-runtime-reliability/`. Then fold the
    result into TODO/BLOCKERS/README. **The preview-APK physical-Android pass stays user-owned in
    BLOCKERS.md — do NOT delete the plan or clear the blocker until Android passes** (Verification
    Contract: the plan cannot be declared complete until the manual Android gate passes). U6 depends
    on U1–U5.

### Evidence-triggered follow-up

- **Durable real-backend web e2e suite + evaluate Maestro/EAS Workflows for the native gate.** The
  U6 real-use gate (2026-07-15) proved a reusable Playwright driver that exercises the REAL learner
  experience end-to-end. It is now seeded as a checked-in **scaffold** in
  `apps/learner-app/e2e-realuse/` (`realuse.spec.ts`, `realuse.config.ts`, `serve.mjs`,
  `cleanup-learner.sh`, `README.md`; opt-in `pnpm --filter @lrnki/learner-app e2e:realuse`, NOT in
  `pnpm check`); the frozen gate evidence stays in `tmp/2026-07-14-learner-runtime-reliability/`.
  Two distinct, separately-decidable
  threads — do NOT conflate them, and keep all three e2e layers distinct: (1) the committed
  **intercepted** suite `apps/learner-app/e2e/` (client behavior, mocked transport, in `pnpm check`);
  (2) a **real-backend** suite (real Postgres + LiteLLM); (3) **native on-device**.
  - **(A) Promote a durable real-backend web suite** by reusing the U6 driver. Design decisions to
    settle first: how to stand up a real learner-api + seed ONE disposable learner and a ready
    expedition deterministically (reuse an existing shared enrichment via `/catalog` to avoid a
    ~5-min live generation per run, or gate generation behind an opt-in), where it runs (NOT default
    `pnpm check` — it needs live services and real model spend; a separate opt-in `e2e:realuse`
    target), the exact-match CORS origin gotcha (`localhost` ≠ `127.0.0.1`), run-unique signup names
    + FK-safe teardown (the two harness defects U6 found), and credential hygiene (keep PIN/bearer
    out of committed artifacts). This complements — does not replace — the intercepted suite.
  - **(B) Evaluate Maestro + EAS Workflows** (https://docs.expo.dev/eas/workflows/examples/e2e-tests/)
    to reduce the recurring MANUAL physical-Android gate that has landed in
    [BLOCKERS.md](./BLOCKERS.md) across the native-parity, interaction-system, Crystal Guardian, and
    Learner Runtime Reliability plans. Maestro drives real build artifacts (Android/iOS/web) as
    black-box UI flows and would extend the existing `scripts/build-learner-android.sh` /
    `.github/workflows/build-learner-android.yml` EAS pipeline. Judge whether an emulator/device-cloud
    Maestro run can certify scroll gestures / Yoga measurement / dialog reachability that Playwright
    provably cannot (plan KTD9/R15) — and if so, whether it downgrades the physical-device pass from
    a hard blocker to a spot-check. Record the decision (adopt / defer / reject) with reasoning; do
    not assume a device-cloud run fully substitutes for a real phone without evidence.

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

- **Learner Runtime Reliability Fix — U6 real-use WEB gate, 2026-07-15 (U1–U5).** Working-tree
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
  removed (only pre-existing data remains); enrichments retained. **The physical-Android
  preview-APK pass remains user-owned and open in [BLOCKERS.md](./BLOCKERS.md); the plan is NOT
  deleted.** Evidence + evaluation note: `tmp/2026-07-14-learner-runtime-reliability/EVALUATION.md`.

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

---
date: 2026-08-10
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

# Repair the 320 dp Native Support Path Flow — Plan

## Goal Capsule

- **Objective:** Make the adopted native Support Path scenario drive the intended term action
  reliably at 320 dp, then requalify its dialog-geometry authority with the required behavior-only
  negative control.
- **Authority:** The scenario claims and mechanics remain owned by the
  [native rig contract](../../apps/learner-app/e2e-native/README.md); general evidence authority and
  negative-control requirements remain owned by [AGENTS.md](../../AGENTS.md#validation-authority).
- **Scope:** Repair the Maestro flow and its validation record. Do not change learner-visible layout,
  Support Path behavior, fixtures, API contracts, or persisted data unless the exact-action repair
  disproves the current diagnosis.
- **Stop conditions:** Stop and re-plan if the exact term action is absent from the native hierarchy,
  its bounds remain wrong when fully visible, the current APK cannot pass twice at a measured 320 dp,
  or the dialog-collapse mutant does not fail at the intended dialog assertion.

## Why This Issue Is Real

The checked-in flow scrolls until `support-paths-panel`, an ancestor container, is reported visible
and then immediately taps `support-path-add-phospholipid bilayer`, a descendant whose own visibility
was never established. The [rig contract](../../apps/learner-app/e2e-native/README.md) records the
observed 320 dp outcome: Maestro can stop while the action remains under the fixed Theory footer, so
the tap lands on `Continue` and advances to the Question activity. Manual driving reaches every row
and affordance, so this is a harness interaction-target defect rather than an app reachability defect.

The established problem class is **false interaction caused by an ancestor visibility oracle**: the
wait condition and the action target are different UI nodes, allowing a fixed overlay to intercept the
subsequent coordinate. Recognized Maestro practice is to scroll to the element that will actually be
used, select stable IDs, verify required state before acting, and require full visibility; the command
also supports centering the selected element away from overlapping chrome
([scrollUntilVisible](https://docs.maestro.dev/api-reference/commands/scrolluntilvisible),
[selectors](https://docs.maestro.dev/api-reference/selectors)).

## Product and Test Contract

### Requirements

- R1. The flow must scroll to the exact app-owned action ID
  `support-path-add-phospholipid bilayer`, not to `support-paths-panel` as a proxy.
- R2. The same exact selector must be fully visible and enabled before `tapOn`; the tap must not use
  prose, coordinates, selector indexes, fixed sleeps, or a duplicated test-only control.
- R3. Center the exact action when Maestro can do so. If the term is the last reachable element and
  cannot be centered, full action visibility plus an unobscured native-hierarchy inspection is the
  acceptance boundary.
- R4. Preserve the existing dialog oracle: title, body action, footer close action, dismissal, and
  return to the same Theory activity. A transition through Theory `Continue` must fail before these
  dialog assertions can be credited.
- R5. Preserve the scenario's claim boundary. Theory scrolling remains navigation-only; this change
  does not grant it automatic authority or change the Guardian visual-evidence scenario.
- R6. Validate on an emulator whose observed effective viewport width is 320 dp. Record device serial,
  Android API/system image, physical size, density, derived dp width, Maestro version, APK build time,
  commit, and the exact assertion reached in the plan Validation Log.
- R7. Rebuild the e2e APK after the flow repair even though the production app is expected to remain
  unchanged; stale artifacts cannot produce evidence for the checked-out tree.
- R8. Re-run the existing dialog-geometry negative control as an isolated behavior-only mutation.
  Preserve the repaired flow, fixture, selectors, emulator, and all unrelated current code.
- R9. Retain automatic authority only if the current APK passes the repaired scenario twice and the
  dialog-collapse APK fails three times at the intended dialog-reachability assertion. Setup,
  authentication, navigation, server, or wrong-control failures do not count as sensitivity evidence.
- R10. Do not request a new physical-device pass: the flow-only selector repair does not change the
  learner interaction or regression class, and the adopted class already has physical correlation.
  If implementation changes app behavior or scenario meaning, stop and restore a concrete user-owned
  physical action in `docs/plans/BLOCKERS.md` before claiming authority.

### Acceptance Examples

- AE1. At 320 dp, `scrollUntilVisible` operates on the exact phospholipid-bilayer action, the action
  is visible and enabled, and tapping it opens the Support Path dialog without advancing the activity.
- AE2. Closing the dialog removes `Add support path` and leaves `Field notes` visible in the same
  activity.
- AE3. The same repaired flow passes twice on freshly built current APKs under identical fixture and
  device conditions.
- AE4. With only the measured dialog cap/shrink behavior reverted in a disposable worktree, the flow
  reaches the term action and opens the dialog, then fails the dialog title/body/footer block three
  times. A failure before the term action is invalid evidence.
- AE5. A normal-width smoke still passes, preventing the narrow-width repair from replacing the
  scenario's existing portable coverage with a 320-only workaround.

## Implementation Design

### U1. Align scroll, visibility, and tap to one semantic control

- **Files:** `apps/learner-app/.maestro/flows/android-runtime-reliability.yaml` and focused harness
  documentation comments only.
- **Approach:** Replace the panel-targeted `scrollUntilVisible` with the exact term-action ID. State
  `visibilityPercentage: 100` explicitly and set `centerElement: true`. Follow it with
  `assertVisible` over the same ID and `enabled: true`, then use the same ID/enabled selector for
  `tapOn`. Keep the surrounding `Field notes`, dialog anatomy, dismissal, and same-activity
  assertions. The panel can remain a product testID, but it no longer acts as the action readiness
  oracle.
- **Focused check:** Inspect the native hierarchy at the stopped position and retain a screenshot
  showing the whole 44 px action target above the footer. Confirm no coordinate, prose-term, index,
  retry, or fixed-delay fallback was introduced.
- **Stop/re-plan trigger:** If Maestro still reports the exact action fully visible while its bounds
  overlap the footer, diagnose the React Native accessibility bounds and stable control seam. Do not
  mask it with swipes of fixed coordinates or repeated taps.

### U2. Requalify the adopted Support Path authority

- **Dependencies:** U1. Before building the APKs for this unit, land plan
  [2026-08-10-002](./2026-08-10-002-one-tap-e2e-signin-gate.md) U4 (the one-tap login-block swap in
  this same flow) so this negative-control re-run qualifies the final flow shape once.
- **Files:** No tracked production files for the mutant. Use a disposable worktree and store reports,
  screenshots, hierarchy dumps, and recordings only under the rig's gitignored `tmp/` evidence path.
- **Current-build positive:** On the measured 320 dp emulator, rebuild the e2e APK and run the focused
  runtime-reliability scenario twice from clean app state. Then run one normal-width smoke. Record
  per-run outcomes rather than only a final suite count.
- **Negative control:** In a disposable worktree at the same revision, apply only the historic
  dialog-collapse behavior derived from commit `0b1c9d3`—the measured numeric-cap/natural-shrink
  regression—without reverting tests, sheets, selectors, fixtures, navigation, or documentation.
  Build that e2e APK and run the repaired flow three times on the same 320 dp emulator. Require the
  term action and dialog-open transition to succeed, followed by failure within the title/body/footer
  reachability block.
- **Restoration:** Reinstall the freshly built current APK after the mutant runs and complete one final
  focused pass. Remove the disposable worktree and mutant APK after evidence has been summarized;
  never add a production fault-injection flag.
- **Verdict:** Keep **ADOPTED automatic authority** only when R9 holds. Otherwise mark the Support Path
  class unqualified in the rig contract and leave an actionable TODO; do not describe a green run as
  authority.

### U3. Consolidate the result and retire this plan

- **Dependencies:** U2.
- **Files:** This plan's `## Validation Log`, `apps/learner-app/e2e-native/README.md`,
  `docs/plans/TODO.md`, and `docs/plans/README.md`.
- **Approach:** Update the rig contract with the repaired exact-action navigation mechanic and measured
  requalification result. Preserve the distinction between Support Path dialog authority, Theory
  navigation, and Guardian visual evidence. Consolidate the latest plan-less validation into
  `TODO.md`, remove this task from TODO, remove this plan from the active index, and delete this plan
  only after its necessary evidence is preserved in the canonical live owners and git history.

## Verification Contract

- YAML/static review: exact action ID is the scroll, visibility, and tap boundary; explicit 100%
  visibility and enabled state; no coordinates, fixed waits, repeated-tap recovery, or generated prose.
- Focused current evidence: two consecutive 320 dp passes, one normal-width pass, and one post-mutant
  restoration pass from a freshly built current APK.
- Sensitivity evidence: three dialog-collapse mutant failures at the intended dialog assertion, with
  successful arrival at and activation of the exact term action in each run.
- Repository checks: relevant learner-app typecheck/tests remain green if tracked TypeScript changes
  become necessary; `pnpm check` is not a substitute for native evidence; `git diff --check` passes;
  links and retained documentation resolve.
- Evidence language: identify emulator/native-fixture evidence exactly. Do not call it real-backend,
  deployed, production, or new physical-device evidence.

## Validation Log

### U1 — Exact-action interaction boundary (closed 2026-08-10)

- Replaced the ancestor `support-paths-panel` readiness oracle with the exact
  `support-path-add-phospholipid bilayer` action for scroll, explicit 100% visibility/enabled
  assertion, and enabled tap. `centerElement: true` keeps the action away from fixed chrome; no
  coordinate, prose, index, retry, or fixed-delay fallback was added.
- The measured 320 dp login exposed a separate keyboard occlusion before the scenario could reach
  Theory. Dismissing the keyboard after email entry restores semantic access to the existing
  password ID without changing app behavior or the dialog oracle.
- Fresh e2e APK: built 2026-08-10 11:42 +06 from commit `ae12ad3`; Gradle
  `:app:assembleRelease` passed. Expo Doctor's existing SDK package-version mismatch remained an
  advisory warning and did not stop the build.
- Native fixture/device: deterministic loopback learner-api shapes; `emulator-5554`, AVD
  `Medium_Phone_API_36.1`, Android API 36, physical size 1080×2400 px, density override 540 dpi,
  derived viewport width 320 dp; Maestro 2.6.1.
- Current APK outcomes at 320 dp: the focused `android-runtime-reliability` scenario passed three
  times (1m06s, 56s, 1m01s). Each reached the exact action, opened the Support Path dialog, proved
  title/body/footer reachability, dismissed it, and returned to the same Theory activity. The final
  run retained `support-path-exact-action-ready.png`; inspection shows the whole first 44 dp action
  above the fixed `Continue` footer.
- Portable smoke: after resetting to the AVD's physical density 420 dpi (about 411 dp wide), both
  native flows passed in 2m01s; the Support Path scenario passed in 1m01s.
- Repository gate: `env -u NODE_ENV pnpm check` passed, including Drizzle baseline parity,
  workspace typechecks/tests, builds, and 70 Playwright tests. It retained four existing lint
  warnings and the known post-test Expo logger warning; neither failed the command. `git diff
  --check` also passed.

### Real-use quality evaluation

- Milestone: the native Support Path scenario activates the intended exact term action reliably at
  320 dp without advancing through Theory `Continue`.
- Fixture and source type: deterministic captured learner-api response shapes in the standalone
  e2e-profile APK on an Android emulator; retained 320 dp screenshot at the exact-action boundary.
- Real model calls used: not applicable.
- Result: PASS.
- Useful output observed: the full phospholipid-bilayer action is unobscured above the footer; its
  activation opens the complete Support Path dialog and dismissal returns to `Field notes`.
- Defects observed: the 320 dp keyboard initially obscured the password target during setup; the
  separate Guardian flow still has that setup issue because this plan does not change its scenario.
- Changes made after inspection: dismiss the keyboard after Support Path-flow email entry and retain
  an exact-action screenshot after the visibility assertion.
- Remaining caveats: this is native-emulator evidence against a deterministic fixture, not a new
  physical-device, real-backend, deployed, or production pass. The dialog-collapse sensitivity gate
  and post-mutant restoration pass remain open, so automatic authority is not yet requalified.
- Safe to continue downstream: yes, into the isolated U2 negative control only.

### U2 — Requalified dialog-geometry authority (closed 2026-08-10)

- Current-build positives (final flow shape, including plan 002 U4's one-tap sign-in): a fresh e2e
  APK built 2026-08-10 12:43 +06 from working-tree commit `b66e540` passed the focused Support Path
  scenario twice at 320 dp (46s, 38s), and the normal-width directory passed all three native
  scenarios in 2m03s. The first attempted native run was invalid because a boot-time System UI ANR
  covered the app; it counts as neither product nor sensitivity evidence.
- Isolated mutant: a disposable worktree at `b66e540` carrying the same uncommitted learner-app
  changes reverted **only** the `Dialog` geometry contract derived from `0b1c9d3` — the numeric
  `maxHeight: Math.round(height * 0.85)` cap back to `max-h-[85%]` with the web-only `85vh` style,
  and the `OverlayEntrance`/`DialogBody` children back from `shrink` to `flex-1`. `FullScreenDialog`,
  `sheets.tsx`, every testID and selector, the repaired flow, the fixture, and all unrelated code
  were preserved, so the flow still reaches Theory and the exact term action. Mutant e2e APK built
  2026-08-10 13:25 +06; Gradle `:app:assembleRelease` BUILD SUCCESSFUL in 7m24s. No production
  fault-injection flag exists; the worktree and mutant APK were deleted after the runs.
- Native fixture/device for every run in this unit: deterministic loopback learner-api shapes;
  `emulator-5554`, AVD `Medium_Phone_API_36.1`, Android API 36, physical size 1080×2400 px, density
  override 540 dpi, derived viewport width 320 dp; Maestro 2.6.1; emulator autofill disabled.
- Negative control: the repaired flow failed 3/3 against the mutant APK (50s, 48s, 49s), every run at
  the same intended assertion — `Assertion is false: "Add support path" is visible`. Each run wrote
  `support-path-exact-action-ready.png`, so each had already passed the exact-action 100%-visibility
  assertion, activated the term action, and opened the dialog far enough for its title. No run failed
  in setup, authentication, navigation, the server, or on a wrong control.
- Sensitivity is carried by the dialog **body/footer** assertions, not the title: under the collapse
  the `Support paths` title still resolved while `Add support path` did not. A flow that asserted only
  the dialog title would have passed the mutant.
- Restoration: reinstalling the freshly built current APK returned the focused 320 dp scenario to
  PASS in 43s, so the failures track the injected behavior and not accumulated device state.
- Runs in this unit used a focused single-flow invocation rather than the directory runner, because
  at 320 dp the out-of-scope Guardian visual flow does not scroll lower answer options into view and
  would make the runner exit nonzero after the Support Path flow's own outcome. That Guardian flow
  passes at its normal width; its 320 dp behavior is not this plan's claim and was not repaired here.
- **Verdict: R9 holds. The Support Path dialog class retains ADOPTED automatic authority.** Plan
  [2026-08-10-002](./2026-08-10-002-one-tap-e2e-signin-gate.md) U4's one-tap swap is qualified by the
  same evidence, because every run above executed the final flow shape.

### Open findings

- None for this plan. Remaining native caveats are owned by the
  [rig contract](../../apps/learner-app/e2e-native/README.md): the touch-responder class stays
  physically owned, the Guardian scenario remains visual evidence with no measured control, and its
  320 dp answer-option reachability is unaddressed.

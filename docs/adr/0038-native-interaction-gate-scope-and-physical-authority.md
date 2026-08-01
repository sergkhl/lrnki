# 0038 — Native interaction gate scope and physical-device authority

Date: 2026-07-15. Status: accepted (last amended 2026-08-01).

## Context

Two Android-only overlay defect classes escaped every automated gate and were caught only by a
physical device: the `@rn-primitives/dialog` touch-responder claim that stopped Theory scrolling,
and the measured dialog-geometry collapse that clipped Support Path dialogs. Neither is observable by
the intercepted web suite (the web build is the responderless Radix path) or by jest (the classes are
inert without real gestures). This left a recurring user-owned physical-Android gate. A portable
[Maestro](https://maestro.dev) flow can drive a real standalone APK on an Android emulator with real
Yoga layout and real gesture dispatch, but a green run only proves the flow drives the app — not that
it would catch the regression. Authority to narrow the physical gate therefore requires measured
negative-control sensitivity, not a passing current build.

## Decision

**The learner surface keeps three test layers with three distinct claims, none substituting for
another** ([ADR-0035](0035-separate-learner-app-static-spa-typed-api.md),
[ADR-0028](0028-measure-non-deterministic-quality-with-non-deterministic-methods.md)):

1. **Intercepted web** (`pnpm check`) — deterministic client behavior, responsive layout,
   accessibility, and injected transport failures at phone and desktop viewports.
2. **Real-backend web** (opt-in `pnpm e2e:web:realuse`) — one authenticated read/write/persist
   integration spine over the real learner API and Postgres, with no neural generation.
3. **Native Maestro** (opt-in `pnpm e2e:native:maestro`) — real APK interaction mechanics on an
   Android emulator against a deterministic loopback fixture.

The opt-in suites never join `pnpm check` or a hosted workflow.

**A native scenario earns automatic authority only when its targeted behavior-only negative control
fails at the intended assertion and the current build passes repeatedly.** Sensitivity is proven in
a throwaway worktree that reverses exactly one overlay behavior while preserving current selectors,
fixture, navigation, and emulator.

**Measured scenario verdicts (2026-07-15):**

- **Support Path dialog reachability — ADOPTED.** The negative control (grow-from-zero `flex-1` plus
  a percentage height cap on the centered dialog) collapses the dialog content to zero height and
  fails the dialog-reachability assertion deterministically; the current build passes repeatedly.
  This scenario is trustworthy automatic native authority for the dialog-geometry regression class.
- **Crystal Guardian obelisk states — VISUAL EVIDENCE ONLY, no authority (added 2026-08-01).** The
  obelisk separates resolved / current / queued wards by fill, facet, gloss and contour weight rather
  than hue, and Android draws those primitives through react-native-svg's native canvas rather than
  Chromium's SVG. A flow walks a deterministic Guardian through entry, partial, miss, Last Stand and
  Final Ward and screenshots each; its assertions prove only that the flow reached the intended
  state, so the screenshot beside them is evidence of that state and not another. Whether the states
  remain separable is a judgement over the captures, no negative control has been measured for it,
  and a green run therefore carries no authority over obelisk rendering.
- **Theory touch-responder scroll — REJECTED as automatic authority.** The regression is real on
  physical hardware, but on the emulator the responder claim races the native ScrollView through the
  JS thread and Maestro-injected swipes usually win a race a real finger loses, so the negative
  control fails only intermittently. An intrinsically flaky control is not a gate. The Theory swipe
  remains in the flow as **navigation** (it must reach the Support Paths panel to open the dialog)
  but carries no sensitivity claim.

**Physical-device authority narrows only per proven, physically correlated scenario.** Emulator
evidence alone never clears or weakens the user-owned physical gate. Automatic authority may cover
only a scenario that (a) passed its negative-control sensitivity check and (b) has one user-recorded
correlated physical pass. Uncovered native primitives, the touch-responder class, OEM behavior,
physical touch feel, haptics, thermals, and safe-area variants retain their physical gate until each
is independently automated and correlated.

**Emulator runs are agent-initiable on a tooling-capable host; physical-device runs stay
user-initiated.** Who may press start is a different question from what a green run proves, and this
rule answers only the first: it moves nothing in the scenario verdicts or the authority rules above.

- **Emulator — the agent may start one.** On a host that actually carries the Android tooling, an
  agent may run `pnpm e2e:native:maestro` on its own initiative, without waiting for the user to
  open the session. The precondition is mechanical rather than a promise: `e2e-native/run.ts`
  preflights `adb`, Maestro, a booted device, and the built e2e APK, and fails before any UI
  execution with an exact setup command — so a session lacking the tooling cannot produce a run to
  misreport. An emulator is a disposable local process that reaches only the loopback fixture, so
  nothing about starting one needs a person in the room. The macOS workstation carrying the Android
  SDK, JDK 17, Maestro, and an AVD is such a host; the VPS coding workspace is not.
- **Physical device — still user-initiated.** Someone must attach, unlock, watch, and feel real
  hardware, and no agent substitutes for that. An agent never asks for a device to be connected as a
  side effect of unrelated work.

**No session may claim native evidence it did not produce.** An agent on a host without the tooling
must not attempt, simulate, or narrate a device or emulator pass, and web or jest evidence never
stands in for one. When a change needs *physical* validation and no such session exists, the agent
records the concrete manual step in [BLOCKERS.md](../plans/BLOCKERS.md) (device, build profile,
scenario, expected observation), completes its scope on the automated layers above, and the user
initiates the device run; the result is then folded into the validation record.

**EAS Workflows is deferred.** The hosted Maestro job is alpha, couples a `type: maestro` job to a
`type: build` job through an EAS `build_id` rather than consuming this repository's
`eas build --local` APK, and introduces paid hosted build/workflow usage. The flow is kept
runner-portable so the decision can be revisited when the hosted job is stable and either accepts the
existing local artifact or hosted cost is explicitly approved. No `.eas/workflows` file, hosted-build
dependency, or paid run is introduced by this decision.

## Boundaries and consequences

- **Deterministic native data, real APK.** The native gate points at a loopback fixture reachable
  through Android's `10.0.2.2` alias, never at production or the real-use database; only the upstream
  data service is mocked ([ADR-0036](0036-run-single-shared-learner-environment-during-testing.md)).
  Real backend integration is owned by the real-backend web layer, not the native gate.
- **Cleartext is disposable-only.** `http://10.0.2.2` cleartext is enabled solely in the e2e build
  profile (`LRNKI_E2E_BUILD=1` → Android `usesCleartextTraffic`); development, preview, and
  production keep the Android secure default, and the e2e APK is gitignored and never distributed.
- **Selectors are semantic.** Flows and web specs use accessibility labels, roles, and minimal
  app-owned `testID`s — never generated prose, coordinates, or styling classes.
- **An agent-started run must build the APK from the tree under test.** The gate drives an installed
  artifact, not the working tree, so a green run against a stale APK is evidence about a build
  nobody is asking about. Rebuild with `scripts/build-learner-android.sh e2e` whenever learner-app
  source moved since the existing APK, and record which tree the APK came from with the result.
- **Physical gate remains open.** This ADR and the flow header in
  `apps/learner-app/.maestro/flows/android-runtime-reliability.yaml` keep the touch-responder class
  and all uncovered native surfaces physically owned; agent-initiable emulator runs narrow none of
  it. `docs/plans/BLOCKERS.md` carries only *unresolved user actions*, so a standing scope limit
  like this one is recorded here rather than there.

## Revisit triggers

- The user records a physical pass correlating the emulator dialog scenario → the Support Path dialog
  class may move to automatic authority for that scenario only.
- A non-flaky emulator (or hosted device-farm) reproduction of the touch-responder regression appears
  → reconsider the Theory scenario's rejection.
- Expo's hosted Maestro job leaves alpha and accepts the local artifact, or hosted cost is approved
  → reconsider the EAS Workflows deferral.

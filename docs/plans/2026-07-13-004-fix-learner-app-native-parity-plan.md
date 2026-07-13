---
type: fix
status: ready
origin: user-reported Android device pass defects, 2026-07-13 (see BLOCKERS.md Android device pass)
---

# Learner App Native/Web Parity Fix Plan

## Goal

Make the native (Android) Learner App render and behave the same as the proven web build: trail
checkpoint circles visible, motion playing, dialogs showing their content, and concept headers
laid out as one row. Web is the current completion bar ([ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md),
BLOCKERS.md); this plan closes the native gap without regressing web, under the Flow UX contract in
[ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).

## Status and scope

- **Readiness:** ready; diagnosis-first (U1 confirms hypotheses before any fix lands).
- **Scope:** `apps/learner-app` presentation layer only — UI kit (`src/ui/`), components, and
  native build/runtime configuration. No projection, API, or persisted-shape changes.
- **Out of scope:** iOS validation (stays deferred in BLOCKERS.md), haptics/reduced-motion device
  matrix beyond what the four defects require, NativeWind v5 migration unless U1 proves the pinned
  v4 line cannot be fixed by configuration.
- **Coordination:** [TODO](./TODO.md) tracks execution status. This plan precedes
  [Crystal Guardian Challenges](./2026-07-13-003-feat-crystal-guardian-challenges-plan.md) in
  execution order: Guardian builds new native-rendered surfaces on the same UI kit, so the kit must
  be proven on native first.

## Reported defects (symptom ledger)

| # | Symptom (Android build) | Prime suspect in code |
|---|---|---|
| S1 | No circle nodes on the expedition map | `CheckpointCircle` draws circles purely with NativeWind classes (`rounded-full border-2 bg-*`) on `PressableSurface` — a `cssInterop`-registered `Animated.createAnimatedComponent(Pressable)` (`src/ui/actions.tsx:22`) |
| S2 | No animation | Reanimated worklets (`useAnimatedStyle`/`withTiming`) not executing, or animated styles inert, on the native runtime |
| S3 | Dialogs have no content | `OverlayEntrance` (`src/ui/overlays.tsx:101`) mounts at `opacity: 0` and animates to 1 — if S2 holds, entrance never plays and content stays invisible; independently, `DialogBody`'s `min-h-0 shrink` ScrollView may collapse under Yoga inside the height-capped `DialogPrimitive.Content` |
| S4 | Concept headers take 3 rows, all elements left-aligned | `ConceptMarker`'s header is a `flex-row` `PressableSurface` with exactly three children (label, glyph, chevron); a dropped className yields exactly three stacked left-aligned rows |

The symptoms cluster: **every broken element is either a Reanimated animated surface or a
`cssInterop`-registered animated component**, while plain `View`/`Text` NativeWind styling
apparently survives (the app is otherwise navigable). This is not four independent bugs.

## Problem class (rule 21)

Established, upstream-documented class: **NativeWind className interop silently dropping styles on
Reanimated animated components on native**, with a second documented class of
**NativeWind ↔ Reanimated 4 version/plugin misalignment** breaking animation execution:

- [reanimated#8329 — NativeWind classes not applied on `Animated.View` (Reanimated 4.1.1)](https://github.com/software-mansion/react-native-reanimated/issues/8329)
- [nativewind#1181 — classes not applied on `Animated.View`](https://github.com/nativewind/nativewind/issues/1181)
- [nativewind#1709 — css-interop runtime breaks `createAnimatedComponent` refs on Expo 54 / Reanimated 4](https://github.com/nativewind/nativewind/issues/1709)
- [nativewind#785 — Reanimated above 4.0.13 breaks under NativeWind; worklets/reanimated babel-plugin duplication](https://github.com/nativewind/nativewind/issues/785)
- [NativeWind v5 migration guide](https://www.nativewind.dev/v5/guides/migrate-from-v4) — v4 is no
  longer the actively supported line.

Repo pins (pnpm catalog `expo`): Expo SDK 57, RN 0.86 (`newArchEnabled: true`), `nativewind@4.2.6`,
`react-native-reanimated@~4.5.0`, `react-native-worklets@0.10.0`. The conventional root-cause fix
for this class is **version/config alignment with the supported upstream combination**, not
per-component workarounds. A bespoke patch (e.g. replacing className with inline styles on affected
components) is a last resort and must be recorded per rule 21 if chosen.

An additional repo-history reason to expect exactly this divergence: the 2026-07-13 Support Path
gate established the “browser-probe-only defect class” — all recent rule-14 gates drove the web
build only, so a native-only interop failure could ship unobserved. This plan’s validation unit
closes that hole for the four defects and records the native probe as part of the practice.

## Hypotheses and diagnosis probes (U1 resolves these)

- **H-A (interop drop):** `cssInterop`-registered animated components lose className→style mapping
  on native new arch. Probe: on the native build, inspect one `PressableSurface` (e.g. a Button)
  and one plain `View` sibling — if the plain `View` is styled and the animated one is bare, H-A is
  confirmed. Static cross-check: `expo export --platform android` and verify whether the compiled
  style registry in the bundle contains the affected classes at all.
- **H-B (worklets dead):** Reanimated animations never execute natively. Probe: press feedback
  (scale on `PressableSurface`) and the overlay entrance — if content appears after S3 elements are
  given a non-animated fallback, or `useAnimatedStyle` values never advance, H-B is confirmed.
  Check `npx expo-doctor` / `expo install --check` for reanimated/worklets/babel-plugin alignment
  (babel-preset-expo must contribute the worklets plugin exactly once — see nativewind#785).
- **H-C (stale artifact):** the tested APK predates the current styling system or was bundled from
  a stale Metro cache (a known repo gotcha). Probe first, cheapest: rebuild
  `pnpm build:android:dev` fresh (`npx expo start -c` for the dev-client server) and re-observe
  before trusting any other probe.
- **H-D (Yoga-only dialog collapse):** independent of styling, `DialogBody`'s `min-h-0 shrink`
  scroll region collapses on native (the KTD9 anatomy was verified against the web focus-wrapper
  quirk only — both existing platform forks in `ui/overlays.tsx` compensate for web, none for
  native). Probe: after H-A/H-B are fixed or ruled out, open the Board/Support Path dialog on
  native and check whether the body region has height.
- **H-E (CSS-variable theme loss, fallback hypothesis):** the tailwind theme maps every color/
  radius/size through `var(--…)` emitted by an `addBase(":root")` plugin (`tailwind.config.js`);
  if the native runtime fails to resolve those variables, colored surfaces go transparent while
  layout survives. Only investigate if H-A does not fully explain S1.

## Key technical decisions

### KTD1 — Diagnose on a development build before changing code

All probes run against a freshly built development-profile client (`pnpm build:android:dev` +
`expo start`), because it is the shortest rebuild-and-observe loop and eliminates H-C by
construction. The preview APK is rebuilt only for final validation. Jest cannot see this defect
class at all — the test babel env deliberately keeps className inert — so no unit test may be
offered as evidence (ADR-0013).

### KTD2 — Prefer supported-version alignment over bespoke wrappers

If U1 confirms H-A/H-B, the first-choice fix is aligning to the upstream-supported combination
(NativeWind patch/minor within v4, exact reanimated/worklets pair, babel plugin de-duplication),
following the issues above. Migrating to NativeWind v5 is in scope **only** if the v4 line has no
working combination for SDK 57/Reanimated 4.5 — it is the supported line and closer to root cause
than pinning backwards, but it touches every className in the app, so it needs its own regression
sweep. Per-component inline-style workarounds are accepted only with a recorded rule-21
justification and must cover all four symptoms, not just the probed one.

### KTD3 — Entrance animations must fail visible, not invisible

Regardless of root cause, the overlay/dialog anatomy may not gate content visibility on an
animation completing. `OverlayEntrance` already renders the settled state under reduced motion;
the same settled-state path becomes the structural default so a non-running animation degrades to
“no entrance motion,” never to “no content.” This is a deterministic structural guarantee, not a
heuristic gate (rule 16 does not apply).

### KTD4 — One dialog anatomy that is correct on Yoga and CSS

The KTD9 dialog anatomy (fixed header, shrinkable scrolling body, fixed footer) stays, but its
sizing must be expressed so both layout engines agree. If H-D is confirmed, fix inside
`ui/overlays.tsx` (`Dialog`/`DialogBody`) only — consumers keep the “no bounded wrapper” contract.
Any new platform fork gets a comment naming the engine behavior it compensates for, matching the
two existing web forks.

### KTD5 — Native probe joins the real-use gate for learner-app changes

The rule-14 practice for Learner App work gains a native leg: any change touching `src/ui/` or
animated presentation is not “validated” on web evidence alone. Record this in the TODO validation
note and in the BLOCKERS.md device-pass item resolution so the browser-probe-only defect class is
closed durably, not just for this fix.

## Implementation units

### U1 — Reproduce and bisect on a fresh development build

Rebuild the dev client fresh (H-C first), then run the H-A/H-B probes on the expedition trail and
one dialog. Output: a confirmed hypothesis set written into the PR/TODO note, with screenshots into
`tmp/2026-07-13-learner-app-native-parity/`. Any temporary probe route is scratch and is deleted
before the first fix commit (rule 10/18). **Decision point:** U2–U4 scope is confirmed here; if the
defects vanish on a fresh build (H-C alone), skip to U5 and record the stale-artifact cause.

### U2 — Restore className interop on animated components (S1, S4)

Apply the KTD2 fix so `PressableSurface`, `Animated.View` (motion.ts), and every
`cssInterop`-registered animated component style identically on native and web. Acceptance:
checkpoint circles render as bordered circles and `ConceptMarker`'s header is one row on native;
web unchanged. If H-E surfaced, fold the variable-resolution fix in here (token pipeline stays
single-source per its KTD1).

### U3 — Restore motion on native (S2)

Align the reanimated/worklets/babel-plugin stack per KTD2 so press scale, the next-stop halo swell,
chevron rotation, and overlay entrances play on native. Acceptance: the U1 probe animations
visibly run on device; reduced-motion still renders settled states immediately.

### U4 — Dialog content visible and scrollable on native (S3)

Land KTD3 (entrance cannot hide content) in `OverlayEntrance`, then verify/fix the KTD4 body
sizing on native (H-D). Acceptance: Board dialog, `SupportPathDialog`, and one long-content dialog
show header, full body (scrollable when tall), and reachable footer actions on a small Android
viewport; the web 85vh behavior from the 2026-07-13 gate is re-checked unregressed.

### U5 — Native rule-14 gate + documentation consolidation

Rebuild the preview APK and run the real-device pass against the four defects plus the flows the
BLOCKERS.md item already lists (overlays, press feedback, disclosure, haptics, reduced motion,
crystal growth) on a real expedition against the live API. Evidence to
`tmp/2026-07-13-learner-app-native-parity/`. Then: resolve or narrow the BLOCKERS.md Android item,
fold the outcome into TODO COMPLETED/VALIDATION, record KTD5 in the validation note, delete this
plan, and register any durable platform-fork rationale as comments at the fork sites (no new ADR
unless the fix changes a documented decision, e.g. a NativeWind v5 migration would amend rule-15
tooling facts).

## Acceptance criteria

1. On a physical Android device (fresh preview build): trail shows circular checkpoint nodes with
   the guided-next halo; concept headers are single-row with label left, glyph and chevron right;
   dialogs show content with reachable actions; press/entrance/halo/chevron motion plays.
2. Web build re-probed on the same flows with zero visual/behavioral regression.
3. No consumer component gained platform forks; forks live only in `src/ui/` with
   engine-behavior comments.
4. Jest suite, typecheck, and lint green — acknowledged as non-evidence for this defect class.
5. BLOCKERS.md, TODO.md, and plans README updated; this plan deleted on completion.

## Risks

- **No Android device/emulator in the agent environment:** U1/U5 device observation may need the
  user's device (as the original report did). Mitigation: the dev-client loop plus bundle
  inspection narrows hypotheses before any manual step, and manual steps are batched into at most
  two device sessions (one bisect, one final gate), tracked via BLOCKERS.md if the user must act.
- **NativeWind v5 migration cascade (only if v4 is unfixable):** touches every styled component;
  if entered, it becomes its own checklist inside U2 with a full-screen web sweep before the
  native gate.
- **Upstream bug with no released fix:** then the rule-21-recorded workaround applies at the
  `src/ui/` layer only, keeping consumer components clean for later removal.

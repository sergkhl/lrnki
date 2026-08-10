# Native Android Maestro gate (opt-in)

This file owns the native gate's current scenario claims and mechanics; general evidence authority
lives in [AGENTS.md](../../../AGENTS.md#validation-authority). The gate drives the **real standalone
e2e-profile APK** on an Android emulator with
[Maestro](https://maestro.dev), against a **deterministic loopback fixture** — real React Native
primitives, real Yoga layout, real gesture dispatch; only the upstream data service is mocked.

**Scope (measured, U6 negative-control sensitivity):**

1. **Support Path dialog — ADOPTED automatic authority.** The contextual term dialog must show its
   title, body, and close action, and closing must return to the same Theory activity (the measured
   dialog-geometry regression, commit `0b1c9d3`). Its negative control collapses the dialog to zero
   height and fails this block deterministically 3/3, so these assertions are a trustworthy gate.
   **Known width sensitivity (2026-08-01):** at a 320 dp-wide display this block fails, and not
   because the app is broken — driven by hand at 320 dp the Support Paths panel is fully reachable
   with every term row and affordance on screen. `scrollUntilVisible` reports the panel visible
   before it actually is at that width, so the following `tapOn` lands on the Theory footer
   `Continue` and advances to the Question activity, whose own panel has no dialog open. A flow that
   can tap the wrong control is a flow that could also pass for the wrong reason, so this wants a
   fix — but changing an adopted-authority flow means re-running its negative control.
2. **Theory scroll — NAVIGATION only.** The real device swipe reaches the Support Paths panel to open
   the dialog, but the touch-responder regression (commit `ddc0ec9`) is only intermittently
   reproducible on the emulator, so that class stays **physically owned** and is not narrowed here.
3. **Crystal Guardian obelisk — VISUAL EVIDENCE, no automatic authority.** A second flow walks a
   deterministic five-ward Leg Guardian through entry, partial, miss, Last Stand, and Final Ward, and
   screenshots each. Its assertions only prove the flow reached the intended state; whether the ward
   states are still separable by fill, facet, gloss, and contour on react-native-svg's native canvas
   is a judgement made from the PNGs, and no negative control has been measured for it.

Each flow file is one scenario with one claim: mixing an unproven visual capture into the
adopted-authority flow would blur what a green run means. The runner runs the whole directory.

This is **not** in `pnpm check` and shares nothing with the intercepted web suite or the real-use
web suite. It never touches production or the real-use database.

## Prerequisites

- **JDK 17** (Gradle/AGP for this Expo SDK): `brew install --cask temurin@17`.
- **Android SDK + a booted emulator.** e.g. `$ANDROID_HOME/emulator/emulator -avd <name>`.
- **Maestro CLI**: `curl -fsSL https://get.maestro.mobile.dev | bash`.
- **The e2e APK**: `scripts/build-learner-android.sh e2e` → `apps/learner-app/lrnki-learner-e2e.apk`.
  This profile sets `LRNKI_E2E_BUILD=1` (Android `usesCleartextTraffic: true`, via `app.config.ts`
  + `expo-build-properties`) and bakes `EXPO_PUBLIC_LEARNER_API_URL=http://10.0.2.2:8799`. Cleartext
  exists **only** in this disposable artifact; preview/production keep the Android secure default.
  The APK is gitignored and must never be uploaded or distributed.

  **Rebuild it whenever app code changes.** It is gitignored, so it is never refreshed by a pull, and
  the runner installs whatever is on disk without comparing it to the tree — a stale APK runs the
  *old* app against the current flows and fails on selectors that the working tree already has, or
  worse, passes on behaviour that no longer exists. This is not hypothetical: the Better Auth cutover
  left the checked-out APK carrying the deleted PIN gate, which is why those flows went a whole
  implementation unit without ever running. Check `ls -la` against your last app change before
  trusting a run.

## Run

```bash
pnpm e2e:native:maestro                            # from repo root
pnpm e2e:native:maestro --device emulator-5554     # required when several devices are attached
```

The runner (`run.ts`) checks prerequisites and fails early with an exact setup command; resolves one
device serial and gives it to **both** `adb` and Maestro (they disagree about ambient config — `adb`
honours `ANDROID_SERIAL`, Maestro does not — so it fails closed rather than let the two drive
different devices); generates an **ephemeral fixture-only login** and passes it, with the fixture
challenge id, to both the fixture server and Maestro's `-e` params (never committed to flow YAML);
starts the loopback fixture (`server.ts`) on `:8799`; `adb install`s the APK; runs the flows; and
tears the fixture down. Evidence (JUnit report, screenshots) lands under
`tmp/2026-07-15-durable-learner-e2e-gates/native/`.

Two host gotchas, each already paid for once. Turn emulator autofill off
(`adb shell settings put secure autofill_service null`) or a "Save password?" sheet covers the app
right after the fixture login. And do not boot the AVD while a Gradle build is saturating the CPU: a
starved cold boot raises a **"System UI isn't responding"** ANR that covers a perfectly rendered app
and fails the first assertion of every flow.

## Fixture data

`scenario/*.json` are **real learner-api response shapes**, captured once from the supervisor-free
API over a genuine production enrichment ("Vesicular transport", Cell Biology — a 12-lesson
expedition with a long Theory activity and available Explorable Terms) and frozen. `server.ts`
replays them and acks non-graded writes, so session reads hold no mutable state. The emulator reaches
the host loopback fixture through Android's `10.0.2.2` alias.

Identity is faked at the **wire** level, never stubbed in the app: the flow drives the real sign-in
UI, the real `authClient`, and the real `@better-auth/expo` SecureStore mirror, and `server.ts`
answers Better Auth's own shapes on `/auth/sign-in/email` and `/auth/get-session`. Three constraints
that fail silently if broken, each already paid for once:

- **The `Set-Cookie` name must be `better-auth.session_token`.** The Expo plugin persists a cookie
  only when its name carries the default `better-auth` prefix and a `session_token`/`session_data`
  suffix. Any other name is dropped with no error and the app returns to the gate.
- **No `Secure` flag.** The emulator reaches the fixture over cleartext http, so a `Secure` cookie is
  never stored. The real API behaves the same way — it derives that flag from its base URL's scheme.
- **`get-session` answers `null` when the request carries no cookie.** `launchApp: clearState: true`
  wipes SecureStore, so a fixture that always returned a session would boot straight into the Journal
  and the flow's first assertion — the sign-in gate — would fail for the wrong reason.

The flow **signs in** rather than signing up: the fixture models one pre-existing learner, and a
freshly created account could not plausibly own the frozen 12-lesson journal it then reads.

`guardianFixture.ts` is the one stateful surface, because the ward states the Guardian flow exists to
look at are only reachable by answering. It holds a five-ward lineup and an append-only event log,
and folds them with the **production** `foldRecallChallenge` / `projectRecallChallengeView`, so queue
rotation, the shield floor, the recovery edge, and the learner-safe view are not represented a second
time. It is authored rather than captured, and that is deliberate: unlike the JSON beside it, it sits
inside the app's tsconfig `include`, so `StudyItem` and `RecallChallengeView` shape-correctness is
proven by typecheck instead of by provenance. The runner spawns it fresh per run, so every run starts
at the entry state.

> **Design note — captured shapes, not shared builders.** This adapter freezes captured real
> responses rather than sharing one response-builder module with the intercepted Playwright suite.
> That guarantees shape-correctness without refactoring the green intercepted suite's inline
> fixtures. The two suites therefore do not share one scenario module; unifying them is optional and
> only worthwhile if it does not obscure the intercepted suite (it currently would).

## Selectors

Accessibility labels and app-owned `testID`s only — never generated prose or coordinates. The
inline Explorable Term is a nested `<Text>` span with no queryable Android resource-id, so the flow
targets the real `SupportPathsPanel` views (`support-paths-panel`, `support-path-add-<term>`, the
component's designed large-target equivalent); scrolling to the panel still exercises the long-Theory
device swipe. The specific term value is fixed by the checked-in deterministic scenario.

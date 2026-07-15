# Native Android Maestro gate (opt-in)

The **native interaction gate** (plan `2026-07-15-001` U5). It drives the **real standalone
e2e-profile APK** on an Android emulator with [Maestro](https://maestro.dev), against a
**deterministic loopback fixture** — real React Native primitives, real Yoga layout, real gesture
dispatch; only the upstream data service is mocked. Its purpose is the two escaped Android-only
interaction classes that web gates and jest cannot observe:

1. **Theory scroll** — a real device swipe beginning over long Theory content must reach later
   content (the `@rn-primitives/dialog` touch-responder regression, commit `ddc0ec9`).
2. **Support Path dialog** — the contextual term dialog must show its title, body, and close action,
   and closing must return to the same Theory activity (the measured dialog-geometry regression,
   commit `0b1c9d3`).

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

## Run

```bash
pnpm e2e:native:maestro     # from repo root
```

The runner (`run.ts`) checks prerequisites and fails early with an exact setup command; generates an
**ephemeral fixture-only login** and passes it to both the fixture server and Maestro's `-e` params
(never committed to flow YAML); starts the loopback fixture (`server.ts`) on `:8799`; `adb install`s
the APK; runs the flow; and tears the fixture down. Evidence (JUnit report, screenshots) lands under
`tmp/2026-07-15-durable-learner-e2e-gates/native/`.

## Fixture data

`scenario/*.json` are **real learner-api response shapes**, captured once from the supervisor-free
API over a genuine production enrichment ("Vesicular transport", Cell Biology — a 12-lesson
expedition with a long Theory activity and available Explorable Terms) and frozen. The fixture holds
no mutable state: `server.ts` replays them and acks non-graded writes. The emulator reaches the host
loopback fixture through Android's `10.0.2.2` alias.

> **Deviation from the plan's R16.** The plan called for extracted shared response *builders*
> (`learnerApiScenarios.ts`) consumed by both the Playwright adapter and this HTTP adapter. This
> implementation instead freezes captured real responses to guarantee shape-correctness without
> refactoring the green intercepted suite's inline fixtures. The two suites therefore do not yet
> share one scenario module; unifying them (or proving the extraction does not obscure the
> intercepted suite) remains open (see the plan's H3 / U6–U7 handoff).

## Selectors

Accessibility labels and app-owned `testID`s only — never generated prose or coordinates. The
Explorable Term testID (`theory-term-<term>`) is a stable semantic control boundary; the specific
term value is fixed by the checked-in deterministic scenario.

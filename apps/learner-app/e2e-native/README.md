# Native Android Maestro gate (opt-in)

The **native interaction gate**
([ADR-0038](../../../docs/adr/0038-native-interaction-gate-scope-and-physical-authority.md)). It
drives the **real standalone e2e-profile APK** on an Android emulator with
[Maestro](https://maestro.dev), against a **deterministic loopback fixture** — real React Native
primitives, real Yoga layout, real gesture dispatch; only the upstream data service is mocked.

**Scope (measured, U6 negative-control sensitivity):**

1. **Support Path dialog — ADOPTED automatic authority.** The contextual term dialog must show its
   title, body, and close action, and closing must return to the same Theory activity (the measured
   dialog-geometry regression, commit `0b1c9d3`). Its negative control collapses the dialog to zero
   height and fails this block deterministically 3/3, so these assertions are a trustworthy gate.
2. **Theory scroll — NAVIGATION only.** The real device swipe reaches the Support Paths panel to open
   the dialog, but the touch-responder regression (commit `ddc0ec9`) is only intermittently
   reproducible on the emulator, so that class stays **physically owned** and is not narrowed here.

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

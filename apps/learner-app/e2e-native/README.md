# Native Maestro gates

Android runs a standalone Debug e2e APK on an emulator; iOS runs a Debug simulator build through the
Expo development client. Both use a loopback fixture with the tracked catalog, production content
qualifier, and learner runtime. Fixture identity and in-memory state replace auth persistence and
Postgres. Neither gate touches a real database, deployment, or physical device.

[AGENTS.md](../../../AGENTS.md#validation-authority) owns evidence authority. The platform results
remain distinct integration evidence, separate from distributable and physical passes.

## Scenario claims

- `android-runtime-reliability.yaml` retains automatic authority for the Support Path dialog at
  320 dp. Title, body, footer, and close/restore assertions are required. Body/footer assertions
  detect the historical isolated dialog-collapse mutant; a title-only assertion did not. The flow
  also covers the first Lesson's compact source disclosure and all authored Leg titles through
  fixture-supplied keys.
- The swipe reaching Support is navigation evidence, not the physical-device-owned touch-responder
  class.
- `signin.yaml` covers a visible wrong-password refusal followed by a successful session. Other
  scenarios use fixture-only one-tap sign-in through the app's Better Auth cookie path.
- `crystal-guardian-obelisk.yaml` closes the first-visit board celebration before capturing Leg and
  Expedition Guardians. Its screenshots have judgment authority only.

To requalify the Support class, run the positive flow and an isolated behavior-only negative control
that must fail at the body/footer assertion. Retain the correlated user-recorded physical pass in
this README before granting automatic authority. Other visual/smoke results do not inherit it.

## Prerequisites and build

Use JDK 17, the Android SDK, a booted emulator, and Maestro CLI. After app changes, build a fresh APK:

```sh
scripts/build-learner-android.sh e2e
```

The gitignored `apps/learner-app/lrnki-learner-e2e.apk` embeds `http://10.0.2.2:8799` and enables
cleartext for the fixture. Never upload or distribute it. Rebuild after app changes; an existing APK
does not establish correspondence to the working tree.

## Android execution

From the repository root:

```sh
caffeinate -dimsu pnpm e2e:native:maestro
```

The runner refuses missing tools/APK or ambiguous device selection. It starts the fixture on `:8799`,
installs the APK, passes fixture identity and production-created challenge ids to Maestro, runs each
flow separately, then stops the fixture. Use the runner's artifact directory for JUnit and screenshots.
Set `NATIVE_MAESTRO` or `NATIVE_ADB` to exact compatible binaries when diagnosing tool regressions and
record the selected binaries.

For the required narrow run, select a 1080 px-wide emulator from `adb devices -l` and set
`LRNKI_EMULATOR_SERIAL` to its serial. Apply 540 dpi and restore density even after failure:

```sh
(
  set -e
  trap 'adb -s "$LRNKI_EMULATOR_SERIAL" shell wm density reset' EXIT
  adb -s "$LRNKI_EMULATOR_SERIAL" shell wm density 540
  pnpm e2e:native:maestro --device "$LRNKI_EMULATOR_SERIAL"
)
```

The runner passes one resolved serial to both Maestro and `adb`. An incompatible-signature install
removes only the configured app id and retries once, erasing that app's local data.

Keep the host awake and unlocked. System UI/autofill overlays invalidate product claims; stabilize
the host/AVD before rerunning. Coordinates, sleeps, and repeated taps are not a repair.

## iOS Debug simulator

Keep a fresh Debug build and Metro server running against the fixture:

```sh
EXPO_PUBLIC_LEARNER_API_URL=http://127.0.0.1:8799 pnpm dev:ios
```

Then run:

```sh
pnpm e2e:native:maestro:ios
```

The runner requires one booted simulator, the installed bundle, and Metro at
`http://127.0.0.1:8881/status`. With multiple booted simulators, select one using `--device` and its
UDID from `xcrun simctl list devices booted`.

Preserve these host/tooling corrections:

- Maestro's DADB discovery probes IPv4 `localhost:5555` even with an iOS UDID; Docker Desktop can
  accept that socket without speaking ADB and block discovery. The runner scopes
  `-Djava.net.preferIPv6Addresses=true` to Maestro's JVM; XCUITest retains its explicit `127.0.0.1`
  endpoint. Remove the correction only after a plain hierarchy probe and the whole flow pass without
  it. Do not stop Docker, edit `/etc/hosts`, or add unbounded retries to work around it.
- `clearState` reinstalls the Debug client and loses its Metro endpoint. The flow opens the runner's
  exact `exp+lrnki://expo-development-client` URL. App config hides onboarding, the launch menu, and
  the Tools button; the standard simulator/device gesture still opens the developer menu.
- Keychain survives reinstall. `clearKeychain: true` is required for a clean auth refusal/recovery
  path; `clearState` alone is insufficient.

The iOS flow covers keyboard-backed wrong-password recovery, Journal/board celebration, first Lesson
source disclosure, all Leg titles, Support body/footer, both Guardian scopes, leaderboard, and a
no-reset process restart. It owns Debug-simulator integration smoke, without automatic visual
regression authority. Use the runner's artifact directory for JUnit and screenshots.

## Fixture and selectors

[The fixture](server.ts) qualifies the catalog, creates one learner in `MemoryLearnerStateStore`,
completes Critical Thinking through production commands, wins each Leg Guardian, and creates Leg
rematch and Expedition challenges. It exports representative content keys and labels instead of
copying prose into flows. Learner reads and commands delegate to `LearnerRuntime`; keys stay private.

Identity is faked at the wire seam. The committed `.invalid` address works only in this fixture. Its
`better-auth.session_token` cookie is non-`Secure` for loopback HTTP; `/auth/get-session` returns
`null` without it so clearing state returns to sign-in.

Use accessibility labels and app-owned test ids, never coordinates or generated prose. A wait and
its action must target the same node: scroll it fully into view, assert enabled, then tap, so fixed
chrome cannot intercept an apparently visible descendant.

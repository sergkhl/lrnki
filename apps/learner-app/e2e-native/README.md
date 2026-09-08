# Native Maestro gates

Android runs a standalone e2e APK on the connected physical device; iOS runs a Debug simulator build through the
Expo development client. Both use a loopback fixture with the tracked catalog, production content
qualifier, and learner runtime. Fixture identity and in-memory state replace auth persistence and
Postgres. Neither gate touches a real database or deployment.

[AGENTS.md](../../../AGENTS.md#validation-authority) owns evidence authority. The platform results
remain distinct integration evidence, separate from distributable and user-recorded physical acceptance.

## Scenario claims

- `android-runtime-reliability.yaml` runs the shared focused-learning scenario: theory
  progression, a source dialog, instant question submission with held feedback, contextual Support
  body/footer and return, and Leg titles in the Trail drawer. The fixture supplies authored selectors.
  This is integration smoke. The replaced centered Support dialog's historical collapse oracle and
  physical correlation do not grant automatic visual authority to the new full-screen flow.
- Scrolling to Help establishes automated navigation on the recorded target; it does not establish
  user-recorded touch or visual acceptance.
- `signin.yaml` covers signup reflow with the software keyboard open, a visible wrong-password
  refusal, and a successful session. Other
  scenarios use fixture-only one-tap sign-in through the app's Better Auth cookie path.
- `crystal-guardian-obelisk.yaml` closes the first-visit board celebration before capturing Leg and
  Expedition Guardians. Its screenshots have judgment authority only.

The focused flow waits for the enabled Trail trigger and confirms the drawer is open before
scrolling. It must reach the third Leg, beyond the initial viewport. Native dismissible overlays
keep the backdrop beside their content and remove the primitive Content's responder claim;
making the backdrop a pressable ancestor blocked the Trail's iOS ScrollView. Preserve this
gesture boundary in [the overlay implementation](../src/ui/overlays.tsx), following React Native's
[responder negotiation](https://reactnative.dev/docs/gesture-responder-system).

To establish automatic authority for the new Support presentation, first define a behavior-only
negative control that fails its body/footer oracle and record a correlated user-initiated physical
pass here. No such authority is claimed by the focused-flow integration smoke.

## Prerequisites and build

Use JDK 17, the Android SDK, a connected and unlocked Android device with USB debugging authorized,
and Maestro CLI. After app changes, build a fresh APK:

```sh
scripts/build-learner-android.sh e2e
```

The gitignored `apps/learner-app/lrnki-learner-e2e.apk` embeds `http://127.0.0.1:8799` and enables
cleartext for the fixture. Never upload or distribute it. Rebuild after app changes; an existing APK
does not establish correspondence to the working tree.

## Android execution

From the repository root:

```sh
caffeinate -dimsu pnpm e2e:native:maestro
```

The runner selects the single ready physical device and pins its serial for both `adb` and Maestro.
With multiple connected physical devices, select one from `adb devices -l` using
`pnpm e2e:native:maestro --device <serial>` or `NATIVE_DEVICE`. Offline and unauthorized targets refuse.
An emulator requires an explicit user/plan selection and `--device`; it is never a silent fallback.

The runner refuses missing tools/APK or ambiguous selection. It starts the fixture on `:8799`, uses
[ADB reverse](https://reactnative.dev/docs/running-on-device#method-1-using-adb-reverse-recommended)
to connect the device's loopback API to the local fixture, installs the APK, passes fixture identity
and production-created challenge ids to Maestro, runs each flow separately, then stops the fixture
and removes only its own reverse mapping. Existing mappings are preserved or cause a refusal if
they conflict. `NATIVE_FIXTURE_PORT` can select a different host port; the APK still uses device port 8799.
Use the runner's artifact directory for JUnit, screenshots, and `device.json`, which records the APK
hash, pinned model/serial/OS, display settings, and fixture endpoint.
Set `NATIVE_MAESTRO` or `NATIVE_ADB` to exact compatible binaries when diagnosing tool regressions and
record the selected binaries.

Preserve the connected device's existing size, density, and font scale. Record them instead of
resetting them. The intercepted layout suite owns the deterministic 320 by 568 and 200% text checks;
an explicitly requested narrow native configuration is a separate run with its own evidence.

The runner passes one resolved serial to both Maestro and `adb`. An incompatible-signature install
removes only the configured app id and retries once, erasing that app's local data.

Keep the host and device awake and unlocked. System UI/autofill overlays invalidate product claims;
stabilize the selected target before rerunning. Coordinates, sleeps, and repeated taps are not a repair.

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

The iOS flow covers keyboard-backed wrong-password recovery, Journal/board celebration, focused
theory and question feedback, source disclosure, Trail Leg titles, Support body/footer and return,
both Guardian scopes, leaderboard, and a no-reset process restart. It owns Debug-simulator integration smoke, without automatic visual
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

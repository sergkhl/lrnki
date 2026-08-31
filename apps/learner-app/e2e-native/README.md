# Native Maestro gates

The Android gate drives the real standalone e2e APK on an Android emulator. The app talks to a
loopback server that loads the tracked authored catalog, runs the production content qualifier, and
uses the production learner runtime with its in-memory state adapter. Only Better Auth persistence
and Postgres are replaced by deterministic fixture identity and memory. The gate never touches a
real database, deployment, or physical device.

The iOS gate drives a fresh Debug simulator build through its Expo development client and the same
fixture/runtime seam. It is separately named Debug-simulator integration evidence; it is not an
Android authority transfer, distributable build, or physical-device result.

General evidence authority lives in [AGENTS.md](../../../AGENTS.md#validation), and execution and
triage live in the [Android validation route](../../../.agents/skills/validate-lrnki/references/native-android.md).

## Scenario claims

- `android-runtime-reliability.yaml` retains automatic authority for the Support Path dialog at a
  320 dp viewport. Its title, body, footer, and close/restore assertions are all required. The body
  and footer are the sensitivity oracle for the historical isolated dialog-collapse mutant; a
  title-only assertion did not distinguish that mutant.
- The swipe needed to reach the Support action is navigation evidence only. It does not claim the
  separately physical-device-owned touch-responder class.
- `signin.yaml` is native integration coverage for a visible wrong-password refusal followed by a
  successful session. Other scenarios use the fixture-only one-tap sign-in, which still exercises
  the app's Better Auth cookie path.
- `crystal-guardian-obelisk.yaml` is visual smoke for the authored Leg and Expedition Guardian
  presentations. Its screenshots are judgment evidence only; no rendering mutant gives it automatic
  authority.

Emulator evidence is not physical-device or distributable-build evidence.

## Prerequisites and build

- JDK 17.
- Android SDK plus a booted emulator.
- Maestro CLI.
- A fresh e2e APK built after the latest app change:

```bash
scripts/build-learner-android.sh e2e
```

The build writes `apps/learner-app/lrnki-learner-e2e.apk`. It is gitignored, must not be uploaded or
distributed, enables cleartext only for the emulator fixture, and embeds
`http://10.0.2.2:8799` as its learner API URL. A checked-out APK is not evidence that it matches the
working tree; rebuild it whenever app code changes.

For iOS, keep a fresh Debug build and Metro server running against the fixture origin:

```bash
EXPO_PUBLIC_LEARNER_API_URL=http://127.0.0.1:8799 pnpm dev:ios
```

The iOS runner fails closed unless exactly one simulator is booted (or `--device <udid>` selects
one), the configured bundle is installed, and Metro answers at `http://127.0.0.1:8881/status`.

## Run

From the repository root:

```bash
caffeinate -dimsu pnpm e2e:native:maestro
caffeinate -dimsu pnpm e2e:native:maestro --device emulator-5554
```

The runner fails closed when tools, the APK, or an unambiguous ready device are missing. It starts
the fixture on `:8799`, installs the APK, passes the fixture-only identity and production-created
Guardian challenge ids to Maestro, runs each flow separately, then stops the fixture. JUnit and
screenshot evidence lands in `tmp/2026-08-31-authored-learner-runtime/native/`.
Set `NATIVE_MAESTRO` or `NATIVE_ADB` to exact compatible binaries when diagnosing a host-level
tool regression; the selected binaries remain explicit evidence.

For the required narrow run, set a 1080 px-wide emulator to 540 dpi, then restore it even after a
failure:

```bash
adb -s emulator-5554 shell wm density 540
pnpm e2e:native:maestro --device emulator-5554
adb -s emulator-5554 shell wm density reset
```

Maestro and `adb` do not interpret ambient device selection identically, so the runner resolves one
serial and passes it to both. If installation reports an incompatible signature, the runner removes
only the configured app id and retries once; that removal erases the resident app's local data.

Keep the host awake and unlocked. Emulator System UI or autofill overlays invalidate a product
claim; stabilize the host/AVD and rerun instead of treating coordinates, sleeps, or repeated taps as
a fix.

### iOS Debug simulator

With `pnpm dev:ios` still serving Metro, run:

```bash
pnpm e2e:native:maestro:ios
pnpm e2e:native:maestro:ios --device <simulator-udid>
```

The runner owns three host/tooling corrections that are prerequisites to meaningful app evidence:

- Maestro enumerates Android endpoints even for an explicit iOS UDID. Its bundled DADB client
  probes IPv4 `localhost:5555` directly; Docker Desktop can accept that socket as a non-ADB
  listener and leave device discovery blocked before XCUITest starts. The runner scopes
  `-Djava.net.preferIPv6Addresses=true` to the Maestro JVM so that unrelated IPv4 listener is not
  mistaken for an Android emulator. XCUITest continues to use its explicit `127.0.0.1` endpoint.
- `clearState` reinstalls an Expo Debug client and erases its remembered Metro endpoint. The flow
  therefore opens the exact `exp+lrnki://expo-development-client` URL supplied by the runner.
  `app.config.ts` disables the client-only onboarding, launch menu, and floating Tools button so
  they cannot obscure learner controls; the standard simulator/device gesture still opens the
  developer menu when a human needs it.
- iOS Keychain data survives an app reinstall. `clearKeychain: true` is required before the auth
  refusal/recovery path; `clearState` alone is not a clean Better Auth start.

The single iOS flow covers keyboard-backed wrong-password recovery, Journal and board celebration,
one authored trail, the Support dialog body/footer, both Guardian scopes, leaderboard rendering,
and a no-reset process restart. Evidence lands in
`tmp/2026-08-31-authored-learner-runtime/native-ios/`.

Do not replace the JVM-scoped hostname correction with stopping Docker Desktop, editing `/etc/hosts`,
or an unbounded retry. If Maestro changes its discovery behavior, remove the correction only after a
plain hierarchy probe and this whole flow pass without it.

## Fixture and selectors

`server.ts` qualifies `content/`, creates one deterministic learner in `MemoryLearnerStateStore`,
adopts and completes Critical Thinking with production commands, and creates real Leg-rematch and
Expedition Guardian challenges. Every subsequent GET and `POST /game/commands` is delegated to the
same `LearnerRuntime` used by learner-api. Answer keys remain server-side.

Identity is faked only at the wire seam. The committed `.invalid` address authenticates only against
this fixture. The cookie name is `better-auth.session_token`, it is deliberately non-`Secure` for
loopback HTTP, and `/auth/get-session` returns `null` without that cookie so `clearState: true`
actually returns to the gate.

Flows use accessibility labels and app-owned test ids, never coordinates or generated prose. A
wait and its action must target the same node; scroll it to full visibility, assert it is enabled,
then tap it. That rule prevents fixed chrome from intercepting an apparently visible descendant.

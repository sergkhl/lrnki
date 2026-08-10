# One-Tap E2E Sign-In for the Native Maestro Rig — Plan

## Goal Capsule

Every Maestro flow currently re-drives the full ~10-step email/password sign-in UI before it reaches
its own claim, and every future flow inherits that cost. Give the disposable e2e APK a one-tap
sign-in affordance on the gate that calls the real `signInWithEmail` with fixed fixture credentials,
move manual login coverage into one dedicated sign-in flow (positive and wrong-password negative),
and delete the runner's now-superseded ephemeral-credential machinery. Google + email/password both
remain in the product exactly as [ADR-0041](../adr/0041-own-learner-identity-with-self-hosted-better-auth.md)
decided; nothing in the auth authority changes.

Decisions resolved in the planning interview (2026-08-10):

- **Mechanism:** e2e-build auto-signin, as a **one-tap button on the gate** — not silent
  sign-in-on-mount, not an auth bypass. Flows stay hermetic (`clearState: true` everywhere).
- **Sign-in paths:** keep both Google and email/password; ADR-0041 unchanged.
- **Login coverage:** one dedicated flow asserting manual login *and* visible wrong-password
  rejection (the rejection is the positive control that the gate assertion bites).
- **Sequencing:** everything that does not touch the adopted-authority flow lands now; the
  `android-runtime-reliability.yaml` login-block swap lands together with plan
  [2026-08-10-001](./2026-08-10-001-repair-320dp-native-support-path-flow.md) U2's already-pending
  negative-control re-run, so one requalification pays for both edits.

## Why This Issue Is Real

Both flows in `apps/learner-app/.maestro/flows/` open with the same 10-step login block (assert
gate → tap `gate-email` → type → hide keyboard → tap `gate-password` → type → hide keyboard → tap
Enter → assert journal). `inputText` is among Maestro's slowest steps, the block is duplicated
verbatim, and neither flow's documented claim is about login — it is pure toll. The rig also carries
runner-side ephemeral credential generation (`run.ts` `randomBytes` → fixture env → Maestro `-e`)
whose only purpose was keeping credentials out of committed YAML; once flows sign in by button, that
purpose disappears for every flow except the one that deliberately types credentials.

## Product and Test Contract

### Requirements

- R1. In e2e builds only, `SignInGate` renders one additional button (testID `gate-e2e-signin`)
  that calls the real `signInWithEmail` with the shared fixture credentials. It goes through the
  same `run` single-flight path as the other gate actions.
- R2. Production, preview, and development builds never render the button. The signal is
  `process.env.EXPO_PUBLIC_LRNKI_E2E_BUILD === "1"`, inlined at bundle time, set only by the `e2e`
  EAS profile. The former non-public `LRNKI_E2E_BUILD` is renamed to this one variable so config-time
  (cleartext seam in `app.config.ts`) and bundle-time read the same fact — no second env var.
- R3. The fixture credential pair is defined once, in one shared module inside `apps/learner-app`,
  imported by `SignInGate`, `e2e-native/server.ts`, and `e2e-native/run.ts`. The address uses the
  reserved `.invalid` TLD. Committing this constant is acceptable because it authenticates only
  against the loopback fixture; the real Better Auth store never holds this user.
- R4. The runner's ephemeral credential generation and the `NATIVE_FIXTURE_EMAIL` /
  `NATIVE_FIXTURE_PASSWORD` env plumbing are deleted in the same change (AGENTS rule 18). The
  `-e LEARNER_EMAIL/LEARNER_PASSWORD` params remain only if the sign-in flow types them; otherwise
  they are deleted too and the flow reads nothing secret (the constants are committed anyway).
- R5. A new `signin.yaml` flow owns the login-gate claim: fresh state shows the gate; a wrong
  password is visibly rejected (the themed `invalidCredentialsMessage` banner); correct manual
  entry lands on the journal. This is the only flow that touches `gate-email`/`gate-password`.
- R6. `crystal-guardian-obelisk.yaml` (visual evidence, no automatic authority, no control owed)
  replaces its login block with `tapOn: gate-e2e-signin` + journal assert now.
- R7. `android-runtime-reliability.yaml` gets the same swap, but that edit lands with plan
  2026-08-10-001 U2's negative-control re-run — never as an isolated change to an adopted-authority
  flow without requalification.
- R8. Existing wire-level realism is preserved: every flow still exercises the real `authClient`,
  the real `Set-Cookie` handling, and the `@better-auth/expo` SecureStore mirror on every run,
  because the button calls the same sign-in route the manual path does.
- R9. `SignInGate.test.tsx` covers both sides of the seam: button absent when the env flag is
  unset, and present-and-calling-`signInWithEmail`-with-the-shared-constants when set.

### Acceptance Examples

- A1. `pnpm e2e:native:maestro` on a rebuilt e2e APK: `signin.yaml` passes its
  wrong-password-then-success scenario; the guardian flow reaches "Choose an expedition" with a
  single tap after `clearState`.
- A2. A preview-profile build renders no `gate-e2e-signin` element (unit test per R9; the inlined
  `"0"` makes the branch dead code).
- A3. Deliberately breaking the app's cookie persistence (e.g. reverting the SecureStore mirror)
  still fails the suite — the button does not mask the cookie path (spot reasoning check, not a
  standing gate).

## Implementation Design

### U1. Env-flag rename and shared fixture credentials

- **Files:** `apps/learner-app/eas.json` (three profiles), `apps/learner-app/app.config.ts`, new
  `apps/learner-app/src/lib/e2eFixture.ts` (flag read + credential constants),
  `apps/learner-app/e2e-native/server.ts`, `apps/learner-app/e2e-native/run.ts`.
- **Approach:** Rename `LRNKI_E2E_BUILD` → `EXPO_PUBLIC_LRNKI_E2E_BUILD` everywhere in the same
  change; `app.config.ts` reads the new name for the cleartext seam. Define
  `E2E_FIXTURE_EMAIL` / `E2E_FIXTURE_PASSWORD` in the shared module; `server.ts` imports them and
  drops its env-var fallbacks; `run.ts` drops `randomBytes` generation and fixture-credential env,
  passing `-e` params only if U3's flow types them. Grep docs for the old env name and repair.

### U2. One-tap button on the gate

- **Dependencies:** U1.
- **Files:** `apps/learner-app/src/components/SignInGate.tsx`,
  `apps/learner-app/src/components/SignInGate.test.tsx`.
- **Approach:** Conditionally render a `gate-e2e-signin` button (plain label, e.g. "E2E sign-in" —
  test-only chrome is not learner vocabulary, ADR-0033 does not apply) that calls
  `run("enter", () => signInWithEmail({ email: E2E_FIXTURE_EMAIL, password: E2E_FIXTURE_PASSWORD }))`.
  Unit-test both flag states (R9).

### U3. Sign-in coverage flow and guardian swap

- **Dependencies:** U2, rebuilt e2e APK (the stale-APK trap is documented in the rig README — the
  button does not exist in any previously built artifact).
- **Files:** new `apps/learner-app/.maestro/flows/signin.yaml`,
  `apps/learner-app/.maestro/flows/crystal-guardian-obelisk.yaml`,
  `apps/learner-app/e2e-native/README.md`.
- **Approach:** `signin.yaml`: `clearState` → assert gate → type fixture email + wrong password →
  Enter → assert a stable substring of the invalid-credentials banner (avoid the curly apostrophe
  in a Maestro text match) → retype correct password → Enter → assert journal. Guardian flow:
  replace the login block with the one-tap sequence. Update the rig README: scenario list gains the
  sign-in claim, the credential story changes from "runner-generated ephemeral" to "committed
  fixture-only constants", and flow-header comments are corrected.

### U4. Adopted-authority flow swap (rides with plan 001 U2)

- **Dependencies:** U3 green; plan 2026-08-10-001 U2 scheduled.
- **Files:** `apps/learner-app/.maestro/flows/android-runtime-reliability.yaml`.
- **Approach:** Replace its login block with the one-tap sequence in the same working state that
  plan 001 U2 requalifies, so the dialog-collapse negative control and current-build positives run
  against the final flow shape. If plan 001 is abandoned, this unit inherits the obligation: swap
  plus its own negative-control re-run per the rig contract.

### U5. Consolidate and retire this plan

- **Dependencies:** U4.
- **Files:** this plan's `## Validation Log`, `apps/learner-app/e2e-native/README.md`,
  `docs/plans/TODO.md`, `docs/plans/README.md`.
- **Approach:** Confirm the rig README fully owns the new credential and sign-in mechanics, move
  the latest validation summary to its owner, remove this plan from the active index, and delete
  the plan after evidence is preserved in git history.

## Verification Contract

- `pnpm check` stays green (typecheck is an independent gate over the new unit tests).
- `SignInGate.test.tsx` proves both flag states (R2/R9).
- Full `pnpm e2e:native:maestro` on a freshly rebuilt e2e APK passes `signin.yaml` (with the
  wrong-password rejection actually asserted, not skipped) and the one-tap guardian flow (A1).
- The adopted-authority swap (U4) is validated only by plan 001 U2's negative-control protocol; a
  green run alone is not authority.
- No production-profile artifact contains the button: verified by the unit test on the inlined
  flag, and by grep confirming no other read of `EXPO_PUBLIC_LRNKI_E2E_BUILD` gates behavior.

## Validation Log

### U1-U3 — Shared fixture sign-in and dedicated native coverage (closed 2026-08-10)

- Renamed the single build fact to `EXPO_PUBLIC_LRNKI_E2E_BUILD` across all EAS profiles and Expo
  config. One shared `.invalid` fixture identity now serves the e2e-only gate, loopback server, and
  runner; runner-generated credentials and `NATIVE_FIXTURE_*` plumbing are deleted.
- `SignInGate` renders `gate-e2e-signin` only in the e2e bundle and sends the shared identity through
  the real `signInWithEmail` single-flight path. Focused tests prove the absent and present/call
  sides; the full repository check passed.
- Added the dedicated manual sign-in flow with a visible wrong-password assertion followed by a
  successful real-form sign-in. Guardian and Support Path now use one tap while preserving the real
  auth client, Better Auth response, cookie, and SecureStore path.
- Fresh e2e APK build completed at 2026-08-10 12:43 +06 from working-tree commit `b66e540`; Gradle
  `:app:assembleRelease` passed. Expo Doctor retained the existing SDK package-version advisory.
- Native fixture/device: `emulator-5554`, `Medium_Phone_API_36.1`, API 36, 1080×2400 px, Maestro
  2.6.1. At normal 420 dpi (~411 dp), all three flows passed in 2m03s: sign-in 37s, Support Path 43s,
  Guardian 43s. At 540 dpi (320 dp), sign-in passed twice (41s, 40s) and the final one-tap Support
  Path flow passed twice (46s, 38s). After the manual flow adopted its condition-based cold-start
  wait, its focused normal-width refusal/success rerun passed in 1m17s.

### Real-use quality evaluation

- Milestone: the native rig removes repeated form entry while preserving a dedicated visible
  refusal/success journey and the real session persistence path.
- Fixture and source type: standalone e2e-profile APK against deterministic loopback Better Auth and
  learner-api response shapes on an Android emulator.
- Real model calls used: not applicable.
- Result: PASS.
- Useful output observed: the e2e-only button is visible on the real native gate; one tap reaches the
  journal in both owning scenarios; the manual flow visibly rejects a wrong password before the
  corrected credential reaches the journal.
- Defects observed: the first run was covered by a boot-time System UI ANR and is invalid evidence.
  A later cold start exposed an immediate manual-flow gate assertion that could expire before the
  gate appeared. At 320 dp the Guardian visual flow can leave lower answer options offscreen; its
  normal-width flow passes, and neither its navigation nor 320 dp behavior is a claim of this
  milestone.
- Changes made after inspection: dismissed the incidental System UI ANR, let the emulator stabilize,
  reran at both measured widths, replaced the manual flow's immediate setup assertion with a
  30-second condition-based wait, confirmed that final flow in a focused normal-width pass, and kept
  the rig contract explicit about each scenario's claim.
- Remaining caveats: plan 001's dialog-collapse negative control and current-APK restoration pass
  still gate U4 authority; this is native-emulator fixture evidence, not real-backend, deployed,
  production, or physical-device evidence.
- Safe to continue downstream: yes, into the isolated plan 001 U2 sensitivity gate only.

### U4 — Adopted-authority flow swap (closed 2026-08-10)

- The Support Path flow's login block is replaced by `tapOn: gate-e2e-signin` plus the journal
  assertion, and that final shape is what plan
  [2026-08-10-001](./2026-08-10-001-repair-320dp-native-support-path-flow.md) U2 requalified: three
  320 dp current-build passes (46s, 38s, and the post-mutant restoration at 43s), one normal-width
  directory pass, and a 3/3 dialog-collapse negative control that failed only inside the dialog
  body/footer block. One requalification therefore paid for both the selector repair and this swap,
  exactly as the sequencing decision intended.
- The swap does not weaken the gate's realism: each of those runs still drove the real `authClient`,
  the real Better Auth `Set-Cookie`, and the `@better-auth/expo` SecureStore mirror from
  `clearState: true`, because the button calls the same email route the manual form does. The
  dedicated `signin.yaml` flow keeps the manual refusal/success coverage.

### Open findings

- None. Both plans' consolidation units execute together.

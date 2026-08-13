# Native Android

Produce evidence about the intended Android scenario without confusing host, AVD, artifact, fixture,
or tooling failure with product behavior.

## Establish the claim

1. Read the native rig [`README.md`](../../../../apps/learner-app/e2e-native/README.md) completely.
   It owns current scenarios, claims, prerequisites, selectors, runner commands, fixture mechanics,
   and viewport values; do not restate or override them here.
2. Name the exact APK revision, emulator, density or viewport, flow, and evidence class: navigation,
   visual judgment, native integration, or automatic authority for one regression class.
3. Read the owning active plan when one exists; otherwise use `docs/plans/TODO.md` for current
   plan-less status and validation.

## Prepare valid host and artifact state

- Finish CPU-heavy APK builds before cold-booting the AVD. Rebuild the e2e APK after app-code
  changes; a changed flow plus a stale gitignored APK is evidence about different revisions.
- Resolve one exact device serial and let the owning runner pass it consistently to ADB and Maestro.
- On macOS, keep the display awake and session unlocked for the whole gate. Use the rig README's
  `caffeinate` wrapper and inspect `pmset -g assertions` when host sleep may explain a failure.
- Confirm the fixture port is free. Stop only a listener proven to be an orphan from an earlier rig
  run, never an unrelated process.
- Apply the README's host settings. For narrow runs, record physical size plus physical and override
  densities, and arrange density restoration before execution.

## Run and inspect

1. Prefer the owning runner to hand-assembled fixture, install, environment, or Maestro commands.
   Use a focused flow only where the README allows diagnosis or a measured negative control.
2. Read the per-flow JUnit cases; a directory exit code does not identify the failing scenario or
   assertion.
3. Inspect every required PNG directly for visual-evidence flows. Reachability assertions do not
   judge native rendering quality.
4. After important visible behavior changes, also load [real-use quality](real-use-quality.md) and
   record its explicit verdict.

## Triage before changing the scenario

Exclude a run from product evidence when Android System UI ANR, OS permission or autofill UI,
emulator offline state, ambiguous device selection, interrupted setup, stale APK, fixture failure,
or host sleep covers or prevents the intended app interaction. Preserve diagnostics, name the
cause, stabilize the environment, and rerun.

Treat a failure as scenario or product evidence only after the flow enters the intended app state
and fails an assertion owned by its claim. Do not weaken selectors, add coordinates, or substitute an
ancestor for the intended action to manufacture a pass.

An awake-host pass after a screen-off or System UI failure is consistent with a host or AVD
lifecycle explanation, but it does not establish display sleep as the cause. A causal claim needs a
controlled comparison that holds APK, AVD state, density, CPU load, and flow constant while varying
host sleep state.

## Authority, cleanup, and report

- Preserve the rig README's claim classification. A green navigation or visual run does not acquire
  automatic authority.
- Automatic authority for one native regression class requires the behavior-only negative control
  and correlated user-recorded physical pass required by `AGENTS.md`.
- Restore and confirm density, stop the fixture, and confirm no rig listener remains. Keep JUnit,
  screenshots, and diagnostics under gitignored `tmp/`.
- Report artifact freshness, emulator and density, host awake state when relevant, every flow result,
  excluded attempts, screenshot verdict, evidence boundary, unchanged authority, and cleanup.
- For hardware, return to the router and load the [physical-device reference](physical-device.md)
  as well; emulator evidence never substitutes for it.

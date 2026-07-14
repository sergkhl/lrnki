# Blockers

- **Android preview APK + physical-device native-parity pass (manual, user-owned).** The automated
  implementation gate for [the native parity plan](./2026-07-13-004-fix-learner-app-native-parity-plan.md)
  passes, but this host has no JDK 17, Android SDK/emulator, `adb`, or device; it cannot produce or
  inspect the preview APK. In a JDK-17 Android environment, run `pnpm build:android`, install the
  resulting APK, and verify the plan's AE1–AE5 on a freshly launched app: the signed-out `Enter`
  and `Set out` controls, the signed-in `Plan a new expedition` trigger, checkpoint circles and
  halo, single-row concept headers, and Board/Support/long dialogs with reachable scrolling
  footers. Check both normal and reduced-motion states. Record the result against the evidence note
  at `tmp/2026-07-13-learner-app-native-parity/EVALUATION.md`; this is the remaining acceptance
  gate before Guardian adds learner-facing native surfaces. iOS runtime validation remains deferred.

# Blockers

- **Android preview APK + physical-device native-parity pass (manual, user-owned).** The automated
  implementation gate for [the native parity plan](./2026-07-13-004-fix-learner-app-native-parity-plan.md)
  and its Playwright web gate pass, but Android observation remains outside this host run. Run U5's
  AE1–AE5 scenarios in the existing preview-build workflow on a freshly launched physical device,
  with strict logging enabled and both normal/reduced motion covered. Acceptance includes zero
  `Reading from value during component render` warnings. Record the result against
  `tmp/2026-07-13-learner-app-native-parity/EVALUATION.md`; this is the remaining gate before
  Guardian adds learner-facing native surfaces. iOS runtime validation remains deferred.

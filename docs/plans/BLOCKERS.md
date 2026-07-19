# Blockers

- **Treasure-map trail — native regression needs an emulator host.** Plan
  [2026-07-18-001](./2026-07-18-001-treasure-map-trail.md) U4: the web real-use gate and the full
  deterministic envelope PASS (evidence `tmp/2026-07-18-treasure-map-trail/EVALUATION.md`), but the
  required `pnpm e2e:native:maestro` regression on a fresh e2e APK **plus** an emulator trail
  screenshot (web/native parity of ground, route, markers) could not run — this environment has no
  Android SDK, emulator, adb, or Maestro. The change is parity-safe by construction (no SVG filters,
  `<Pattern>` grain, literal color tokens, no forked styling or interaction/testID change), but
  react-native-svg on Android has historically differed on `<Pattern>` fills and bundled-font
  rendering, so the parity screenshot still carries value. **Action:** run `pnpm e2e:native:maestro`
  and capture one emulator trail screenshot on a host with the emulator (the same
  `Medium_Phone_API_36.1` used by prior native gates). On PASS, the plan's fold completes: amend
  ADR-0032 with the "Trail map presentation" paragraph, delete the plan, and record the outcome in
  `TODO.md`.

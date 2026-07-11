# Blockers

- **Android preview build + physical-device pass (manual, user-owned).** The learner-interaction
  system (plan 2026-07-10-003, R20) is proven on web; the Android real-device pass is deferred to a
  manual step. Run the canonical build (`pnpm build:android` → `scripts/build-learner-android.sh`,
  one-time EAS setup already done) and validate the migrated interaction system — overlays, press
  feedback, disclosure, haptics, reduced-motion, crystal growth/fusion — on a physical Android
  device. Web correctness is the completion bar for the plan; this device pass is tracked separately
  and does not block marking the plan complete. Record iOS runtime validation as deferred.

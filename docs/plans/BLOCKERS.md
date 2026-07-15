# Blockers

- **Android preview APK + physical-device learner-runtime pass (manual, user-owned).** The final
  gate for the [Learner Runtime Reliability Fix](./2026-07-14-001-fix-learner-runtime-reliability-plan.md).
  U1–U5 and the U6 automatic real-use WEB gate passed on 2026-07-15 (see TODO.md VALIDATION and
  `tmp/2026-07-14-learner-runtime-reliability/EVALUATION.md`). The FIRST preview-APK attempt
  (2026-07-15) failed AE4 — Theory would not scroll — and that defect is now root-caused and fixed
  in the working tree (`ui/overlays.tsx` FullScreenDialog responder overrides), with scrolling
  verified on the physical device through a dev client + Metro. Remaining: build a FRESH preview
  APK (`pnpm build:android`) that includes the responder fix and run the full U6 pass on a physical
  Android phone. Acceptance requires failed entry followed by successful signup to reach the
  Journal; visible loading/error recovery; real long-Theory scrolling with fixed header/footer; a
  fully visible Support Path `Preparing support` dialog through generation; and representative
  button, checkpoint, motion, reduced-motion, strict-log, and current Crystal Guardian regression
  checks. If a centered dialog with an overflowing body is encountered, spot-check that its body
  scrolls (latent same-class risk noted in TODO.md). Record screenshots/recording and the result in
  `tmp/2026-07-14-learner-runtime-reliability/`. iOS manual runtime validation remains deferred.

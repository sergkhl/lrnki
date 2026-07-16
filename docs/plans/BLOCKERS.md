# Blockers

- **Plan 2026-07-16-003 U5 — Android emulator verification of the overlay fixes.** The D6 scrim
  token and D7 sequenced menu→board handoff are implemented, but the defect class is native-only
  (invisible to web gates and jest, per KTD3/ADR-0038) and this workspace has no KVM/adb. Needed
  from the user on their emulator + Metro dev-client loop (fresh build provenance first): (1) dim
  scrim visible behind BOTH the Board dialog and the Support Path dialog, (2) Board content renders
  via BOTH the menu path and the splash path, (3) run the updated maestro flow
  (`apps/learner-app/.maestro/flows/android-runtime-reliability.yaml`, new D8d board step) against
  the e2e APK. If either symptom persists, plan 2026-07-16-003's stop condition applies —
  re-diagnose on device evidence (fallback for the blank board: harden `OverlayEntrance`
  fail-visible).

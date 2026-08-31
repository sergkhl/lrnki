---
name: validate-lrnki
description: Route and qualify lrnki validation across local automated checks, authored-content inspection, intercepted and real-backend web, Android emulators, iOS simulators, deployed systems, and physical devices. Use whenever implementing, reviewing, testing, or reporting an lrnki behavior change, running Playwright, Maestro, database-backed, deployment, or real-use gates, or deciding what an observed result proves.
---

# Validate lrnki

Use the smallest environment that can prove the changed behavior, then name the evidence class
exactly. One green class never upgrades another.

## Route

1. Classify the claim before running anything:
   - deterministic structure/logic/build;
   - authored-content semantic and teaching quality;
   - intercepted Expo web presentation;
   - real Better Auth/Hono/Postgres web behavior;
   - Android emulator native behavior;
   - iOS Debug simulator behavior;
   - deployed route behavior;
   - physical-device behavior.
2. Read only the matching reference below plus any owning rig README it names.
3. Run the smallest relevant gate first. Escalate only when the claim crosses a real boundary.
4. On failure, preserve the first causal error, classify whether the harness or product failed, and
   rerun only after naming the changed cause. A retry without a cause is not evidence.
5. Record command, environment, identity/scope, result, and what it does not prove in the active
   plan's Validation Log.

## References

- [Local automated](references/local-automated.md)
- [Authored real-use quality](references/real-use-quality.md)
- [Intercepted web](references/web-intercepted.md)
- [Real-backend web](references/web-real-backend.md)
- [Android emulator](references/native-android.md)
- [iOS simulator](references/native-ios.md)
- [Deployed](references/deployed.md)
- [Physical device](references/physical-device.md)

## Qualification rules

- `pnpm content:check` proves schema/reference guarantees and exact source-anchor existence. It does
  not prove semantic support, answer quality, teaching sufficiency, or playability.
- Deterministic and database suites prove runtime/store contracts, not learner-visible quality.
- Intercepted web proves the production-format Expo artifact against owned DTO fixtures and proves no
  unmatched request escaped. It does not prove Hono, Postgres, or Better Auth.
- Real-backend web proves the local real API/database path it actually exercises. It does not prove
  deployment, native rendering, or physical-device behavior.
- Emulator and simulator results remain platform-specific Debug evidence. They do not imply a store
  artifact or physical pass.
- Deployed reads do not authorize production writes, resets, or releases.
- Physical-device runs are user-initiated. Do not handle credentials or claim a pass from emulator
  evidence.
- Keep reports, screenshots, traces, and diagnostics in gitignored `tmp/`; retained facts belong in
  the active plan or owning README, never links to `tmp/`.

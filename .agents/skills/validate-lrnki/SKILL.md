---
name: validate-lrnki
description: Route and qualify lrnki validation across local automated checks, authored-content inspection, intercepted and real-backend web, Android emulators, iOS simulators, deployed systems, and physical devices. Use whenever implementing, reviewing, testing, or reporting an lrnki behavior change, running Playwright, Maestro, database-backed, deployment, or real-use gates, or deciding what an observed result proves.
---

# Validate lrnki

Apply the repository's [evidence authority](../../../AGENTS.md#validation-authority) and
[execution authority](../../../AGENTS.md#execution-authority).

## Route

1. Classify the claim using the table below, then read only its reference and owning rig README.
2. Run the smallest gate that exercises the change; escalate when the claim crosses a boundary.
3. On failure, preserve the first causal error, distinguish harness from product failure, and name
   the changed cause before rerunning.
4. Record command, environment, identity/scope, result, and evidence limits in the active plan's
   Validation Log, or the latest plan-less validation in [TODO](../../../docs/plans/TODO.md).

| Claim | Route |
| --- | --- |
| Content structure, logic, types, schema parity, builds | [Local automated](references/local-automated.md) |
| Teaching and semantic source support | [Authored real-use quality](references/real-use-quality.md) |
| Expo presentation against owned DTO fixtures | [Intercepted web](references/web-intercepted.md) |
| Local Better Auth/Hono/Postgres web behavior | [Real-backend web](references/web-real-backend.md) |
| Android emulator integration | [Android](references/native-android.md) |
| iOS Debug simulator integration | [iOS](references/native-ios.md) |
| Authorized deployed routes | [Deployed](references/deployed.md) |
| User-initiated physical-device behavior | [Physical device](references/physical-device.md) |

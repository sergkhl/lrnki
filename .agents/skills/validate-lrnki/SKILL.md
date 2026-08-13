---
name: validate-lrnki
description: Route and qualify lrnki validation across local automated checks, real-use quality, intercepted web, real-backend web, deployed systems, Android emulators, iOS simulators, and Android or iOS physical devices. Use whenever implementing, reviewing, testing, or reporting an lrnki behavior change; running Playwright, Maestro, database-backed, deployment, or real-model gates; investigating an invalid test run; or deciding what an observed result actually proves.
---

# Validate lrnki

Select the evidence layer before selecting a command. Use one skill entry point and load only the
reference files needed for the claim under test.

## Route the work

1. Read the canonical [validation authority](../../../AGENTS.md#validation-authority).
2. Name the product claim, environment, artifact or revision, and intended evidence class before
   running anything.
3. Load the smallest applicable reference set from the table. Do not preload every reference.
4. If one requested conclusion spans multiple layers, validate and report each layer separately.
5. After an important behavior-changing milestone, also load the real-use quality reference. A
   green automated suite does not replace direct usefulness inspection.

| Intended evidence | Load |
| --- | --- |
| Source, unit, type, lint, build, or isolated DB behavior | [Local automated checks](references/local-automated.md) |
| End-user or downstream usefulness, including real LLM output | [Real-use quality](references/real-use-quality.md) |
| Production-format web export with deterministic API interception | [Intercepted web](references/web-intercepted.md) |
| Web export over a real local API and Postgres | [Real-backend web](references/web-real-backend.md) |
| A published web artifact, deployed API, or full deployed path | [Deployed](references/deployed.md) |
| Android APK behavior on an emulator | [Native Android](references/native-android.md) |
| iOS app behavior on a simulator, including future automated gates | [Native iOS](references/native-ios.md) |
| Android or iOS behavior on hardware | [Physical device](references/physical-device.md) plus the platform reference |

## Preserve claim boundaries

- Treat intercepted web, real-backend web, deployed, native emulator or simulator, and physical
  device results as distinct evidence. State when production data, a deterministic fixture, or API
  interception was involved.
- Separate artifact reachability, navigation, integration, visual judgment, and automatic regression
  authority. A single run may exercise several states, but it does not silently upgrade its claim.
- Exclude runs where the intended interaction never became available because the host, OS UI,
  device, build, fixture, network, or test tool failed. Record the invalid cause and rerun after
  stabilizing it; do not count the attempt as a product result.
- Inspect the evidence the claim requires. Read per-case reports, inspect screenshots directly for
  visual claims, query produced artifacts for data claims, and include positive controls with every
  zero-row inspection assertion.
- Keep generated reports, screenshots, traces, and diagnostics in gitignored `tmp/`. Never link
  retained documentation to those files.

## Consolidate the result

- Put implementation-unit evidence in the owning plan's `## Validation Log`; otherwise replace the
  single latest plan-less validation in `docs/plans/TODO.md`.
- Put unresolved user-required physical actions in `docs/plans/BLOCKERS.md`. Do not create a blocker
  for an agent-runnable emulator, local, or deployed check.
- Record the command or procedure, exact environment, artifact freshness, valid result, excluded
  attempts, inspected output, cleanup, and evidence boundary. Preserve current invariants instead of
  run-count or timing history.
- Change a scenario claim or rig mechanic only in its owning README or source. Keep this skill focused
  on selecting, executing, triaging, and qualifying validation.

# Physical device

Use this layer for behavior observed on Android or iOS hardware. Load the matching native platform
reference as well; this file owns only the hardware evidence boundary and recording workflow.

## Initiation and preparation

- Physical-device runs are user-initiated. An agent may prepare a build, exact steps, selectors, and
  expected observations, but must not report a pass until the user actually initiates and records the
  run.
- Identify platform, device model, OS, artifact kind and revision, API origin, account or fixture,
  network conditions relevant to the claim, and whether the build is development, preview, or
  distributable.
- Do not install, erase, reset, or alter a user's attached device beyond the explicitly requested
  scope. Avoid collecting personal content in logs or screenshots.

## Record valid evidence

1. State the one physical behavior or regression class under test and the exact action that must be
   reachable.
2. Use semantic actions and observable assertions where an owned scenario exists. Coordinates and
   vague “looks okay” confirmation do not establish exact-action reachability.
3. Record the user's observed pass or failure, including the point of failure and any relevant visual
   or OS-level behavior. Keep platform results separate.
4. State the backend and deployment boundary. Hardware against a loopback fixture is physical native
   evidence, not real-backend or production evidence; hardware against a deployed API is not proof of
   every deployed web path.
5. For automatic authority over one native regression class, correlate the physical pass with the
   behavior-only negative control required by `AGENTS.md`. A physical pass alone does not define what
   the automation detects.

If the required run remains outstanding, put one concrete user action in
[`docs/plans/BLOCKERS.md`](../../../../docs/plans/BLOCKERS.md). Remove it only after recording the
actual result in the owning plan or `docs/plans/TODO.md`; never clear it from emulator, simulator,
web, backend, receipt, or build evidence.

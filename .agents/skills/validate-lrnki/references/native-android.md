# Android E2E

Use [the native rig contract](../../../../apps/learner-app/e2e-native/README.md) for fresh APK builds,
execution, fixture boundaries, and regression authority.

Use the connected physical Android device by default, as required by
[AGENTS.md](../../../../AGENTS.md#validation-authority). Pin its serial throughout the run; do not
substitute an emulator without an explicit selection. Keep existing display settings intact.

Record APK identity, device serial/model, Android version/API level, current size/density/font scale,
fixture server, flows, and artifact directory. Name connected-device and emulator results separately.
Requalify automatic authority only through the owning README's negative-control procedure;
automated fixture-backed device runs do not establish user-recorded physical acceptance.

# iOS simulator

Use the repository-owned Debug simulator smoke after learner-app changes. Its build, fixture,
host-tool preflight, scenario claims, and evidence path are owned by
[`apps/learner-app/e2e-native/README.md`](../../../apps/learner-app/e2e-native/README.md#ios-debug-simulator).

Keep the fresh Debug build and Metro server running, then execute:

```sh
EXPO_PUBLIC_LEARNER_API_URL=http://127.0.0.1:8799 pnpm dev:ios
pnpm e2e:native:maestro:ios
```

Record simulator model, iOS version, build identity, API origin, and the JUnit/screenshot paths.
Inspect the retained screenshots for safe areas and layout; qualify accessibility labels from the
selectors the flow actually exercised. Reduced-motion behavior remains a separate code-level or
explicit simulator-setting check until this rig owns a negative control for it.

This is canonical automated Debug-simulator integration smoke, not automatic visual-regression
authority. It does not imply Android parity, distribution signing, App Store behavior, or a physical
iPhone/iPad pass.

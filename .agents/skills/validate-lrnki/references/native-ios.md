# iOS simulator

Use [the native rig's iOS procedure](../../../../apps/learner-app/e2e-native/README.md#ios-debug-simulator)
for the Debug build, fixture, host-tool preflight, scenario claims, and execution.

Record simulator model, iOS version, build identity, API origin, and JUnit/screenshot paths. Inspect
screenshots for safe areas and layout; qualify accessibility labels only from exercised selectors.
Reduced-motion claims require a separate code-level or explicit simulator-setting check.

This flow owns Debug-simulator integration smoke, not automatic visual-regression authority.

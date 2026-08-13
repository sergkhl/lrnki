# Native iOS

Use this route for iOS simulator behavior now and for an automated iOS native gate once the
repository owns one. Do not apply Android APK, ADB, AVD-density, or Android System UI procedures to
iOS.

## Discover the current iOS surface

Before making a claim, inspect:

- the root [`package.json`](../../../../package.json) for current iOS commands;
- [`scripts/dev-learner-app.sh`](../../../../scripts/dev-learner-app.sh) for API-origin and launch
  behavior;
- [`apps/learner-app/eas.json`](../../../../apps/learner-app/eas.json) for an iOS artifact profile;
  and
- the root [mobile-build and native-loop documentation](../../../../README.md#deployment).

If no iOS validation runner, artifact profile, scenario owner, or evidence-output contract exists,
say so. `pnpm dev:ios` can support an explicitly observed development-build simulator smoke, but it
does not become an automated regression gate or distributable-build claim by convention.

## Simulator workflow

1. Name the app revision, build kind, simulator model and OS, API origin, fixture or data source, and
   exact visible behavior under test.
2. Rebuild after native dependencies, Expo config, entitlements, permission metadata, or app code
   change in ways that can make the installed app stale.
3. Ensure the simulator is booted and the intended app is installed; reject OS alerts, unavailable
   services, stale builds, or interrupted setup as evidence about the product assertion.
4. Exercise semantic controls and inspect the actual rendering or OS integration required by the
   claim. Record screenshots or logs under gitignored `tmp/`.
5. State that simulator evidence is not physical-device or App Store/distributable-build evidence.

## Extend this route when iOS automation arrives

Keep this top-level skill unchanged. Add or update a canonical iOS rig owner and then revise this
reference with direct links to:

- the build profile and freshness rule;
- the simulator-selection and test-runner command;
- fixture, API-origin, and authentication boundaries;
- semantic selectors, supported viewports or accessibility sizes, and scenario claims;
- invalid-run signatures, evidence outputs, and cleanup; and
- any behavior-only negative control plus the separately user-recorded physical correlation needed
  for automatic native authority.

For hardware evidence, also load [physical device](physical-device.md). Do not infer it from a
simulator pass.

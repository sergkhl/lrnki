# Android emulator

Read [the native rig contract](../../../../apps/learner-app/e2e-native/README.md) before running. Build a
fresh disposable Debug e2e APK after app changes, then run:

```sh
scripts/build-learner-android.sh e2e
pnpm e2e:native:maestro
```

The runner must identify the APK, emulator serial/profile, density, API level, fixture server, flow,
and artifact directory. Its fixture uses the production content qualifier and learner-runtime; only
auth transport and Postgres are replaced.

Support Path automatic authority is limited to the 320 dp body/footer collapse regression. Preserve
it only when the isolated behavior-only negative control fails at the intended assertion and the
current positive flow passes. Guardian, formation, Activity, leaderboard, and whole-path screenshots
are separately named visual/smoke evidence unless their owning rig grants more.

An Android emulator pass is not an iOS, distributable, Play Store, or physical-device pass.

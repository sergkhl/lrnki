# Blockers

- **Android build pipeline one-time setup.** The
  `.github/workflows/build-learner-android.yml` workflow builds the learner APK on a GitHub
  runner with `eas build --local`, which needs an Expo project identity and token:
  1. From `apps/learner-app`, run `npx eas init` with your Expo account (writes
     `extra.eas.projectId` into `app.json`; commit it).
  2. Create an access token at <https://expo.dev/settings/access-tokens> and add it as the
     `EXPO_TOKEN` repository secret.
  Until both are done, the workflow fails at authentication. The local fallback
  (`npx eas build --platform android --profile preview --local` on a machine with Java 17 +
  Android SDK) needs step 1 plus `eas login`.

import type { ExpoConfig } from "expo/config";

// Canonical dynamic Expo config (plan 2026-07-15-001 U5, R24). It reproduces every value the
// former static `app.json` carried, and adds ONE build-profile-controlled seam: Android cleartext
// HTTP. Android 9+ blocks cleartext by default, but the disposable e2e APK must reach the loopback
// fixture at `http://10.0.2.2:<port>`. `LRNKI_E2E_BUILD` is set per EAS build profile — `1` ONLY in
// the `e2e` profile, `0` in development/preview/production. Config resolution maps `1` → cleartext
// permitted and EVERYTHING else → the secure default (`false`), so preview/production-capable
// builds never ship cleartext. The e2e artifact is never distributed or uploaded as a release.

const isE2eBuild = process.env.LRNKI_E2E_BUILD === "1";

const config: ExpoConfig = {
  name: "lrnki",
  slug: "lrnki",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "lrnki",
  userInterfaceStyle: "light",
  android: {
    package: "com.globesoul.lrnki"
  },
  ios: {
    bundleIdentifier: "com.globesoul.lrnki"
  },
  web: {
    output: "static"
  },
  owner: "globesoul",
  extra: {
    eas: {
      projectId: "3dc56bb1-ae46-470a-a39e-71c0ec94147b"
    }
  },
  plugins: [
    "expo-router",
    [
      "expo-build-properties",
      {
        // Only the e2e build permits cleartext, and only to reach the loopback fixture. `false`
        // (the Android secure default) for every other profile.
        android: { usesCleartextTraffic: isE2eBuild }
      }
    ]
  ],
  experiments: {
    typedRoutes: false
  }
};

export default config;

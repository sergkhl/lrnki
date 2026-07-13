#!/usr/bin/env bash
# Local Android APK build for the learner app — same eas-cli invocation as
# .github/workflows/build-learner-android.yml. Profile is preview (standalone APK
# against the live API) or development (expects `expo start` as its dev server).
set -euo pipefail

cd "$(dirname "$0")/.."

PROFILE="${1:-preview}"

# Gradle/AGP for this Expo SDK requires JDK 17 (same as CI). Newer JDKs break the
# androidJdkImage jlink transform and trip JDK 24+ native-access restrictions.
if [ "$(uname)" = "Darwin" ]; then
  JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null)" \
    || { echo "JDK 17 not found. Install it: brew install --cask temurin@17" >&2; exit 1; }
  export JAVA_HOME
fi
java_major="$("${JAVA_HOME:+$JAVA_HOME/bin/}java" -version 2>&1 | sed -nE 's/.*version "([0-9]+).*/\1/p')"
if [ "$java_major" != "17" ]; then
  echo "Expected JDK 17 on PATH or JAVA_HOME, found ${java_major:-none}." >&2
  exit 1
fi

# EXPO_TOKEN: repo-root .env wins when it defines one, else the environment.
if [ -f .env ]; then
  token="$(grep -E '^EXPO_TOKEN=' .env | tail -n 1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//' || true)"
  if [ -n "$token" ]; then
    EXPO_TOKEN="$token"
  fi
fi
: "${EXPO_TOKEN:?EXPO_TOKEN is not set in .env or the environment (create one at https://expo.dev/settings/access-tokens)}"
export EXPO_TOKEN

cd apps/learner-app
npx eas-cli build --platform android \
  --profile "$PROFILE" \
  --local --non-interactive \
  --output "./lrnki-learner-${PROFILE}.apk"

#!/usr/bin/env bash
# Learner-app dev loop against the LOCAL learner-api (`pnpm dev:api`), for every platform.
#
# The app's API origin is DERIVED from `BETTER_AUTH_URL` in the repo-root `.env` rather than spelled
# again here. The two are not independent settings: Better Auth advertises that exact origin as its
# Google redirect URI and binds the OAuth state cookie to it, so an app pointed anywhere else fails
# the leg with `state_mismatch` (ADR-0041). One value, two consumers. An explicit
# EXPO_PUBLIC_LEARNER_API_URL still wins, which is the escape hatch for pointing a device at the
# deployed API instead.
set -euo pipefail

platform="${1:-}"
case "$platform" in
  web | android | ios) ;;
  *)
    echo "usage: $(basename "$0") <web|android|ios>" >&2
    exit 2
    ;;
esac

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
api="$(sed -n 's/^BETTER_AUTH_URL=//p' "$root/.env" | tail -1)"
if [ -z "$api" ]; then
  echo "dev-learner-app: BETTER_AUTH_URL is unset in $root/.env — the local API has no known origin." >&2
  exit 1
fi
export EXPO_PUBLIC_LEARNER_API_URL="${EXPO_PUBLIC_LEARNER_API_URL:-$api}"
echo "[dev] learner-app ($platform) → $EXPO_PUBLIC_LEARNER_API_URL"

# A loopback origin with nothing behind it is the one failure the app cannot explain for itself: the
# session probe fails and the gate can only say it could not reach the trail, which reads like a bug
# in the app or the reverse. Say it here instead, where the cause is knowable. Only the exit code is
# read — any HTTP answer at all proves something is listening, so this does not care which routes
# exist. A warning, not a failure: starting the API second is legitimate, and the app retries.
case "$EXPO_PUBLIC_LEARNER_API_URL" in
  http://localhost:* | http://127.0.0.1:*)
    if command -v curl >/dev/null && ! curl -s -o /dev/null --max-time 1 "$EXPO_PUBLIC_LEARNER_API_URL/health"; then
      echo "[dev] nothing is listening on $EXPO_PUBLIC_LEARNER_API_URL — the app will render its 'couldn't reach the trail' gate until you start it: pnpm dev:api" >&2
    fi
    ;;
esac

# Android is the one platform where `localhost` means the DEVICE, not this machine. `adb reverse`
# forwards the device's own loopback back to this host, which — unlike the `10.0.2.2` emulator
# alias — also works on a USB-attached physical device AND keeps the origin string byte-identical
# to the one the API advertises to Google. A different string there is a `redirect_uri_mismatch`.
#
# That reverse needs a device that is not merely attached but BOOTED, which is also what
# `expo run:android` needs and never verifies for an emulator it did not launch itself. Owning the
# boot here gets both: a device that answers `pm` before Expo is handed control, and the reverse
# applied up front instead of left to the user as a manual step. What this does NOT get is a
# guarantee that still holds one Gradle build later — see the `android)` case below.
if [ "$platform" = android ]; then
  port="${EXPO_PUBLIC_LEARNER_API_URL##*:}"
  port="${port%%/*}"
  sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
  adb="$(command -v adb || true)"
  adb="${adb:-$sdk/platform-tools/adb}"
  emulator="$(command -v emulator || true)"
  emulator="${emulator:-$sdk/emulator/emulator}"

  # Serials in the `device` state only. `offline`/`unauthorized`/`bootloader` entries are not
  # targets anything here can act on, and counting them would make "a device exists" a lie.
  ready_devices() { "$adb" devices | awk '$2 == "device" { print $1 }'; }

  # Two probes, because they answer different questions. `sys.boot_completed` is the framework's own
  # "I finished booting" flag; `pm path android` proves the package manager service — the one that
  # actually serves `adb install` — is answering binder calls. The flag can be set while `pm` still
  # replies `Can't find service: package`.
  device_ready() {
    [ "$("$adb" -s "$1" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n')" = 1 ] &&
      "$adb" -s "$1" shell pm path android >/dev/null 2>&1
  }

  await_boot() {
    local device="$1" waited=0 announced=0
    until device_ready "$device"; do
      if [ "$waited" -ge 300 ]; then
        echo "[dev] $device has not finished booting after 5 min — install would race it. Check the emulator window." >&2
        return 1
      fi
      if [ "$announced" = 0 ]; then
        echo "[dev] waiting for $device to finish booting…"
        announced=1
      fi
      sleep 3
      waited=$((waited + 3))
    done
    [ "$announced" = 1 ] && echo "[dev] $device booted after ${waited}s"
    return 0
  }

  boot_emulator() {
    if [ ! -x "$emulator" ]; then
      echo "[dev] no device attached and no emulator at $emulator — expo will boot one, and its install may lose the race to the boot." >&2
      return 1
    fi
    local avd="${ANDROID_AVD:-$("$emulator" -list-avds | head -1)}"
    if [ -z "$avd" ]; then
      echo "[dev] no AVD defined — create one in Android Studio, or attach a device." >&2
      return 1
    fi
    mkdir -p "$root/tmp"
    # `set -m` puts the emulator in its OWN process group, so the Ctrl-C that stops this dev loop
    # does not also take the emulator down and buy a cold boot on the next run. The log is in
    # gitignored tmp/ (rule 10); the emulator outlives this script either way.
    echo "[dev] booting emulator $avd (log: tmp/emulator-$avd.log)"
    set -m
    "$emulator" -avd "$avd" >"$root/tmp/emulator-$avd.log" 2>&1 </dev/null &
    set +m

    # Bounded, rather than `adb wait-for-device`, which has no timeout: an AVD that dies on its
    # lock file or a missing system image would otherwise hang this dev loop with nothing said.
    local waited=0
    while [ -z "$(ready_devices)" ]; do
      if [ "$waited" -ge 120 ]; then
        echo "[dev] $avd never attached — see tmp/emulator-$avd.log." >&2
        return 1
      fi
      sleep 2
      waited=$((waited + 2))
    done
  }

  if ! [[ "$port" =~ ^[0-9]+$ ]]; then
    # A portless origin is a remote one (https://api.…), which the device reaches directly.
    echo "[dev] $EXPO_PUBLIC_LEARNER_API_URL is not a loopback origin — no adb reverse needed."
  elif [ ! -x "$adb" ]; then
    echo "[dev] adb not found at $adb — set ANDROID_HOME. Without it the device cannot reach $EXPO_PUBLIC_LEARNER_API_URL." >&2
  else
    if [ -z "$(ready_devices)" ]; then
      boot_emulator || true
    fi
    for device in $(ready_devices); do
      # A device that never becomes ready gets no reverse: the forward would fail anyway, and
      # claiming one that does not exist is worse than saying so.
      await_boot "$device" || continue
      if "$adb" -s "$device" reverse "tcp:$port" "tcp:$port" >/dev/null; then
        echo "[dev] adb reverse tcp:$port → $device"
      else
        echo "[dev] adb reverse failed on $device; the app will not reach $EXPO_PUBLIC_LEARNER_API_URL." >&2
      fi
    done
    if [ -z "$(ready_devices)" ]; then
      echo "[dev] still no device. Once one appears, run: $adb reverse tcp:$port tcp:$port" >&2
    fi
  fi
fi

cd "$root/apps/learner-app"
case "$platform" in
  # `--clear` on web only, because it is the only platform where the bundler is the whole build:
  # Metro inlines EXPO_PUBLIC_* at transform time and caches the result, so a switched origin is
  # otherwise served stale from cache with nothing to show for it. On native the cost rides along
  # with a Gradle/Xcode build that dwarfs it, but `run:*` exposes no such flag — if a native app
  # reaches the wrong origin, clear it once with `pnpm exec expo start --clear`.
  web)
    BROWSER=none exec pnpm exec expo start --web --port 8881 --clear
    ;;
  # `expo run:android` installs the APK the instant its Gradle build ends, onto a device it has not
  # checked: `isBooted` is hardcoded `true` for anything named `emulator-*` in @expo/cli's
  # `adb.js`, and its one real wait (`init.svc.bootanim == stopped`) runs only on the path where
  # Expo launches the AVD itself — which is not this one, because the boot above already attached
  # it. The gate above is stricter than either, but it is still a PRE-flight gate: it proves the
  # device serves `pm` at hand-off and cannot bind that state to an install one build later. A
  # snapshot-restored guest doing its catch-up work while Gradle and Metro saturate the host can
  # lose `system_server` in exactly that window, and `adb install` dies with
  # `cmd: Can't find service: package`. Re-running on that one signature — after re-proving the
  # device — is what covers it; the second Gradle build is a no-op. Recovery below is always
  # per-signature and never a blanket retry, the same rule `installApk` follows in
  # apps/learner-app/e2e-native/run.ts.
  android)
    err="$root/tmp/expo-run-android.err"
    fifo="$root/tmp/.expo-run-android.$$"
    mkdir -p "$root/tmp"
    trap 'rm -f "$fifo"' EXIT

    run_expo() {
      rm -f "$fifo"
      mkfifo "$fifo"
      # Only stderr is diverted, so Metro keeps a real TTY on stdout for its interactive UI. `tee`
      # puts the errors back on the terminal live; waiting on it is what makes the copy complete
      # before it is classified, which `2> >(tee …)` would not guarantee.
      tee -a "$err" <"$fifo" >&2 &
      local teepid=$! status=0
      pnpm exec expo run:android --port 8881 2>"$fifo" || status=$?
      wait "$teepid" || true
      rm -f "$fifo"
      return "$status"
    }

    : >"$err"
    if run_expo; then exit 0; fi

    # Each branch names a cause it can prove from stderr and removes exactly that cause before the
    # one retry. An unrecognized failure exits with the build's own status: a retry that cannot say
    # what it is fixing only doubles the wait.
    # `A problem occurred starting process 'command 'node''` is Gradle failing to SPAWN a process,
    # not node failing once it ran. android/settings.gradle asks `node` to resolve the autolinking
    # plugins, making it the build's first subprocess and so the first casualty of any spawn
    # breakage. Two different causes surface through that one line, and Gradle prints the nested one
    # that would tell them apart only under `--stacktrace`, which Expo does not pass — so
    # discriminate here instead. If `node` runs from this shell then PATH is not the problem and a
    # Gradle daemon is: a JVM never forks directly, it hands the work to `<jdk>/lib/jspawnhelper`,
    # which version-handshakes with its parent, so a JDK replaced on disk (any `brew upgrade` does
    # this) leaves every daemon still running the old build unable to exec the new helper. A daemon
    # reused with a staler PATH than this shell's lands in the same place and takes the same fix.
    # Stopping the daemons is the whole remedy; the retry pays one cold start.
    if grep -qF "A problem occurred starting process 'command 'node''" "$err"; then
      if ! command -v node >/dev/null; then
        echo "[dev] the Gradle build could not start 'node', and this shell has no node either — install it or repair PATH, then re-run." >&2
        exit 1
      fi
      echo "[dev] node runs here, so a Gradle daemon is running a JDK that has since been replaced on disk and can no longer spawn it; stopping the daemons and retrying once." >&2
      ./android/gradlew --stop >/dev/null 2>&1 || true
    elif grep -q "Can't find service: package" "$err"; then
      echo "[dev] the device dropped its package manager mid-run; waiting for it to come back, then retrying once." >&2
      if [ -x "$adb" ]; then
        for device in $(ready_devices); do await_boot "$device" || true; done
      fi
    else
      exit 1
    fi
    run_expo
    ;;
  ios)
    exec pnpm exec expo run:ios --port 8881
    ;;
esac

#!/usr/bin/env bash
# Run DB-backed suites against the disposable lrnki_test database only.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Serialize runs: this script drops and recreates the lrnki_test schema, so two concurrent runs
# would tear down each other's fixtures mid-suite.
#
# The lock is a symlink whose target is the owning PID. flock(1) is util-linux and simply does not
# exist on macOS, and shlock(1) is the mirror-image problem (BSD only), so the lock is built from
# `ln -s`, which is atomic on every POSIX filesystem: it fails when the name already exists and it
# publishes the owner in that same atomic step, leaving no window where the lock is held but
# unattributed. Unlike an fd-based flock the kernel does not release this on process death, hence
# the liveness check that reclaims a lock whose owner is gone.
LOCK_FILE=.cache/test-db.lock
LOCK_WAIT_SECONDS="${LOCK_WAIT_SECONDS:-900}"

mkdir -p .cache
if [[ -e "$LOCK_FILE" && ! -L "$LOCK_FILE" ]]; then
  # Leftover from the flock implementation, which opened this path as a regular file.
  rm -f "$LOCK_FILE"
fi

waited=0
while ! ln -s "$$" "$LOCK_FILE" 2>/dev/null; do
  lock_owner="$(readlink "$LOCK_FILE" 2>/dev/null || true)"
  if [[ -n "$lock_owner" ]] && ! kill -0 "$lock_owner" 2>/dev/null; then
    echo "Clearing DB test lock left behind by dead PID $lock_owner." >&2
    rm -f "$LOCK_FILE"
    continue
  fi
  if [[ "$waited" -eq 0 ]]; then
    echo "Waiting for the DB tests already running under PID ${lock_owner:-unknown}." >&2
  fi
  if [[ "$waited" -ge "$LOCK_WAIT_SECONDS" ]]; then
    echo "Gave up after ${LOCK_WAIT_SECONDS}s waiting for PID ${lock_owner:-unknown}; delete $LOCK_FILE if that run is gone." >&2
    exit 1
  fi
  sleep 2
  waited=$((waited + 2))
done
trap 'rm -f "$LOCK_FILE"' EXIT
trap 'rm -f "$LOCK_FILE"; exit 130' INT TERM

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  # Resolves DATABASE_URL through the one shared path, and picks up a TEST_DATABASE_URL that .env
  # sets directly, since that load exports everything it reads.
  # shellcheck source=scripts/lib/require-database-url.sh
  . scripts/lib/require-database-url.sh
fi

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  TEST_DATABASE_URL="$(node -e 'const url = new URL(process.argv[1]); url.pathname = "/lrnki_test"; process.stdout.write(url.toString())' "$DATABASE_URL")"
fi

TARGET_DATABASE="$(node -e 'process.stdout.write(new URL(process.argv[1]).pathname.slice(1))' "$TEST_DATABASE_URL")"
if [[ "$TARGET_DATABASE" != "lrnki_test" ]]; then
  echo "Refusing DB tests: TEST_DATABASE_URL must target exactly lrnki_test, got $TARGET_DATABASE." >&2
  exit 1
fi

CONNECTED_DATABASE="$(psql "$TEST_DATABASE_URL" -X -Atqc 'select current_database();')"
if [[ "$CONNECTED_DATABASE" != "lrnki_test" ]]; then
  echo "Refusing DB tests: connected to $CONNECTED_DATABASE instead of lrnki_test." >&2
  exit 1
fi

export TEST_DATABASE_URL
export DATABASE_URL="$TEST_DATABASE_URL"
scripts/reset-db.sh
pnpm -r --sort --if-present run test

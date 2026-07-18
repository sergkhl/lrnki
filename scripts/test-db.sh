#!/usr/bin/env bash
# Run DB-backed suites against the disposable lrnki_test database only.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p .cache
exec 9>.cache/test-db.lock
flock 9

if [[ -z "${TEST_DATABASE_URL:-}" && -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "TEST_DATABASE_URL or DATABASE_URL is required." >&2
    exit 1
  fi
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

#!/usr/bin/env bash
# Validate the complete sealed package set before destructively reinstalling accepted global paths.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# This command reads only committed manifest/source/package files. Keep it before .env resolution,
# psql, or reset so an incomplete or changed package set cannot destroy the current database.
pnpm accepted-paths validate

# shellcheck source=scripts/lib/require-database-url.sh
. scripts/lib/require-database-url.sh
export DATABASE_URL

TARGET_DATABASE="$(node -e 'process.stdout.write(decodeURIComponent(new URL(process.argv[1]).pathname.slice(1)))' "$DATABASE_URL")"
TARGET_ENDPOINT="$(node -e 'const url = new URL(process.argv[1]); process.stdout.write(`${url.hostname}:${url.port || "5432"}`)' "$DATABASE_URL")"
if [[ "$TARGET_DATABASE" != "lrnki" && "$TARGET_DATABASE" != "lrnki_test" ]]; then
  echo "Refusing accepted-path install: expected lrnki or lrnki_test, got $TARGET_DATABASE." >&2
  exit 1
fi

echo "Installing the complete accepted-path package set into $TARGET_DATABASE at $TARGET_ENDPOINT."
echo "This discards users, sessions, learner paths, responses, awards, and all progress."
scripts/reset-db.sh
pnpm accepted-paths install

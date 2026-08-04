#!/usr/bin/env bash
# Reset only the local application schemas and reapply the single initial migration (AGENTS rule 8).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/lib/require-database-url.sh
. scripts/lib/require-database-url.sh
DB_URL="$DATABASE_URL"

TARGET_DATABASE="$(node -e 'process.stdout.write(decodeURIComponent(new URL(process.argv[1]).pathname.slice(1)))' "$DB_URL")"
TARGET_ENDPOINT="$(node -e 'const url = new URL(process.argv[1]); process.stdout.write(`${url.hostname}:${url.port || "5432"}`)' "$DB_URL")"
if [[ "$TARGET_DATABASE" != "lrnki" && "$TARGET_DATABASE" != "lrnki_test" ]]; then
  echo "Refusing reset: DATABASE_URL must target lrnki or lrnki_test, got $TARGET_DATABASE." >&2
  exit 1
fi

CONNECTED_DATABASE="$(psql "$DB_URL" -X -Atqc 'select current_database();')"
if [[ "$CONNECTED_DATABASE" != "$TARGET_DATABASE" ]]; then
  echo "Refusing reset: connected to $CONNECTED_DATABASE instead of $TARGET_DATABASE." >&2
  exit 1
fi

echo "Resetting application schemas in $TARGET_DATABASE at $TARGET_ENDPOINT."
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f scripts/reset-app-schema.sql

scripts/migrate-db.sh
echo "Application schemas reset and migrated."

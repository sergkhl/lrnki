#!/usr/bin/env bash
# Reset local database state and re-apply the single initial migration (AGENTS rule 8).
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://lrnki:lrnki@localhost:5432/lrnki}"

psql "$DB_URL" -v ON_ERROR_STOP=1 -c \
  "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"

scripts/migrate-db.sh
echo "Database reset and migrated."

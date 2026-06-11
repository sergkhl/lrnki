#!/usr/bin/env bash
# Reset local database state and re-apply the single initial migration (AGENTS rule 8).
# Drops BOTH the public schema and drizzle's bookkeeping schema, otherwise drizzle-kit
# treats the migration as already applied and silently skips it.
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://lrnki:lrnki@localhost:5432/lrnki}"

psql "$DB_URL" -v ON_ERROR_STOP=1 -c \
  "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;"

pnpm --filter @lrnki/infrastructure-postgres db:migrate
echo "Database reset and migrated."

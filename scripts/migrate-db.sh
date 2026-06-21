#!/usr/bin/env bash
# Apply the single handwritten database migration (AGENTS rules 8 and 18).
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://lrnki:lrnki@localhost:5432/lrnki}"

psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -f packages/infrastructure-postgres/src/migrations/0000_initial_lrnki_schema.sql

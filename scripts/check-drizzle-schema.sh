#!/usr/bin/env bash
# Reject committed Drizzle lineage errors and schema-to-baseline drift without touching a database.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$REPO_ROOT/packages/infrastructure-postgres"
MIGRATIONS_DIR="$PACKAGE_DIR/src/migrations"

node "$REPO_ROOT/scripts/lib/assert-single-drizzle-baseline.mjs" "$MIGRATIONS_DIR"

mkdir -p "$REPO_ROOT/tmp"
TEMP_ROOT="$(mktemp -d "$REPO_ROOT/tmp/drizzle-check.XXXXXX")"
trap 'rm -rf "$TEMP_ROOT"' EXIT
trap 'exit 130' INT TERM

CANDIDATE_DIR="$TEMP_ROOT/initial_lrnki_schema"
mkdir -p "$CANDIDATE_DIR"
cp -R "$MIGRATIONS_DIR/." "$CANDIDATE_DIR/"
CANDIDATE_RELATIVE="../../${CANDIDATE_DIR#"$REPO_ROOT/"}"

pnpm --dir "$PACKAGE_DIR" exec drizzle-kit check \
  --dialect postgresql \
  --out "$CANDIDATE_RELATIVE"
pnpm --dir "$PACKAGE_DIR" exec drizzle-kit generate \
  --dialect postgresql \
  --schema ./src/schema/index.ts \
  --out "$CANDIDATE_RELATIVE" \
  --name schema_drift_check

node "$REPO_ROOT/scripts/lib/assert-single-drizzle-baseline.mjs" "$CANDIDATE_DIR"

if ! diff -ru "$MIGRATIONS_DIR" "$CANDIDATE_DIR"; then
  echo "Drizzle schema and committed baseline differ; run pnpm db:generate and review all lineage artifacts." >&2
  exit 1
fi

echo "Drizzle schema and committed baseline are in sync."

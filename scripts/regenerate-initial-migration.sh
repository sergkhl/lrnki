#!/usr/bin/env bash
# Regenerate the sole greenfield Drizzle baseline after validating the complete candidate lineage.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$REPO_ROOT/packages/infrastructure-postgres"
MIGRATIONS_DIR="$PACKAGE_DIR/src/migrations"

UNEXPECTED_SQL="$(
  find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' \
    ! -name '0000_initial_lrnki_schema.sql' -print
)"
UNEXPECTED_SNAPSHOTS="$(
  find "$MIGRATIONS_DIR/meta" -maxdepth 1 -type f -name '*_snapshot.json' \
    ! -name '0000_snapshot.json' -print
)"

if [[ -n "$UNEXPECTED_SQL" || -n "$UNEXPECTED_SNAPSHOTS" ]]; then
  echo "Refusing baseline regeneration while additional migration history exists." >&2
  printf '%s\n' "$UNEXPECTED_SQL" "$UNEXPECTED_SNAPSHOTS" | sed '/^$/d' >&2
  exit 1
fi

mkdir -p "$REPO_ROOT/tmp"
TEMP_ROOT="$(mktemp -d "$REPO_ROOT/tmp/drizzle-generate.XXXXXX")"
trap 'rm -rf "$TEMP_ROOT"' EXIT
trap 'exit 130' INT TERM

CANDIDATE_DIR="$TEMP_ROOT/initial_lrnki_schema"
CANDIDATE_RELATIVE="../../${CANDIDATE_DIR#"$REPO_ROOT/"}"

pnpm --dir "$PACKAGE_DIR" exec drizzle-kit generate \
  --dialect postgresql \
  --schema ./src/schema/index.ts \
  --out "$CANDIDATE_RELATIVE" \
  --name initial_lrnki_schema

node "$REPO_ROOT/scripts/lib/assert-single-drizzle-baseline.mjs" "$CANDIDATE_DIR"
pnpm --dir "$PACKAGE_DIR" exec drizzle-kit check \
  --dialect postgresql \
  --out "$CANDIDATE_RELATIVE"

install -m 0644 \
  "$CANDIDATE_DIR/0000_initial_lrnki_schema.sql" \
  "$MIGRATIONS_DIR/0000_initial_lrnki_schema.sql"
install -m 0644 \
  "$CANDIDATE_DIR/meta/0000_snapshot.json" \
  "$MIGRATIONS_DIR/meta/0000_snapshot.json"
install -m 0644 \
  "$CANDIDATE_DIR/meta/_journal.json" \
  "$MIGRATIONS_DIR/meta/_journal.json"

echo "Regenerated the single Drizzle baseline and replaced its SQL, snapshot, and journal."

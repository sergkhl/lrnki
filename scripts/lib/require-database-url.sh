# Sourced, not executed. AGENTS rule 14: DATABASE_URL lives in the repo-root .env and neither the
# shell nor the test runner auto-loads it. This is the single place the DB scripts resolve it.
#
# There is deliberately no host/port fallback. A guessed DSN that happens to reach an unrelated
# Postgres on the old port succeeds silently against the wrong database, which is worse than a
# refusal to run.
if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required; set it or provide it in the repo-root .env." >&2
  exit 1
fi

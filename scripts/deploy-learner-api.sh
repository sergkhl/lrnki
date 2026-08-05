#!/usr/bin/env bash
# Manual learner-api deploy (U5). Runs ON the VPS against the local Docker daemon: fast-forward the
# checkout, bring the application schema to current, then rebuild + restart the learner-api and
# caddy containers and wait for the public health endpoint. Idempotent; a brief restart blip is
# accepted (greenfield, single operator).
#
# The migration runs and is verified BEFORE the API is recreated or polled. That ordering is the
# point: a failed migration leaves the previous API container running and healthy, so polling
# /health first would report a successful deploy for code that never started. The schema migrator
# is never destructive — a legacy/stale/partial database fails here and waits for the explicit
# reset runbook rather than being erased.
#
# Usage (from the repo checkout on the VPS):
#   scripts/deploy-learner-api.sh
#
# Optional overrides:
#   LRNKI_API_HEALTH_URL   health URL to poll   (default https://api.lrnki.globesoul.com/health)
#   LRNKI_SKIP_GIT_PULL=1  skip the git pull    (deploy the working tree as-is)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEALTH_URL="${LRNKI_API_HEALTH_URL:-https://api.lrnki.globesoul.com/health}"

cd "$REPO_DIR"

if [[ "${LRNKI_SKIP_GIT_PULL:-0}" != "1" ]]; then
  echo "==> git pull --ff-only"
  git pull --ff-only
fi

# Never pipe a compose build: a pipeline reports the LAST command's status, so a build that died on
# `no space left on device` would still look like a success. Reclaim with `docker builder prune -f`.
echo "==> docker compose build migrate learner-api caddy"
docker compose build migrate learner-api caddy

echo "==> docker compose up -d --wait postgres"
docker compose up -d --wait postgres

# One-shot migration from the image just built. --no-deps leaves the healthy postgres container
# untouched (it was waited for above); --force-recreate guarantees the exit status read below
# belongs to this deploy and not to a previous run's leftover container.
echo "==> docker compose up -d --no-deps --force-recreate migrate"
docker compose up -d --no-deps --force-recreate migrate

MIGRATE_CONTAINER="$(docker compose ps -aq migrate)"
if [[ -z "$MIGRATE_CONTAINER" ]]; then
  echo "!! the migrate container was not created; the API was left untouched" >&2
  exit 1
fi

MIGRATE_EXIT="$(docker wait "$MIGRATE_CONTAINER")"
if [[ "$MIGRATE_EXIT" != "0" ]]; then
  echo "!! application-schema migration failed (exit ${MIGRATE_EXIT}); the API was left untouched" >&2
  docker logs --tail 40 "$MIGRATE_CONTAINER" >&2 || true
  exit 1
fi
docker logs --tail 5 "$MIGRATE_CONTAINER"

echo "==> docker compose up -d learner-api caddy"
docker compose up -d learner-api caddy

echo "==> waiting for ${HEALTH_URL}"
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "==> healthy after ${attempt} attempt(s)"
    exit 0
  fi
  sleep 2
done

echo "!! ${HEALTH_URL} did not become healthy in time" >&2
echo "!! recent learner-api logs:" >&2
docker compose logs --tail 40 learner-api >&2 || true
exit 1

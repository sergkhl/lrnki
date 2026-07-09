#!/usr/bin/env bash
# Manual learner-api deploy (U5). Runs ON the VPS against the local Docker daemon: fast-forward
# the checkout, rebuild + restart the learner-api and caddy containers, then wait for the public
# health endpoint to come back OK. Idempotent; a brief restart blip is accepted (greenfield,
# single operator).
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

echo "==> docker compose up -d --build learner-api caddy"
docker compose up -d --build learner-api caddy

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

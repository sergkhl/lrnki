#!/usr/bin/env bash
# Deploy the learner API and Expo website from the saved checkout on the deployment host.
# Build and validate both images before migrating or replacing application containers. PostgreSQL
# can host unrelated databases: reuse its healthy container rather than reconciling its config.
#
# Health is asserted twice, deliberately: once against the container directly (the artifact just
# deployed actually started) and once against the public hostname (TLS and Caddy routing reach it).
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
#   LRNKI_WEB_URL          website to verify   (default https://lrnki.globesoul.com)
#   LRNKI_SKIP_GIT_PULL=1  skip the git pull    (deploy the working tree as-is)
#   LRNKI_SKIP_BUILD=1     use already built images, requiring their labels to match this commit
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEALTH_URL="${LRNKI_API_HEALTH_URL:-https://api.lrnki.globesoul.com/health}"
WEB_URL="${LRNKI_WEB_URL:-https://lrnki.globesoul.com}"
EXPECTED_AUTH_URL="${HEALTH_URL%/health}"

cd "$REPO_DIR"

# An attached `docker compose watch` session re-syncs the working tree over whatever image is
# running, so it would quietly undo the deploy moments after it succeeds. Refuse before building.
# This is a process-name heuristic: a false positive costs one clear message, a false negative only
# leaves the pre-guard behaviour.
if pgrep -f 'compose.*watch' >/dev/null 2>&1; then
  echo "!! a 'docker compose watch' session is running; stop it before deploying" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "!! commit or preserve checkout changes before deploying an identifiable revision" >&2
  exit 1
fi

if [[ "${LRNKI_SKIP_GIT_PULL:-0}" != "1" ]]; then
  echo "==> git pull --ff-only"
  git pull --ff-only
fi

export LRNKI_DEPLOY_REVISION="$(git rev-parse HEAD)"

# Inspect resolved configuration without printing credentials, before replacing any service.
docker compose config --format json | EXPECTED_AUTH_URL="$EXPECTED_AUTH_URL" node -e '
  let input = "";
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    const api = JSON.parse(input).services["learner-api"];
    if (!api.environment.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is required.");
    if (api.environment.BETTER_AUTH_URL !== process.env.EXPECTED_AUTH_URL) {
      throw new Error("BETTER_AUTH_URL must match the deployment API origin.");
    }
    if (api.ports?.length) throw new Error("The deployed API must not publish a host port.");
  });
'

# Never pipe a compose build: a pipeline reports the LAST command's status, so a build that died on
# `no space left on device` would still look like a success. Reclaim with `docker builder prune -f`.
# `migrate` is not built: it runs the learner-api image with an overridden command, so building
# learner-api is what brings the migrator to current too. It must happen before the migrate step.
if [[ "${LRNKI_SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> docker compose build learner-api caddy"
  docker compose build learner-api caddy
fi

for image in lrnki-learner-api lrnki-caddy; do
  image_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")"
  if [[ "$image_revision" != "$LRNKI_DEPLOY_REVISION" ]]; then
    echo "!! $image was not built from $LRNKI_DEPLOY_REVISION; refusing deployment" >&2
    exit 1
  fi
done
API_IMAGE="$(docker image inspect --format '{{.Id}}' lrnki-learner-api)"
CADDY_IMAGE="$(docker image inspect --format '{{.Id}}' lrnki-caddy)"
docker run --rm --network none --entrypoint caddy "$CADDY_IMAGE" validate --config /etc/caddy/Caddyfile

POSTGRES_CONTAINER="$(docker compose ps -aq postgres)"
if [[ -z "$POSTGRES_CONTAINER" ]]; then
  echo "==> starting PostgreSQL for an initial deployment"
  docker compose up -d --no-deps --wait postgres
  POSTGRES_CONTAINER="$(docker compose ps -aq postgres)"
fi
POSTGRES_HEALTH="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$POSTGRES_CONTAINER")"
if [[ "$POSTGRES_HEALTH" != "healthy" ]]; then
  echo "!! PostgreSQL is not healthy; resolve it explicitly before deploying" >&2
  exit 1
fi
echo "==> reusing healthy PostgreSQL container $POSTGRES_CONTAINER"

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

echo "==> docker compose up -d --no-deps learner-api"
docker compose up -d --no-deps learner-api
API_CONTAINER="$(docker compose ps -aq learner-api)"
if [[ "$(docker inspect --format '{{.Image}}' "$API_CONTAINER")" != "$API_IMAGE" ]]; then
  echo "!! the learner API did not start the prepared image" >&2
  exit 1
fi

# Two checks, in this order, because they assert different things. This one asks the container
# itself — the artifact just deployed — and cannot be answered by anything else. A public 200 alone
# was the only evidence this script had until now, and on 2026-08-05 it was returned by a stale host
# process while the deployed container sat idle (ADR-0040 exists to make that unreachable; the probe
# stays because "the thing I deployed started" is not what an edge check measures).
echo "==> probing the learner-api container directly"
CONTAINER_HEALTHY=0
for attempt in $(seq 1 30); do
  if docker compose exec -T learner-api node -e \
    "fetch('http://localhost:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
    >/dev/null 2>&1; then
    echo "==> container answered after ${attempt} attempt(s)"
    CONTAINER_HEALTHY=1
    break
  fi
  sleep 2
done

if [[ "$CONTAINER_HEALTHY" != "1" ]]; then
  echo "!! the learner-api container did not answer /health in time" >&2
  docker compose logs --tail 40 learner-api >&2 || true
  exit 1
fi

# `BETTER_AUTH_URL` is the one setting that can be wrong and still make every other check pass.
# Better Auth derives BOTH the Google redirect URI it advertises AND `useSecureCookies` (from the
# URL's scheme) out of it, so the `.env.example` dev default left on a deployment host yields an API
# that health-checks green, serves the whole credential path, and quietly mints session cookies with
# no `Secure` flag over HTTPS while Google rejects the callback (ADR-0041). Nothing errors, because a
# wrong base URL still resolves without an infrastructure error. Asserted against
# the RUNNING container so this reads what shipped, not what a file said, and so compose's default
# stays the single source of that value.
SHIPPED_AUTH_URL="$(docker compose exec -T learner-api printenv BETTER_AUTH_URL 2>/dev/null | tr -d '\r\n')"
if [[ "$SHIPPED_AUTH_URL" != "$EXPECTED_AUTH_URL" ]]; then
  echo "!! BETTER_AUTH_URL is '${SHIPPED_AUTH_URL:-<unset>}' but this deployment serves ${EXPECTED_AUTH_URL}" >&2
  echo "!! Google sign-in will fail and session cookies lose their Secure flag. Fix .env, then redeploy." >&2
  exit 1
fi
echo "==> BETTER_AUTH_URL matches the deployed origin (${SHIPPED_AUTH_URL})"

echo "==> docker compose up -d --no-deps caddy"
docker compose up -d --no-deps caddy
CADDY_CONTAINER="$(docker compose ps -aq caddy)"
if [[ "$(docker inspect --format '{{.Image}}' "$CADDY_CONTAINER")" != "$CADDY_IMAGE" ]]; then
  echo "!! Caddy did not start the prepared image" >&2
  exit 1
fi
if [[ "$(docker compose ps -aq postgres)" != "$POSTGRES_CONTAINER" ]]; then
  echo "!! PostgreSQL container identity changed during deployment" >&2
  exit 1
fi

# And this one asserts the public hostname reaches it — TLS, DNS, and Caddy routing.
echo "==> waiting for ${HEALTH_URL}"
PUBLIC_HEALTHY=0
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "==> healthy after ${attempt} attempt(s)"
    PUBLIC_HEALTHY=1
    break
  fi
  sleep 2
done

if [[ "$PUBLIC_HEALTHY" != "1" ]]; then
  echo "!! ${HEALTH_URL} did not become healthy in time" >&2
  docker compose logs --tail 40 learner-api >&2 || true
  exit 1
fi

# Compare actual public bytes with the running image, so a cached Pages shell cannot pass.
mkdir -p "$REPO_DIR/tmp"
PROBE_DIR="$(mktemp -d "$REPO_DIR/tmp/deploy-web.XXXXXX")"
trap 'rm -rf "$PROBE_DIR"' EXIT
docker cp "$CADDY_CONTAINER:/srv/lrnki/index.html" "$PROBE_DIR/image-index.html"
echo "==> waiting for the prepared Expo artifact at ${WEB_URL}"
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 10 "${WEB_URL%/}/" -o "$PROBE_DIR/public-index.html" \
    && cmp -s "$PROBE_DIR/image-index.html" "$PROBE_DIR/public-index.html"; then
    echo "==> deployed $LRNKI_DEPLOY_REVISION; API=$API_IMAGE Caddy=$CADDY_IMAGE"
    exit 0
  fi
  sleep 2
done

echo "!! the public website did not serve the prepared Expo artifact" >&2
docker compose logs --tail 40 caddy >&2 || true
exit 1

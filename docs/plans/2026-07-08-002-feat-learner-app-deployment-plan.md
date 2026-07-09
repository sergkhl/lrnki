# Learner App Deployment Plan

Deploy the target topology recorded in
[ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md): `learner-api` as a Docker
Compose service behind Caddy TLS on the existing VPS, `learner-web` on GitHub Pages under a custom
domain, and production environment wiring. Admin Lab and kg-worker deployment are unchanged
(host-run, SSH-tunnel-private per [ADR-0011](../adr/0011-retain-minimal-admin-lab.md)).

Decisions taken with the user (2026-07-08/09):

- Web app at **`https://lrnki.globesoul.com`** (GitHub Pages custom domain, CNAME →
  `sergkhl.github.io`, Vite `base` stays `/`). Nothing else will ever be hosted under
  `lrnki.globesoul.com`; a same-origin `/api` reverse-proxy setup was considered and rejected
  (bearer auth removes the cookie motive, Expo makes CORS moot, and proxying Pages through the
  VPS forfeits the CDN).
- API at **`https://api.lrnki.globesoul.com`** (A record → VPS IP); Caddy auto-provisions
  Let's Encrypt TLS.
- The VPS already runs this repo's compose (postgres/litellm/docling) from a checkout; nothing owns
  ports 80/443, so Caddy joins the same compose file.
- API deploys are triggered by a manual SSH script; the Pages workflow auto-deploys on push to
  `main`.

Both hostnames are stable and public, so each is hardcoded in the one file that consumes it
(Caddyfile site address, compose `LEARNER_WEB_ORIGIN`, workflow `VITE_LEARNER_API_URL`) — no env
indirection, no Actions variable. The remaining user-side actions (DNS records, Pages settings
after the first deploy, deploy-script SSH coordinates) are tracked in [BLOCKERS](./BLOCKERS.md).

## Scope

### U1 — learner-api container image

- `apps/learner-api/Dockerfile` with the repo root as build context: `node:22-alpine`, corepack
  pin to `pnpm@11.4.0` (root `engines`), `pnpm install --frozen-lockfile --filter
  @lrnki/learner-api...` (the `...` suffix pulls the workspace dependency closure), then
  `CMD ["node_modules/.bin/tsx", "apps/learner-api/src/index.ts"]`.
- The image runs the TS source via `tsx` exactly like the package's `start` script but takes env
  from the container, not `--env-file` (that flag stays dev-only; no second start script is added).
- Repo-root `.dockerignore` excluding `node_modules`, `tmp`, `dist`, `.next`, `docs`, `fixtures`.

### U2 — compose services: learner-api + caddy

- `learner-api` service in `docker-compose.yml`: `build` from U1, joins the `lrnki` network, **no
  published host port** (only Caddy reaches it), `restart: unless-stopped`, `depends_on` postgres
  healthy, healthcheck via `node -e "fetch('http://localhost:8787/health')…"`. Environment:
  `DATABASE_URL: postgresql://lrnki:lrnki@postgres:5432/lrnki`,
  `LITELLM_BASE_URL: http://litellm:4000`, `LITELLM_API_KEY` from `.env`,
  `LEARNER_WEB_ORIGIN: https://lrnki.globesoul.com`. The relocated topic-generation supervisor
  starts inside this process (ADR-0035), so these are its production LLM credentials too.
- `caddy` service: `caddy:2-alpine`, ports `80:80`, `443:443`, `443:443/udp`, mounts
  `scripts/docker/caddy/Caddyfile` read-only plus `caddy_data`/`caddy_config` volumes.
- `scripts/docker/caddy/Caddyfile` — one site block:
  `api.lrnki.globesoul.com { reverse_proxy learner-api:8787 }`. Caddy replaces untrusted incoming
  `X-Forwarded-For` with the real client IP by default, so the session rate limiter's existing
  first-XFF-entry read is not spoofable; no API change needed.
- One-line API change in `app.ts` `cors()`: add `maxAge: 86400` so browsers cache CORS preflights
  (the only real per-request cost of the two-origin topology).

### U3 — VPS exposure hardening

- Bind the published `litellm` (4000) and `docling` (5001) ports to `127.0.0.1` like postgres
  already is. Docker's iptables rules bypass ufw, so today those two are publicly reachable on the
  VPS. Host-run admin-lab/kg-worker still reach `localhost`; containers use service names; no
  behavior change.

### U4 — GitHub Pages workflow

- `.github/workflows/deploy-learner-web.yml`: on push to `main` — checkout, corepack pnpm,
  `pnpm install --frozen-lockfile`, `pnpm --filter @lrnki/learner-web test` and `typecheck` as a
  cheap gate, then `pnpm --filter @lrnki/learner-web build` with
  `VITE_LEARNER_API_URL=https://api.lrnki.globesoul.com` (custom domain ⇒ no `LEARNER_WEB_BASE`,
  base stays `/`), then `actions/configure-pages` → `actions/upload-pages-artifact`
  (`apps/learner-web/dist`) → `actions/deploy-pages`.
- Sequencing (user-confirmed): the custom domain can only be attached after the first Pages
  deploy. The first deploy lands on `sergkhl.github.io/lrnki/` where the `base=/` build looks
  broken — expected and harmless; attaching `lrnki.globesoul.com` in Pages settings fixes it and
  Pages then 301s the default URL to the custom domain.
- The existing `404.html` SPA fallback in the Vite build already handles Pages deep links; nothing
  new is built for routing.

### U5 — manual API deploy script

- `scripts/deploy-learner-api.sh`: requires `LRNKI_VPS_SSH` and `LRNKI_VPS_DIR`; runs
  `ssh → git pull --ff-only → docker compose up -d --build learner-api caddy`, then polls
  `https://api.lrnki.globesoul.com/health` until OK. Idempotent; brief restart downtime is
  accepted (greenfield, single operator).

### U6 — production schema

- Ensure the VPS database carries the current single migration (`scripts/migrate-db.sh`, or a
  reset per rule 9 if the VPS DB is disposable dev state). Sessions live in `learner_sessions`, so
  they survive API restarts with no extra work.

### Skipped deliberately (will not transfer or not needed now)

- No staging environment, blue-green/zero-downtime deploys, image registry, CDN, or added
  monitoring stack. No Expo build work — the public HTTPS API is the only thing the future Expo
  app needs from this plan.

## Completion

Fold the durable runbook facts (script name, required env/DNS parameters) into a short README
deployment section, then delete this plan and its BLOCKERS entries per the plans README.

## Verification

- Deterministic envelope: workspace `typecheck`/`test`/`lint` unchanged; `docker build` of the
  learner-api image succeeds; one real Pages workflow run deploys green.
- Real-use gate (rule 14): from a real browser on `https://lrnki.globesoul.com` — register through
  the gate (session row visible in the VPS `learner_sessions`), generate a REAL topic expedition
  end-to-end on the VPS supervisor through production LiteLLM, submit a graded study response, and
  read the leaderboard. Negative checks: `401` without a bearer token, HTTP→HTTPS redirect, and
  litellm/docling ports unreachable from outside the VPS. Evidence + screenshots under
  `tmp/2026-07-XX-learner-app-deployment/`.

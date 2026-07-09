# Lrnki Greenfield Scaffold

A minimal scaffold for building a Learner-Neutral Core Concept Graph from curated source resources.

## Included

- `apps/admin-lab`: minimal Next.js graph exploration lab
- `apps/kg-worker`: graph-builder worker entrypoint scaffold
- `packages/domain-core`: learner-neutral Concepts, Concept Evidence Profiles, and graph versions
- `packages/ports`: explicit application boundaries
- `packages/application`: concept-first graph-build orchestration skeleton
- `packages/infrastructure-ingestion`: structured text and HTML parser adapters
- `packages/infrastructure-litellm`: forced named tool-call gateway
- `packages/infrastructure-postgres`: PostgreSQL schema and initial migration with JSONB artifacts and JSON_TABLE inspection view
- `packages/infrastructure-storage-local`: local curated-source object store adapter
- `packages/infrastructure-rdf-export`: JSON-LD export sidecar

## Commands

```bash
cp .env.example .env
docker compose up -d postgres litellm
pnpm install
pnpm db:migrate
pnpm dev
```

The generated scaffold intentionally does not include a lockfile. Generate it with `pnpm install` in a network-enabled environment.

Run the quality checks:

```bash
pnpm check
```

## Deployment

Target topology ([ADR-0035](docs/adr/0035-separate-learner-app-static-spa-typed-api.md)): the
learner **web** SPA on GitHub Pages, the learner **API** as a Docker Compose service behind Caddy
TLS on the VPS. Admin Lab and kg-worker stay host-run and SSH-tunnel-private
([ADR-0011](docs/adr/0011-retain-minimal-admin-lab.md)).

| Surface | URL | How it deploys |
| --- | --- | --- |
| Learner web | `https://lrnki.globesoul.com` | `.github/workflows/deploy-learner-web.yml` on push to `main` |
| Learner API | `https://api.lrnki.globesoul.com` | `scripts/deploy-learner-api.sh` (manual, run on the VPS) |

Both hostnames are stable and hardcoded in the single file that consumes each (workflow
`VITE_LEARNER_API_URL`, `docker-compose.yml` `LEARNER_WEB_ORIGIN`, `scripts/docker/caddy/Caddyfile`).

**API deploy** — from the repo checkout on the VPS (drives the local Docker daemon):

```bash
scripts/deploy-learner-api.sh   # git pull --ff-only → compose up -d --build learner-api caddy → poll /health
```

The `learner-api` container reads `DATABASE_URL`, `LITELLM_BASE_URL`, and `LEARNER_WEB_ORIGIN`
from compose; `LITELLM_API_KEY` comes from the repo-root `.env`. Before the first API deploy,
ensure the VPS database carries the single migration (`pnpm db:migrate` against the VPS
`DATABASE_URL`); learner sessions persist in `learner_sessions` and survive restarts.

**Web deploy** — automatic on push to `main`. The first run lands on `sergkhl.github.io/lrnki/`
(looks broken with `base=/` — expected); attach `lrnki.globesoul.com` as the Pages custom domain
in repo settings afterward and Pages 301s the default URL to it.

## Scope

This scaffold intentionally excludes learner-state persistence, assessment-bank generation, course planning, learner-facing UI, OCR, multimodal interpretation, and automatic ontology import.

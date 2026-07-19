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

## Commands

```bash
cp .env.example .env
docker compose up -d postgres litellm
pnpm install
pnpm db:migrate
pnpm dev:admin      # Admin Lab (Next.js)
pnpm dev:api        # Learner API (tsx watch)
pnpm dev:learner    # Learner app web (Expo, no browser auto-open)
```

The generated scaffold intentionally does not include a lockfile. Generate it with `pnpm install` in a network-enabled environment.

Run the quality checks:

```bash
pnpm check
```

`pnpm check` includes the intercepted production-web Playwright gate (`pnpm e2e:web`), which mocks
the API and runs deterministically. Two heavier suites are **opt-in** and not part of `pnpm check`
([ADR-0038](docs/adr/0038-native-interaction-gate-scope-and-physical-authority.md)):

```bash
pnpm e2e:web:realuse    # real supervisor-free API over Postgres, no generation
pnpm e2e:native:maestro # real Android APK on an emulator, deterministic loopback fixture
```

The real-backend web gate needs live Postgres with at least one ready catalog enrichment; it
selects one by capability, never generates, and cleans up its disposable learners on success or
failure. See [apps/learner-app/e2e-realuse/README.md](apps/learner-app/e2e-realuse/README.md).

The native gate drives a standalone e2e-profile APK on a booted Android emulator with Maestro; it
holds automatic authority only for the sensitivity-proven Support Path dialog scenario (the Theory
touch-responder class stays physically owned). Prerequisites and scope:
[apps/learner-app/e2e-native/README.md](apps/learner-app/e2e-native/README.md).

## Deployment

Target topology ([ADR-0035](docs/adr/0035-separate-learner-app-static-spa-typed-api.md)): the
learner **web** build of the Expo universal app on GitHub Pages, the learner **API** as a Docker
Compose service behind Caddy TLS on the VPS. Admin Lab and kg-worker stay host-run and
SSH-tunnel-private ([ADR-0011](docs/adr/0011-retain-minimal-admin-lab.md)).

| Surface | URL | How it deploys |
| --- | --- | --- |
| Learner web | `https://lrnki.globesoul.com` | `.github/workflows/deploy-learner-web.yml` on push to `main` |
| Learner API | `https://api.lrnki.globesoul.com` | `scripts/deploy-learner-api.sh` (manual, run on the VPS) |

Both hostnames are stable and hardcoded in the single file that consumes each (workflow
`EXPO_PUBLIC_LEARNER_API_URL`, the `apps/learner-api/src/app.ts` CORS default,
`scripts/docker/caddy/Caddyfile`).

During testing there is one shared environment
([ADR-0036](docs/adr/0036-run-single-shared-learner-environment-during-testing.md)): the Expo
learner-app (`apps/learner-app`) defaults to `https://api.lrnki.globesoul.com`, so `pnpm --filter
@lrnki/learner-app start` needs no configuration. Set `EXPO_PUBLIC_LEARNER_API_URL` (e.g.
`http://localhost:8787`) only to point it at a local API instead.

**API dev loop** — Caddy's first upstream is a host-run dev API with a container fallback
(`lb_policy first` + `/health` checks in `scripts/docker/caddy/Caddyfile`). Start

```bash
pnpm --filter @lrnki/learner-api dev   # tsx watch, reads the repo-root .env
```

and within ~5s `https://api.lrnki.globesoul.com` serves the watched process — no image rebuild
per edit. Stop it and traffic falls back to the `learner-api` container within ~10s. One-time
VPS setup (ufw defaults to DROP, which silently times out the container→host hop):

```bash
ufw allow in on br-lrnki to any port 8787 proto tcp comment 'lrnki learner-api dev loop: caddy -> host dev process'
``` Both
processes may run their topic-generation supervisors concurrently; the DB-claim fencing
([ADR-0029](docs/adr/0029-persist-shared-operation-stage-timelines.md)) makes that safe. The
Caddyfile is baked into the built caddy image (bind mounts break on this VPS — the daemon's FS
view diverges from the checkout), so a Caddy config change needs
`docker compose up -d --build caddy`.

**API deploy** — from the repo checkout on the VPS (drives the local Docker daemon):

```bash
scripts/deploy-learner-api.sh   # git pull --ff-only → compose up -d --build learner-api caddy → poll /health
```

The `learner-api` container reads `DATABASE_URL` and `LITELLM_BASE_URL` from compose;
`LITELLM_API_KEY` comes from the repo-root `.env`. Before the first API deploy, ensure the VPS
database carries the single migration (`pnpm db:migrate` against the VPS `DATABASE_URL`);
learner sessions persist in `learner_sessions` and survive restarts.

**Web deploy** — automatic on push to `main`. The first run lands on `sergkhl.github.io/lrnki/`
(looks broken with `base=/` — expected); attach `lrnki.globesoul.com` as the Pages custom domain
in repo settings afterward and Pages 301s the default URL to it. Once the custom-domain cert has
provisioned, enable **Enforce HTTPS** in Pages settings so plain-HTTP requests 301 to HTTPS.

**Mobile builds (Android)** — `.github/workflows/build-learner-android.yml`
(`workflow_dispatch`) runs `scripts/build-learner-android.sh` on a GitHub runner (`eas build
--local`, authenticated by the `EXPO_TOKEN` repo secret) and uploads the APK as a workflow
artifact; download and sideload it. Profiles come from `apps/learner-app/eas.json`: `preview`
(default; standalone APK against the live API) and `development` (dev client for `expo start`).
Local fallback on a machine with Java 17 + the Android SDK (`EXPO_TOKEN` is read from the
repo-root `.env`, else the environment):

```bash
pnpm build:android       # preview profile
pnpm build:android:dev   # development profile
```

**Native dev loop** — build, install, and launch a development build on a connected device (else
the emulator/simulator) and start Metro with the dev client:

```bash
pnpm dev:android    # needs Java 17 + Android SDK
pnpm dev:ios        # needs macOS + Xcode
```

`expo run:*` generates `apps/learner-app/android/` and `ios/` in-tree (gitignored); no
`EXPO_TOKEN` needed. Builds default to the live API; to target a local `pnpm dev:api`, set
`EXPO_PUBLIC_LEARNER_API_URL=http://10.0.2.2:8787` (Android emulator) or `http://localhost:8787`
(iOS simulator) — debug builds permit cleartext HTTP, so no config change is needed.

EAS iOS builds (distributable artifacts) — future work.

## Scope

This scaffold intentionally excludes learner-state persistence, assessment-bank generation, course planning, learner-facing UI, OCR, multimodal interpretation, and automatic ontology import.

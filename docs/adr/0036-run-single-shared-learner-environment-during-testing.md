# 0036 — Run a single shared learner environment during testing

Date: 2026-07-09. Status: accepted. Origin: learner-app deployed-API default change.

## Decision

Until learner-stack testing is complete, there is one working environment: dev equals prod. The
learner-app defaults, in code, to the deployed learner-api at `https://api.lrnki.globesoul.com`
(the fallback in `apps/learner-app/src/lib/api.ts`). There is no separate dev backend to run,
migrate, or keep in sync. `EXPO_PUBLIC_LEARNER_API_URL` remains the single opt-in override for
pointing the app at a local API.

## Context

The learner-api is already live as a Docker Compose service behind Caddy TLS
([ADR-0035](./0035-separate-learner-app-static-spa-typed-api.md) topology; see the README
`## Deployment` section for the runbook). While the Expo learner-app is still being validated,
maintaining a parallel local backend for everyday work costs setup — run the API, apply the
migration, and put a physical phone on the same LAN — for no current benefit. A public HTTPS
default lets Expo Go on a real device reach the API directly, which unblocks the native rule-14
half and the [ADR-0032](./0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md) feel
gate without any local infrastructure.

## Consequences

- Local learner-app development hits real production data by default. This is acceptable and
  intended during testing; the learner surface is PIN-gated and identity is a server-derived
  bearer token (ADR-0035), not a privileged account.
- Phone testing reduces to `pnpm --filter @lrnki/learner-app start` + Expo Go — no local API, no
  local migration, no same-network requirement.
- The shared environment extends to the API dev loop: Caddy's first upstream is a host-run
  `pnpm --filter @lrnki/learner-api dev` process with the `learner-api` container as fallback,
  so `api.lrnki.globesoul.com` serves the watched dev process whenever one is running (runbook
  in the README `## Deployment` section).
- This decision is explicitly temporary. When a separate dev/staging backend is reintroduced,
  delete this ADR and repair inbound references (ADRs are never left as tombstones).

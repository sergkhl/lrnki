# 0040 — Serve the public API only from the deployed container

Date: 2026-08-05. Status: accepted. Origin: a developer process silently owning the public hostname.

## Decision

`api.lrnki.globesoul.com` resolves to exactly one upstream: the `learner-api` container. No
developer process may enter the production traffic path, and nothing on the host binds 8787.

The API dev loop is `docker compose watch learner-api` — edit on the host, run in the container.
Edits sync into the same container that serves traffic instead of standing up a second runtime
beside it. There is therefore one process, one image, and one env source for the public API.

`/health` remains a cheap static liveness endpoint. A separate readiness endpoint is out of scope.

## Context

A shallow health check was arbitrating between a managed and an unmanaged upstream. Caddy proxied
`host.docker.internal:8787 learner-api:8787` under `lb_policy first` with `health_uri /health`, so a
host-run dev API took the hostname whenever one was running and kept it for as long as it returned
200 — which a static `{ ok: true }` does even when every dependency behind it is dead. The failure
mode is a "pet process" shadowing the deployed artifact, and it is not detectable from the edge.

The conventional root-cause fix for that class is dev/prod parity — run the same artifact in dev as
in prod — rather than a better probe. Compose Watch is the vendor-supported mechanism for it, and
fits because the image runs `tsx` on TypeScript source: a sync needs no build step, and the in-image
workspace install lives at the same paths the sync targets, so the symlinks survive.

**A DB-aware `/health` was rejected**, and should not be re-proposed as a fix for this:

- The pool is `postgres(url, { max: 1 })` — a single connection. An active 5s probe against two
  upstreams would contend with real learner traffic on that one connection, permanently.
- It detects one flavour of the class. A dev process on the wrong branch, or holding a stale `.env`
  with a dead LiteLLM key, has a perfectly healthy pool and still owns the hostname.

Deepening the probe treats the symptom of having two upstreams. Removing the second upstream is what
makes the hazard unreachable, after which there is nothing for a health check to arbitrate.

## Consequences

- Active health checks are gone from the Caddyfile. With one upstream they have nothing to fail over
  to and would only turn a restart-window 502 into a 503.
- The host runtime is deleted, not merely discouraged: `dev:api`, and the learner-api `dev`/`start`
  scripts that read a host `.env` pointing at `localhost:5433`. Env divergence goes with them.
  `realuse-server` is unaffected — it is a separate supervisor-free harness process on its own port,
  not a shadow of the production one.
- The dev reload is a container restart (~1–3s with a brief 502), not sub-second `tsx watch`.
  Accepted.
- `docker compose watch` is foreground and attached, and dies with its terminal or SSH session.
  If it is not on screen it is not syncing.
- A deploy refuses while a watch session is attached, since a sync would overwrite the image just
  deployed. The deploy also probes the container directly before the public hostname, so "the
  artifact I deployed started" and "the public hostname reaches it" are asserted separately.
- Compose projects are keyed by directory basename, so a second checkout sharing the basename
  resolves to the same containers and can still `watch` into the deployed one. That residual is
  host hygiene — an operator action, not a compose or Caddy setting.
- This supersedes the dev-loop mechanism in
  [ADR-0036](./0036-run-single-shared-learner-environment-during-testing.md). That decision — one
  shared environment, dev equals prod — is unchanged and is in fact what this ADR enforces.

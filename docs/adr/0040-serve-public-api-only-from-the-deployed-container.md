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
- The host runtime is deleted, not merely discouraged: the learner-api `dev`/`start` scripts that
  read a host `.env` pointing at `localhost:5433`. Env divergence goes with them. `realuse-server` is
  unaffected — it is a separate supervisor-free harness process on its own port, not a shadow of the
  production one. `dev:api` survives only as the name of the watch session.
- A dev machine reaches the container through `docker-compose.dev.yml`, whose only content is
  `127.0.0.1:8787:8787`. The learner app needs a host listener there: its origin must be
  byte-identical to `BETTER_AUTH_URL` (ADR-0041), and `adb reverse` forwards a device's loopback
  only to one. The publish cannot reach the VPS — compose does not auto-load a named overlay, and
  `scripts/deploy-learner-api.sh` passes no `-f` — so "nothing on the host binds 8787" still holds
  where it was decided. It is also not a second upstream: what binds the port is the deployed
  container itself, which is what leaves nothing for a health check to arbitrate.
- The dev reload is a container restart (~1–3s with a brief 502), not sub-second `tsx watch`.
  Accepted.
- `docker compose watch` is foreground and attached, and dies with its terminal or SSH session.
  If it is not on screen it is not syncing.
- A deploy refuses while a watch session is attached, since a sync would overwrite the image just
  deployed. The deploy also probes the container directly before the public hostname, so "the
  artifact I deployed started" and "the public hostname reaches it" are asserted separately.
- The no-interception guarantee is verifiable rather than merely asserted, by a negative control:
  bind an impostor on the host's `0.0.0.0:8787` and confirm the loopback serves the impostor while
  the public hostname still serves the container. `host.docker.internal` is additionally `NXDOMAIN`
  inside Caddy, since nothing grants it `host-gateway`. First run end-to-end over real TLS on the
  VPS, 2026-08-05, alongside one authenticated round trip
  (`POST /session` → `/me` → `/catalog` → `DELETE /session` → 401); run it against the deployed
  stack, not a local Caddy, or it proves nothing about the public path.
- Compose projects are keyed by directory basename, so anything that reaches the shared daemon with
  a project directory named `lrnki` resolves to these containers. On the VPS that is not a second
  checkout but the **same** checkout at a second path: an agent container binds the workspace at a
  different prefix and shares the docker socket, so compose there hands the daemon paths it cannot
  see. Docker's default is to create a missing bind source as an empty directory, which is how a
  directory ends up mounted over `config.yaml`.

  Resolved by rule plus a fail-closed mechanism, not by remapping that container: every file bind in
  `docker-compose.yml` sets `create_host_path: false`, so a caller resolving the wrong path is
  refused by name instead of silently corrupted, and rule 23 in `AGENTS.md` states where compose may
  run. Remapping the agent container's workspace to the host path was considered and rejected — it
  re-keys the path-addressed session state bind-mounted into it, for a hazard this closes more
  cheaply. `watch` on already-running containers and `down` touch no bind source and so remain
  governed by the rule alone.
- This supersedes the dev-loop mechanism in
  [ADR-0036](./0036-run-single-shared-learner-environment-during-testing.md). That decision — one
  shared environment, dev equals prod — is unchanged and is in fact what this ADR enforces.

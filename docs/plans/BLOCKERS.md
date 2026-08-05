# Blockers

- **Deploy the single-upstream Caddy to the VPS and close the dev-loop firewall hole.** The change is
  verified locally but the shared environment still runs the dev-first Caddyfile, so until this runs
  a host process on 8787 can still take `api.lrnki.globesoul.com`. From `~/pi-workspace/lrnki`:

  ```bash
  ss -tlnp | grep 8787                                         # expect empty; stop anything found
  scripts/deploy-learner-api.sh                                # rebuilds caddy with the one upstream
  ufw delete allow in on br-lrnki to any port 8787 proto tcp   # the dev-loop hole is now unused
  ```

  Confirm the deploy's container-direct probe and public poll both pass, then one authenticated
  learner round trip over real TLS (`POST /session` → `GET /me` → `/catalog` → `DELETE /session` →
  401), cleaning up the probe rows. The rule-14 real-use gate follows, since this is a
  behaviour-changing milestone on the shared environment.

- **Remove or rename the second `lrnki` checkout on the VPS.** `/workspace/lrnki` (root-owned,
  non-git, where Codex sessions spawn) and `~/pi-workspace/lrnki` (the deploy checkout) share the
  basename `lrnki`, and Compose keys the project by directory basename — so both resolve to the
  **same project and the same containers**. A session in the wrong checkout can therefore
  `docker compose watch` into the deployed container, or `up -d` it from a divergent tree.

  This is the residual of the hazard closed by
  [ADR-0040](../adr/0040-serve-public-api-only-from-the-deployed-container.md), and it is strictly
  smaller: it is a foreground process, it cannot serve a divergent env or a wedged private pool, and
  `docker compose up -d --force-recreate learner-api` fully clears it. No compose or Caddy setting
  closes it — the fix is host hygiene, which only the operator can perform. Either delete
  `/workspace/lrnki` or rename its directory so it claims a distinct Compose project.

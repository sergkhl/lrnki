# Serve the public API only from the deployed container

Status: Accepted

The public learner API hostname has exactly one upstream: the learner-api container. Host-run
developer processes cannot enter production traffic or compete for the public API port. The
shared-host development loop uses Compose Watch inside that same container.

A Caddy fallback previously allowed a healthy but unmanaged or stale host process to shadow the
deployed artifact. Removing that upstream eliminates the competing traffic authority.

[AGENTS.md](../../AGENTS.md#shared-host-compose) owns Compose execution authority and bind-path safety;
the [root README](../../README.md#deployment) owns commands and probes.

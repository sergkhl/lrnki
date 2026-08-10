# Serve the public API only from the deployed container

Status: Accepted

## Decision

The public learner API hostname has exactly one upstream: the learner-api container. No host-run
developer process may enter production traffic or compete for the public API port.

The shared-host development loop edits on the host and runs through Compose Watch inside that same
container. Deployment and local-development commands, probes, and environment details belong to the
root README; compose execution authority and bind-path safety belong to AGENTS rule 23.

## Context

A Caddy fallback previously preferred a host-run process whenever its shallow health endpoint
answered, allowing an unmanaged or stale process to shadow the deployed artifact invisibly.
Deepening the probe would still leave two authorities. Removing the second upstream makes that failure
class unreachable.

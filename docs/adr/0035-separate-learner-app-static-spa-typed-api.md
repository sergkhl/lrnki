# Separate the Learner App into a universal Expo app over a typed learner API

Status: Accepted

## Decision

Learner delivery has two apps behind one typed contract:

- apps/learner-api is the long-lived Hono process whose validated routes map to application use-cases
  and derive learner identity from the request credential.
- apps/learner-app is one universal Expo rendering layer for native and web, consuming that API
  through the generated Hono client.

The web artifact is a client-rendered single-shell SPA. Static hosting serves the same shell for
dynamic Expedition and Guardian routes so the server-rendered tree cannot disagree with runtime
route state. Native and web platform differences stay behind file-level adapters with one interface.

Self-hosted identity belongs to
[ADR-0041](0041-own-learner-identity-with-self-hosted-better-auth.md). Admin Lab remains an operator
surface and serves no learner route. The web artifact deploys to static hosting; learner-api runs
beside PostgreSQL and LiteLLM according to the root README deployment runbook.

## Context

Admin Lab and the learner experience have different users, trust boundaries, and deployment needs.
One universal learner rendering layer avoids separate mobile and web products while the typed API
keeps persistence and application behavior server-owned.

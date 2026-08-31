# Use one universal Expo app over a typed Hono learner API

Status: Accepted

## Decision

Learner delivery has two apps behind one typed contract: a long-lived Hono API that authenticates and
delegates to learner-runtime, and one universal Expo rendering layer for web and native. The app
imports learner-api DTOs only and does not import runtime, persistence, or authored server documents.

The web artifact is a client-rendered static SPA. Native/web differences stay behind file-level
adapters. PostgreSQL and the API remain server-side; there is no Admin Lab, worker, model service, or
second learner content route.

Self-hosted identity follows [ADR-0041](0041-own-learner-identity-with-self-hosted-better-auth.md), and
the deployed public route follows [ADR-0040](0040-serve-public-api-only-from-the-deployed-container.md).

## Context

One universal presentation avoids separate web and mobile products, while the typed server boundary
keeps identity, grading, atomic progress, and private answers outside the client.

# Use one universal Expo app over a typed Hono learner API

Status: Accepted

Learner delivery uses a long-lived Hono API and one universal Expo rendering layer for web and
native. All reads and transitions cross `LearnerRuntime`, which combines qualified authored content
with validated Learner State and returns finished views. Hono derives identity, validates transport,
and maps results; neither Hono nor Expo assembles policy from storage rows or content documents.

The app imports learner-api DTOs only, never runtime, persistence, or authored server documents.
Private grading and answer keys stay behind this boundary. Exact interfaces are owned by the
[runtime types](../../packages/learner-runtime/src/runtimeTypes.ts) and
[API contract](../../apps/learner-api/src/client.ts).

The web artifact is a client-rendered static SPA. Native/web differences stay behind file-level
adapters. This avoids separate web and mobile products and keeps learner policy consistent across
transport and test adapters.

Self-hosted identity follows [ADR-0041](0041-own-learner-identity-with-self-hosted-better-auth.md), and
the deployed public route follows [ADR-0040](0040-serve-public-api-only-from-the-deployed-container.md).

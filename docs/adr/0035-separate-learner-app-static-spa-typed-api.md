# 0035 — Separate the Learner App into a static SPA over a typed learner API

Date: 2026-07-08. Status: accepted. Origin: plan 2026-07-08-003.

## Decision

The Learner App is extracted from Admin Lab into two apps with an Expo-ready topology:

- **`apps/learner-api`** — one long-lived Hono + zod Node process exposing the complete learner
  HTTP surface. Every route is a thin zod-validated mapper over `@lrnki/application` use-cases;
  no raw SQL and no domain logic lives in routes. It hosts the relocated topic-generation
  supervisor (same DB-claim/fencing/staleness semantics) and holds one shared postgres.js pool
  for routes and supervisor alike. Its exported Hono `AppType` is the single client contract.
- **`apps/learner-web`** — a Vite + TanStack Router/Query SPA consuming the API through the
  typed `hono/client`. `vite build` output is fully static (GitHub Pages deployable; browser
  history plus a `404.html` copy of `index.html` as the SPA fallback, `base` configurable).

## API boundary policy

All learner traffic goes through `learner-api`. Identity is derived server-side from an opaque
bearer token — 32 random bytes client-side, SHA-256 hash at rest in `learner_sessions`; no route
accepts a client-supplied `learnerStateRef`; revocation is row deletion. The web app keeps the
token in `localStorage`, the future Expo app keeps the same token in `SecureStore` and consumes
the **same** API and typed client + TanStack Query data layer, with only the rendering layer
rewritten in RN primitives. XSS exposure of a localStorage token is accepted for a PIN-gated
learning app; the `POST /session` route (name + PIN, fixed-window per-IP and per-name rate
limit) remains the swap seam for real authentication.

## Deployment topology (target)

Static web client on GitHub Pages; `learner-api` on the VPS beside Postgres/LiteLLM (its only
runtime dependencies). Admin Lab stays VPS-private behind the existing SSH tunnel (ADR-0011) and
no longer serves any learner route. Deployment mechanics live in the follow-up deployment plan.

## Consequences

- The server actions, learner-ref cookie, and Next.js `instrumentation.ts` supervisor bootstrap
  in Admin Lab are deleted (rule 18); Admin Lab's "open as learner" door is a plain link to the
  learner web app.
- Pure learner view-model modules moved with their components into `learner-web`; the seeded
  rival board assembly lives in `learner-api` (exported as a pure subpath for the duel's
  client-side rival), and the sphere-grid layout moved to `@lrnki/application` because both
  Admin Lab and the learner web app render it.
- Per-request `createDatabaseClient()/end()` churn on the learner path is gone (one pool per
  process).

# 0035 — Separate the Learner App into a universal Expo app over a typed learner API

Date: 2026-07-08, amended 2026-07-10 (universal Expo cutover), 2026-07-11 (app-owned interaction
system), 2026-07-14 (static/animated style boundary), and 2026-08-08 (identity swap seam realized).
Status: accepted.

## Decision

The Learner App is extracted from Admin Lab into two apps with a shared typed contract:

- **`apps/learner-api`** — one long-lived Hono + zod Node process exposing the complete learner
  HTTP surface. Every route is a thin zod-validated mapper over `@lrnki/application` use-cases;
  no raw SQL and no domain logic lives in routes. It hosts the relocated topic-generation
  supervisor (same DB-claim/fencing/staleness semantics) and holds one shared postgres.js pool
  for routes and supervisor alike. Its exported Hono `AppType` is the single client contract.
- **`apps/learner-app`** — one Expo universal app (React Native + React Native Web + Expo
  Router, NativeWind styling, `react-native-svg` crystals) whose **single rendering layer**
  serves both the installable mobile app and the static web build. `expo export --platform web`
  output is fully static (GitHub Pages deployable; a `404.html` copy of `index.html` is the SPA
  fallback for deep links). Platform seams are RN file extensions with one exported contract
  each: the session cookie lives in SecureStore on native and in the browser cookie jar on web
  ([ADR-0041](./0041-own-learner-identity-with-self-hosted-better-auth.md)); nav memory in
  AsyncStorage / localStorage.

## API boundary policy

All learner traffic goes through `learner-api`, and **no route accepts a client-supplied
`learnerStateRef`** — identity is always derived server-side from the request's own credential.
Both platforms consume the **same** API through the typed `hono/client` + TanStack Query data
layer.

The swap seam this ADR reserved is realized: identity and sessions are owned by self-hosted Better
Auth mounted inside `learner-api`, per
[ADR-0041](./0041-own-learner-identity-with-self-hosted-better-auth.md). The PIN registry, the
opaque bearer token, its `learner_sessions` table, the client-side token stores, and the
localStorage-XSS acceptance recorded here are all deleted — that acceptance was scoped to a
PIN-gated placeholder and does not survive into the real-identity era.

Clients import server-side packages only through client-safe surfaces: the pure
`@lrnki/application` `./projection` subpath and the `@lrnki/learner-api` `./client` and
`./rival-simulation` subpaths — no Node builtins are reachable from the app bundle (the web
export fails otherwise, which is the enforcement).

## Deployment topology (target)

Static web build on GitHub Pages; `learner-api` on the VPS beside Postgres/LiteLLM (its only
runtime dependencies). Admin Lab stays VPS-private behind the existing SSH tunnel (ADR-0011) and
no longer serves any learner route. Deployment mechanics live in the README `## Deployment`
runbook; the single shared environment during testing is
[ADR-0036](./0036-run-single-shared-learner-environment-during-testing.md).

## Consequences

- The server actions, learner-ref cookie, and Next.js `instrumentation.ts` supervisor bootstrap
  in Admin Lab are deleted (rule 18); Admin Lab's "open as learner" door is a plain link to the
  learner web build.
- Pure learner view-model modules and the data layer moved into `apps/learner-app` with their
  tests; the seeded rival board assembly lives in `learner-api` (exported as a pure subpath for
  the weekly leaderboard's presentation-only seeded rivals), and the sphere-grid layout lives in
  `@lrnki/application` because both Admin Lab and the learner app render it.
- The interim Vite + TanStack Router web SPA (`apps/learner-web`) was deleted at cutover; the
  monorepo uses pnpm's hoisted node linker because Metro's resolution needs transitive Babel
  plugins materialized.
- Per-request `createDatabaseClient()/end()` churn on the learner path is gone (one pool per
  process).
- The single rendering layer renders through the app-owned NativeWind component system and motion
  contract defined in
  [ADR-0032](0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md); the learner-surface
  boundary is lint-enforced in the root ESLint config.
- Class-bearing animated surfaces use the app-owned split bridge in `src/ui/motion.ts`: NativeWind's
  `styled` wrapper resolves `className` and static inline `style` on a ref-forwarding component, and
  that component appends the opaque Reanimated `animatedStyle` handle only at the terminal animated
  view or pressable. This preserves class shells and static overrides without letting the CSS
  resolver inspect shared values during React render. `passThrough`, duplicated consumer inline
  styles, dependency patches, and Reanimated warning suppression are not part of this boundary.
  Jest locks the bridge shape and prop/ref contracts; web and physical Android inspection remain
  the styling and runtime-warning authority.

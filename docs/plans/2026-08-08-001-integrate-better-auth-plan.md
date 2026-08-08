---
title: Integrate Self-Hosted Better Auth - Plan
type: feat
date: 2026-08-08
execution: code
---

<!--
Plan hygiene — docs/plans/README.md owns these rules; this is a signpost, not a second definition.
  * The Validation Log is append-only within a unit and REWRITTEN to one entry when that unit closes.
  * Record one current metric value and its invariant, never the trajectory that produced it.
  * Open work goes in the single `Open findings` section, never in a per-entry "not done" list.
  * Durable mechanics belong in docs/adr/, AGENTS.md, CONTEXT.md, a rig README, or a skill — never
    here. This plan is deleted at completion.
  * Caps: Validation Log ~200 lines, this file ~600, the status header 15. Over a cap means
    consolidate BEFORE appending.
-->

# Integrate Self-Hosted Better Auth

**Status:** Ready — queued after
[2026-08-07-001 (matching item quality)](./2026-08-07-001-fix-matching-item-quality-plan.md).
No unit started. Next action: when the matching branch merges, branch `feat/better-auth` off `main`
and open U1.

**Decision state:** Interview-locked 2026-08-08. D1–D9 were each chosen in the planning interview;
D1's email/password fallback was user-directed (e2e testability), the rest accepted as recommended.

**Precondition:** `fix/matching-item-quality` merged to `main`. The shared-environment hard reset in
U4 must not land while another branch is mid-validation against the old shared data (D9).

## Goal capsule

The current learner identity is a labeled placeholder: display-name-as-primary-key plus a 4–8 digit
PIN, hand-rolled opaque bearer tokens in `learner_sessions`, and localStorage on web — accepted by
[ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md) only "for a PIN-gated learning
app", with `POST /session` named as "the swap seam for real authentication". This plan executes that
swap: self-hosted **Better Auth** mounted inside `learner-api` becomes the only identity and session
authority — Google sign-in as the primary UX, email/password as the fallback and e2e path, cookie
sessions on both platforms — and the entire placeholder subsystem (PIN registry, token minting,
`learners`/`learner_sessions` tables, tokenStore seams, the name gate) is deleted in the same work.

After this work: a learner signs in with Google (or email/password), names their explorer once,
and the app, rigs, and Admin Lab reads all resolve identity from Better Auth's `user` table;
no PIN, custom token, or client-readable credential exists anywhere.

## Canonical inputs

- Engineering and greenfield enforcement: [AGENTS.md](../../AGENTS.md), especially rules 1, 9, 14,
  15, 18, 21, 22.
- Learner surface and API boundary, amended by this plan:
  [ADR-0035](../adr/0035-separate-learner-app-static-spa-typed-api.md); shared environment:
  [ADR-0036](../adr/0036-run-single-shared-learner-environment-during-testing.md); one public
  upstream: [ADR-0040](../adr/0040-serve-public-api-only-from-the-deployed-container.md).
- Persisted-shape authority and baseline regeneration:
  [ADR-0039](../adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md).
- Admin Lab stays tunnel-gated: [ADR-0011](../adr/0011-retain-minimal-admin-lab.md).
- Game UX for the new screens: [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md),
  [ADR-0033](../adr/0033-plain-identifiers-single-themed-vocabulary-mapping.md).

Source files that own the current behavior:
[`auth.ts`](../../apps/learner-api/src/auth.ts) (token mint/hash, bearer middleware, rate limiter),
[`app.ts`](../../apps/learner-api/src/app.ts) (`POST/DELETE /session`, `GET /me`, CORS),
[`learnerRegistry.ts`](../../packages/application/src/learnerRegistry.ts) (PIN hashing),
[`learnerState.ts`](../../packages/infrastructure-postgres/src/schema/learnerState.ts)
(`learners`, `learner_sessions`, and the FK graph),
[`PostgresLearnerRegistryStores.ts`](../../packages/infrastructure-postgres/src/PostgresLearnerRegistryStores.ts),
`LearnerStorePort` / `LearnerSessionStorePort` in [`ports`](../../packages/ports/src/index.ts),
[`tokenStore.ts`](../../apps/learner-app/src/lib/tokenStore.ts) / `.web.ts`,
[`api.ts`](../../apps/learner-app/src/lib/api.ts),
[`session.ts`](../../apps/learner-app/src/lib/session.ts),
[`queries.ts`](../../apps/learner-app/src/lib/queries.ts),
[`LearnerNameGate.tsx`](../../apps/learner-app/src/components/LearnerNameGate.tsx),
[`getWeeklyLeaderboard.ts`](../../packages/application/src/getWeeklyLeaderboard.ts), the Admin Lab
learner-loop pages, and the rigs enumerated in U3.

There is no linked brainstorm; the planning interview of 2026-08-08 owns the problem framing and
this ready plan owns the implementation design until the work completes.

## Problem class and conventional practice (AGENTS rule 21)

- **Rolling your own auth** is the named anti-pattern this plan retires. The conventional remedy is
  a maintained framework owning credential storage, session issuance, OAuth wiring, and CSRF.
  Better Auth is the conventional choice *for this stack*: TypeScript-first, framework-agnostic with
  first-class Hono mounting, a Drizzle adapter over Postgres, and an official Expo plugin — every
  integration seam this codebase already has, with no external auth service (self-hosted, so the
  ADR-0040 single-container topology is untouched).
- **OAuth in e2e tests** has one recognized rule: never drive the third-party IdP (Google actively
  blocks automated logins; consent-screen flows are brittle by design). The conventional
  alternatives are a first-party credential path or seeding sessions behind the UI. The credential
  path wins here because it is Better Auth **core** (one config line), exercises the real sign-in UI,
  and doubles as a genuine fallback for learners without a Google account; session-seeding couples
  the rigs to Better Auth's internal session format and needs an injection hook that would never
  ship (D1).
- **Cookie vs bearer for SPAs** — the standard reason SPAs pick bearer tokens is a cross-*site* API
  where cookies are third-party. `lrnki.globesoul.com` and `api.lrnki.globesoul.com` share a
  registrable domain, so cookies are first-party (`SameSite=Lax` suffices) and the standard reason
  does not apply. OAuth redirects can only deliver a cookie, never a header, so a bearer design
  would run both transports plus glue (D2).

No bespoke method is introduced anywhere in this plan.

## Interview-locked decision ledger

**D1 — Google primary, email/password fallback.** Google social sign-in is the primary UX. Email +
password (Better Auth core) stays enabled as the secondary path: it is the deterministic e2e route
and the fallback for learners without a Google account. Email **verification off** (no SMTP), **no
password-reset flow** until SMTP exists — both deferred, not built and mocked.

**D2 — Cookie sessions everywhere; bearer plugin never installed.** Web: Better Auth default
HttpOnly cookies, `SameSite=Lax`, `credentials: "include"` on the `hc` fetch, CORS gains
`credentials: true` over the existing exact-origin echo. Native: `@better-auth/expo` stores the
session cookie in SecureStore and the `hc` headers callback attaches `authClient.getCookie()` where
`Bearer` goes today. `tokenStore.ts`/`.web.ts` are deleted; ADR-0035's localStorage-XSS acceptance
is retired rather than carried into the real-identity era. Standing constraint to document in the
ADR: the learner web build must stay on a `globesoul.com` subdomain, or cookies become third-party
and die in Safari.

**D3 — `learnerRef` = Better Auth `user.id`.** `learners` and `learner_sessions` are deleted. Every
FK that pointed at `learners.learner_ref` repoints to `user.id` (both text — no column-type churn);
`learnerStateRef` keeps its name through the application layer but now carries the opaque user id;
`user.name` is the single display-name owner. Hard reset (rule 9) and mechanical baseline
regeneration (ADR-0039). No data migration: ADR-0036 declares the shared test data disposable (D8).

**D4 — Mounted inside `learner-api`, one container.** The Better Auth instance lives in the
learner-api composition root, handler mounted at `/auth/*`, Drizzle adapter over the same shared
postgres.js pool (a `drizzle(sql)` wrapper — the adapter needs one; stores keep raw `sql`). Better
Auth's built-in rate limiting replaces `FixedWindowRateLimiter`. ADR-0040's one-upstream guarantee
is untouched.

**D5 — Native OAuth is the browser-redirect flow.** System browser → Google consent → callback on
`api.lrnki.globesoul.com` → redirect into the app via the existing `lrnki://` scheme (already in
`app.config.ts`; `expo-dev-client` and `expo-secure-store` already installed). ONE web-type Google
OAuth client serves web and native — no SHA-1 fingerprints, no native Google SDK. The native
ID-token flow remains a later polish option, out of scope.

**D6 — The custom identity surface is deleted.** `POST /session`, `DELETE /session`, and `GET /me`
go away; Better Auth's endpoints plus its typed `authClient` are the only identity surface
(`user.id` = learnerStateRef, `user.name` = display name). `session.ts` keeps its atomic
cache-swap semantics (cancel in-flight learner reads → drop the learner-scoped subtree → seed
identity) but wraps `authClient` calls. The typed `AppType` shrinks to purely learner-domain routes.

**D7 — First-run explorer naming.** After first sign-in, one screen ("name your explorer",
prefilled from the provider name) writes `authClient.updateUser`; a Better Auth boolean
additionalField (`profileComplete`, default false) gates it to exactly once. Real names never reach
the shared leaderboard unless chosen. Email sign-up collects the name inline (Better Auth requires
it), so the e2e path never sees the extra screen.

**D8 — Blast radius confirmed.** Admin Lab stays SSH-tunnel-gated with no Better Auth on it — only
its learner-name reads repoint from `learners` to `user`; kg-worker untouched; the shared VPS
database is hard-reset through the existing cutover runbook and current learner accounts/progress
are lost.

**D9 — Queued after the matching plan.** Second in the README execution order; implementation
starts on `feat/better-auth` off `main` after `fix/matching-item-quality` merges. The two touch
disjoint areas; sequencing exists so the shared-DB reset never lands under a branch mid-validation.

## Target design

### Server (U1)

`apps/learner-api/src/auth.ts` is replaced by the Better Auth instance:

```ts
betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),   // drizzle(sql) over the shared pool
  baseURL: env.BETTER_AUTH_URL,                       // https://api.lrnki.globesoul.com
  basePath: "/auth",
  emailAndPassword: { enabled: true },                // D1: fallback + e2e path; verification off
  socialProviders: { google: { clientId, clientSecret } },
  user: { additionalFields: { profileComplete: { type: "boolean", defaultValue: false } } },
  trustedOrigins: [webOrigin, ...devOrigins, "lrnki://"],
  plugins: [expo()],
  rateLimit: { enabled: true }                        // replaces FixedWindowRateLimiter
})
```

`createLearnerApp` mounts `app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw))`
**after** CORS (which gains `credentials: true`). The bearer middleware becomes a session
middleware: `auth.api.getSession({ headers: c.req.raw.headers })` → sets `learnerStateRef`
(= `session.user.id`) on the same `AuthEnv` variable every route already reads; a missing session
stays `{ error: "unauthorized" }` 401. Google callback URL:
`${BETTER_AUTH_URL}/auth/callback/google`.

Deleted in the same change (rule 18): `mintSessionToken`, `hashSessionToken`, `compactLearnerRef`,
`FixedWindowRateLimiter`, `issueSession`, the `sessionBody` schema, the three custom routes,
`learnerRegistry.ts` (PIN hashing and both use-cases), `LearnerStorePort`,
`LearnerSessionStorePort`, `PostgresLearnerRegistryStores.ts`, and their tests.

### Schema (U1)

`@better-auth/cli generate` produces the Drizzle schema for `user`, `session`, `account`, and
`verification` (plus `profileComplete`); it lands as
`packages/infrastructure-postgres/src/schema/auth.ts` — a mechanically generated representation,
regenerated whenever the Better Auth config changes, never hand-tuned. `learners` and
`learner_sessions` leave `learnerState.ts`; the ~12 learner-state FKs repoint to `user.id`. The
`0000` baseline, snapshot, and journal regenerate mechanically (ADR-0039); local `pnpm db:reset`
applies it.

Display-name reads (`getWeeklyLeaderboard.ts`, the Admin Lab learner-loop pages, and every other
`LearnerStorePort` consumer found in U1's sweep) move to one minimal read port over `user`
(id → name), replacing the registry stores.

### Client (U2)

One `authClient` module: `createAuthClient` with the `@better-auth/expo` client plugin over
SecureStore (the plugin defers to browser cookies on web). `api.ts`: web passes
`credentials: "include"` through `hc`'s fetch init; native attaches
`Cookie: authClient.getCookie()` in the existing synchronous headers callback. `tokenStore.ts`,
`tokenStore.web.ts`, and the boot-time `hydrateToken` call are deleted.

`LearnerNameGate` is replaced by a sign-in screen: primary "Continue with Google"
(`authClient.signIn.social({ provider: "google", callbackURL })`), secondary email + password with
a create/enter toggle — stable `testID`s for Maestro, themed copy per ADR-0032/0033. A
`profileComplete === false` session routes to the explorer-naming screen (D7). `queries.ts`'s
`meQuery` reimplements over the Better Auth session; `session.ts` keeps the atomic-swap contract
around `authClient.signIn`/`signUp`/`signOut`.

### Rigs (U3)

Every rig that drives `POST /session` today rewrites to the Better Auth endpoints
(`/auth/sign-up/email`, `/auth/sign-in/email`, cookie from `Set-Cookie`):

- `apps/learner-api/src/app.test.ts` — route tests, including new coverage that a signed-out
  request to a learner route stays 401 and rate limiting fires on the email sign-in route.
- Playwright web e2e: `e2e/global-setup.ts`, `learner-runtime.spec.ts`, `fixtures.ts`.
- Real-use rig: `e2e-realuse/run.ts`, `realuse.spec.ts`, `preflight.ts`, and
  `realuseServer.ts` (needs `BETTER_AUTH_SECRET` + `BETTER_AUTH_URL=http://127.0.0.1:<port>`;
  Better Auth drops the cookie `Secure` flag automatically on http, which is also what the
  cleartext native fixture relies on). `cleanupReservedLearners` in
  `packages/infrastructure-postgres/src/testSupport.ts` repoints its deletes at `user` (state rows
  first, then the user row).
- Native fixture: `e2e-native/server.ts` fakes `/auth/sign-in/email` + `/auth/get-session` with a
  Set-Cookie instead of `POST /session` with a token; Maestro flows retarget the new sign-in
  `testID`s. Google itself is never driven by any rig (rule-21 section above).

### Deployment and secrets (U4)

New env in the repo-root `.env` and the compose `learner-api` environment block:
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Creating the
Google OAuth client and minting the secret are user-owned manual actions —
tracked in [BLOCKERS](./BLOCKERS.md) so they can happen in parallel with U1–U3. Shared cutover
follows the existing reset runbook (README `## Deployment`), then `scripts/deploy-learner-api.sh`.

### Documentation, same change as the code (rule 18)

- New ADR: learner identity and sessions via self-hosted Better Auth — owns the D1/D2/D3 policy,
  the cookie-transport decision with the same-site constraint, and the e2e credential-path
  rationale.
- Amend ADR-0035's "API boundary policy" section: the swap seam is realized; the bearer-token and
  localStorage-XSS paragraphs are superseded by a link to the new ADR.
- ADR-0036's "PIN-gated" consequence line updates to name Better Auth.
- CONTEXT.md needs no new term (no auth vocabulary exists there today); the README deployment
  runbook gains the new env vars.

## Implementation units

### U1 — server and schema cutover

Better Auth instance + Drizzle adapter + generated schema file; mount handler; session middleware
replaces `bearerAuth`; FK repoint and baseline regeneration; the U1 deletion list above; the
display-name read port; ADR work in the same change. Tests: `app.test.ts` rewritten (see U3 scope
note — the API-level rewrite lands here so U1 closes green); `pnpm check` and `pnpm test:db` green.

### U2 — client cutover

`authClient`, `hc` cookie wiring, sign-in screen, explorer-naming screen, `session.ts`/`queries.ts`
rework, deletion of the tokenStore seams and `LearnerNameGate`. Jest covers: the atomic-swap
contract around `authClient` calls, the `profileComplete` routing decision, and the headers
callback shape per platform. Verified live against a local API (email/password path end-to-end;
Google against the deployed API once U4's credentials exist).

### U3 — rigs

The rewrite inventory in the target design: Playwright e2e, realuse rig + server, native fixture +
Maestro flows, `cleanupReservedLearners`. Gate: web e2e suite green; realuse preflight green
locally; native flows green on the e2e APK against the loopback fixture.

### U4 — deployment cutover and real-use gate (rule 14)

Env/secrets landed (BLOCKERS cleared), compose updated, shared cutover reset, deploy. The gate, on
the deployed stack, not a local Caddy:

1. Real Google sign-in round trip on web (`lrnki.globesoul.com`) — fresh account, explorer naming,
   one full study action persisted under the new `user.id`, sign-out, cookie gone.
2. Same on physical Android via the browser-redirect flow (`lrnki://` return leg).
3. Email/password round trip via the same UI the rigs use.
4. Negative controls: signed-out learner routes 401; a revoked session (row deleted server-side)
   401s on the next request; learner B cannot read learner A's expedition; the sign-in rate limit
   fires under a scripted burst.

## Acceptance

- `pnpm check` green; `pnpm test:db` green against `lrnki_test` only.
- All four U4 checks pass on the deployed stack; the real-use note lands in this Validation Log.
- A `pin` grep over the learner surface finds no auth-bearing hit; `learners`,
  `learner_sessions`, `tokenStore`, `LearnerNameGate`, `learnerRegistry`, and both registry ports
  are gone from the tree (rule 18).
- The new ADR is linked from ADR-0035's amended boundary section; README runbook names the new env.
- Rigs authenticate exclusively through Better Auth endpoints; no rig drives Google.

## Out of scope

- **Apple sign-in** — additive config + Apple Developer setup when iOS ships; Better Auth links
  accounts by verified email, so no reset is implied.
- **SMTP, email verification, password reset** — deferred until an email provider exists; not
  mocked (D1).
- **Admin Lab authentication / roles** — the SSH tunnel remains its gate (ADR-0011, D8).
- **Account linking UI and native ID-token Google flow** — later polish (D5).
- **Session-expiry tuning and Better Auth cookie caching** — framework defaults ship; revisit only
  on measured need.
- **Data migration from `learners`** — hard reset by decision (D3/D8).

## Validation Log

One entry per closed implementation unit; see the hygiene comment at the top of this file. No unit
has started.

### Open findings

None.

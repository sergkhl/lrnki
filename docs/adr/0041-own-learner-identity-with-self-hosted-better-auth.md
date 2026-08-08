# 0041 — Own learner identity and sessions with self-hosted Better Auth

Date: 2026-08-08. Status: accepted. Supersedes the placeholder identity policy in
[ADR-0035](./0035-separate-learner-app-static-spa-typed-api.md) `## API boundary policy`.

## Context

Learner identity was a labeled placeholder: a display name as primary key, a 4–8 digit PIN, and
hand-rolled opaque bearer tokens in `learner_sessions`. ADR-0035 accepted it explicitly "for a
PIN-gated learning app" and named `POST /session` as the swap seam. Rolling your own authentication
is the named anti-pattern this decision retires; the conventional remedy is a maintained framework
that owns credential storage, session issuance, OAuth wiring, and CSRF.

## Decision

**Self-hosted Better Auth, mounted inside `learner-api`, is the only identity and session
authority.** There is no external auth service, so the single-public-upstream topology of
[ADR-0040](./0040-serve-public-api-only-from-the-deployed-container.md) is unchanged: the auth
handler is served at `/auth/*` by the same Hono app, over the same postgres.js pool, in the same
container.

**Google is the primary sign-in; email + password is a first-party fallback and the only path any
rig drives.** Email verification and password reset are not built until an email provider exists —
deferred, not mocked. No rig ever drives Google: automated third-party IdP login is blocked by
Google and brittle by design. The credential path is Better Auth core, exercises the real sign-in
UI rather than a test-only injection hook, and is a genuine fallback for learners without a Google
account — so the e2e route and the shipped product are the same route.

**Sessions are cookies on both platforms; the bearer plugin is never installed.** The standard
reason an SPA reaches for bearer tokens is a cross-*site* API, where cookies would be third-party.
The learner web build and the API share a registrable domain, so cookies are first-party and
`SameSite=Lax` suffices. An OAuth redirect can deliver a cookie and never a header, so a bearer
design would have to run both transports plus the glue between them. Native stores the same session
cookie in SecureStore through the official Expo plugin.

*Standing constraint:* **the learner web build must stay on a `globesoul.com` subdomain.** Moving it
to any other registrable domain makes the session cookie third-party, and Safari drops it — the
sign-in would fail for that browser only, at deploy time, with no local reproduction. Changing the
web origin is therefore an auth change, not a hosting change.

The same constraint binds every rig that serves the web build against a real API: the two must share
a **host**, differing only in port. Cookies are scoped by host and ignore port, so same host is
same-site (the cookie rides the request) while a differing port keeps the exchange cross-origin (the
credentialed CORS path stays under test) — `127.0.0.1:<web>` ↔ `127.0.0.1:<api>`. Splitting them
across `localhost` and `127.0.0.1` makes them cross-site, and every journey then fails signed out
with no CORS error naming the cause.

**`learnerRef` is Better Auth's `user.id`.** Every learner-state foreign key points at `user.id`;
`learnerStateRef` keeps its name through the application layer but carries the opaque user id, and
`user.name` is the single owner of the display name. A learner names their explorer once, after
first sign-in, so a provider's real name never reaches the shared leaderboard unless chosen.

## Consequences

- The entire placeholder subsystem is deleted (rule 18): PIN hashing and its use-cases, token mint
  and hash, the in-process fixed-window rate limiter, `POST/DELETE /session`, `GET /me`, the
  `learners` and `learner_sessions` tables, both registry ports and their Postgres stores, and the
  client-side token stores. Better Auth's own rate limiting covers the sign-in routes.
- Display-name reads (weekly leaderboard, Admin Lab learner loop) go through one minimal read port
  over `user`. Admin Lab gains no Better Auth of its own — the SSH tunnel remains its only gate
  ([ADR-0011](./0011-retain-minimal-admin-lab.md)).
- The Better Auth tables are a **generated** Drizzle schema file under the authority of
  [ADR-0039](./0039-own-persisted-shape-in-code-first-drizzle-schema.md): regenerated from the auth
  config, never hand-tuned, and the `0000` baseline regenerates mechanically from it.
- Cutting over hard-resets the shared database. The shared test data is disposable by
  [ADR-0036](./0036-run-single-shared-learner-environment-during-testing.md), so existing learner
  accounts and progress are lost by decision, not by accident.
- CORS must echo an exact origin and set `credentials: true`; a wildcard origin is incompatible
  with credentialed requests, so every new learner web origin is an explicit allow-list entry.
- **The API refuses to start without `BETTER_AUTH_SECRET`, and compose gives it no default.**
  Better Auth's own fallback is a secret published in its source, and its guard against that
  fallback fires only under `NODE_ENV=production` — which this repo deliberately leaves unset. The
  library's default would therefore be silently live here, so the check is ours and it fails the
  boot. Rotating the secret signs every learner out.
- Apple sign-in, native Google ID-token sign-in, and account-linking UI stay additive later work.
  Better Auth links accounts by verified email, so adding a provider implies no further reset.

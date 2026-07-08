---
title: "feat: separate the Learner App into a static SPA over a typed learner API"
type: feat
date: 2026-07-08
origin: Deployment brainstorm 2026-07-08 (this plan owns the accepted framing). User decisions —
  target topology is the Expo-ready shape now (static web client + API server), not a
  server-rendered deploy; the full typed HTTP API is built now and the web app consumes it (no
  server-action phase); API stack is Hono + zod with the `hono/client` typed RPC surface; web
  stack is Vite + TanStack Router/Query (Expo/expo-router web-first rejected for now — it forces
  React Native primitives onto every DOM/SVG surface immediately; deferred to the mobile plan);
  session transport is an opaque bearer token (one mechanism for web localStorage and Expo
  SecureStore); auth stays name + PIN with a rate limit at the session route (real auth later at
  the KTD8 seam); Admin Lab deployment is unchanged (VPS-private behind the existing SSH tunnel);
  work is sliced into two plans — this plan is the extraction, a follow-up plan owns VPS/Caddy/
  GitHub Pages deployment.
---

# feat: separate the Learner App into a static SPA over a typed learner API

## Summary

The Learner App currently lives inside `apps/admin-lab`: server-rendered `/learn/*` routes, server
actions that are thin mappers over `@lrnki/application` use-cases, an httpOnly learner-ref cookie
set by `/learn/session`, and an in-process topic-generation supervisor started from
`instrumentation.ts` (a `setInterval` in the Next Node runtime that claims DB work and calls
LiteLLM). Its only runtime dependencies are Postgres and LiteLLM — Docling and the kg-worker CLI
are admin/ingestion-side.

This plan extracts two new apps and deletes the learner surface from Admin Lab (rule 18):

- **`apps/learner-api`** — one long-lived Hono + zod Node process exposing the complete learner
  HTTP API as thin zod-validated mappers over the same `@lrnki/application` use-cases the server
  actions call today. It hosts the relocated topic-generation supervisor, holds one shared
  postgres.js pool (replacing today's per-request `createDatabaseClient()/end()` churn in
  `actions.ts`), and exports its Hono `AppType` so clients get end-to-end request/response types
  without codegen.
- **`apps/learner-web`** — a Vite + TanStack Router + TanStack Query SPA that ports the existing
  `components/learn/**` (already client components) and pure view-model modules, talking to the
  API through the typed `hono/client`. It builds to a static folder deployable to GitHub Pages.

The target topology (recorded in a new ADR): static web client (GitHub Pages) + `learner-api` on
the VPS beside Postgres/LiteLLM; the future Expo app consumes the **same** API and reuses the same
typed client + TanStack Query data layer, with only the rendering layer rewritten in RN
primitives. Admin Lab keeps `/admin/lab/*` unchanged (VPS-private, SSH tunnel; ADR-0011).

Exploration facts the design must absorb (verified 2026-07-08 against the tree):

- The learner write surface is 12 server actions in `apps/admin-lab/src/app/learn/actions.ts`
  plus 2 duel actions (`learn/duel/actions.ts`); all are already thin mappers over
  `@lrnki/application` (`gradeStudyResponse`, `checkMatchingAttempt`, `recordLearnerVerdict`,
  `recordLessonRead`, expedition choose/activate/start/retry). `refreshLearnerExpedition` is a
  `revalidatePath` shim that disappears in a SPA (Query polling replaces it).
- The read surface is 4 composed reads: journal/entry (`listExpeditionCandidates` +
  `expeditionJournalView`), study session (`getLearnerExpeditionByEnrichment` +
  `getLearnerStudySession`), leaderboard (`loadLeaderboard`), duel setup (`loadDuelSetup`).
- Server-side lib modules that move to `learner-api`: `learnerExpedition.ts`,
  `learnerStudySession.ts`, `leaderboard.ts`, `duel.ts`, `learnerGeneration.ts`,
  `topicGenerationSupervisor.ts`. `learnerSession.ts` (cookie machinery) is superseded by bearer
  tokens and deleted.
- Pure view-model modules that move to `learner-web` (dependency-free TS, the future RN-shared
  layer): `trailView`, `duelMachine`, `crystalGeometry`, `crystalVistaView`, `activityProgress`,
  `advanceMemory`, `division`, `expeditionJournalView`, `generationProgress`, `matchingProgress`,
  `resumeLabel`, `rivalSimulation`, `seenState`, `shuffle`, `stageCopy`, `vocabulary`,
  `useShuffledLookup`, `theme.css`, and all `components/learn/*.tsx`.
- One admin-side coupling: `admin/lab/enrichments/actions.ts` imports `setLearnerRefCookie`
  ("open as learner"). It dies with the cookie; the enrichment card links to the learner web
  app's URL instead.
- Several actions accept `learnerStateRef` from the client today (e.g. `recordDuelWinAction`).
  The API derives learner identity from the bearer token server-side, always — client-supplied
  learner refs are removed from every request shape.
- Bearer tokens need a server-side store: one new `learner_sessions` table added to the single
  initial migration (rule 8) with a dev DB reset (rule 9).

Out of scope: VPS/Caddy/GitHub Pages deployment mechanics (follow-up deployment plan), any React
Native/Expo code, a real auth provider (PIN + rate limit stays; the session route remains the
swap seam), workflow-engine replacement of the supervisor's DB-claim seam, and any change to
Admin Lab's remaining `/admin/lab/*` surface, kg-worker, or the pipeline packages.

## Problem Frame and Requirements

Decided 2026-07-08; this section owns the requirements until completion.

- **R1 — Complete typed learner API.** `apps/learner-api` exposes every learner read and write as
  a zod-validated Hono route calling the existing `@lrnki/application` use-cases; no raw SQL and
  no domain logic in routes (ADR-0011 spirit, ADR-0027 read boundaries). The exported `AppType`
  is the single client contract; web (and later Expo) consume it via `hono/client`.
- **R2 — Token-derived identity.** Login/register (`POST /session`, name + PIN) issues an opaque
  random token persisted hashed in `learner_sessions`; a bearer middleware resolves it to the
  learner on every authenticated route. No route accepts a client-supplied `learnerStateRef`.
  Logout revokes the row. The session route carries an in-process fixed-window rate limit
  (per-IP and per-name) against PIN brute force.
- **R3 — Static learner web app.** `apps/learner-web` is a Vite SPA (TanStack Router + Query)
  that renders the existing learner UX — journal, expedition trail, activity sheet, crystals and
  vista, leaderboard dialog, duel, menu drawer — from API data, with generation progress via
  Query `refetchInterval` polling while any expedition is generating. `vite build` output is
  fully static (GitHub Pages deployable).
- **R4 — Supervisor relocates, behavior unchanged.** The topic-generation supervisor and
  `learnerGeneration` composition root move into the `learner-api` process (started on boot,
  woken by the plan/retry routes). Claim/fencing/staleness semantics are untouched.
- **R5 — Rule-18 deletions in the same change.** `apps/admin-lab` loses `app/learn/**`,
  `components/learn/**`, the learner lib modules, `instrumentation.ts`, the cookie machinery,
  and the "open as learner" admin action. Admin Lab keeps only `/admin/lab/*`; kg-worker is
  untouched.
- **R6 — UX parity, no regression.** Learner-facing copy, theme, and flows stay as they are
  (ADR-0032/0033); the SPA adds honest loading states where SSR used to prefetch. The game UX
  gate applies: no flow-breaking spinners inside the activity loop (data for the active study
  surface is prefetched/cached by Query before the sheet opens).
- **R7 — Durable records.** A new ADR records the separation, the API boundary policy (all
  learner traffic through `learner-api` wrapping application use-cases; identity from bearer
  token; mobile consumes the same API), and the target deployment topology. `docs/plans/README.md`
  and `TODO.md` link here; the follow-up deployment plan is authored after this plan ships.
- **R8 — Rule-14 real-use gate.** Register through the real gate, plan a real topic expedition
  end-to-end (supervisor in `learner-api`, production LiteLLM calls), study through all item
  types, duel, and leaderboard — all through the SPA against the API.

## Key Technical Decisions

- **KTD1 — Hono + zod, one process.** The API server is a plain long-lived Node process (tsx in
  dev, `node` in prod) — the same process class the supervisor already requires, which is why
  serverless hosts were rejected. `@hono/zod-validator` gives request validation; the typed RPC
  client is plain `fetch` underneath, so it works identically in the browser and React Native.
- **KTD2 — The application layer is the boundary, not the API.** Routes stay as thin as today's
  server actions. Any logic tempted to live in a route belongs in `@lrnki/application` (where the
  grading use-case refactor already put it). This keeps the future Expo API surface and the web
  surface from drifting.
- **KTD3 — Opaque bearer token, hashed at rest.** `learner_sessions(token_hash, learner_ref,
  created_at, last_seen_at)`; the raw token exists only client-side (web `localStorage`, Expo
  `SecureStore` later). SHA-256 the token for lookup; no JWT machinery — revocation is row
  deletion. XSS exposure is accepted for a PIN-gated learning app and recorded in the ADR.
- **KTD4 — Web history strategy decided for GitHub Pages.** TanStack Router uses browser history
  with a `404.html` SPA-redirect fallback (copy of `index.html`) and a configurable `base`;
  decided now so deep links (`/expedition/:enrichmentId`) survive Pages hosting in the follow-up
  plan without a router change. Hash history is the fallback if the 404 trick proves flaky.
- **KTD5 — Per-request pools die.** `learner-api` holds one shared postgres.js pool for routes
  and supervisor alike (the supervisor already does this); the per-action
  `createDatabaseClient()/end()` pattern is not ported.
- **KTD6 — Tests stay on the node runner.** Both new apps use `tsx --test` like the rest of the
  workspace; API routes are tested through `app.request(...)` (Hono's fetch-native test surface),
  pure view-model tests move with their modules unchanged.
- **KTD7 — CORS by env.** `learner-api` allows the web origin from `LEARNER_WEB_ORIGIN` (dev:
  Vite's localhost; prod: the Pages origin, set in the deployment plan). Bearer auth avoids
  cookie SameSite/third-party constraints entirely.

## Implementation Units

- **U1 — Scaffold `apps/learner-api`.** Hono app + zod validator, env loading (repo-root `.env`),
  shared pool, error envelope, CORS, `/health`. Move `topicGenerationSupervisor.ts` +
  `learnerGeneration.ts` here; start supervisor on boot. Root scripts gain `dev:api`.
- **U2 — Sessions and auth.** `learner_sessions` in the initial migration + dev DB reset;
  `POST /session` (login/register, replacing the `/learn/session` route handler semantics),
  `DELETE /session`, bearer middleware, rate limiter + tests (throttle, token revocation,
  no client-supplied learner refs anywhere).
- **U3 — Read routes.** Journal/entry, expedition study session, leaderboard, duel setup — the
  four composed reads, moving their lib modules in. Route tests assert shape parity with the
  current page props (fixture-driven, no LLM).
- **U4 — Write routes.** Expedition start/retry/choose/activate (waking the supervisor), graded
  responses (option-select, impostor, matching + matching attempt), verdict set/clear, lesson
  read, duel grade + win. Export `AppType`.
- **U5 — Scaffold `apps/learner-web`.** Vite + TanStack Router/Query + Tailwind + base-ui
  (rule 15), `theme.css`, typed client + token storage, login/register gate screen, 404 SPA
  fallback per KTD4.
- **U6 — Port the study surfaces.** Journal, expedition trail, activity sheet, crystals/vista
  onto Query hooks with generation-progress polling; move the pure view-model modules and their
  tests.
- **U7 — Port social surfaces and delete the old home.** Leaderboard dialog, duel, menu drawer;
  then delete `/learn` from admin-lab (routes, components, libs, instrumentation, cookie code,
  "open as learner" action — R5), repair root scripts/lint/typecheck wiring.
- **U8 — Docs + gate.** New ADR (separation, API boundary, topology, Expo policy), plans
  README/TODO updates, then the R8 rule-14 real-use gate with evidence under
  `tmp/2026-07-08-learner-app-separation/`.

## Acceptance

- `pnpm typecheck`, `pnpm test`, `pnpm lint`, and both app builds pass; `vite build` output
  contains no server runtime.
- Every learner flow works end-to-end through SPA → API with identity derived from the bearer
  token only; admin-lab serves 404 for `/learn`.
- Session route rejects a brute-force PIN sweep (rate limit observed live).
- Rule-14 gate PASS with a real generated expedition through the relocated supervisor.

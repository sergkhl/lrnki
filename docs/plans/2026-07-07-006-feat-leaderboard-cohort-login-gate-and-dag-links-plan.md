---
title: "feat: leaderboard dialog + cohort-of-10, single login/register gate, and enriched-DAG links"
type: feat
date: 2026-07-07
origin: conversation 2026-07-07 (five Learner App / Admin Lab tasks; no separate brainstorm;
  requirements inline below). User decisions — one shadcn Dialog serves both leaderboard surfaces
  and the standalone route is deleted; the board is a cohort of 10 with read-time-derived
  divisions (no persisted tiers); the gate becomes one 2-field form with Login/Register buttons,
  the logged-in state stays on the existing learner-ref cookie, and a logout (exit-icon) button is
  added; enriched-DAG visualization was verified working live, so task 5 is discoverability links,
  not a rendering fix.
---

# feat: leaderboard dialog + cohort-of-10, single login/register gate, and enriched-DAG links

## Summary

Five gaps from real use of the shipped registry/leaderboard/duel work (plan 2026-07-07-005) and
the Admin Lab:

| Gap | Observed | Root cause |
| --- | --- | --- |
| Leaderboard splash traps the learner | no `Esc`, no scroll, no focus trap | `LeaderboardSplash` is a hand-rolled `fixed inset-0` overlay instead of the base-ui Dialog (rule 15) |
| Board grows with the population | every real learner renders; rank #47 of 50 is demotivating | `assembleWeeklyBoard` puts **all** real rows on the board; `size: 10` only caps the rival top-up |
| Rival names look fake | bare seeded `firstName()` ("Mila", "John") | rivals skip Faker's person-first correlated derivation |
| Login gate is three stacked forms | picker with per-row PIN + manual entry + create | grew organically around a browser-known-refs cookie |
| Enriched-DAG viz "lost" | operators can't find it | it renders fine (verified live 2026-07-07 against synthetic enrichment `4aad4903-…`: 20 nodes / 27 edges, zero client errors) but nothing links to `/admin/lab/enrichments/{id}` from the learner-loop or operations surfaces |

Problem classes (rule 21): **modal dialog accessibility** (dismissal, focus containment,
scrollable content — solved by the base-ui Dialog primitive, not re-implemented), **leaderboard
cohorting / bucketing** (the standard bounded-cohort pattern behind Duolingo leagues, applied here
as a viewer-centered window because rivals are already viewer-local fiction), **correlated fake
data generation** (Faker's own person-first guidance), and **auth-form consolidation** (one
identifier+secret form with two intents — the conventional login/register shape).

Out of scope by user decision and constraint: persisted Duolingo-style leagues (promotion/demotion
needs durable tier state and a real population; the derived-division ladder below keeps the
"delete the fiction when real multiplayer lands" property), real authentication (the PIN stays;
`/learn/session` remains the single swap point, KTD8 of 005), and any change to the
learner-neutral core or scoring derivation (KTD2 of 005: no parallel mastery SQL).

---

## Problem Frame and Requirements

Decided in conversation (2026-07-07); this section owns them until completion.

- **R1 — One leaderboard Dialog, no standalone route.** One shadcn Dialog component renders the
  board for both consumers: the seam-triggered splash (open state driven by the existing
  `classifySeam`/`seenState` logic, unchanged) and an on-demand trigger replacing the
  `/learn/leaderboard` link on the landing header. `Esc`, overlay dismiss, focus trap, and
  internal scrolling (bounded height, overflow scroll) come from the primitive. The
  `/learn/leaderboard` route is deleted (rule 18); its podium-lifecycle side effect already runs
  on the landing load.
- **R2 — The board is always exactly 10 rows.** Real rows are windowed to the viewer plus their
  nearest neighbors by weekly score (viewer always included and highlighted), then topped up with
  seeded rivals to exactly 10. Ranks stay cohort-local (1–10), which is the existing rank
  semantics. With ≤10 real learners the behavior is today's. The chase and previous-week podium
  computations keep operating on the assembled 10-row board.
- **R3 — Divisions are derived at read time, never persisted.** The viewer's division (themed
  ladder, e.g. Basecamp → Foothills → Ridge → Summit) derives from their lifetime mastered-crystal
  count via one application read that reuses the same graded-outcome derivation the weekly score
  uses — no new tables, columns, or parallel mastery SQL. The division renders as one badge on the
  board (the whole cohort shares the viewer's division; rivals are the viewer's fiction), with
  names and thresholds living learner-side (ADR-0033). It is progress clarity, not a parallel
  objective (ADR-0032).
- **R4 — Rival nicknames look real.** Inside the existing seeded block, derive a person first and
  the nickname from that person: `sexType()` → `firstName(sex)` + `lastName()` →
  `internet.username({ firstName, lastName })` (Faker's correlated-fields guidance). Determinism
  contract unchanged: stable within (learnerRef, weekKey, slot), fresh across weeks.
- **R5 — The gate is one form: 2 fields, 2 buttons.** Explorer name + PIN, with **Login**
  (`enter` intent) and **Register** (`create` intent) submit buttons posting to the same
  `/learn/session` route. The picker section, the manual/create split, and the entire
  known-learner-refs cookie machinery (cookie constant, parse/serialize/remember helpers, their
  tests, and the gate's `explorers` prop) are deleted (rule 18). One user at a time: the logged-in
  state remains the single httpOnly learner-ref cookie, which already persists across visits. On a
  refusal redirect the name field is prefilled from the existing `ref` query param.
- **R6 — Logout.** A simple exit-icon button on the learner landing header posts a `logout`
  intent to `/learn/session`, which clears the learner-ref cookie and lands on the gate. The dead
  `switchExplorer` vocabulary key (no usages) is deleted; logout supersedes that concept.
- **R7 — Enriched-DAG discoverability.** The admin learner-loop detail exposes each expedition's
  `enrichmentId` and links "View DAG" to `/admin/lab/enrichments/{id}`; operations cards whose
  scope is an enrichment link the same way. No new visualization code — the existing
  `DerivedGraphExplorer` page is the destination.
- **R8 — Rule-14 gate on the real learner path.** Drive the changed surfaces in the real app
  against a really-seeded graph: dialog behavior, cohort windowing with >10 real learners,
  division badge, rival names, register/login/logout round-trip, and the DAG links.

ADR-0032 flow design gate for the division ladder (the only new mechanic): the player-visible
goal is "climb to the next division", which matches the learning goal because the count only
grows through the completion rule (mastered crystals); the distraction risk is grinding easy
expeditions for count — accepted at this population size and bounded by the existing
difficulty-banded weekly scoring staying the competitive number; the challenge curve is
threshold spacing (provisional 0 / 10 / 30 / 75, tuned at gate time); pleasures: Challenge +
Discovery; focused signals: the existing board-open/dismiss seam events and weekly score are
sufficient — no new telemetry.

Acceptance examples:

- **AE1:** The landing header trigger opens the board as a dialog; `Esc` and overlay click close
  it; a long board scrolls inside the dialog; `/learn/leaderboard` 404s. The splash still fires
  only on seam changes and dismisses to the same seen-state snapshot.
- **AE2:** With >10 real learners seeded and the viewer mid-pack, the viewer's board shows exactly
  10 rows including their highlighted row with real neighbors above and below; ranks read 1–10.
- **AE3:** The division badge derives from lifetime mastered crystals; mastering across a
  threshold changes the badge on the next board load; the schema diff is empty.
- **AE4:** Rival names render as realistic usernames (e.g. "Mila_Kovalenko42"), byte-stable across
  reloads within a week and different the next week (determinism test updated).
- **AE5:** The gate renders one form with exactly two fields and two buttons. Register creates and
  enters; Login enters; a wrong PIN redirects back with themed copy, the name prefilled, and the
  active session unchanged.
- **AE6:** The exit button ends the session and lands on the gate; re-login works; without logout
  the logged-in state survives a browser restart.
- **AE7:** A learner-loop expedition row's "View DAG" link opens the enrichment detail and the
  Cytoscape canvas renders that expedition's derived layer.
- **AE8 (rule 18):** Deleted end-to-end: the `/learn/leaderboard` route, the known-refs cookie
  machinery and gate picker, and dead vocabulary keys (`pickExplorer`, `manualLoginHeading`,
  `manualLoginHint`, `noExplorersYet`, `switchExplorer`, `leaderboardEntry`, and any other key
  with no remaining usage).

---

## Key Technical Decisions

- **KTD1 — Dialog is the base-ui primitive, splash logic untouched.** The splash keeps owning
  *when* to open (seam classifier + localStorage seen-state, KTD5 of 005); only the *surface*
  swaps to a controlled `Dialog`. `onOpenChange(false)` routes through the existing dismiss (which
  writes the seen snapshot), so `Esc`/overlay dismissal can never skip the snapshot write.
- **KTD2 — Windowing lives in `assembleWeeklyBoard`.** It is already the pure, tested assembly
  seam. Sort real rows by points, cut the window around the viewer (nearest above/below,
  spilling when the viewer is at an extreme), rival-fill to 10, rank cohort-locally. The
  application `getWeeklyLeaderboard` read stays global and untouched — cohorting is presentation,
  exactly like the rivals it composes with, and deletes with them when real multiplayer lands.
- **KTD3 — Division derivation reuses the scoring module.** One application function returns the
  viewer's lifetime mastered-crystal count from the same graded-outcome reads the weekly score
  uses (no parallel mastery SQL, KTD2 of 005). The division mapping (thresholds + themed names) is
  a pure learner-side module beside `vocabulary.ts` per ADR-0033.
- **KTD4 — Nickname derivation stays inside the seeded block.** `faker.seed(...)` is already set
  per (learnerRef, weekKey, slot); the person-first calls draw from that same stream, so
  determinism holds with zero new seams. Real learners keep their chosen display names.
- **KTD5 — Logout is a third intent on `/learn/session`.** The route stays the one PIN-aware /
  session-mutating endpoint (KTD8 of 005) — the swap point for real auth later covers login,
  register, *and* logout. Clearing is cookie deletion; nothing persisted changes.
- **KTD6 — No new persistence anywhere in this plan.** Every addition is derived at read time
  (cohort, division, nicknames) or cookie state that already exists. The initial migration is
  untouched (rule 8).
- **KTD7 — Task 5 is links, not rendering.** Verified live 2026-07-07 (headless browser against
  the running dev server): `/admin/lab/enrichments/4aad4903-…` renders the full sphere-grid DAG
  for an anchor-less synthetic layer with no client errors. The learner-loop read model gains
  `enrichmentId` on its expedition rows (a field on an existing Inspection Read Model, ADR-0027);
  the UI adds links. `DerivedGraphExplorer` is not modified.

## High-Level Technical Design

Everything rides existing seams. R1/R2/R3/R4 are learner-presentation changes in
`apps/admin-lab/src/components/learn/` (`LeaderboardSplash` → Dialog wrapper around a shared
board dialog, `rivalSimulation.ts` windowing + nicknames, one new division module) plus one
application read for the lifetime count in `packages/application` and one loader touch in
`apps/admin-lab/src/lib/leaderboard.ts`. R5/R6 rewrite `LearnerNameGate` to a single form, add the
`logout` intent to `apps/admin-lab/src/app/learn/session/route.ts`, and delete the known-refs
machinery from `apps/admin-lab/src/lib/learnerSession.ts` and the gate. R7 adds `enrichmentId` to
the learner-loop expedition read (port type + Postgres adapter + `LearnerLoopReview` link) and an
enrichment link on operations cards where the operation scope is an enrichment.

## Implementation Units

### U1. Leaderboard dialog consolidation (R1)

Extract the board+chase content into one dialog component; splash and header trigger both render
it. Delete `/learn/leaderboard/page.tsx`; move any still-needed copy keys, delete the rest (AE8).
Test: seam-driven open still writes the seen snapshot on every dismissal path.

### U2. Cohort-of-10 windowing (R2)

Window real rows around the viewer in `assembleWeeklyBoard` before rival fill; extend the existing
unit tests (viewer at top, bottom, mid-pack; ≤10 real learners unchanged; podium/chase over the
windowed board).

### U3. Derived divisions (R3)

Application: lifetime mastered-crystal count read reusing the weekly-score derivation. Learner
side: pure `division.ts` mapping (thresholds + themed names, unit-tested) and a badge on the board
dialog. Loader threads the count through `loadLeaderboard`.

### U4. Rival nickname realism (R4)

Person-first derivation inside the seeded block per the Faker guidance snippet; update the
determinism test to the new expected names.

### U5. Single login/register gate + logout (R5, R6)

Rewrite `LearnerNameGate` to one form (name + PIN; Login/Register buttons; `ref`-param prefill).
Add the `logout` intent to the session route. Delete the picker, the known-refs cookie machinery
(`KNOWN_LEARNER_REFS_COOKIE`, `parseKnownLearnerRefs`, `serializeKnownLearnerRefs`,
`rememberKnownLearnerRef`, `readKnownLearnerRefs`, related tests and the landing `loadRegistry`
plumbing) and dead vocabulary keys. Exit-icon button on the landing header.

### U6. Enriched-DAG discoverability links (R7)

Add `enrichmentId` to the learner-loop expedition read (port + Postgres adapter + integration
test); "View DAG" link per expedition row in `LearnerLoopReview`; enrichment-scoped operations
cards link to the same detail page.

### U7. Rule-14 real-use gate (R8)

Against a really-seeded graph with >10 registered learners (registration is cheap via the real
route): drive AE1–AE7 through the real app in a phone-sized viewport plus desktop for admin
surfaces; screenshot evidence. PASS criteria: AE1–AE8.

## Validation

- Deterministic envelope: workspace typecheck; `@lrnki/application`,
  `@lrnki/infrastructure-postgres`, and `apps/admin-lab` tests green with `.env` loaded; lint
  clean; production build with `/learn/leaderboard` absent from the route list.
- Real-use gate (rule 14): U7 evidence under `tmp/2026-07-07-leaderboard-cohort-gate/`; a green
  suite is not quality evidence (ADR-0013).

---
title: "fix: learner-state cleanup + /learn read path, and operations cost/timing visibility"
type: fix
date: 2026-07-07
origin: conversation 2026-07-07 (three tasks; no separate brainstorm; requirements inline below).
  User decisions — dev learner state is wiped outright (rule 9) instead of pattern-matched;
  DB-touching tests and rule-14 gate scripts must delete the learners they create; the board hides
  zero-point non-viewer real rows; the /learn read path is optimized while keeping eager render;
  the operations page preloads cost/tokens/calls chips on every card and collapses finished cards;
  the "bottleneck" surface is renamed to cost/timings language.
---

# fix: learner-state cleanup + /learn read path, and operations cost/timing visibility

## Summary

Three defects observed in real use of the Learner App and Admin Lab, all measured against the
running dev server on 2026-07-07:

| Defect | Observed | Root cause |
| --- | --- | --- |
| UUID players on the leaderboard | rows like `11c61546-…`, `learner-<uuid>`, `gate-<ts>` on the weekly board | 54 `learners` rows, most written to the real dev DB by integration tests (`PostgresLearnerLoopStores.test.ts` seeds `learner-<uuid>` and never deletes) and rule-14 gate scripts; the board reads ALL learners and cohort windowing surrounds a 0-point viewer with its nearest 0-point (junk) neighbors |
| Navigation "too slow while compiling" | `/learn` logged-in = **10.5s per load, warm** (curl-measured); compile is secondary | `loadLeaderboard` runs the full Study-Session-projection board **twice** (current week + previous-week podium recompute) over all 54 learners, re-fetching enrichment detail/study items/lessons per (learner, expedition); a third full pass computes the lifetime crystal count and a fourth runs duel setup — all serialized on `max: 1` connections |
| "Bottleneck" click is slow; no at-a-glance pricing | operations page = ~4s and 1.5 MB HTML per load; report click re-renders it all | DB is innocent: all timeline reads total ~116 ms and ONE LiteLLM spend aggregate covering **all 42 operations** costs ~0.35 s at 55 k spend rows. The cost is the force-dynamic SSR of 42 full stage tables, re-done on every report click |

Problem classes (rule 21): **test data pollution** (tests writing to a shared dev database —
conventional fix: tests own the lifecycle of every row they create), **N+1 / duplicated reads in a
fan-out aggregation** (conventional fix: hoist shared reads out of the per-entity loop and reuse
one pass for derived aggregates), and **eager rendering of unbounded collections** (conventional
fix: preload the cheap aggregate, collapse or bound the expensive detail).

Out of scope: any change to the ONE completion rule or its reads (KTD2 of plan 005: no parallel
mastery SQL — preserved here by construction, see KTD2 below), persisting LLM cost (cost stays
read-live-never-stored), pagination or a client-side data grid for operations, and Next.js
build-system changes (Next 16 already runs Turbopack; the measured cost is server work, not
compile).

Related: plan 2026-07-07-006 is implemented in the committed tree (cohort windowing, division
ladder, single-form gate, dialog, logout, DAG links all verified present) but not yet consolidated
into TODO/ADRs; consolidation of 006 is a separate chore, not part of this plan.

---

## Problem Frame and Requirements

Decided in conversation (2026-07-07); this section owns them until completion.

- **R1 — One-time dev learner-state wipe.** Delete every row from the five tables that FK
  `learners` (`learner_expeditions`, `response_log`, `calibration_verdicts`, `lesson_reads`,
  `learner_awards`) and from `learners` itself, in one transaction, FK-ordered. Graphs,
  enrichments, study banks, and operation timelines are untouched. Real users re-register via the
  gate in seconds. No schema change, no migration, no reusable "cleanup" code path kept (rule 9
  allows the reset; rule 18 means we do not grow a pattern-matching cleaner).
- **R2 — Tests and gates own their learners.** Every DB-touching integration test that creates
  `learners` rows (and their FK'd state) deletes them in an after/finally hook, keyed by the exact
  refs it created — no pattern deletes. The real-use-quality-evaluation skill gains one line:
  gate scripts must delete the learners they register. Junk stops accumulating at the source.
- **R3 — The board hides zero-point non-viewers.** `assembleWeeklyBoard` drops real rows with 0
  weekly points (never the viewer) before windowing; seeded rivals fill to 10 as designed. Dormant
  or residual junk learners become invisible without any name heuristics. Presentation-side only,
  like the rivals and cohorting it composes with.
- **R4 — One-pass, deduplicated /learn board read.** The logged-in `/learn` load keeps its eager
  render but the read path is restructured so that:
  - per-enrichment reads (derived-graph detail, study items, lessons, lesson-absent) are fetched
    **once per distinct enrichment**, not once per (learner, expedition);
  - learners with zero study evidence (no responses, lesson reads, or verdicts) are skipped
    before any projection work via one cheap existence read;
  - the viewer's lifetime mastered-crystal count is derived from the same current-week pass
    (its contributions are already computed) instead of a third full pass;
  - the previous-week podium recompute is skipped when the viewer's `weekly_podium` award for the
    previous week key already exists or the viewer has no evidence rows — the idempotent record
    still runs the first time each week.
- **R5 — Operations cards show cost/timings at a glance.** One live spend aggregate per page load
  (the existing `readOperationStageSpend` port already accepts the full operation-id list) puts
  cost USD, tokens, and LLM-call-count chips on every operation card next to the existing elapsed
  chip. When `LITELLM_DATABASE_URL` is absent or the read fails, chips degrade to wall-clock only
  (existing `costAvailable` semantics). Cost is never stored.
- **R6 — Finished operations collapse.** Finished operation cards render as compact summary rows
  (type, status, id, elapsed, cost chips) that expand on demand to the full stage table; active
  operations stay fully expanded. Presentation-only — no new endpoints, no pagination, no
  persisted UI state.
- **R7 — The "bottleneck" surface is renamed to what it shows.** The per-operation panel is
  "Cost & timings", the card link label matches, and the application module follows: the
  `bottleneckReport` use-case and its types/View component are renamed to cost/timing language in
  the same change (rule 18; `rankBottleneckTargets` keeps its name — ranking cost *targets* is
  genuinely about bottlenecks and is a different surface). Panel behavior (per-stage wall-clock ⋈
  spend, journey scope) is unchanged.
- **R8 — Rule-14 gate on both surfaces.** Measured before/after page timings plus the real flows:
  registration → board without junk, chips on cards, collapse/expand, renamed panel.

Acceptance examples:

- **AE1:** After the wipe, `SELECT count(*) FROM learners` is 0; a fresh registration through the
  real gate studies a crystal and appears on the board; no UUID-shaped names render.
- **AE2:** Running the `@lrnki/infrastructure-postgres` and `apps/admin-lab` test suites against
  the dev DB leaves `learners` row count unchanged (before == after).
- **AE3:** A registered learner with zero weekly points (not the viewer) does not render on the
  board; the board still shows exactly 10 rows (rivals filled); the viewer renders at 0 points.
- **AE4:** Logged-in `/learn` (dev server, warm) loads in well under 2 s with ≥10 registered
  learners and ≥3 distinct ready enrichments; the rendered board, lifetime crystal count, and
  podium behavior are byte-identical to the pre-change semantics for the same data.
- **AE5:** Each distinct enrichment's detail/study-items/lessons are read once per board load
  (observable via query logging or a counting test double), regardless of how many learners hold
  expeditions on it.
- **AE6:** Every operation card shows cost/tokens/calls chips on first paint with no report param;
  with LiteLLM DB unreachable the page still renders with wall-clock-only chips.
- **AE7:** Finished cards render collapsed (operations page HTML well under 500 KB at current
  volume) and expand to the full stage table; active cards are expanded by default; opening the
  renamed "Cost & timings" panel still shows the per-stage breakdown and journey rollup.
- **AE8 (rule 18):** No surface or export named "bottleneck" remains except
  `rankBottleneckTargets`; the old copy and component names are deleted in the same change.

---

## Key Technical Decisions

- **KTD1 — Wipe is one transactional SQL script, run once, not kept as a code path.** FK-ordered
  deletes over the five child tables then `learners`. No TRUNCATE CASCADE (explicit table list
  keeps it reviewable), no admin UI, no reusable script under `scripts/` — it is a dev reset under
  rule 9, recorded in the validation evidence only.
- **KTD2 — The board restructure never adds a mastery predicate.** `getWeeklyLeaderboard` still
  decides mastery exclusively through `composeStudySession` over the same store reads. The changes
  are: (a) hoist per-enrichment reads out of the per-learner loop into a keyed map built once from
  the distinct `enrichmentId`s of all ready expeditions; (b) skip learners whose evidence tables
  are empty — an existence prefilter on the *inputs* the projection would read anyway (a learner
  with zero responses/reads/verdicts cannot score or hold lifetime crystals), not a judgment about
  mastery; (c) return per-learner contributions so the caller derives the viewer's lifetime count
  from the same pass. One new read on an existing port (evidence-existence per learner set); no
  schema change.
- **KTD3 — Podium recompute is guarded, not redesigned.** `loadLeaderboard` already fetches viewer
  awards via the board pass; checking for a `weekly_podium` award with `dedupe_key` = previous
  week key is a map lookup on data in hand. Only when absent AND the viewer has evidence does the
  previous-week board recompute run — the scheduler-free idempotent design of 005 (KTD6) is
  unchanged, it just stops running twice per navigation forever.
- **KTD4 — Cost preload rides the existing port and stays live.** The operations page calls
  `readOperationStageSpend(allListedOperationIds)` once (measured ~0.35 s at 55 k spend rows; the
  lateral-join scan dominates, so one call for 42 ids costs the same as one id) and folds
  per-operation totals through the existing catalog ownership filter
  (`spendStageBelongsToOperation`). No new index, no cache, no persistence — if the scan ever
  dominates page load at much larger log volume, an index or short-lived cache is a later,
  separate decision.
- **KTD5 — Collapse is server-rendered disclosure, not a data change.** Finished cards use the
  shadcn collapsible/details pattern with the stage table inside; the report panel stays
  search-param driven. The page remains one force-dynamic server render; `AutoRefresh` behavior is
  untouched.
- **KTD6 — Rename is total within its surface.** `bottleneckReport` → `costTimingReport` (types
  `BottleneckReport`/`BottleneckStageRow`/… follow), `BottleneckReportView` →
  `CostTimingReportView`, UI copy "Bottleneck report" → "Cost & timings", link label
  "bottleneck" → "cost & timings". The kg-worker CLI caller is updated in the same change.
  `rankBottleneckTargets` (ranked cost-target list) keeps its name and its meaning.

## High-Level Technical Design

R1 is a one-off transaction. R2 touches the two Postgres integration-test files that seed learners
(`PostgresLearnerLoopStores.test.ts`, `PostgresLearnerRegistryStores.test.ts`, and any other suite
found by a `registerLearner`/`INSERT INTO learners` sweep) plus one line in
`.agents/skills/real-use-quality-evaluation/SKILL.md`. R3 is a pure change in
`apps/admin-lab/src/components/learn/rivalSimulation.ts` with unit tests. R4 restructures
`packages/application/src/getWeeklyLeaderboard.ts` (hoisted enrichment map, evidence prefilter,
contributions returned to the caller) and `apps/admin-lab/src/lib/leaderboard.ts` (derive lifetime
count, guard podium recompute); one existence read is added to an existing learner-state port with
its Postgres adapter and integration test. R5–R7 change
`apps/admin-lab/src/app/admin/lab/operations/page.tsx` and `_components/`, one preload call in
`apps/admin-lab/src/lib/operationTimeline.ts`, and the rename across
`packages/application/src/bottleneckReport.ts`, its index exports, tests, and the kg-worker CLI.

## Implementation Units

### U1. Dev learner-state wipe (R1)

One transaction: delete from `learner_expeditions`, `response_log`, `calibration_verdicts`,
`lesson_reads`, `learner_awards`, then `learners`. Record row counts before/after in the gate
evidence. Nothing merges to the codebase.

### U2. Test/gate learner lifecycle ownership (R2)

Sweep for every suite that inserts `learners` rows; add scoped after-hooks deleting exactly the
refs each test created (FK children first). Add the gate-script cleanup line to the real-use
skill. Test: AE2's before==after row-count assertion wrapped around each suite.

### U3. Zero-point row hiding (R3)

Filter `points <= 0 && !isViewer` real rows in `assembleWeeklyBoard` before windowing; extend the
existing unit tests (viewer at 0 points stays; dormant learners vanish; rival fill still reaches
exactly 10; chase/podium operate on the filtered board).

### U4. One-pass board read (R4)

Application: evidence-existence prefilter read (port + Postgres adapter + integration test);
`getWeeklyLeaderboard` hoists per-enrichment reads into a once-per-enrichment map and returns
per-learner contributions; `getLearnerLifetimeMasteredCrystalCount` derives from the shared pass
(its standalone read path is deleted if no other caller remains, rule 18). Loader:
`loadLeaderboard` guards the previous-week recompute per KTD3. Tests: counting test doubles assert
AE5's read deduplication; podium-guard unit tests (award present / absent / no evidence).

### U5. Operations cost chips + collapse + rename (R5, R6, R7)

Preload the spend aggregate in the page loader; per-card chips with the `costAvailable`
degradation; collapsed finished cards via the shadcn disclosure pattern; rename per KTD6 across
application, kg-worker, and UI in the same change. Tests: chip folding from spend rows (including
degraded mode); rename leaves no stale export (typecheck + grep in review).

### U6. Rule-14 real-use gate (R8)

Against the post-wipe DB with ≥10 registered learners and ≥3 enrichments (registration via the
real route is cheap): timed before/after loads of `/learn` (logged-in, warm) and
`/admin/lab/operations`, plus AE1–AE7 driven through the real app with screenshots. Baselines
already measured 2026-07-07: `/learn` 10.5 s, operations ~4 s / 1.5 MB. PASS criteria: AE1–AE8.

## Validation

- Deterministic envelope: workspace typecheck; `@lrnki/application`,
  `@lrnki/infrastructure-postgres`, and `apps/admin-lab` tests green with `.env` loaded; lint
  clean.
- Real-use gate (rule 14): U6 evidence under `tmp/2026-07-07-learner-cleanup-ops-visibility/`;
  a green suite is not quality evidence (ADR-0013).

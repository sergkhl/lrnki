# 2026-07-10-005 — Fix expedition discoverability: curated Explore + Browse all catalog

Status: ready.

## Problem

A generated, succeeded, fully-ready expedition can be **unreachable** from the learner journal.
Reproduced live as learner `jackie chan` (PIN 1234): the "Photosynthesis" trails
(`Carbon fixation and carbohydrate synthesis` 7/7, `CAM (Crassulacean Acid Metabolism) pathway`
6/6, both Plant Biology) exist and are playable but never render.

Root cause is a single line in `packages/application/src/listExpeditionCandidates.ts`:

```ts
candidates: candidates.slice(0, input.limit ?? 3).map(...)
```

The `/journal` route (`apps/learner-api/src/app.ts`) calls the use-case with **no `limit`**, so the
"Explore" section is hard-clipped to the **top 3 shared enrichments by readiness rank**. Of 58 ready
candidate enrichments, the photosynthesis trails rank #6–#10 among shared and are sliced out. The
ranking `compareExpeditionCandidates` (fully-ready → ready-fraction → total stops → recency) is being
misused as a **visibility gate**: a sort that decides order is fine; a `slice` that decides existence
turns a discovery surface into a dead-end.

Secondary finding: the enrichment catalog is polluted with ~30 degenerate single-node "Ownership"
trails and `test`-domain runs from prior extraction testing, which would bury the real catalog in any
unwindowed list.

## Decisions (interview-resolved)

1. **Keep Explore curated; add a dedicated Browse all screen** with search for the full catalog.
   Explore stays a short ranked list; reachability of *any* trail moves to Browse all.
2. **Explore curated limit 3 → 5.**
3. **Browse all contents:** shared/beginnable trails only (`!existingLearnerExpeditionId`),
   unwindowed. Adopted trails keep their single home under Continue / Your expeditions on the journal.
4. **Separate `/catalog` endpoint**, its own lazy client query. Do NOT fatten the hot `/journal`
   poll (which refetches timelines) with the browse dataset.
5. **Test-noise: both** a one-time data cleanup AND a durable structural floor.
   - Structural floor: an expedition needs **≥ 2 trail stops** to be a candidate (a 1-node "trail"
     is a summit with no path). Lives in `listExpeditionCandidates`, so Explore and Browse all share
     one definition. Framed as a structural expedition property, not a lexical/surface content gate
     (AGENTS rule 16 stays satisfied — it is not a gate over neural output).
   - Data cleanup predicate (dry-run listing reviewed before any `DELETE`): remove enrichments that
     are **degenerate (< 2 trail stops)** OR carry a **placeholder domain** (`declaredDomain` in
     `{'test',''}`) OR are **empty 0-node/0-item runs**. Keep every substantive real-domain
     multi-node trail (game theory, Plant Biology, Oceanography, music, Immunology, Software Testing,
     Renewable Energy Engineering, Computer Science, rust, real software-engineering trails).
6. **Browse all screen:** flat route `app/catalog.tsx`; **client-side** search (case-insensitive
   substring on title + declaredDomain); rows reuse `CandidateCard` unchanged; reached by an
   **in-section "Browse all →" link in the Explore header** (and from the empty-state copy).

## Implementation units

### U1 — Use-case: drop the default window, add the structural floor
`packages/application/src/listExpeditionCandidates.ts`
- Remove the `?? 3` default. `limit` becomes an explicit optional param: a number caps the list,
  `undefined` returns the full ranked set. Callers state intent (journal 5, catalog unbounded).
- Add the ≥2-stop candidate floor in `candidateForSummary` / assembly so a trail with
  `totalStopCount < 2` produces no candidate. One source of truth for both surfaces.
- `readinessRank` continues to number the returned rows in order; harmless for the unbounded catalog.

### U2 — API: curated journal + new catalog route
`apps/learner-api/src/app.ts`
- `/journal`: pass `limit: 5` explicitly (curated Explore).
- New `.get("/catalog", auth, …)`: call `listExpeditionCandidates` with no `limit`, return the full
  entry (same shape). Reuses the existing Postgres read adapters already wired for `/journal`.
  Timelines are journal-only and are **not** included in the catalog payload.

### U3 — Client read layer
`apps/learner-app/src/lib/queries.ts`
- Add `catalogQuery` (key `["catalog"]`) hitting `api.catalog.$get()`, typed to
  `LearnerExpeditionEntry`. Lazy — fetched only when Browse all mounts.

### U4 — Browse all screen
`apps/learner-app/src/app/catalog.tsx` (new)
- Header + back affordance consistent with `duel.tsx` / `leaderboard.tsx`.
- Local search state; filter the `shared` partition (`partitionExpeditionJournal`) by
  case-insensitive substring over `title` + `declaredDomain`.
- Render filtered rows via the existing `CandidateCard` (extract/export it from `ExpeditionEntry.tsx`
  if not already reusable). Empty-filter and no-results states.

### U5 — Explore entry point
`apps/learner-app/src/components/ExpeditionEntry.tsx`
- Explore `JournalSection` header gains a **"Browse all →"** link routing to `/catalog`.
- Update `NoCandidates` copy to point at Browse all.
- Explore continues to render the curated (now top-5) `shared` slice from `/journal`.

### U6 — One-time data cleanup (dev, not a migration)
- Script in `tmp/2026-07-10-expedition-catalog-cleanup/`: **dry-run SELECT** listing every enrichment
  matching the U5 deletion predicate (id, domain, node/item counts). Review the rows.
- After review, `DELETE` matched enrichments and their dependent rows in FK-safe order (or cascade).
  Verify no `learner_expeditions` row references a delete target (jackie chan holds only Folk theorem,
  a keeper).

## Acceptance / validation

- **Unit:** `listExpeditionCandidates` returns the full ranked set when `limit` is omitted and
  excludes `< 2`-stop trails; `partitionExpeditionJournal`/journal-view tests updated for top-5.
- **Rule 14 real-use gate** (`.agents/skills/real-use-quality-evaluation/SKILL.md`): as `jackie chan`
  (PIN 1234) against production data — open Browse all, search "photo", confirm the Carbon-fixation
  trail appears and **Begins** into a playable expedition. Capture evidence under
  `tmp/2026-07-10-expedition-catalog-cleanup/`.
- Confirm Explore still shows a clean top-5 with no degenerate rows after cleanup.

## Out of scope

- No change to ranking semantics (`compareExpeditionCandidates`) or the learner-neutral core.
- No server-side search, pagination, or catalog persistence — client-side filter over the fetched
  list is sufficient at current catalog size.
- No code-level `test`-domain filter; placeholder-domain noise is removed by the one-time cleanup.

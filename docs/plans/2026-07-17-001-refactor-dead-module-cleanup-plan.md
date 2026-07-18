---
title: Dead Module Cleanup and Durable Keep Decisions - Plan
type: refactor
date: 2026-07-17
execution: code
---

# Dead Module Cleanup and Durable Keep Decisions - Plan

## Goal Capsule

- **Objective:** Delete every zero-consumer module found by the 2026-07-17 workspace reference
  scan (rule 18), retire the one test block whose subject was deleted with the Crystal Formation
  minimal redesign, and record two durable keep decisions in their owning ADRs: the weekly
  leaderboard as a provisional MVP surface (ADR-0032) and the stable-IRI-only RDF boundary
  (ADR-0008).
- **Authority:** [AGENTS.md](../../AGENTS.md) rules 8, 14, 18;
  [ADR-0008](../adr/0008-use-rdf-compatible-boundary.md);
  [ADR-0011](../adr/0011-retain-minimal-admin-lab.md);
  [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md);
  [CONTEXT.md](../../CONTEXT.md).
- **Execution profile:** Purely subtractive. No runtime behavior, schema, prompt, port semantics,
  or wire shape changes; every deletion target has mechanically verified zero consumers. No
  database reset is required (no migration change). No LLM call is touched.
- **Scheduling:** Now unblocked — the Deep Scaffold Generation work (former plan 2026-07-16-004)
  shipped and its rule-14 gate passed on 2026-07-17 (see `TODO.md`), so this plan's subtractive
  envelope no longer confounds that plan's gate.
- **Stop conditions:** Re-verify zero-consumer evidence at execution time (plan -004 executes in
  between); stop and re-scope if any target has gained a live consumer, i.e. a typecheck/test
  failure traces to a real import rather than a stale re-export.
- **Tail ownership:** Complete U1–U4, amend ADR-0008/ADR-0032, update `TODO.md` with the grouped
  outcome and validation, remove this plan from `docs/plans/README.md`, then delete this plan.

## Interview-Locked Decision Ledger (2026-07-17 — do not re-propose)

- **Weekly leaderboard stack KEPT AS IS** (simulated seeded rivals, division ladder, journal
  splashes, `learner_awards`, `/leaderboard` route, faker dependency). User decision: competition
  motivates even when the learner knows rivals are fake; it is an MVP surface whose keep-or-remove
  call belongs to beta learner response; real multiplayer is deferred until after beta. U3 records
  this durably in ADR-0032. Full-removal and stripped-down ("own points only") variants were
  both REJECTED.
- **`sphereGridLayout.ts` stays in `packages/application` unchanged.** It is the live layout
  engine of Admin Lab's `DerivedGraphExplorer` (deterministic crossing-free per-domain regions +
  flagged-loop inspection). Relocation into `apps/admin-lab` and replacement with a stock
  Cytoscape layout were both REJECTED; only its per-Leg test block dies (subject deleted with the
  Crystal Formation minimal redesign). The 622-line `sphereGridLayout.realShapeFixture.ts` stays —
  the surviving whole-enrichment regression uses it.
- **Symbol-level export pruning REJECTED.** Never-imported type aliases in `domain-core`/`ports`
  (~40, e.g. `GroundingOrigin`, `ConceptRole`) and micro-prunes (`rankFrontier`, `isoWeekKey`,
  `LearnerBadges`) all stay; they are zero-runtime domain vocabulary and pruning is churn.
- **Test suite judged healthy; NO consolidation.** Sweep found zero `.skip`/`.todo` leftovers and
  zero assert-free tests; the only conditional skips are the deliberate opt-in `DATABASE_URL`
  pattern. The only test deletions are those attached to deleted code.
- **Validation bar:** deterministic envelope plus one manual Admin Lab explorer smoke. No
  LLM-touching rule-14 gate applies: a zero-consumer deletion is not a behavior-changing
  milestone (no model call, no projection change, no persisted shape change).

## Verified Dead-Code Inventory (2026-07-17 scan)

Method: symbol-level reference scan over `packages/` + `apps/` (every exported symbol grepped
outside its defining file, its test, and the package barrel), cross-checked with relative-import
scans, `git log -S`, and route/UI tracing. Re-run the same checks at execution time.

| Target | Size | Evidence |
| --- | --- | --- |
| `packages/application/src/verifyEvidenceQuote.ts` | 7 lines | Zero references anywhere; not exported from `index.ts`; verbatim checking lives in the extraction path / `verbatimFloorByGrounding` |
| `packages/application/src/targetCandidates.ts` + `.test.ts` + `index.ts` block (`buildTargetCandidates`, `filterTargets`, `recommendedTargets`, `TargetCandidate`) | ~200 lines | Only its own test references it; goal-cone target selection superseded by the layer-wide Study Session |
| `packages/application/src/calibrationList.ts` + `.test.ts` + `index.ts` block (`composeCalibrationSession`, `CalibrationSessionProjection`) | ~250 lines | Only the barrel re-export references it; no route or UI consumes the pre-study calibration list. The live per-node verdict path (`ConceptMarker` → `/study/verdict` → closure in `studySessionProjection`) is untouched |
| `packages/infrastructure-rdf-export` (whole package) | 54 lines + test | Zero importers in any app/package; `git log -S exportGraphAsJsonLd` shows no caller has ever existed since init (2026-06-10). Only external reference is one README package-list line |
| Per-Leg block in `packages/application/src/sphereGridLayout.test.ts` (lines ~246–297, comment header through file end) | ~50 lines | Locks "every Crystal Formation Leg embeds crossing-free" for the per-Leg sphere grid deleted by the minimal redesign (plan 2026-07-16-002); the whole-enrichment regression above it stays |
| Empty `apps/admin-lab/src/app/learn/leaderboard/` directories | 0 files | Untracked filesystem litter from the Learner App separation; `rmdir` only, no git change |

## Implementation Units

### U1 — Delete dead application modules and the per-Leg test block

- **Depends on:** Deep Scaffold Generation completion (shipped 2026-07-17); re-verified
  zero-consumer evidence.
- **Primary files:** `packages/application/src/verifyEvidenceQuote.ts`,
  `targetCandidates.ts` + `.test.ts`, `calibrationList.ts` + `.test.ts`,
  `packages/application/src/index.ts` (the two export blocks named in the inventory),
  `packages/application/src/sphereGridLayout.test.ts` (per-Leg block only), and the empty
  `apps/admin-lab/src/app/learn/` directory tree.
- **Work:** Delete the files and export blocks; leave every other `index.ts` export byte-identical.
  Remove the per-Leg comment header and test together. `rmdir` the empty admin-lab directories.
- **Tests:** Full `@lrnki/application` suite passes with no other test edits; workspace typecheck
  passes (proves nothing imported the deleted symbols).

### U2 — Remove the RDF-export package and amend ADR-0008

- **Depends on:** none (independent of U1).
- **Primary files:** `packages/infrastructure-rdf-export/` (whole directory), `README.md`
  (one package-list line), `docs/adr/0008-use-rdf-compatible-boundary.md`, `pnpm-lock.yaml`
  (via `pnpm install`).
- **Work:** Delete the package directory; workspace globs (`packages/*`) need no edit. Remove the
  README line. Amend ADR-0008's Decision to own only the surviving boundary: stable internal
  Concept IRIs; no triplestore, SPARQL endpoint, or OWL reasoner in the MVP; no standing JSON-LD
  export utility — an exporter is introduced only when a real consumer exists. Run `pnpm install`
  to settle the lockfile.
- **Tests:** `pnpm -r typecheck` and `pnpm -r test` pass with the package gone.

### U3 — Record the leaderboard MVP decision in ADR-0032

- **Depends on:** none.
- **Primary files:** `docs/adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md`.
- **Work:** Add a short policy paragraph near the existing weekly-podium mention: the weekly
  cohort leaderboard (simulated seeded rivals, division ladder, journal splash celebrations,
  `weekly_podium` award) is a deliberately retained MVP motivation surface. Rivals remain
  presentation-side fiction that never touches `learners`, graded evidence, or persistence; its
  retention is provisional — beta learner response decides whether it is kept, reshaped, or
  removed, and real multiplayer is out of scope until after beta. State policy only; no
  implementation walkthrough.
- **Tests:** none (documentation); link check that CONTEXT/AGENTS references stay intact.

### U4 — Envelope, smoke, and documentation tail

- **Depends on:** U1–U3.
- **Automated envelope:** `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`,
  `pnpm e2e:web` (the standing `pnpm check` composition). No database reset; no
  `DATABASE_URL`-gated suites are affected beyond compiling.
- **Manual smoke:** Open Admin Lab's derived-graph explorer against existing data: sphere-grid
  positions render, focus recenter works, and the flagged-loop banner path is intact (its only
  adjacent change is a deleted test block, so this is a cheap regression tripwire, not a gate).
- **Documentation tail:** Update `TODO.md` (grouped outcome + validation note, remove the queued
  entry), remove this plan from `docs/plans/README.md`, delete this plan file. Record explicitly
  in TODO validation that no rule-14 LLM gate applies and why.

## Acceptance

- The five inventory targets are gone; no other export, test, prompt, schema, or config changed.
- Workspace typecheck, full test suites, lint, build, and `pnpm e2e:web` pass with zero new
  skips or edits outside the inventory.
- ADR-0008 owns the stable-IRI-only boundary; ADR-0032 owns the provisional leaderboard-MVP
  decision; `docs/adr/README.md` links remain valid.
- The decision ledger's rejected alternatives (leaderboard removal/strip-down, sphere-grid
  relocation/stock-layout swap, symbol pruning, test consolidation) are recorded and not
  re-proposed.

---
date: 2026-07-03
topic: anchor-less-learner-path-audit
---

# Anchor-less Learner Path Audit — Retire the Persisted-Path Stack

## Summary

TODO item 4 ("Validate learner-facing projections for anchor-less synthetic layers",
[ADR-0019](../adr/0019-graph-enrichment-derived-layer.md)) asked to audit and adapt the Learner Paths
view, the adaptive path, and anchor-based target resolution beyond the Study Session. Investigation
found the gap narrower than framed: every anchor-assuming defect is confined to one legacy surface —
the pre-Quest-Subgraph persisted-path stack. **Decision (2026-07-03, resolved with the user): retire
that stack entirely.** No workflow depends on the persisted rows, the CLI commands, or the
`/admin/lab/paths` view; the Study Session already serves both asserted and synthetic layers through
the same shared adaptive core, computed live. No schema relaxation, no CLI generalization.

---

## Problem Frame

Synthetic Topic Generation produces anchor-less Derived Graph Layers (`graphVersionId` null, every
node `nodeKind: "enrichment"` with `role: "synthetic_primary"`, no `AnchorProjectionNode` exists).
These layers were validated against the Study Session projection only. The TODO named three other
consumers — the Learner Paths view, the deferred adaptive path, and anchor-based target resolution —
as validated only against source-grounded (asserted) layers.

---

## Findings

### Confirmed defects (all inside the retired stack)

- `packages/application/src/computeLearnerPath.ts` hard-throws for any enrichment with
  `graphVersionId === null` (every synthetic layer) — it can never persist a `learner_paths` row for
  a synthetic topic.
- `apps/kg-worker/src/knowledgeGraphWorker.ts`'s `computeAdaptivePathCommand` resolves its target via
  `node.nodeKind === "anchor" && node.conceptId === targetRef`. Synthetic layers have zero anchor
  nodes, so the CLI command is unusable for them independent of the throw above.
- Schema and types match: `learner_paths.graph_version_id` is `NOT NULL`
  (`packages/infrastructure-postgres/src/migrations/0000_initial_lrnki_schema.sql`), and
  `LearnerPath` / `LearnerPathSummary` / `LearnerPathDetail` (`packages/ports/src/index.ts`) declare
  `graphVersionId: string`.

### Why retirement is safe

- The pure adaptive-frontier core in `packages/application/src/adaptivePathProjection.ts`
  (`classifyAdaptedNodes`, `selectScopedFrontierTarget`) is node-kind-agnostic and is what the live
  Quest Subgraph surfaces use: `studySessionProjection.ts` and `DerivedGraphExplorer.tsx`'s
  mastered/frontier/locked overlay both read generically and already work for synthetic layers.
- The pruned persisted-path projections `projectLearnerPath` (`learnerPathProjection.ts`) and
  `projectAdaptivePath` are reachable only from `computeLearnerPath.ts` — the live Study Session does
  not use them. The legacy stack is cleanly severable.
- `targetCandidates.ts` (the quest target/candidate layer) is already `derivedNodeId`-generic.
- The user confirmed no workflow relies on persisted `learner_paths` rows, the two CLI commands, or
  the `/admin/lab/paths` view.

### Consumers of `learner_paths` (complete list)

Two Admin Lab surfaces, both inspection-only:

1. The `/admin/lab/paths` view (`apps/admin-lab/src/lib/learnerPaths.ts`,
   `apps/admin-lab/src/components/LearnerPathExplorer.tsx`) via `PostgresLearnerPathInspectionRead`.
2. The learner-loop detail page (`apps/admin-lab/src/app/admin/lab/learner-loop/[learnerStateRef]/`)
   — `getLearnerLoopDetail` (`packages/application/src/learnerLoopProjection.ts`) folds `pathScopes`
   and per-path study-item `coverage` from `listPathScopesForLearner` / `listCoverageForLearner`
   (`packages/infrastructure-postgres/src/PostgresLearnerLoopRead.ts`). Both sections render empty
   for any learner who never ran the legacy CLI.

The only writers are the `compute-learner-path` / `compute-adaptive-path` worker commands.

---

## Decision

Retire the persisted Learner Path stack in one change (AGENTS.md rule 18). The capability it once
delivered — adaptive path inspection — moved into the live Study Session ladder and the graph
explorer overlay during Quest Subgraph, which deliberately chose live computation over persisted
paths. A persisted path row is a stale snapshot of learner state at compute time; keeping the stack
"asserted-graph-only by design" would preserve a documented asymmetry plus dead weight, and extending
it would spend schema/type/CLI work reviving a surface nothing consumes. Retiring it also keeps Admin
Lab minimal ([ADR-0011](../adr/0011-retain-minimal-admin-lab.md)).

## Requirements

**Retirement (delete, one change)**

- R1. Delete the write path: `packages/application/src/computeLearnerPath.ts`, the
  `compute-learner-path` / `compute-adaptive-path` commands in
  `apps/kg-worker/src/knowledgeGraphWorker.ts`, and the now-orphaned pruned projections
  `projectAdaptivePath` and `projectLearnerPath`, with their tests and index exports. Helpers the
  live surfaces still import (`classifyAdaptedNodes`, `selectScopedFrontierTarget`,
  `LearnerStatePort`) stay; `emptyLearnerState` and `DEFAULT_MASTERY_THRESHOLD` have no remaining
  consumers once the CLI commands are gone, so `learnerPathProjection.ts` is deleted whole.
- R2. Delete persistence: the `learner_paths` and `learner_path_steps` tables from the single initial
  migration (rules 8/9 — edit in place, dev DB realigned), `PostgresLearnerPathStore`,
  `LearnerPathStorePort`, and the `LearnerPath` type. `LearnerPathStep` stays — the live quest
  ladder (`statefulLearnerPath.ts`, `studySessionProjection.ts`, `QuestLadder.tsx`) imports it.
- R3. Delete the inspection read side: the `LearnerPathSummary` / `LearnerPathDetail` ports,
  `PostgresLearnerPathInspectionRead`, and the Admin Lab `/admin/lab/paths` view
  (`apps/admin-lab/src/app/admin/lab/paths/`, `apps/admin-lab/src/lib/learnerPaths.ts`,
  `apps/admin-lab/src/components/LearnerPathExplorer.tsx`) including its navigation entry.
- R4. Remove the `learner_paths`-backed learner-loop sections: `listPathScopesForLearner` /
  `listCoverageForLearner` on `LearnerLoopReadPort` and their Postgres implementations, the
  `pathScopes` / `coverage` folds in `getLearnerLoopDetail`, and their rendering on the learner-loop
  detail page. Response history and calibration verdicts stay.

**Kept invariants**

- R5. The live adaptive core and Study Session projection are untouched; the Study Session remains
  the sole Learner Path projection, so CONTEXT.md's **Learner Path** term needs no edit.
- R6. No schema relaxation: `graph_version_id` nullability, type widening, and CLI target-resolution
  generalization are all rejected, not deferred.

**Closure**

- R7. Close TODO item 4 as resolved by retirement: the Study Session was already validated on
  synthetic layers, `targetCandidates` is already generic, and the only anchor-assuming consumers are
  deleted rather than adapted.

## Success Criteria

- `pnpm run check` passes after the deletion and a dev DB reset.
- No references to `learner_paths`, `LearnerPath*` types/ports, or the two CLI commands remain
  outside git history; Admin Lab has no `/paths` route or navigation entry.
- The learner-loop detail page renders without the removed sections (no empty placeholders).

## Out of Scope

- No replacement headless path CLI. Ad-hoc headless frontier checks run a `tsx` script over the
  `getStudySession` use-case when needed.
- No ADR changes: the "learner path" mentions in ADR-0016/0019/0024/0026 refer to the generic
  projection concept, which the Study Session continues to implement.
- Old validation trails that used the CLI stay historical; no reproducibility requirement.

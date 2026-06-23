# Separate Calibration Flow, Critical-Set Probing & Study-Leak Fix — Requirements

**Status:** Approved for planning · **Date:** 2026-06-23 · **Branch:** `feat/graph-dissolved-calibration`

## Summary

Reshape the just-built (unmerged) graph-dissolved calibration into a **separate, re-entrable
calibration flow** that probes only a small **flat critical set** of nodes, selected by
**intrinsic difficulty** (primary) and trusted **down-closure leverage** (secondary). Studying
the gap stays on the Admin Lab study graph, which keeps its neutral↔adapted toggle. Because
calibration (which reveals answers) and graded study (which must not) become physically separate
surfaces, the same-sheet answer leak disappears. A **manual skip** lets the learner prune any node
directly, and a **manage-skipped** affordance restores it; re-calibration is always available. The
domain core (verdict store, prune closure, restoration nudge, graded-only log) is unchanged — this
is a UI/flow reshape plus one pure critical-set selector.

## Problem

Two defects observed by real-use inspection of the dissolved-calibration branch:

1. **Answer leak.** A cone node's side sheet renders the reveal/verdict calibration card and, under
   "Or study it now:", the auto-graded `option_select` card for the *same* node
   (`apps/admin-lab/src/components/study/StudySideSheet.tsx`). Revealing the self-assessment answer
   directly above the graded item hands over the answer, contaminating the graded-only Response Log
   the refactor was built around.
2. **No simplification / weak reversibility.** Marking a node "I knew it" prunes its down-closure
   but every node stays on the canvas (recolored, not removed). The only reversal path was clicking
   the now-mastered node on the graph — so any move toward hiding nodes would have deleted the
   reversal affordance.

**Root cause:** calibration was dissolved *onto every node of the study graph*, fusing two
different epistemic acts — calibration (reveal allowed, self-report) and graded study (no reveal,
measured) — onto one surface, and making "calibrate everything" the only model.

## Goals

- Calibration and graded study are **separate surfaces**; a revealed answer can never sit beside
  its own graded item.
- Calibration asks about a **small critical set**, not every node — fast for the learner, and a
  real first consumer for the intrinsic-difficulty signal.
- Calibration is **always re-entrable**, so reversibility no longer depends on graph node visibility.
- The learner can **skip any concept** they already know, and **un-skip** it.
- Coarse calibration is **safe in both directions** without new safety machinery, via the skip
  button and the existing restoration nudge.
- The domain/persistence core is **reused unchanged**; the change is UI/flow plus one pure selector.

## Non-goals

- **The adapted-only, mastered-hiding learner graph — out of scope (future Learner app).** Admin
  Lab **keeps** the neutral↔adapted toggle and full graph visibility for operator inspection
  (AGENTS rule 12). The simplified single graph is built later against these same transfer-ready
  modules.
- **Top-down adaptive descent / binary-search probing** — deferred. v1 is a static flat set. Add
  descent only if real-use shows the flat set leaves the gap too large.
- Soft / weighted / probabilistic pruning, evidence weights — remain removed (prior doc).
- Real learner modeling / IRT / KT / population difficulty calibration (ADR-0014, ADR-0024).
- Graph granularity / densification — separate upstream tracks.

## Requirements

### Separate calibration flow

- R1. Calibration is a **distinct, re-entrable surface** (its own screen/step), not a per-node
  affordance on the study graph. Re-entering it overwrites prior verdicts — this is the primary
  reversal path.
- R2. The flow presents the **flat critical set** (R6) as a list of reveal cards. Each card:
  reveal the `self_assessment` answer, then one binary choice — **"I knew it"** (`known` verdict →
  prune trusted down-closure) or **"I forgot"** (`learn` verdict → stays in gap). Reveal-before-
  choice is retained as the honesty check.
- R3. Re-opening the flow shows the learner's **prior verdict** per critical node, changeable or
  clearable. Verdicts are mutable state, so reversal is delete/overwrite (no stale rows).

### Critical-set selection

- R4. The critical set is a **flat (non-adaptive)** subset of the goal's trusted prerequisite cone.
- R5. The set is **deterministic** given the cone, the trusted edges, and the difficulty scores.
- R6. Selection rule: rank cone nodes by **intrinsic difficulty (primary)**, breaking ties by
  **trusted down-closure size (secondary)**; take the top few (a small **tunable count**, not a
  fixed product number); **always include the goal's direct trusted prerequisites** so the immediate
  frontier is never skipped. Nodes with **no difficulty score fall back to leverage order** so a
  missing signal degrades gracefully rather than dropping the node.
- R7. The critical set is an explicitly **reversible heuristic starting point**, never a correctness
  gate. A noisy difficulty score can only reorder/resize the probe set; it can never produce a wrong
  or unrecoverable gap, because skip and restoration correct any miss (R10, R11).

### Per-card difficulty stat (debug)

- R8. Each card (calibration and graded study) shows its node's **intrinsic difficulty value** as an
  operator debug/inspection stat, clearly labeled. It exists so the operator can judge whether the
  difficulty-driven critical-set selection is sensible (AGENTS rule 14). The future Learner app may
  hide it; the transfer-ready card view carries it as optional inspection data.

### Manual skip & un-skip

- R9. Any study-graph node offers **"Skip — I already know this,"** writing the same `known` verdict
  and the same deterministic trusted down-closure as a calibration "I knew it."
- R10. A **"Skipped (N) — manage"** affordance lists skipped nodes and restores any (`clearVerdict`,
  returning it to the gap). This is the reversal path for manual skips and the reason hiding nodes
  (later, in the Learner app) is safe.

### Answer-leak fix

- R11. Calibration (reveal allowed) and graded study (no reveal) are **separate surfaces**. Tapping
  a study-graph node opens graded study (`option_select`, no answer reveal) plus the skip control —
  **never** the calibration reveal card. The "Or study it now:" block and the `optionItem` arm of
  the `calibration` `SheetContent` variant are deleted (AGENTS rule 18).

### Self-correction (reuse, no new machinery)

- R12. Over-inclusion (forgot a high node but know parts beneath it) is corrected by the **skip
  button** (R9). Over-pruning (marked a node `known` but actually forgot a deep prerequisite) is
  corrected by the **existing restoration nudge** — a graded miss surfaces the skipped prerequisites
  to restore (`suggestRestorations`, prior R14). No new struggle signal or threshold is added.

### Removals (AGENTS rule 18, all on the unmerged branch)

- R13. Delete the per-node dissolved-calibration gating from the study-graph node-tap path (the
  `calibration` sheet kind moves into the separate flow), the `optionItem` stacking, and any "study
  it now" affordance on a revealed node. **Do not** delete the Admin Lab neutral↔adapted toggle.

## v1 simplifications (avoid over-build)

- Flat critical set; adaptive descent deferred (non-goal).
- Reuse the verdict store, `pruneClosure`/`composeMastery`, restoration nudge, and graded-only
  Response Log unchanged — no schema change.
- Skip = `known` verdict; un-skip = `clearVerdict`; re-calibration = overwrite verdicts. One
  mechanism, three entry points.
- Difficulty stat is a plain labeled value, no chart.

## Success criteria

- A revealed self-assessment answer is **never** rendered on the same surface as that node's graded
  `option_select` item (grep-clean of the `optionItem` calibration arm / "study it now").
- Opening the calibration flow for a goal presents a **small** difficulty-ranked critical set (incl.
  the goal's direct prerequisites), each card showing its difficulty stat; "I knew it" visibly
  shrinks the study gap, deterministically and reversibly; re-entering the flow shows prior verdicts.
- Skipping a study node prunes it; "Skipped — manage" restores it; a graded miss still surfaces the
  restoration nudge for skipped prerequisites.
- The Admin Lab neutral↔adapted toggle and full graph remain.
- The critical-set selector and its difficulty/leverage ordering are covered by **unit tests over a
  fixture DAG** (deterministic envelope, AGENTS rule 11 — never asserting model output).
- Real-use inspection (AGENTS rule 14) on the economics + a deep-narrow (Rust) cone confirms the
  critical set is sensible and the leak is closed.

## Scope boundaries

- **In scope:** separate calibration flow; flat critical-set selector; per-card difficulty stat;
  skip + manage-skipped; answer-leak fix; the listed removals — all in Admin Lab and the
  transfer-ready study modules.
- **Out of scope (future Learner app):** the adapted-only graph that hides mastered/known/skipped
  nodes. Admin Lab keeps the toggle.

## Dependencies / assumptions

- Per-node `self_assessment` items remain the calibration surface; `option_select` items remain the
  graded study surface (ADR-0026 typed items).
- Intrinsic difficulty (`intrinsic-fused-v1`, ADR-0024) is persisted per node and is the cold-start
  selection signal; it remains EXPERIMENT_ONLY (TODO #1 broad/thin distortion) — tolerated here
  because R7 makes the set a reversible heuristic, not a correctness gate.
- The Derived Graph Layer's trusted `inferred-prerequisite-of` edges are the prune/closure/critical-
  set substrate.
- The transfer-ready presentation contract (`apps/admin-lab/src/components/study/studyView.ts`) keeps
  owning shared types so the future Learner app reuses calibration, skip, and the (then-hidden)
  difficulty stat unchanged (AGENTS rule 18).

## Decisions & rationale (journey)

- **Separate flow over dissolved-on-every-node.** Separation fixes the answer leak structurally
  (reveal and grade can't co-occur) and makes calibration re-entrable, which removes the dependency
  on graph node visibility for reversal — one move, two problems solved.
- **Critical set, not full sweep.** Down-closure pruning already means a high "I knew it" answer
  removes a whole sub-cone, so probing a small leverage/difficulty-ranked set is enough; the skip
  button covers anything deeper the learner happens to know.
- **Intrinsic difficulty as primary selector.** It is the purpose-built learner-neutral cold-start
  adaptation signal (ADR-0024), and calibration is the cold-start moment. Earlier caution about its
  EXPERIMENT_ONLY status was load-bearing only when verdicts were hard to reverse; with the
  re-entrable flow + skip + restoration, a noisy score only reorders questions. This also gives the
  signal its first real consumer and a per-card inspection surface to drive its refinement.
- **Down-closure leverage as secondary.** Difficulty answers "where do learners differ"; leverage
  answers "how much does a `known` answer prune." They are complementary, so leverage breaks ties and
  guards against missing a mid-difficulty cut-point.
- **Keep the Admin Lab toggle; defer the adapted-only graph.** The simplified single graph is a
  Learner-app concern; Admin Lab stays a full-visibility operator inspection surface (rule 12).
- **Reuse the core unchanged.** Skip/un-skip/re-calibrate are all the existing verdict
  upsert/clear; no schema or domain change — lowest-cost durable path (rules 1, 8, 18).

## Relationship to the prior doc

Supersedes the calibration-UX portion of the shipped graph-dissolved calibration feature (2026-06-22;
outcome recorded in `docs/plans/TODO.md` COMPLETED, full provenance in git history): its "dissolve
calibration into the graph, tap any node to reveal" model is replaced by the separate flow (R1–R3) +
critical-set probing (R4–R7) + skip (R9–R10) here. Goal-first entry, the verdict store, deterministic
pruning, restoration, and reset carry forward unchanged.

# Graph-Dissolved Calibration & Goal-First Study Loop — Requirements

**Status:** Approved for planning · **Date:** 2026-06-22

## Summary

Replace the separate, optional, weighted self-report calibration sweep with **explicit
calibration dissolved into the study graph**. The learner picks a goal concept first, then
calibrates by self-assessing concept nodes on the goal's prerequisite cone: revealing a node's
answer and declaring **"I knew it"** hard-prunes its prerequisite sub-cone, collapsing the graph
to a visible study gap to learn bottom-up; **"I forgot"** keeps the node in the gap. Calibration
is a **mutable, explicit, deterministic** verdict per node (overwrite / delete, no weights, no
probabilistic pruning). The append-only response log is kept only for **graded study
measurement**. While studying the gap, a graded miss surfaces a **restoration suggestion** to
revisit related skipped prerequisites. No weights, no adaptive probe selection, no separate
calibration mode.

## Problem

Two reported defects in the Admin Lab study surface trace to one root cause.

1. **Empty calibration** — "This goal has no prerequisite self-assessment items to calibrate —
   study it directly." Verified: the chosen economics goal *Surplus Produce of Labour* is a DAG
   **root** (zero inbound prerequisite edges), and `buildCalibrationSet`
   (`packages/application/src/calibration.ts`) scopes calibration to prerequisite *ancestors
   only* — so the sweep is empty even though the enrichment has full per-node self-assessment
   coverage.
2. **Premature "Goal reached"** — the same root goal's scoped frontier cone is just itself
   (`selectScopedFrontier` in `apps/admin-lab/src/lib/studySession.ts`), and the test learner
   already carried a graded-correct response on it, so it classified `mastered` → no frontier →
   completion fired on entry.

**Root cause:** the study loop is scoped to the goal's prerequisite-ancestor cone, which is
empty/degenerate when the goal is a DAG root. Separately, the *only* mechanism that adapts the
graph "from the start" today — the weighted self-report sweep — is weak-evidence, a separate
mode, and confusingly empty for such goals.

### Verified diagnosis (reference)

Economics enrichment `a78cb25f-…`: 59 nodes (35 anchor / 24 enrichment), 51 certain edges (not
sparse). Goal `0a6ba115-…` is `source_mentioned` with **0 inbound / 1 outbound** prerequisite
edge — a root. Learner `123` had both a graded *incorrect* and a graded *correct* row on it. Both
messages are *correct given that data*; the fix is structural/UX, not a data repair.

## Goals

- Calibration is meaningful for **every** goal, including DAG roots; never a spuriously empty screen.
- Pre-study adaptation is **deterministic and unit-testable** — no weights, no probabilistic pruning.
- Calibration is a **single, explicit, learner-driven** mechanism — fewer modes and modules.
- The learner **authors their own path**: pruning is a deliberate, reversible, visible choice.
- The system is **explicit and debuggable**: no signal silently overrides another, and learner
  state can be reset to a clean slate.

## Non-goals

- Adaptive probe selection / binary search — **dropped, not deferred**. Once the learner taps what
  they know, there is no level to "hunt" for, so the search machinery earns nothing.
- Any soft / weighted / probabilistic pruning, and any evidence-weight gradient.
- A three-way self-assessment ("worth exploring") — **dropped**. The depth-preservation goal it
  served is met instead by the evidence-driven restoration suggestion (R12–R13) and by per-node
  reversibility, which together beat a speculative forward-looking flag.
- Graph granularity (splitting hard concepts into finer prerequisite nodes) — separate upstream
  enrichment track; compatible, not blocked.
- New study-item types (free-text, theory, games) — separate teach-phase track.
- Real learner modeling / IRT / KT (per ADR-0014, ADR-0024).

## Requirements

### Goal-first entry

- R1. Learner selects a **goal concept first** via search over concepts (label/alias), not via
  enrichment id. The enrichment picker becomes a secondary operator switcher (default to latest).
- R2. Each goal candidate shows its **journey size** — the count of prerequisite concepts in its
  cone. Default ordering surfaces larger cones first.
- R3. A goal with no prerequisites (DAG root) is **labeled "foundational — studied directly,"**
  still selectable, and opens an honest single-node study screen — never an empty-calibration
  error and never a premature "Goal reached."

### Calibration dissolved into the graph

- R4. The study screen renders the **goal's prerequisite cone** as a graph (cytoscape, AGENTS
  rule 15), goal marked as the destination.
- R5. Opening a node **reveals its `self_assessment` card** (prompt + answer), then offers one
  **binary explicit choice**:
  - **"I knew it"** → **hard-prune**: record a `known` verdict on the node and treat its
    prerequisite down-closure as mastered (deterministic down-closure).
  - **"I forgot"** → record a `learn` verdict; the node stays in the study gap (default).
- R6. Revealing the answer *before* the choice is required — the reveal is an honesty check
  ("deeper than I assumed").
- R7. Every choice is **reversible**: re-opening a node lets the learner change or clear its
  verdict. Because verdicts are mutable state, reversal is a delete/overwrite — no stale rows to
  reconcile.
- R8. Down-closure walks **trusted (`!uncertain`) prerequisite edges only**, matching the existing
  readiness rule.
- R9. Remaining lit (unpruned, `learn`) nodes form the **study gap**, studied bottom-up toward the
  goal via the existing teach loop (unchanged).

### Explicit calibration state & determinism

- R10. Calibration is a **mutable verdict** per `(learner, derived node)` — `known` or `learn` —
  stored **separately from the append-only response log**, which is kept only for graded study
  measurement. Calibration carries **no evidence weights**.
- R11. Calibration pruning is **fully deterministic**: given the set of `known` nodes and the
  layer's trusted edges, the pruned set is a fixed, unit-testable down-closure.
- R12. **No signal silently overrides another.** A `known` node is pruned out of the gap, so it is
  never simultaneously studied; mastery composition is explicit (calibration `known` masters its
  closure; graded outcomes drive only the un-pruned gap). Where a verdict and a graded row
  coexist (e.g. after a reset/replay), the coexistence is **surfaced**, not silently resolved.

### Restoration re-calibration

- R13. While studying the gap, a **graded miss** (latest graded `incorrect`) on a node is the
  struggle signal — derived from the existing graded rows, with **no new measurement type**.
- R14. The struggle signal yields a **restoration suggestion**: the struggled node's **pruned
  prerequisite ancestors** (nodes earlier marked `known`) are surfaced as "worth revisiting."
  Acting on a suggestion **restores** the node (clears its `known` verdict → it returns to the
  gap). v1 keeps this minimal: no ranking, no failure-count thresholds, and the suggestion itself
  is derived on read (not persisted).

### Reset

- R15. **Per-node** reset is the everyday reversibility of R7 (re-open, clear the verdict).
- R16. **Per-learner** reset is an explicit operator action that nukes all of a learner's state —
  every verdict plus all graded study rows — for clean-slate replay during development.
- R17. **Per-goal/enrichment** reset is **deferred** (extra scoping for little debug payoff now).

### Determinism & removals

- R18. In the same change (AGENTS rule 18), **retire** the standalone calibration sweep
  (`apps/admin-lab/src/components/study/CalibrationSweep.tsx`), the "Calibrate" mode toggle in
  `StudySession.tsx`, the weighted self-report propagation path (`propagateSelfReport`, the
  prerequisite-ancestor `buildCalibrationSet`, the `0.3` / `0.15` weight constants and the
  `appendSelfReportBatch` sweep writer), and the `evidence_weight` column. With the sweep removed,
  `self_report` becomes an unused log signal: **collapse the response log to graded-only** (drop
  the `self_report` signal type, the `self_report_rating` column, and the self-report branch of the
  mastery fold), and **re-home conflict detection** onto (calibration `known` vs graded
  `incorrect`). The synthetic simulator is non-transferring scaffolding: reshape it to seed
  verdicts + graded answers, or mock it.

## v1 simplifications (avoid over-build)

- The self-assessment is **binary** (`I knew it` / `I forgot`); depth is preserved by the
  evidence-driven restoration suggestion (R13–R14), not a speculative flag.
- Restoration carries **no ranking or thresholds**; struggle = latest graded `incorrect`.
- Reset ships **per-node + per-learner**; per-goal is deferred (R17).

## Success criteria

- Picking the economics root goal *Surplus Produce of Labour* yields a usable single-node study
  screen — no empty-calibration message, no premature "Goal reached" surprise.
- Self-assessing a few high nodes "I knew it" visibly collapses the graph to a smaller study gap,
  deterministically and reversibly; clearing a verdict restores the cone.
- A graded miss on a gap node surfaces its pruned prerequisites as restoration suggestions; acting
  on one returns that prerequisite to the gap.
- The deterministic prune down-closure, the explicit mastery composition, and the
  restoration-suggestion mapping are covered by unit tests over a fixture DAG, per AGENTS rule 11
  (deterministic envelope, not neural output).
- No remaining references to the retired sweep / weighted propagation / `evidence_weight` /
  `self_report` signal (grep-clean).

## Resolved in planning

- **Mastery storage of a hard-prune.** Calibration is a **mutable verdict store** (overwrite /
  delete), separate from the append-only response log. The down-closure is **derived** at read
  time (a pure function), not materialized. No evidence weights survive; the response log
  simplifies to graded-only, and conflict detection is re-homed onto verdict-vs-graded (R10, R18).
- **Goal search scope in Admin Lab.** **Within the selected enrichment** for v1.
- **"Worth exploring" vs propagation.** Dropped; replaced by the evidence-driven restoration
  suggestion (R13–R14) plus per-node reversibility.

## Dependencies / assumptions

- The existing per-node `self_assessment` study items remain the calibration surface (verified:
  full 59/59 coverage on the economics enrichment).
- The Derived Graph Layer's `inferred-prerequisite-of` edges (certain only) are the prune /
  closure / suggestion substrate.
- The transfer-ready presentation contract (`apps/admin-lab/src/components/study/studyView.ts`)
  continues to own shared types so a future Learner app reuses calibration unchanged (AGENTS rule 18).
- Quality is verified by real-source inspection on the economics + a deep-narrow (Rust) cone per
  the real-use-quality-evaluation skill, not by a green suite alone.

## Decisions & rationale (journey)

- **Dissolve calibration into the loop** rather than polish a separate gate. A separate sweep
  optimizes "adapted from the start" at the cost of friction, weak signal, and the degenerate
  empty-set cases observed.
- **Binary search dropped** — it only auto-selects probe order when the *system* hunts for the
  learner's level. Explicit learner self-assessment removes the hunt.
- **Soft / weighted pruning dropped** — weights existed only to absorb the non-determinism of
  *guessing on auto-graded `option_select`*. An explicit self-assessment is a deliberate claim, so
  a **hard, deterministic, weightless prune** is justified and far cheaper to test and maintain.
- **Mutable verdict over append-and-fold** — reusing the append-only log would inherit a silent
  "graded outranks self-report" precedence and an awkward reset (accreting correction rows). A
  mutable verdict is more explicit, trivially reversible (delete), and resettable — and splits two
  different natures cleanly: calibration is *current intent*, graded study is *historical evidence*.
- **No silent precedence** — graded answers silently overriding a self-assessment lowers trust and
  produces confusing results; mastery composition stays explicit, and conflicts are surfaced.
- **Binary + restoration over three-way** — "worth exploring" was a speculative forward-looking
  flag. The restoration suggestion preserves depth on a *real* signal: only when a downstream node
  the learner is actually studying reveals that a skip was optimistic.

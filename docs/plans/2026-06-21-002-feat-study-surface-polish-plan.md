---
title: "feat: Study surface polish + calibration propagation trust fix"
type: feat
date: 2026-06-21
origin: docs/brainstorms/2026-06-21-study-surface-polish-and-typed-study-items-requirements.md
---

# feat: Study surface polish + calibration propagation trust fix

## Summary

Make the just-shipped study surface legible and uninterrupted, and align "I know it"
calibration propagation with the router's trust model. Four study-surface fixes —
contrast for collided node fills, a clear button-vs-tag register, a frontier-zoomed
graph, and auto-advance after an answer — plus one calibration-logic fix that stops
positive recall from seeding mastery across edges the router distrusts. Calibration
re-save and the rest of the calibration model are handled in a separate rework and
are out of scope here.

---

## Problem Frame

The learner-calibrated study loop runs end-to-end and the 2026-06-21 rule-14 pass
classified the skip-ahead proof `PASS`, while recording defects to fix before
building further. The study surface has real legibility and interaction friction:
enrichment and locked nodes collide with the near-white canvas (their fills are the
same `oklch(0.97)` token), buttons are indistinguishable from tags, the graph frames
the whole DAG instead of the learner's working region, and answering a card drops the
learner out of flow. Separately, calibration propagation walks every prerequisite
edge while readiness trusts only certain edges, so on a subgraph with uncertain-edge
cycles an "I know it" over-seeds the whole connected component (the recorded rule-14
defect).

This plan is the lighter of the brainstorm's two plans. The typed Study Item model is
Plan 2. Calibration re-save / latest-wins is being reworked separately; only the
uncertain-edge propagation defect is fixed here.

---

## High-Level Technical Design

The trickiest behavior is the answer → advance → recenter flow, which crosses the
client driver, a server action, and the re-folding page render. It must keep the side
sheet open and retarget it to the newly-advanced frontier without breaking the pinned
ELK layout. Directional sequence:

```mermaid
sequenceDiagram
  participant L as Learner
  participant C as StudySession (client)
  participant A as selfAssessCard (server action)
  participant P as Study page (server re-render)
  L->>C: Answer the frontier card
  C->>C: setPendingAdvance(true); keep sheet open
  C->>A: selfAssessCard(cardId, outcome)
  A->>A: append graded(self) row — learner state only
  A->>P: revalidatePath(session)
  P->>P: re-fold mastery, re-classify (frontier advances)
  P-->>C: fresh session prop (new selectedFrontierTarget)
  C->>C: effect (pendingAdvance + new target): retarget sheet,<br/>recenter viewport on target's 1-hop neighborhood
  Note over C: target == null → close sheet, show "goal reached"
```

The recenter is viewport-only and keyed on the classification's frontier target (a
prop), so it fires on a *frontier advance*, never on the neutral↔adapted toggle —
preserving the one-time-ELK / restyle-only blink-compare invariant from the prior plan.

---

## Requirements

Carried from the origin brainstorm with R-IDs preserved for traceability
(see origin). R5 and R7-R14 are out of scope (see Scope Boundaries).

**Study surface: visibility & interaction**

- R1. Node fills that currently collide with the near-white canvas — enrichment
  (`--secondary`) and locked (`--muted`) — render with enough contrast to be legible;
  every node state is distinguishable against the canvas and from each other.
- R2. Interactive controls (buttons) are visually distinct from non-interactive tags
  (badges) so a learner can tell what is clickable, including the neutral/adapted graph
  control.
- R3. The study graph opens zoomed and centered on the frontier target's immediate
  neighborhood (about five nodes visible) rather than fit to the whole DAG; pan and
  zoom still reach the rest of the graph, and the view recenters as the frontier
  advances.
- R4. After a study item is answered, the next frontier item opens automatically in the
  same view so studying is uninterrupted.

**Calibration correctness**

- R6. Calibration propagation excludes `uncertain` edges and terminates on cycles, so an
  "I know it" rating seeds only prerequisites the router trusts and cannot credit an
  entire connected component through distrusted edges.

**Guards**

- R15. All behavior is read and projection over the authoritative graph and the Derived
  Graph Layer; neither is mutated, and generated content stays honestly labeled.
- R16. No population difficulty calibration (IRT / KT / Bradley-Terry); intrinsic
  difficulty stays `EXPERIMENT_ONLY`.

---

## Key Technical Decisions

- KTD1 — One source of truth for node-state fills, recolor not token-mutation. Define
  the node-state → CSS-variable mapping in a single pure module consumed by both the
  Cytoscape style and the legend swatches (AGENTS rule 18). Add dedicated graph tokens
  (`--graph-locked`, `--graph-enrichment`) rather than darkening the shared `--secondary`
  / `--muted` chrome tokens, which would ripple into every badge and button. Locked and
  enrichment get distinct lightness/hue and keep their existing shape/border cue, so
  both read on the canvas and stay distinct from each other and from mastered/frontier.

- KTD2 — Frontier framing is the target's 1-hop closed neighborhood. "About five nodes"
  is derived as the frontier target plus its direct prerequisites and direct dependents
  (a pure, testable helper) — durable across difficulty re-scoring and graph growth, and
  self-sizing per node. The shared ELK layout helper gains an optional focus input and
  fits to that collection with a min-zoom clamp; the neutral enrichment page passes no
  focus and keeps fit-to-all unchanged.

- KTD3 — Recenter is viewport-only and advance-keyed. Re-centering on frontier advance
  is a separate effect keyed on the classification's `selectedFrontierTarget`, never
  re-running ELK and never firing on the neutral↔adapted mode toggle. This preserves the
  pinned-position blink-compare invariant the prior plan established.

- KTD4 — Auto-advance retargets the open sheet from the fresh server prop. On answer,
  keep the sheet open and set a pending-advance flag; when the re-folded session prop
  arrives with a new `selectedFrontierTarget`, an effect retargets the sheet to it and
  recenters. A null target (goal reached) closes the sheet and shows a completion state.
  Mastery stays server-derived; nothing is held client-side (unchanged).

- KTD5 — Interactive controls use the solid/elevated Button register; metadata stays in
  bordered/solid Badge pills. The neutral/adapted segmented control reads unambiguously
  as buttons (pressed state via `aria-pressed`, button hover/active affordance), not as
  tags. Reuse existing `Button`/`Badge` variants; introduce a new variant only if the
  audit shows none fits.

- KTD6 — R6 filters uncertain edges before computing propagation ancestors, mirroring
  `buildReadiness`. The ancestor traversal's existing seen-set provides cycle
  termination. Aligning the calibration *sweep* scoping (`buildCalibrationSet`) with the
  trust model is deferred to the separate calibration rework, since that path is being
  redesigned.

- KTD7 (guard) — The study surface stays read + projection. The two write actions append
  learner-state rows only; no graph-version or enrichment write port is opened (R15). No
  population difficulty calibration is introduced (R16).

---

## Implementation Units

### U1. Legible, single-source node-state fills (R1)

- Goal: Make enrichment and locked nodes legible on the near-white canvas and distinct
  from each other, with one source of truth for node-state colors.
- Requirements: R1
- Dependencies: none
- Files:
  - `apps/admin-lab/src/app/globals.css` — add `--graph-locked` and `--graph-enrichment`
    tokens tuned to read on `--background` and to differ from each other.
  - `apps/admin-lab/src/lib/graphNodeStyles.ts` (new) — pure node-state → token map plus
    its types; the single source consumed by both the canvas style and the legend.
  - `apps/admin-lab/src/lib/graphNodeStyles.test.ts` (new).
  - `apps/admin-lab/src/components/DerivedGraphExplorer.tsx` — source the `locked` and
    `enrichment` fills (style selectors and `LegendSwatch`) from the shared map instead
    of inline `--muted` / `--secondary`.
- Approach: The locked overlay fill and the neutral enrichment node-kind fill both
  currently resolve to `oklch(0.97)`. Replace each with its dedicated token via the
  shared map; keep round-rectangle shape and dashed `llm_grounded` border untouched so
  node-kind and grounding cues survive. Mastered/frontier (chart tokens) move into the
  map unchanged for consistency.
- Patterns to follow: the existing `color(token)` reader and `LegendSwatch` in
  `DerivedGraphExplorer.tsx`; token definitions in `globals.css :root`.
- Test scenarios:
  - The map has an entry for every `AdaptedNodeState` (mastered/frontier/locked) and for
    the enrichment neutral fill.
  - No two map entries resolve to the same token (locked ≠ enrichment; both ≠
    mastered/frontier) — the distinctness guard that prevents the original collision.
  - Legend and canvas read the same token per state (drift guard): the legend's locked
    token equals the style's locked token via the shared source.
  - Test expectation for on-canvas contrast itself: none -- legibility is verified
    visually in the rule-14 pass (U6).
- Verification: enrichment and locked nodes are clearly visible and distinct on the
  study canvas and the neutral enrichment page; the distinctness/parity tests pass.

### U2. Button-vs-tag register on the study surface (R2)

- Goal: A learner can tell at a glance what is clickable; interactive controls look like
  buttons, metadata looks like tags.
- Requirements: R2
- Dependencies: none
- Files:
  - `apps/admin-lab/src/components/DerivedGraphExplorer.tsx` — the neutral/adapted
    segmented control and the count chips in the card header.
  - `apps/admin-lab/src/components/study/StudySession.tsx` — the Calibrate toggle and the
    source-summary chip.
  - `apps/admin-lab/src/components/ui/button.tsx` — only if the audit shows no existing
    variant carries a clear-enough interactive affordance.
- Approach: Audit every study-surface control. Interactive ones use the solid/elevated
  `Button` register with hover + active-press affordance; non-interactive metadata uses
  bordered/solid `Badge` pills. Make the neutral/adapted segmented control read as
  buttons (keep `aria-pressed`, ensure pressed/hover styling is button-like, not
  badge-like). Prefer correct use of existing variants over new ones.
- Patterns to follow: `buttonVariants` and `badgeVariants` registers in
  `apps/admin-lab/src/components/ui/`.
- Test expectation: none -- presentation-only; the button-vs-tag distinction (including
  the neutral/adapted control) is verified visually in the rule-14 pass (U6).
- Verification: in the study view, controls and tags are unambiguous; the segmented
  control reads as buttons.

### U3. Frontier-zoomed graph with advance-recenter (R3)

- Goal: Open zoomed on the frontier target's neighborhood and recenter as the frontier
  advances, without breaking the pinned-layout blink-compare invariant or the neutral
  enrichment page.
- Requirements: R3
- Dependencies: none (pairs with U4)
- Files:
  - `apps/admin-lab/src/lib/derivedGraph.ts` — pure `frontierNeighborhood(targetId,
    edges)` helper (target + direct prerequisites + direct dependents, deduped) and its
    export.
  - `apps/admin-lab/src/lib/derivedGraph.test.ts` (new).
  - `apps/admin-lab/src/lib/cytoscapeElkLayout.ts` — optional focus parameter; when
    present, fit to the focus collection with a min-zoom clamp; when absent, fit-to-all
    (unchanged).
  - `apps/admin-lab/src/components/DerivedGraphExplorer.tsx` — pass the frontier target's
    neighborhood as focus on initial layout; add a viewport-only recenter effect keyed on
    `adapted?.selectedFrontierTarget`.
  - `apps/admin-lab/src/components/LearnerPathExplorer.tsx` — regression check only (it
    calls the shared helper with no focus and must stay fit-to-all).
- Approach: The neighborhood is computed over rendered edges (certain and uncertain,
  since both are drawn) so the visible working region matches the canvas. Initial framing
  happens at the end of the layout pass (focus arg). Subsequent advances recenter via a
  separate effect — viewport pan/zoom only, no `cy.layout()` re-run — so node positions
  stay fixed and the mode toggle never moves the viewport. The recenter effect must guard
  against firing before the one-time ELK pass has positioned nodes (the async layout
  resolves after first paint): skip the recenter until layout is ready, leaving initial
  framing to the focus-fit at the end of the layout pass. A min-zoom clamp keeps a sparse
  (1-2 node) neighborhood from zooming absurdly close.
- Patterns to follow: the one-time layout effect and the restyle-only effect already in
  `DerivedGraphExplorer.tsx`; the `cy.fit(eles, padding)` call in `cytoscapeElkLayout.ts`.
- Test scenarios:
  - `frontierNeighborhood` returns the target plus its direct prerequisites and direct
    dependents, deduped.
  - An isolated node (no edges) returns just itself.
  - Direction-agnostic: both upstream and downstream 1-hop neighbors are included.
  - An uncertain-edge neighbor is included (the canvas renders it, so framing should too).
  - Test expectation for the `cy.fit` / recenter viewport behavior: none -- canvas
    viewport is verified in the rule-14 pass (U6); the existing
    `DerivedGraphExplorer.test.tsx` render must still pass with the focus param.
- Verification: the study graph opens framed on ~5 nodes around the frontier and
  recenters when the frontier advances; the neutral enrichment page is unchanged.

### U4. Uninterrupted advance after an answer (R4)

- Goal: After answering, the next frontier item opens automatically in the same view.
- Requirements: R4 (Covers AE1)
- Dependencies: U3 (the advance recenters on the new target)
- Files:
  - `apps/admin-lab/src/components/study/StudySession.tsx` — pending-advance flag + effect
    that retargets the open sheet to the fresh `selectedFrontierTarget`; goal-reached
    state.
  - `apps/admin-lab/src/components/study/studyView.ts` — pure `nextStudyTarget(classification)`
    helper.
  - `apps/admin-lab/src/components/study/studyView.test.ts` — extend.
- Approach: Replace the current "close the sheet on answer" behavior. On answer, set
  `pendingAdvance` and keep the sheet open; when the re-folded `session` prop arrives, an
  effect reads `nextStudyTarget` and either retargets the sheet to the new frontier
  target (and clears the flag) or, when null, closes the sheet and shows a "goal reached"
  state. The answered node is now mastered; the sheet content for the new target comes
  from the already-loaded `sheetByNode`.
- Patterns to follow: the existing `useTransition` + `revalidatePath` flow and
  `sheetByNode` lookups in `StudySession.tsx`; the pure helpers in `studyView.ts`.
- Test scenarios:
  - `nextStudyTarget` returns `selectedFrontierTarget` when present.
  - `nextStudyTarget` returns null when `selectedFrontierTarget` is null (goal reached).
  - Covers AE1 (flow): a self-assessed "got it" masters the node and auto-opens the next
    frontier card with no manual node click — Test expectation: none for the client-effect
    orchestration (not unit-tested per project convention); the flow is verified in the
    rule-14 pass (U6).
- Verification: answering advances to the next frontier card automatically in the same
  view; reaching the goal closes the sheet cleanly.

### U5. Calibration propagation honors the router's trust model (R6)

- Goal: "I know it" seeds mastery only along certain edges and cannot credit a connected
  component through uncertain-edge cycles.
- Requirements: R6 (Covers AE2)
- Dependencies: none
- Files:
  - `packages/application/src/calibration.ts` — filter uncertain edges before computing
    propagation ancestors in `propagateSelfReport`.
  - `packages/application/src/calibration.test.ts` — extend.
- Approach: In `propagateSelfReport`, compute `prerequisiteAncestors` over
  `layer.prerequisiteEdges.filter((e) => !e.uncertain)`, mirroring `buildReadiness` so the
  edges propagation trusts are exactly the edges the router trusts. The ancestor
  traversal's existing seen-set already terminates on cycles. Do not change
  `buildCalibrationSet` sweep scoping — that alignment belongs to the separate
  calibration rework.
- Patterns to follow: the `excludeUncertain` filter in `adaptivePathProjection.ts`
  (`buildReadiness`) and `selectScopedFrontier` in `studySession.ts`.
- Test scenarios:
  - A "good" rating does not seed an ancestor reachable only through an uncertain edge.
  - A "good" rating still seeds ancestors reachable through certain edges (regression:
    existing positive propagation preserved).
  - Covers AE2: on a subgraph with an uncertain-edge cycle (the recorded SE cycle shape),
    calibrating one node seeds only certain-edge ancestors, terminates, and does not
    credit the goal / whole component through uncertain edges.
  - Defensive: traversal terminates on any residual cycle without duplicating seeds.
  - "again" / "hard" still never propagate (unchanged behavior).
- Verification: the over-seeding case from the rule-14 eval no longer credits the goal
  through uncertain edges; the new and existing calibration tests pass.

### U6. Real-use quality evaluation (AGENTS rule 14)

- Goal: Confirm the study surface is genuinely legible and uninterrupted and that R6
  fixes the recorded over-seeding, before any downstream (Plan 2) work.
- Requirements: R1, R2, R3, R4, R6, R15, R16 (milestone proof)
- Dependencies: U1, U2, U3, U4, U5
- Files:
  - `tmp/2026-06-21-study-surface-polish/` (gitignored scratch) — eval notes and
    screenshots.
  - The PR / plan summary — the required rule-14 evaluation note.
- Approach: Run the study surface on the seeded Rust-ownership SE subgraph (study toward
  "Move"). Inspect as an expert user: every node state legible and distinct; controls vs
  tags unambiguous; the graph opens framed on ~5 nodes and recenters on advance;
  answering auto-opens the next frontier card; goal-reached closes cleanly. Drive a
  calibration "I know it" through `propagateSelfReport` and confirm seeding stays on
  certain edges. Classify PASS / FIX_FIRST / EXPERIMENT_ONLY / BLOCKED and record
  evidence and caveats.
- Test expectation: none -- this unit IS the real-use evaluation; automated tests never
  validate neural/visual output quality (AGENTS rules 11, 14).
- Verification: a recorded rule-14 note with representative evidence; no authoritative
  graph or Derived Graph Layer mutated (R15); no population calibration introduced (R16).

---

## Acceptance Examples

- AE1. (Covers R4) A learner answers the frontier card; that node turns mastered and the
  next frontier card opens automatically in the same view, with no manual node click and
  no drop back to the bare graph. When the goal is reached the sheet closes and a
  completion state shows.
- AE2. (Covers R6; mirrors origin AE3) In a subgraph with an uncertain-edge cycle,
  calibrating one node with "I know it" seeds mastery only along certain edges; the goal
  is not auto-credited through uncertain edges, and propagation terminates.

---

## Scope Boundaries

**Deferred for later**

- Calibration re-save / latest-wins (origin R5) and the broader calibration model —
  handled separately in an upcoming calibration rework. This plan touches calibration
  only for the R6 uncertain-edge propagation fix; aligning `buildCalibrationSet` sweep
  scoping with the trust model is deferred to that rework.
- Plan 2: the typed Study Item model, option-select studying, sibling-conditioned
  generated distractors, the deterministic option-select guard, and evidence-driven
  supported-type computation (origin R7-R14).
- Population difficulty calibration — IRT / KT / Bradley-Terry — data-blocked
  (ADR-0014, ADR-0024); R16.
- Performance-driven / incremental graph growth — remains under the narrowed F3 guard.
- The separate Learner app, spaced-repetition scheduling, real auth, and learner
  accounts.

**Outside this product's identity (for now)**

- The study surface is a consumer of the authoritative graph, never an editor of it.
  Calibration and (later) item generation live in the downstream projection; the
  learner-neutral core graph and the Derived Graph Layer are never mutated by learner
  activity (R15).

---

## Risks & Dependencies

- The ELK layout helper is shared with `LearnerPathExplorer`. The new focus parameter
  must default to fit-to-all so that page is byte-unchanged — regression-check it in U3.
- The blink-compare invariant (pinned ELK positions across the neutral↔adapted toggle)
  must survive U3. Recenter is viewport-only and keyed on the classification target (a
  prop), not on `mode` (local state), so it must not fire on toggle — verify in the
  rule-14 pass.
- R4 advance relies on the server action + `revalidatePath` delivering the fresh session
  prop after the transition. If the prop arrives before the pending-advance flag is read,
  the sheet could linger on the mastered node or flicker; the flag + effect handles the
  ordering, confirmed visually in U6.
- Calibration is being redesigned separately. U5 fixes only the recorded propagation
  defect and avoids building further on the calibration path under redesign.
- The rule-14 pass needs the seeded enrichment (Rust-ownership SE subgraph) with cards
  and a reachable Postgres; the study surface is read-only and makes no LLM calls.

---

## Sources / Research

- Node fills and fit-to-all zoom: `apps/admin-lab/src/components/DerivedGraphExplorer.tsx`
  (node-state style selectors `:150-198`, legend `:312-329`);
  `apps/admin-lab/src/lib/cytoscapeElkLayout.ts:68` (`cy.fit`), shared with
  `apps/admin-lab/src/components/LearnerPathExplorer.tsx:157`.
- Token collision behind R1: `apps/admin-lab/src/app/globals.css` — `--secondary` and
  `--muted` are both `oklch(0.97 0 0)` on a `--background` of `oklch(0.985 0.002 247.84)`.
- Button / badge registers: `apps/admin-lab/src/components/ui/button.tsx`,
  `apps/admin-lab/src/components/ui/badge.tsx`.
- Post-answer drop-out and the advance flow:
  `apps/admin-lab/src/components/study/StudySession.tsx:36-46` (`onAssess` closes the
  sheet); side sheet `apps/admin-lab/src/components/study/StudySideSheet.tsx`; pure
  helpers `apps/admin-lab/src/components/study/studyView.ts`; loader and scoped frontier
  `apps/admin-lab/src/lib/studySession.ts` (`selectScopedFrontier`).
- Calibration propagation and the trust model: `packages/application/src/calibration.ts`
  (`propagateSelfReport:70-90`), `packages/application/src/prerequisiteDag.ts`
  (`prerequisiteAncestors:169-184` — seen-set cycle termination),
  `packages/application/src/adaptivePathProjection.ts` (`buildReadiness:30-49` excludes
  uncertain edges).
- Recorded defect this addresses: `tmp/2026-06-21-study-loop/rule-14-evaluation.md`
  (uncertain-edge over-seeding via cycles).
- Governing decisions: ADR-0025 (Card Bank / Response Log, provenance), ADR-0024
  (intrinsic difficulty; calibration data-blocked), ADR-0019 (Derived Graph Layer),
  ADR-0014 (defer learner modeling).
- Prior plan and origin brainstorm:
  `docs/plans/2026-06-21-001-feat-learner-calibrated-study-loop-plan.md`;
  `docs/brainstorms/2026-06-21-study-surface-polish-and-typed-study-items-requirements.md`.

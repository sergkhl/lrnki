---
date: 2026-06-21
topic: learner-calibrated-study-loop
---

# Learner-calibrated study loop (minimal proof)

## Summary

Build a learner-facing study loop — as reusable modules inside Admin Lab, shaped for later extraction into a separate Learner app — where a learner picks a goal, declares what they already know through a card sweep, then studies only the gap while a prerequisite graph re-shapes (mastered / frontier / locked) as they self-assess each card. It drives the existing recall loop with real responses where the synthetic simulator drives it today.

## Problem Frame

The recall / adaptive-path loop already runs end-to-end across the manifest fixtures, but every response in the system is synthetic — there is no human in the loop and no learner-facing surface. The 2026-06-20 work made a learner's adaptation visible *to an operator* in Admin Lab; it explicitly parked the learner-facing study UI and a real response-capture surface as out of scope.

"Calibrated to their needs" only becomes provable against a contrast. A single learner grinding cards looks like a quiz. The proof is divergence: a learner who declares "I already know X and Y, teach me Z" should visibly skip ahead and be routed only through what they are missing — a different slice of the graph than a learner who knows nothing. The weight of the claim sits entirely in that skip-ahead being real and legible, not in grading accuracy.

## Key Decisions

- **Reuse the existing loop; the UI only adds real responses.** The learner modules write `responseSource`-tagged rows through the same append path the synthetic simulator already uses. The domain core, mastery fold, frontier selection, and Card Bank are unchanged.
- **Build reusable modules in Admin Lab now; defer the separate Learner app.** Prove the module shapes (card, sweep, study sheet, tabbed graph) against the real loop before standing up a second Next.js scaffold. The modules carry no Admin-Lab-only coupling so they transfer unchanged.
- **Initial small extension = already-minted enrichment nodes, no new growth.** The Derived Graph Layer already extends below the document via rescued `source_mentioned` and minted `llm_grounded` prerequisite nodes, and the Card Bank already cards them. Surface and route through those; performance-driven growth is the later incremental phase.
- **Narrow the F3 guard to permit a future measured growth experiment.** Replace the blanket ban in `docs/plans/TODO.md` with:

  > Do not reintroduce F3-style densification: no ungrounded bridge-node/bridge-edge pass, no embedding/clustering gate, and no method-stack-driven graph growth.
  >
  > Performance-driven graph growth may be reconsidered only as a measured, run-scoped experiment. Learner responses may propose candidate missing prerequisites or candidate edge audits, but they must not directly mutate the asserted graph or silently modify an existing Derived Graph Layer. Any accepted mechanism must be versioned, provenance-visible, validated against held-out learner data or inspected real-use runs, and compared against the current ADR-0019 exhaustive same-domain judgment baseline.

- **Self-assessed recall, no judge in the loop.** Calibration writes self-report ratings; studying writes a graded response the learner self-assesses ("got it" / "missed it"). An LLM-graded free-text answer is the later upgrade, not part of this proof.
- **Neutral vs adapted as tabs over one pinned layout.** The two states share identical topology, so a blink-comparison toggle beats side-by-side. The pinned layout is mandatory; the 2026-06-20 side-by-side pair view is removed (rule 18).
- **Anchor the demo on one clean single-domain enrichment.** The skip-ahead reads most clearly on a short, expert-correct chain (the Rust ownership DAG). The mechanism stays domain-general and runs on any manifest enrichment.
- **Track the generated-judge fail-closed hardening separately.** `runGraphEnrichment` should require the cross-family generated judge when minting is enabled (today it silently falls back at `runGraphEnrichment.ts:182`). That fix lands as its own change, outside this UI scope, since the learner modules never run enrichment.

## Requirements

**Goal selection & calibration**

- R1. The learner picks a target derived node ("teach me Z") within one enrichment's Derived Graph Layer.
- R2. The learner calibrates through a focused card sweep — not graph-click-driven — over the target's prerequisite-ancestor cards, hardest-first, marking each "I know it" or "not sure".
- R3. An "I know it" rating propagates down the prerequisite DAG, seeding flagged prior mastery on that node's ancestors so they are not separately asked.
- R4. Calibration writes real self-report responses through the existing append path, tagged by response source so seeded, claimed, and synthetic rows stay distinguishable.

**Study loop & adaptation**

- R5. After calibration the learner studies only the unmet gap: routing advances through frontier nodes and skips declared- or derived-known nodes.
- R6. Studying is self-assessed — the learner reveals a node's card answer and marks "got it" or "missed it", writing a graded response under a self grader identity.
- R7. Each response re-folds mastery and re-selects the frontier so the adapted graph updates immediately.
- R8. Routing reuses the existing mastery fold, frontier selection, and ≈0.7 threshold unchanged; prerequisite edges stay primary and intrinsic difficulty secondary.
- R9. In study mode, clicking a node opens its card in a side sheet that keeps the graph visible; sheet content is gated by node state — a frontier node opens its recall card, a locked node names the unmet prerequisite with no card, a mastered node opens a review.

**Graph comparison view**

- R10. The learner's Derived Graph Layer renders in neutral and adapted (mastered / frontier / locked) states, switchable via tabs or a segmented toggle.
- R11. Both states share one pre-computed layout; switching swaps node styling only and never re-runs graph layout, so node positions stay fixed for blink comparison.
- R12. The tabbed view supersedes the side-by-side neutral/adapted pair, which is removed.
- R13. Node provenance (`document_anchored` / `source_mentioned` / `llm_grounded`) and cardless no-card facts stay visible in both states; a cardless node on the path is flagged, never dropped.
- R14. Each rendered graph retains an equivalent textual node-and-edge listing for non-visual inspection.

**Reusable-module shape**

- R15. The card component, calibration sweep, study side sheet, and tabbed graph view are built as transfer-ready modules with no Admin-Lab-only coupling, so a later Learner app consumes them unchanged.

**Guards**

- R16. The view and loop are read and projection only; neither the published graph nor the Derived Graph Layer is mutated.
- R17. No graph growth, densification, or graph-mutating extension ships this phase; only already-minted enrichment nodes are routed.
- R18. No population difficulty calibration (IRT / KT / Bradley-Terry) and no fitting of any difficulty or learner model on synthetic or self-assessed responses.

## Key Flows

```mermaid
flowchart TB
  A[Pick enrichment, target Z, learner identity] --> B[Card sweep over Z's prerequisite ancestors]
  B --> C{Rated "I know it"?}
  C -->|yes| D[Propagate down-DAG: seed mastery on ancestors]
  C -->|not sure| E[Stays in the gap]
  D --> F[Adapted graph: mastered / frontier / locked]
  E --> F
  F --> G[Study a frontier node's card in the side sheet]
  G --> H[Self-assess: got it / missed it]
  H --> I[Re-fold mastery, advance frontier]
  I --> F
```

- F1. Calibrate, then study a goal
  - **Trigger:** The learner opens the loop and picks an enrichment, a target node Z, and a learner identity.
  - **Steps:** Sweep Z's prerequisite-ancestor cards; "I know it" ratings propagate down the DAG; the adapted graph resolves to mastered / frontier / locked; the learner studies frontier cards through the side sheet, self-assessing each; the graph re-folds after every response.
  - **Outcome:** The learner reaches Z having studied only the gap, and the neutral/adapted tabs show the calibrated slice against the full DAG.
  - **Covered by:** R1–R14

## Acceptance Examples

- AE1. **Covers R3, R5.** A learner who marks a downstream concept "I know it" sees its prerequisite ancestors pre-marked mastered, is not asked about them in the sweep, and the study gap excludes them.
- AE2. **Covers R6, R7.** Marking a frontier card "got it" turns that node mastered and advances the frontier to the next unmet node in the same view.
- AE3. **Covers R10, R11.** Switching from the neutral tab to the adapted tab keeps every node in the same position; only color and state change.
- AE4. **Covers R9, R13.** Clicking a locked node opens a sheet naming the unmet prerequisite and shows no card; a cardless frontier node is flagged in the graph, never omitted.
- AE5. **Covers R4.** A synthetically prefilled learner and a real learner render identically, with each response badged by its source.

## Scope Boundaries

**Deferred for later**

- The separate Learner app — modules are built now for clean extraction.
- Performance-driven / incremental graph growth — reconsidered only under the narrowed F3 guard (measured, run-scoped, versioned, provenance-visible, validated against held-out or real-use data, benchmarked against the ADR-0019 baseline).
- LLM-graded free-text answers — self-assessment is the proof mechanic; judged grading is the upgrade.
- Population difficulty calibration (IRT / KT / Bradley-Terry) — data-blocked until real responses accumulate (ADR-0014, ADR-0024).
- Spaced-repetition scheduling, real auth, and learner accounts.

**Outside this product's identity (for now)**

- The learner surface is a consumer of the authoritative graph, never an editor of it. All calibration and adaptation live in the downstream projection; the learner-neutral core graph and Derived Graph Layer are never mutated by learner activity.

## Dependencies / Assumptions

- The existing learner loop is reused unchanged: `calibration.ts` (self-report sweep, down-DAG propagation, source-agnostic append), `adaptivePathProjection.ts` (frontier selection, ≈0.7 threshold), the mastery fold, the Card Bank, and the append-only Response Log. The UI writes `responseSource`-tagged rows where the synthetic simulator writes synthetic ones.
- A demo enrichment with a clean single-domain prerequisite chain and minted enrichment nodes exists (the Rust ownership DAG). The mechanism is domain-general and runs on any manifest enrichment.
- Learner identity is mocked: a `learnerStateRef` is picked or created, with no accounts or auth.
- Intrinsic difficulty stays at `EXPERIMENT_ONLY` trust; prerequisite edges remain the primary path constraint (ADR-0024).
- The generated-judge fail-closed hardening is a separate change and not a dependency of this UI — the learner modules consume already-minted nodes and never run enrichment.

## Outstanding Questions

**Deferred to Planning**

- Full tabs vs a lighter segmented toggle for neutral/adapted, and where the control sits relative to the study side sheet.
- How the intrinsic difficulty score is encoded on nodes (size, color ramp, or label) so ordering oddities stay legible.
- How a learner starts a session inside the Admin-Lab-hosted modules (placement of the target and identity pickers) given there is no real auth.
- Whether the calibration sweep and study mode are one continuous flow or separately entered.

## Sources / Research

- Calibration and propagation: `packages/application/src/calibration.ts` (`buildCalibrationSet`, `propagateSelfReport`, source-agnostic append).
- Adaptation: `packages/application/src/adaptivePathProjection.ts` (`selectFrontierTarget`, ≈0.7 threshold); mastery fold in `packages/application/src/responseLogLearnerState.ts`.
- Card model: `packages/application/src/generateCardBank.ts`; ADR-0025 (Card Bank / Response Log keyed to derived nodes, grounding provenance).
- Graph renderer to reuse, and side-by-side pair to supersede: `apps/admin-lab/src/components/DerivedGraphExplorer.tsx`; learner page `apps/admin-lab/src/app/admin/lab/learner-loop/[learnerStateRef]/page.tsx` and `apps/admin-lab/src/components/LearnerLoopReview.tsx`.
- Enrichment-node minting and the fail-closed gap (separate change): `packages/application/src/runGraphEnrichment.ts:182`.
- F3 guard to narrow: `docs/plans/TODO.md` task 5.
- Governing decisions: ADR-0019 (Graph Enrichment / Derived Graph Layer), ADR-0024 (intrinsic difficulty; calibration data-blocked), ADR-0014 (defer learner modeling), ADR-0025 (Card Bank), CONTEXT.md (the asserted layer has no edges).
- Prior brainstorm this extends: `docs/brainstorms/2026-06-20-adapted-graph-view-and-difficulty-eval-requirements.md`.
</content>
</invoke>

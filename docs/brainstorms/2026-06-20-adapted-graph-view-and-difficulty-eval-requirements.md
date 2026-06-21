---
date: 2026-06-20
topic: adapted-graph-view-and-difficulty-eval
---

# Adapted-graph comparison view + difficulty-ordering evaluation

## Summary

Add an Admin Lab view that shows a learner's Derived Graph Layer in two states side by side — neutral and learner-adapted (mastered / frontier / locked), driven by real or synthetic responses — and run a difficulty-ordering evaluation of `intrinsic-fused-v1` across the full manifest. The view makes per-learner adaptation visible; the evaluation establishes where intrinsic difficulty ordering is plausible and where it distorts, feeding a separately-scoped difficulty fix. Population difficulty calibration stays deferred until the study Game UI exists.

## Problem Frame

The recall/adaptive-path loop runs end-to-end across all manifest fixtures at `EXPERIMENT_ONLY` trust, but a learner's adaptation is currently invisible: it surfaces only as a projected path list and a card-coverage table in `LearnerLoopReview`. There is no way to *see* how a learner's responses reshape the graph — which nodes are mastered, which is the working frontier, what is still locked behind unmet prerequisites.

The tempting next step is learner-calibrated (population) difficulty — IRT / Bradley-Terry / KT. It is data-blocked: the product collects no real learner responses yet (ADR-0024, ADR-0014). Fitting it on the synthetic simulator would be circular — the simulator generates correctness from the very difficulty the fit would "recover" — and would violate AGENTS rules 11/13/14 (fabricated responses asserted as quality evidence). The durable move is instead to make the existing adaptation legible and to inspect the difficulty signal that already orders paths, so real defects are found before any model is fit on real data later.

## Key Decisions

- **Defer population difficulty calibration to the Game UI.** IRT / Bradley-Terry / KT is introduced only when the Domain-Agnostic study Game UI exists and per-learner calibration is stable. No cross-learner difficulty fitting before then.
- **"Neutral graph" means the Derived Graph Layer, not the asserted graph.** The published asserted layer has zero edges, so it cannot be ordered or adapted. All adaptation has meaning only over the derived prerequisite DAG, scoped to one enrichment (ADR-0025).
- **Synthetic data is valid for the mechanism, not for model fitting.** Synthetic responses legitimately exercise the deterministic projection, fold, and overlay, and the response-append path is already source-agnostic so real answers swap in later. They are not a basis for claiming a fitted difficulty/learner model is accurate.
- **Difficulty is evaluation-only this task.** Produce a rule-14 read of ordering quality. Scoring-formula changes, fusion-weight tuning, and neural-rationale persistence all move to a separately-scoped follow-up, triggered once the review UI makes the defects visible.
- **Extend the per-learner page and reuse one renderer.** The view lives on `apps/admin-lab/src/app/admin/lab/learner-loop/[learnerStateRef]`, reusing `DerivedGraphExplorer` with learner state as an optional overlay input. No new nav page; the enrichment graph page stays learner-agnostic.

## Requirements

**Adapted-graph comparison view**

- R1. The per-learner review page renders the enrichment's Derived Graph Layer in two states — neutral and learner-adapted — scoped to one learner and one enrichment.
- R2. The adapted overlay classifies each derived node by learner state: mastered, frontier (ready and unmastered), and locked (a direct prerequisite unmastered), using the existing mastery fold and frontier selection at the existing threshold (≈0.7).
- R3. The view behaves identically for real and synthetic responses and shows each response's source, so seeded rows stay distinguishable from real ones.
- R4. The neutral and adapted panels reuse the single existing `DerivedGraphExplorer` renderer with learner state as an optional overlay input; no second graph renderer is introduced.
- R5. Each rendered graph retains an equivalent textual node-and-edge listing for non-visual inspection.
- R6. Node provenance (`document_anchored` / `source_mentioned` / `llm_grounded`) and cardless no-card facts stay visible in both panels; a cardless node on the path is rendered and flagged, never silently dropped.
- R7. The view surfaces each node's persisted intrinsic difficulty score as a visual signal so an operator can spot ordering defects; the neural rationale is not shown (deferred with the difficulty follow-up).

**Difficulty-ordering evaluation (analysis only)**

- R8. Produce a rule-14 evaluation of `intrinsic-fused-v1` ordering across the full current manifest (all domains), not only the 3-domain 2026-06-18 set, saved under `tmp/`.
- R9. The evaluation checks whether the broad / evidence-thin over-scoring defect (e.g. `source_mentioned` `Algorithms` neural 0.78, `Natural Language Processing` neural 0.65) is systemic, with concrete per-domain foundational→advanced ordering examples and a `PASS` / `FIX_FIRST` / `EXPERIMENT_ONLY` / `BLOCKED` classification.
- R10. No scoring-formula, fusion-weight, component-shape, or rationale-persistence code change ships in this task; the evaluation only classifies quality and feeds the deferred follow-up.

**Guards**

- R11. No population difficulty calibration (IRT / Bradley-Terry / KT) and no fitting of any difficulty or learner model on synthetic responses.
- R12. The view is read and projection only; it never mutates the published asserted graph or the Derived Graph Layer.

## Key Flows

- F1. Operator reviews one learner's adaptation
  - **Trigger:** Operator opens a learner on `/admin/lab/learner-loop/[learnerStateRef]`.
  - **Steps:** The page renders the neutral Derived Graph Layer and the adapted overlay; the operator reads which nodes are mastered, which is the frontier, and what is locked, then cross-references the responses, conflicts, and card-coverage already on the page.
  - **Outcome:** The operator can judge whether the adaptation tracks the learner's responses, and can spot difficulty-ordering oddities via the difficulty signal on nodes.
  - **Covered by:** R1, R2, R3, R6, R7

## Acceptance Examples

- AE1. **Covers R2.** Given a learner with no responses, the adapted panel matches the neutral panel: every node unmastered, the frontier sitting at the prerequisite roots.
- AE2. **Covers R2.** Given a learner who has mastered a node's direct prerequisites, that node renders as frontier, its prerequisites render as mastered, and nodes still depending on unmastered prerequisites render as locked.
- AE3. **Covers R3.** Given a synthetically prefilled learner, the overlay renders the same as for a real learner and the responses are badged as synthetic.
- AE4. **Covers R6.** Given a cardless derived node on the path, it still appears in the graph flagged as a no-card fact, not omitted.

## Scope Boundaries

**Deferred for later (own scope)**
- Difficulty scoring-formula fixes (broad/thin over-scoring), fusion-weight tuning, and neural-rationale persistence — triggered once this view surfaces the defects.
- Population difficulty calibration (IRT / Bradley-Terry / KT), once the Game UI and stable per-learner calibration exist.

**Outside this product's identity (for now)**
- The learner-facing Domain-Agnostic study Game UI itself.
- A real (non-synthetic) learner response-capture surface.

## Dependencies / Assumptions

- The mastery fold, `selectFrontierTarget`, and the ≈0.7 threshold are reused unchanged as the source of the overlay's node classification.
- `getLearnerLoopDetail` already resolves the learner's enrichment scope, paths, and coverage; the graph panel consumes that same enrichment's Derived Graph Layer.
- Intrinsic difficulty stays at `EXPERIMENT_ONLY` trust; prerequisite edges remain the primary path constraint, difficulty secondary (ADR-0024).
- The synthetic simulator stays behind its port; nothing here is redundant to delete.

## Outstanding Questions

**Deferred to Planning**
- Neutral and adapted as two side-by-side canvases vs one canvas with a neutral/adapted toggle.
- How the intrinsic difficulty score is encoded on nodes (size, color ramp, or label) so ordering defects are legible without the rationale.
- Whether `learnerStateRef` ever spans more than one enrichment in practice, and if so how the graph panel selects which enrichment to render.

## Sources / Research

- Difficulty method: `packages/application/src/intrinsicDifficulty.ts` (`intrinsic-fused-v1`, `0.55·neural + 0.45·structural`, numeric components only).
- Prior difficulty rule-14 read (3 domains, broadly plausible, over-scoring defect noted): `tmp/2026-06-18-intrinsic-difficulty/rule-14-evaluation.md`.
- Adaptation logic: `packages/application/src/adaptivePathProjection.ts` (`selectFrontierTarget`, mastery threshold), `packages/application/src/calibration.ts` (source-agnostic append, self-report sweep + down-DAG propagation).
- Graph renderer to reuse: `apps/admin-lab/src/components/DerivedGraphExplorer.tsx` (learner-agnostic, textual fallback).
- Page to extend: `apps/admin-lab/src/app/admin/lab/learner-loop/[learnerStateRef]/page.tsx`, `apps/admin-lab/src/components/LearnerLoopReview.tsx`.
- Governing decisions: ADR-0024 (intrinsic difficulty now, calibration data-blocked), ADR-0014 (defer learner modeling), ADR-0025 (Card Bank / Response Log keyed to derived nodes, enrichment-scoped learner history), CONTEXT.md (asserted layer has no edges).

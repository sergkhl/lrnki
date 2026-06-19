---
date: 2026-06-19
topic: learner-recall-adaptive-path
---

# Learner Recall Loop and Adaptive Path

## Summary

Build a downstream learner-adaptivity loop on top of the published graph: a per-Concept anki-style Card Bank, an append-only Response Log, a thin swappable mastery estimator behind the existing `LearnerStatePort`, and a frontier-advancing path projection. Learners cold-start with a fast self-report calibration sweep, then ongoing free-form Q&A graded by an LLM judge refines mastery. Synthetic prefilled answers seed both modes for pre-launch inspection, and Admin Lab lets a human review, edit, and resubmit them.

## Problem Frame

The architecture already deferred personalization through a clean seam: `LearnerStatePort` (`packages/ports/src/index.ts:269`) exposes `mastery(conceptId) → [0,1]`, and `projectLearnerPath` (`packages/application/src/learnerPathProjection.ts:14`) already consumes it — pruning mastered concepts, topo-ordering survivors by prerequisite structure, and breaking ties by intrinsic difficulty. Today that port is mocked to "knows nothing."

ADR-0014, ADR-0024, and `docs/plans/TODO.md` #2 all defer IRT/KT/Bradley-Terry for the same reason: **no learner interaction data exists yet.** IRT and BKT are estimators that fit over a response history; with zero responses, any prior is invented precision. The missing piece is therefore not the algorithm but the **data surface** — the recall-measurement loop that produces responses. This brainstorm builds that surface and the minimal adaptivity it unlocks, keeping the real estimator as a later port implementation so the project's "don't add a model from method-stack preference" discipline holds.

## Key Decisions

**Four layers, one irreversible commitment.** The feature is four downstream layers: (1) Card Bank — learner-neutral, (2) Response Log — learner-specific and append-only, (3) Mastery Estimator — the swappable `LearnerStatePort`, (4) Adaptive Projection — reuses the existing projection. Only the Response Log is an irreversible decision; everything above it is cheap to replace. IRT (per-item difficulty/discrimination) and BKT (per-skill learn/slip/guess) are both fits over the same response history, so the log must record enough fidelity to backfit either without re-collecting answers.

**Thin honest estimator now; real IRT/KT later behind the same port.** This milestone ships a deliberately simple mastery update labeled `EXPERIMENT_ONLY`, mirroring how ADR-0024 treated intrinsic difficulty. A real learner-response model swaps in later as a `LearnerStatePort` implementation reading the same log; the projection upstream never changes.

**Two recall modes, one log.** Self-report calibration (anki-style confidence: again/hard/good/easy) seeds a cheap prior; ongoing free-form Q&A graded by an LLM judge produces demonstrated observations. Both append to the single Response Log tagged with a signal type and an evidence-strength weight. Graded evidence beats self-report on conflict; recency selects the active prior per concept.

**Self-report optimistically prunes; graded evidence can re-open.** Trusting self-report for a fast initial path means the path may skip a concept the learner only claims to recall. A later graded miss on a skipped concept re-surfaces it, because the estimator ranks demonstrated over believed mastery. This is the accepted trade for cold-start speed.

**Calibration is DAG-frontier seeded and scoped to the target's ancestors.** The calibration set is the prerequisite ancestors of the learner's chosen target, not the whole graph. The sweep asks about downstream/high-difficulty concepts first and propagates "I know X" down to X's prerequisite ancestors (R8), so calibration cost tracks the goal the learner picked rather than graph size. Its one risk — a wrong "known" claim skipping a real prerequisite — is already covered by optimistic-pruning re-opening on a graded miss.

**Calibration is just the first batch of self-report responses.** "Initial learner setup" is not a structurally special one-time path — it is calibration batch #1. Re-calibration is another appended batch. One store, one estimator, one code path (AGENTS rule 18).

**Cards are a learner-neutral shared deck.** A card is generated per Concept from its CEP, like a grounding bundle: the question and answer key are non-verbatim but the answer key cites CEP passages. One deck serves every learner, so cards live alongside the Derived Graph Layer, never inside the asserted core.

**The whole layer is projection-only.** Nothing here mutates the asserted graph or the Derived Graph Layer. Learner state is never stored in the learner-neutral core (CONTEXT.md). Admin Lab edits learner state only, never a published graph (AGENTS rule 12).

### The loop and its source-of-truth fan-out

```
Published Graph Version ──► Graph Enrichment ──► Derived Graph Layer
                                                  (anchors + edges + difficulty)
                                                        │
                      ┌─────────────────────────────────┤ (learner-neutral)
                      ▼                                  ▼
                 Card Bank  ◄──── CEP evidence     Adaptive Projection ──► Learner Path
              (per-Concept Q&A)                          ▲
                      │                                  │ mastery(conceptId)
                      ▼                                  │
          ┌── self-report (calibration) ──┐     Mastery Estimator  (LearnerStatePort)
          │                               │             ▲
          ▼                               ▼             │ folds log (graded > self-report, recency)
   Synthetic / human answers ──► Response Log ──────────┘
        (Admin Lab review)        (append-only, IRT/BKT-fittable)
```

## Requirements

**Card Bank (learner-neutral)**

R1. Generate one or more anki-style Q&A cards per published Concept, conditioned on that Concept's CEP, via a forced named tool schema routed through LiteLLM (AGENTS rules 5, 6).

R2. Each card carries a question, a graded-answer key, and a self-report prompt, with the answer key citing the CEP passages it derives from for traceability.

R3. The Card Bank is a learner-neutral derived asset keyed to a graph version / enrichment, regenerable without affecting learner state, and never written into the asserted graph or Derived Graph Layer.

**Response Log (the durable commitment)**

R4. Persist every recall attempt as an immutable append-only row capturing: card (item), concept (skill), signal type (`self_report` | `graded`), the self-report confidence or the judged outcome plus graded score, evidence-strength weight, response source (`synthetic` | `human`), grader identity, and attempt order/timestamp.

R5. The log is never mutated or deleted by any operation, including re-calibration; corrections and resubmissions append new rows.

R6. The log's fidelity must be sufficient to fit a per-item IRT model and a per-skill BKT model later without re-collecting responses.

**Recall modes**

R7. Calibration mode presents a self-report sweep over a calibration set scoped to the chosen target's prerequisite ancestors; the learner rates recall confidence per concept, producing `self_report` rows at lower evidence weight.

R8. Calibration may propagate self-reported mastery across the prerequisite DAG so a learner who reports knowing a downstream concept seeds prior mastery on its prerequisite ancestors, reducing questions asked.

R9. Measurement mode presents free-form questions; the learner's written answer is graded correct/partial/incorrect against the card's answer key by a forced-tool LLM judge, producing `graded` rows at higher evidence weight.

R10. Re-calibration is allowed at any time and is recorded as an appended self-report batch; it never resets or outranks existing graded evidence.

**Mastery estimator and adaptive path**

R11. A mastery estimator folds the Response Log into `mastery(conceptId) → [0,1]` behind the existing `LearnerStatePort`, ranking graded over self-report on conflict and selecting the active self-report prior by recency.

R12. The initial estimator is deliberately simple and carried at `EXPERIMENT_ONLY` trust; it must not present learner-calibrated precision (no IRT/BKT/Bradley-Terry in this milestone).

R13. The path projection consumes the estimator unchanged to skip mastered concepts, and advances the target to the hardest *ready* unmastered concept so the learner is pushed toward harder material.

**Synthetic prefill and Admin Lab review**

R14. A synthetic-answer generator produces prefilled responses for both modes — simulated self-ratings and simulated written answers with their judge grades — written into the Response Log tagged `synthetic`.

R15. Admin Lab exposes a learner-loop surface to inspect cards, review synthetic answers, edit and resubmit them, and re-run mastery and projection — mutating learner state only, never a published graph.

R16. Admin Lab surfaces self-report↔graded conflicts (claimed-known but failed graded, or the reverse) as a deliberate calibration signal.

## Acceptance Examples

AE1. **Covers R10, R11.** A learner fails the graded question on Concept X, then re-calibrates and rates X "good." The path still includes X, because graded evidence outranks the later self-report.

AE2. **Covers R7, R13.** A learner self-reports high confidence across a calibration set with no graded rows yet. The initial path prunes those concepts and targets the hardest ready unmastered concept downstream.

AE3. **Covers R8.** A learner reports knowing a downstream concept. Calibration seeds prior mastery on its prerequisite ancestors without asking about each one individually.

AE4. **Covers R4, R9.** A free-form answer judged "partial" appends a graded row carrying the partial score and grader identity, distinct from a binary correct/incorrect row.

AE5. **Covers R14, R15.** A synthetic written answer is graded incorrect; an operator edits the answer in Admin Lab and resubmits; a new graded row appends and the recomputed path reflects it, with the original synthetic row left intact.

## Success Criteria

- A rule-14 real-use run on an existing mixed-domain graph version produces an inspectable end-to-end loop: cards → synthetic answers → log → mastery → adapted path, judged against the SKILL's PASS/FIX_FIRST/EXPERIMENT_ONLY/BLOCKED scale.
- The adapted path visibly differs from the mock "knows nothing" path: mastered concepts are skipped and the target advances to harder ready concepts.
- The Response Log, on inspection, holds the fields an IRT and a BKT fit would each require, with no destructive overwrite across a re-calibration.
- Mastery and difficulty are presented as `EXPERIMENT_ONLY` secondary signals, with provenance (self-report vs graded, synthetic vs human) legible in Admin Lab.

## Scope Boundaries

- **Deferred for later:** real IRT (2PL) / BKT / Bradley-Terry estimators, synthetic IRT priors, anomaly detection, and any forgetting-curve/spaced-repetition scheduling — unblocked only once the log holds real responses and a measured run shows the estimator beats the thin one (ADR-0014, ADR-0024, TODO #2).
- **Deferred for later:** real human learners and any auth/identity for them — synthetic answers plus Admin Lab review are the only response sources this milestone.
- **Outside this layer's identity:** any mutation of the asserted graph or Derived Graph Layer; learner state stays a projection input and never feeds back into the learner-neutral core.

## Dependencies / Assumptions

- Assumes a published graph version with a Derived Graph Layer (anchors, `inferred-prerequisite-of` edges, intrinsic difficulty) already exists to project from — present today.
- Assumes the CEP carries enough definition/mention evidence to ground a usable answer key; thin CEPs (the open `docs/plans/TODO.md` #1 definition-precision caveat) may yield weak cards and should be noted, not patched per-fixture (AGENTS rule 17).
- Card generation and the grading judge inherit standard neural-quality caveats; quality is established by rule-14 inspection, never by a green test suite (AGENTS rule 11).

## Outstanding Questions

**Deferred to planning**

- The exact evidence-strength weighting and recency/decay shape for folding the log into mastery (a thin starting rule is sufficient for this milestone; tuning is not).
- Whether one card or several per Concept, and whether graded cards and self-report cards are the same card in two modes or distinct items in the bank.
- Whether frontier target-advancement is a new projection entry point or a parameterization of the existing one.

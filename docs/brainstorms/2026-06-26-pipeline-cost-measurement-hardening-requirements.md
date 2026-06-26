---
title: "Trustworthy, complete pipeline-cost measurement + ranked reduction targets"
date: 2026-06-26
topic: pipeline-cost-measurement-hardening
type: feat
status: ready
---

# Trustworthy, complete pipeline-cost measurement + ranked reduction targets

## Summary

The per-journey cost rollup shipped (see `docs/brainstorms/2026-06-25-per-journey-pipeline-cost-requirements.md`,
completed), and both the worker CLI and the Admin Lab view report a journey's whole-pipeline cost.
But the lens has two defects that block the optimization pass that prior doc deferred: per-stage
attribution inside enrichment does not join (wall-clock and cost key to different stage names), and
the rollup is structurally incomplete because study-item / Learner-Study-Loop generation was never
run for the measured journeys, so its cost is unknown.

This work hardens and completes the measurement, then hands the deferred rule-21 optimization pass a
ranked list of cost and time targets grounded in one clean, complete baseline journey. It changes no
prompts and ships no cuts.

---

## Problem Frame

The deferred optimization was explicitly gated on "the rollup's evidence and a rule-21
best-practices pass" (prior doc KD4). We now have evidence — and acting on it would mean optimizing
against a lens that is partly blind and partly mis-attributed.

The real journey `c2e28622-7e9e-4ccf-8fb2-a6b233e906b5`, read live via the worker
`journey-cost-report`, totals **774.1s (~12.9 min)**, **$0.0465**, 169 calls, 444k tokens. Two gaps
sit on top of that number:

1. **Per-stage enrichment attribution does not join.** The reporter brackets one *coarse* composite
   stage `rescue-mint` (`packages/application/src/runGraphEnrichment.ts:214`) whose internal LLM
   calls are tagged with four *finer* stage names (`missing-prerequisite-proposal`,
   `grounding-generation`, `rescue-durability`, `minting-durability`). So the rollup shows
   `rescue-mint` = 151.7s wall with **no cost**, and those four stages with cost but **no wall**.
   That is the second-largest time sink in the journey, and it is currently unreadable at stage
   level. Operation-level totals stay correct (the sum is invariant to stage slicing); stage-level
   time is not.

2. **Incomplete rollup.** Study-item / Learner-Study-Loop generation is a first-class instrumented
   operation (`study_items` operation type, `operation_id` tag, `studyItemGeneration` stage;
   `packages/application/src/generateStudyItemBank.ts`), but it was never run for the measured
   journeys, so the rollup lists only three of four operations and study-item cost is **unmeasured**.
   It is per-node generation and could be a material share of the journey.

Until these are fixed, any ranked target list is provisional.

---

## Key Decisions

- KD1. **Measurement-hardening only; the cuts stay the next rule-21 pass.** Consistent with prior
  doc KD4, AGENTS rule 21, and [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md):
  the deliverable that hands off to the optimization pass is a ranked target list grounded in one
  clean complete journey, not a prompt or payload change.

- KD2. **One stage vocabulary across both halves of the join in enrichment.** Per-stage wall-clock
  and per-stage cost must key to the same stage names so every stage's time and cost line up. The
  finer granularity is preferred — `ENRICHMENT_STAGES` in `bottleneckReport.ts:179-188` already
  lists the four fine names and omits `rescue-mint`, so the cost side was built expecting fine
  stages. Mechanism (bracket the sub-stages vs re-tag the calls) is planning's call; the outcome is
  that no enrichment stage shows time without its cost or cost without its time.

- KD3. **A "complete journey" terminates at `study_items`.** "Loops generation" is study-item
  generation ([ADR-0026](../adr/0026-define-study-item-bank-and-learner-response-identity.md): the
  Learner Study Loop is populated by the Study Item Bank). The learner loop's runtime
  answer-grading cost is keyed by learner state, not journey lineage, so it is downstream of and
  outside the journey rollup. Complete = extraction → minting → enrichment → study_items, all four
  present in one journey.

- KD4. **One clean baseline journey is the handoff artifact.** Run one representative real source
  end-to-end through study-item generation so the rollup includes all four operations from a single
  coherent run. That recorded baseline is what the optimization pass measures its before/after
  against.

---

## Requirements

### Trustworthy attribution

- R1. In enrichment, per-stage wall-clock and per-stage cost share one stage vocabulary: when a
  stage incurs both, both appear under the same stage name and sum consistently. No stage shows
  150s of wall with zero cost (or cost with no wall) when both exist.

### Completeness

- R2. A complete-journey rollup includes all four operations (extraction, minting, enrichment,
  study_items) from one pipeline run, with the `study_items` operation showing non-null wall-clock
  and cost.
- R3. One representative real source is run end-to-end through study-item generation to produce that
  complete baseline journey, and the baseline is recorded for the optimization pass.

### Ranked target list (the deliverable)

- R4. From the complete baseline, produce a ranked list of cost targets and time targets, each as
  an (operation, stage) pair with its share of the journey total and the measured driver (calls,
  tokens, wall-clock). The list is domain-neutral and names targets only; it changes no prompt.

---

## Acceptance Examples

- AE1. Enrichment rescue path joins.
  - **Covers R1.** A journey whose enrichment ran the rescue/mint path.
  - **Given** the report renders, **then** the time spent rescuing and minting and its LLM cost
    appear under the same stage name(s), and there is no `rescue-mint` row showing ~150s of wall
    with zero cost.

- AE2. Complete journey.
  - **Covers R2, R3.** **Given** a freshly run source taken through `generate-study-items`, **when**
    the journey report runs, **then** it lists four operations and the `study_items` operation shows
    non-null wall-clock and cost.

- AE3. Ranked list.
  - **Covers R4.** **Given** the complete baseline, **then** the stages rank by cost share and by
    wall-clock share, making the top cost target and the top time targets explicit and ordered.

---

## Provisional findings (pre-completion, from journey `c2e28622`)

These are the current numbers minus the unmeasured `study_items` operation; the ranked list is
final only after R3. Recorded here as the starting evidence for the optimization pass.

- **Cost (total $0.0465):** extraction dominates at $0.0352 (76%). Within it, **admission =
  $0.0200 — 43% of the entire journey** (135k tokens / 9 calls), confirming the long-suspected
  whole-document re-send per candidate batch. Then `cep-extraction` $0.0078, enrichment's
  `prerequisite-ordering` $0.0071, `assertion-entailment` $0.0035.
- **Time (total 774.1s):** enrichment dominates at 441.8s (57%). Largest stages:
  `prerequisite-ordering` 192.3s, `admission` 172.1s, `rescue-mint` 151.7s, `intrinsic-difficulty`
  88.5s.
- Leading cost target: **admission payload**. Leading time targets: **prerequisite-ordering,
  admission, rescue-mint**. All deferred to the rule-21 pass per KD1.

---

## Scope Boundaries

### Deferred for later

- The actual cuts — admission payload scoping, prerequisite-ordering / rescue-mint latency,
  study-item cost reduction. Each gets its own rule-21 root-cause pass, gated on this baseline.
- Learner-loop *runtime* cost measurement (per-interaction answer grading). Keyed by learner state,
  not journey lineage; a separate effort if wanted.
- A window / all-runs aggregate cost view (already deferred in the prior doc).

### Outside this work

- Pipeline orchestration — a single user-triggered end-to-end journey runner or workflow engine.
  The baseline run uses the existing per-operation worker commands in sequence.
- Any app-side cost computation or storage; cost stays read-live (prior doc KD5).
- Any prompt or provider tuning; the list names targets, it does not act on them.

---

## Dependencies / Assumptions

- Builds on the completed per-journey-pipeline-cost work and the
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md) substrate: `operation_runs` /
  `operation_run_stages`, the Postgres reporter, the `bottleneckReport` use-case, the timeline read
  model, and `LiteLlmSpendLogsReadAdapter`.
- "Loops generation" == study-item generation (ADR-0026); there is no separate loops operation type
  (`OperationType = extraction | minting | enrichment | study_items`,
  `packages/ports/src/index.ts:619`).
- The enrichment divergence is coarse-bracket (`rescue-mint`,
  `packages/application/src/runGraphEnrichment.ts:214`) versus fine call-tags
  (`missing-prerequisite-proposal` / `grounding-generation` / `rescue-durability` /
  `minting-durability`), confirmed against the live report.

---

## Outstanding Questions

### Deferred to Planning

- Reconcile the enrichment stage vocabulary by adding fine sub-stage reporter brackets (preferred —
  preserves granularity and matches the existing `ENRICHMENT_STAGES` set) versus tagging the calls
  with the coarse `rescue-mint` name (loses granularity). Confirm whether changing reporter stage
  names affects already-persisted `operation_run_stages` rows or the `ENRICHMENT_STAGES` /
  `EXTRACTION_STAGES` sets.
- Which already-ingested mixed-domain source is the representative baseline for R3.
- Whether the ranked target list lives in the report's `--json` output or a separate recorded
  artifact under `tmp/`.

---

## Sources / Research

- `packages/application/src/bottleneckReport.ts` — the join and the `ENRICHMENT_STAGES` /
  `EXTRACTION_STAGES` sets (`:170-188`).
- `packages/infrastructure-litellm/src/LiteLlmSpendLogsReadAdapter.ts` — the `operation_id`-tagged
  `/SpendLogs` aggregate query.
- `packages/application/src/runGraphEnrichment.ts:214` — the coarse `rescue-mint` reporter bracket.
- `packages/application/src/generateStudyItemBank.ts` — `study_items` operation instrumentation.
- Live `worker:kg journey-cost-report c2e28622-…` output (2026-06-26) — the real journey numbers in
  Provisional findings.
- `docs/brainstorms/2026-06-25-per-journey-pipeline-cost-requirements.md` — the completed
  measurement work this hardens and completes.
</content>

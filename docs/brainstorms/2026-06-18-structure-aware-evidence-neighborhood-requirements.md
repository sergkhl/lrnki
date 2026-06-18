---
date: 2026-06-18
topic: structure-aware-evidence-neighborhood
---

# Structure-Aware Evidence Neighborhood (recover thin definitions)

## Summary

Widen the CEP extraction evidence neighborhood from "mention blocks ∪ label-containing blocks"
to a structure-aware, deterministic, capped window that also pulls the blocks *adjacent* to and
*in the same section as* a concept's mentions. The target defect is thin or missing **Definition
Passages**: a concept is named in one block and explained in the next, but the current neighborhood
never shows the explaining block to the extractor, so the definition is lost and the core is later
demoted as ungroundable. This is a source-faithful retrieval fix, not a new layer, not a gate, and
not LLM-knowledge filling.

This is milestone one of a larger latent thesis — *document structure as a first-class pipeline
signal* — but only the extraction-window arrow is in scope now. Structure-in-decisions
(admission, evidence weighting, relation extraction, ordering, connectivity) is deferred to a
later measured track.

---

## Problem Frame

CEP extraction is fed by `evidenceNeighborhood(document, subject)`
(`packages/application/src/executeExtractionRun.ts:245-249`), which returns extractable blocks
where the blockId is one of the candidate's mention blocks **or** the block text contains the
concept label. A definition that lives in an adjacent or sibling block — the common "named here,
explained in the next sentence" pattern — is invisible to the extractor unless it happens to repeat
the label.

The F1 enrichment-ordering evaluation (`tmp/2026-06-17-f1-enrichment-eval/rule-14-evaluation.md`)
recorded the symptom: InstructKG extraction produced **9 incomplete CEPs** and economics **1**.
An incomplete CEP means no verified Definition Passage was found, which now triggers
ungroundable-core demotion to `optional`. The definitions are frequently *present in the source*;
the neighborhood just never surfaced them.

Document structure is already a first-class **input** elsewhere in the pipeline — block headings
are rendered to the model (`packages/infrastructure-litellm/src/extractionAdapters.ts:60-61`) and
admission demotes illustrative concepts by having the model read the rendered heading
(`extractionAdapters.ts:205`). This change extends that existing, rule-compliant pattern (structure
as neural input, never a silent veto) into the evidence neighborhood. It deliberately does **not**
add a `sectionRole` regex bucket: the model already reads the true `headingPath`, which is richer
and domain-neutral (it works on sources with no canonical section taxonomy, e.g. *Wealth of
Nations*).

---

## Key Decisions

- **Widen the neighborhood structurally and deterministically.** Add, to the existing mention and
  label-containing blocks: the ±1 adjacent body blocks around each mention, and same-`headingPath`
  sibling body blocks. Priority-ordered, capped, no LLM in the selection step.

- **Recover definitions via retrieval, not generation.** When a definition is missing because the
  extractor never saw the explaining block, the fix is to show it the block. LLM-knowledge filling
  of an asserted CEP is out — world-knowledge grounding already has its only legitimate home in the
  Derived Graph Layer's `llm_grounded` Enrichment Nodes (ADR-0019/0023), never inside an asserted
  CEP, which must stay verbatim source-grounded.

- **No `sectionRole` regex bucket.** Role stays a neural inference over the already-rendered
  `headingPath`. A hardcoded section taxonomy would be a domain-overfitting symbolic signal
  (AGENTS rule 17) and is unnecessary given the heading is rendered.

- **The verbatim floor is unchanged.** A wider neighborhood only widens the set of blocks a quote
  may be drawn from; every Definition and Mention Passage still must verify verbatim against its
  cited block. Worst case of a too-wide window is a recoverable, inspectable citation, never a
  hallucinated one.

- **Rendered adjacency.** The block renderer gains `prev`/`next` block-id context so the model can
  read local ordering; the heading is already rendered.

- **Structure-in-decisions is deferred.** Admission weighting, evidence-quality weighting, relation
  extraction, prerequisite ordering, and connectivity remain on the current neural/deterministic
  behavior. Each is added later only behind an experiment that diagnoses real benefit.

---

## Requirements

**Structure-aware neighborhood (in scope)**

- R1. Replace the neighborhood selection in `executeExtractionRun.ts` with a structure-aware,
  deterministic, capped selector that includes, in priority order:
  1. blocks with an explicit mention of the candidate;
  2. ±1 adjacent body blocks around each mention block;
  3. same-`headingPath` sibling body blocks (capped);
  4. other blocks whose text contains the exact label or a known alias.
- R2. Cap total neighborhood blocks per concept (`maxEvidenceBlocksPerConcept`), filling by the R1
  priority order so the cap degrades gracefully on large sections.
- R3. Keep selection scoped to `extractableBlocks` (the existing body-only contract): no
  references, appendices, captions, or table/figure placeholders enter the neighborhood.
- R4. Render `prev`/`next` adjacency in the block prompt renderer alongside the existing `heading`.
- R5. Selection is purely deterministic — no LLM call in neighborhood construction, no embeddings.

**Invariants preserved**

- R6. The verbatim-evidence floor is unchanged; every kept passage still verifies against its cited
  block.
- R7. No `sectionRole` regex classifier, no section-role veto or weighting, no new asserted edge,
  no change to the asserted/derived layer split.
- R8. Prompts and any new rendering stay domain-neutral (AGENTS rule 17); selection uses structural
  position only, never fixture-specific tuning.

**Measurement (rule 14, disposable)**

- R9. Re-run real mixed-domain extraction (at minimum InstructKG and economics, the fixtures with
  recorded incomplete CEPs) and compare incomplete-CEP count and ungroundable-core demotions
  against the F1 baseline.
- R10. For a sample of newly-completed CEPs, confirm the recovered Definition Passage traces
  verbatim to an R1 newly-included block, and confirm Definition-Passage precision did not regress
  (no nearby-but-wrong block accepted as a definition).
- R11. Record findings under `tmp/`, not as a standing benchmark or oracle harness.

---

## Acceptance Examples

- AE1. **Covers R1, R9.** On a real InstructKG re-run, a concept that was incomplete in the F1
  batch now has a verified Definition Passage drawn from the block immediately following its first
  mention, and the run's incomplete-CEP count drops below the F1 baseline of 9.

- AE2. **Covers R6, R10.** Every recovered Definition Passage verifies verbatim against its cited
  block; a spot-check of newly-completed CEPs shows the definition is the genuine explaining
  passage, not an adjacent unrelated sentence.

- AE3. **Covers R2.** A concept mentioned many times in a long section yields a neighborhood capped
  at `maxEvidenceBlocksPerConcept`, populated mention-first then adjacent then sibling, never the
  whole section.

- AE4. **Covers R7.** The diff introduces no section-role taxonomy and no symbolic veto; structural
  role remains the model's inference over the rendered `headingPath`.

---

## Success Criteria

- A real mixed-domain re-run shows fewer incomplete CEPs and fewer ungroundable-core demotions than
  the F1 baseline, attributable to definitions recovered from adjacent/sibling blocks.
- No regression in Definition-Passage precision on inspection, and the verbatim floor holds.
- The change is confined to neighborhood construction and prompt rendering; asserted/derived layer
  identity, admission, and enrichment behavior are unchanged.

---

## Scope Boundaries

**Deferred for later (the "structure in decisions" track, each behind an experiment)**

- Structure influencing **concept admission** (beyond the existing neural heading-read demotion).
- Structure **weighting evidence quality** / Mention-Passage salience.
- Structure constraining **relation / typed-assertion extraction**.
- Structure informing **prerequisite ordering** and improving **graph connectivity** (this overlaps
  the active F3 densification track and is owned there).
- A derived `sectionRole` field, as a measured module only, if a future experiment earns it.
- **Table preservation** (promoting `table_placeholder` to extractable content) — no current defect
  earns it; the F1 sparsity is bridge-shaped, not table-shaped.

**Outside this product's identity**

- LLM-knowledge filling of asserted CEPs (world knowledge lives only in the derived layer's
  `llm_grounded` nodes).
- Any symbolic veto over neural output that is not a measured module (AGENTS rule 16).
- Embeddings in neighborhood selection or identity (ADR-0012 stands).

---

## Dependencies / Assumptions

- `SourceBlock` already carries `headingPath`, `blockType`, and array order, so adjacency and
  same-section grouping are derivable with no schema change.
- The existing block renderer already emits the heading; adding `prev`/`next` is additive.
- The definition is, in the common case, actually present in the source — the defect is retrieval,
  not absence. Genuinely-undefined concepts continue to demote to `optional` or live as derived
  `llm_grounded` nodes; that path is unchanged.
- Hard DB reset and single-migration rewrites remain allowed during development.

---

## Outstanding Questions

**Deferred to planning**

- The concrete values for `maxEvidenceBlocksPerConcept` and the same-section sibling sub-cap.
- Whether the parent heading *block itself* is worth including as a neighborhood block (its text is
  often low-value) versus relying on the already-rendered `headingPath`.
- Whether adjacency should be strictly ±1 or a small configurable radius, decided by the re-run.
- Whether the re-run should also cover the ingested PDF fixture or stay on the native batch.

---

## Sources / Research

- `packages/application/src/executeExtractionRun.ts:245-249` — current `evidenceNeighborhood`.
- `packages/domain-core/src/index.ts:12-44` — `SourceBlock`, `EXTRACTABLE_BLOCK_TYPES`,
  `extractableBlocks`; the body-only contract neighborhood selection must respect.
- `packages/infrastructure-litellm/src/extractionAdapters.ts:60-61, 205, 283` — block renderer that
  already emits `heading`; existing neural illustrative-section demotion; Definition-Passage prompt.
- `tmp/2026-06-17-f1-enrichment-eval/rule-14-evaluation.md` — incomplete-CEP counts (InstructKG 9,
  economics 1) motivating the fix.
- `docs/adr/0019-graph-enrichment-derived-layer.md`,
  `docs/adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md` — the only
  sanctioned home for generated grounding (`llm_grounded` derived nodes), keeping LLM knowledge out
  of asserted CEPs.
- `AGENTS.md` rules 14 (real-use validation), 16 (symbolic gates earn their veto), 17 (domain-neutral
  prompts) — the constraints this change is shaped to satisfy.

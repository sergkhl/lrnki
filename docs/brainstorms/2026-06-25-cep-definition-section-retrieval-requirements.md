# CEP Definition-Evidence Retrieval — Section-Scoped Parent-Child Window

- **Date:** 2026-06-25
- **Status:** Requirements — ready for `/ce-plan`
- **TODO item:** #2 (CEP definition-evidence retrieval / chunking, layer B)
- **Grounding dossier:** `/tmp/compound-engineering/ce-brainstorm/cep-defn-retrieval/grounding.md`

## Problem

Layer A (shipped) vetoes verbatim-grounded but meaning-empty Definition Passages (bare
name / heading / title / citation) and demotes the Concept core→optional under the
`core_demoted_hollow_definition` reason code. That code does not say *why* the passage was
hollow. Two very different causes produce it:

- the source genuinely never defines the Concept (Layer A correct — nothing to fix), or
- the definition exists in the source but the deterministic extraction window
  (`selectEvidenceNeighborhood`, radius-1 + ≤4 same-heading siblings, cap 12) never put the
  meaning-bearing block in front of the extractor.

Reading the retrieval code surfaces a third cause the TODO's two-way framing misses: the
defining block was *in* the window but the model quoted the hollow block (the heading)
instead. Each cause needs a different fix, so a chunking change applied blindly would waste
carrying cost on cases it cannot touch.

## Outcome

A core Concept whose source actually defines it is no longer demoted because the defining
passage fell outside its evidence window. Concretely: replace the radius-1 + sibling-cap
neighborhood with **section-scoped parent-child retrieval** — retrieve on the precise mention
(child block), return the enclosing heading-path section (parent) as the definition window —
and confirm on real output that the hollow-demotion rate drops for the right reason.

## Scope — in this pass

1. **Section-scoped parent-child retrieval.** `selectEvidenceNeighborhood` returns, per
   mention, the blocks of the enclosing heading-path section rather than a ±1 radius slice.
   This is the rule-21 established method (hierarchical / parent-child retrieval) applied to
   the existing structure-aware blocks — no new segmentation.
2. **Delete the superseded heuristics in the same change (rule 18).** The `adjacencyRadius`
   neighbor expansion and the `siblingCap` same-heading scan are subsumed by section scoping
   and must be removed, along with their config fields and any now-dead references. The
   label-substring sweep and the `maxEvidenceBlocksPerConcept` bound stay (section bounding).
3. **Disposable three-way measurement instrument.** A throwaway script under `tmp/` that, for
   each `core_demoted_hollow_definition` Concept on a real run, classifies the cause:
   - **genuine absence** — no defining block anywhere in the document,
   - **window miss** — a defining block exists *outside* the window that was used,
   - **in-window mis-pick** — a defining block exists *inside* the window that was used.
   For window-miss cases it also records *locality* — same enclosing section / adjacent
   section / far — because that is the gate for whether section scoping suffices.
4. **Before/after validation.** Run the measurement against the pre-change and post-change
   pipeline on the named fixture; section scoping should convert window-miss/same-section and
   window-miss/adjacent cases into kept definitions.

## Pre-committed decisions (the durable record)

- **Measurement oracle is the existing Layer A judge, run over the full document.** The
  classifier reuses `applyDefinitionPassageQualityJudge`'s rubric over all body blocks (not
  just the window) so "what counts as a definition" stays consistent with the gate being
  explained. No new neural judge is built. Disposable (rule 11) — deleted once it has
  reported.
- **Embeddings stay deferred and are expected to be unnecessary.** An embedding propose-only
  retrieval experiment (rule 20) is built *only if* measurement shows window-miss/**far**
  cases dominate — definitions in a different section that section scoping cannot reach. The
  working assumption is that this is overkill; section scoping is expected to close the gap.
- **In-window mis-pick, if material, is a domain-neutral prompt fix, not retrieval.** If
  measurement shows mis-pick is a meaningful share, add a domain-neutral CEP-extraction rubric
  clause preferring a meaning-bearing block over a heading/title/citation block already in
  context (rules 16/17). This is a small, separable follow-up, not part of the retrieval work.

| Dominant cause (from measurement) | Fix | When |
|---|---|---|
| Window miss, same / adjacent section | section-scoped retrieval (this pass) | now |
| Genuine absence | none — Layer A + rescue already correct | n/a |
| In-window mis-pick (if material) | domain-neutral extraction prompt clause | small follow-up |
| Window miss, far | embedding propose-only retrieval | deferred, EXPERIMENT_ONLY, only if proven |

## Hard constraints

- **Verbatim floor is untouched (ADR-0004/0007).** A returned section is a *retrieval-time
  grouping only*. Every stored CEP passage still decomposes into exactly one cited source
  block that matches verbatim. Section scoping changes which blocks the extractor sees, never
  how a passage is stored or verified.
- **Block / locator identity unchanged.** No re-segmentation; `extractMarkdownBlocks` and the
  block model stay as-is. Section scoping operates over existing blocks via their
  `headingPath`.
- **Domain-neutral (rules 3/17).** No fixture- or benchmark-specific calibration in any window
  bound, prompt, or judge description.
- **Real-use gate (rules 13/14).** Promotion requires a rule-14 PASS on real model output, not
  a green test suite.

## Success criteria

- On the named real fixture, the three-way measurement attributes each existing
  `core_demoted_hollow_definition` demotion to one of the three causes with its defining-block
  citation, so the fragmentation-vs-absence split is quantified (the TODO's stated gate).
- After section scoping, every Concept previously demoted for a window-miss/same-or-adjacent
  cause retains a meaning-bearing Definition Passage and is no longer demoted, with no new
  verbatim-floor failures.
- Genuine-absence Concepts remain correctly demoted (no false recovery) — section scoping does
  not manufacture definitions.
- The radius + sibling config fields and code paths are gone; one source of truth for the
  window (rule 18).

## Out of scope

- Embeddings / vector retrieval, unless the far-definition branch is proven necessary.
- Any change to Layer A's hollow-definition rubric or its categories.
- Any standing benchmark harness — the measurement instrument is deleted after it reports
  (ADR-0013 / rule 11).
- Re-segmentation or overlapping fixed-size chunking — the corpus is already structure-aware;
  overlap is the wrong tool here and would threaten block identity.

## Open questions (defer to planning / measurement)

- **Section bounding.** How to bound an oversized enclosing section against
  `maxEvidenceBlocksPerConcept` (whole section vs. mention-centered slice within the section,
  and how deep in the heading hierarchy "the section" is). Planning detail; pick the simplest
  rule that keeps the defining block reachable.
- **Measurement judge independence.** Whether to additionally run a cross-family judge as the
  full-document oracle to catch Layer A's own blind spots (e.g. the borderline `Overfitting`
  non-defining-prose case noted in the Layer A COMPLETED entry). Lean: record both verdicts and
  flag disagreement; cheap and more honest, but optional.
- **Fixture coverage.** AIRA-dojo 2507.02554v2 is the primary fixture; whether a second
  mixed-domain source is needed to trust the cause distribution before deleting heuristics.

## Dependencies

- Layer A (`applyDefinitionPassageQualityJudge`, `core_demoted_hollow_definition`,
  `mentionedNonCoreCandidates` rescue) — shipped on `feat/cep-definition-quality-judge`.
- `selectEvidenceNeighborhood` (`packages/domain-core/src/index.ts`) and its caller
  `executeExtractionRun.ts` — the change site.
- `extractMarkdownBlocks` block model with `headingPath` — the section key (unchanged).
- `kg-independent-judge` (gpt-oss-120b) alias for the measurement oracle.

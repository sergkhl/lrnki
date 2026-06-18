---
date: 2026-06-18
type: feat
title: "feat: Structure-aware evidence neighborhood (recover thin definitions)"
origin: docs/brainstorms/2026-06-18-structure-aware-evidence-neighborhood-requirements.md
depth: standard
---

# feat: Structure-Aware Evidence Neighborhood (recover thin definitions)

## Summary

Widen CEP extraction's evidence neighborhood from "mention blocks ∪ label-containing blocks" to a
deterministic, capped, structure-aware window that also pulls the blocks *adjacent* to and *in the
same `headingPath` section as* a concept's mentions. The target defect is thin or missing
**Definition Passages**: a concept named in one block and explained in the next, where the current
selector never shows the explaining block to the extractor, so the definition is lost and the core
is later demoted as ungroundable (`demoteUngroundableCores`, `executeExtractionRun.ts:203-219`).

The fix is **source-faithful retrieval, not generation**: show the extractor the block that already
contains the definition. The verbatim floor, the asserted/derived layer split, admission, and
enrichment are all unchanged. The neighborhood selector is extracted from a private application
helper into a pure, unit-tested `domain-core` function (the "deterministic envelope" AGENTS rule 11
requires to be tested), and the block renderer gains `prev`/`next` adjacency context so the model can
read local ordering.

This is milestone one of a larger latent thesis — *document structure as a first-class pipeline
signal* — but only the extraction-window arrow is in scope. Structure-in-decisions (admission,
evidence weighting, relation extraction, ordering, connectivity) is deferred (see origin: Scope
Boundaries).

---

## Problem Frame

`evidenceNeighborhood(document, subject)` (`packages/application/src/executeExtractionRun.ts:245-249`)
is a private one-liner that returns extractable blocks where `blockId ∈ mention blocks` **or** the
block text contains the lowercased canonical label. A definition that lives in an adjacent or sibling
block — the common "named here, explained in the next sentence" pattern — is invisible to the
extractor unless it happens to repeat the label. The CEP extractor cannot quote a block it never
sees, so the Definition Passage comes back empty, the profile is `incomplete`, and a core concept is
demoted to `optional` even though the source defines it.

The F1 enrichment-ordering evaluation (`tmp/2026-06-17-f1-enrichment-eval/rule-14-evaluation.md`)
recorded the symptom: **InstructKG 9 incomplete CEPs, economics 1**. The definitions are frequently
present in the source; the neighborhood just never surfaced them.

Document structure is already a rule-compliant **neural input** elsewhere: `renderBlocks` emits
`heading="…"` (`packages/infrastructure-litellm/src/extractionAdapters.ts:60-61`) and admission
demotes illustrative concepts by having the model read that rendered heading
(`extractionAdapters.ts:205`). This change extends that exact pattern — structure as neural input,
never a silent symbolic veto — into the evidence neighborhood. It deliberately adds **no**
`sectionRole` regex bucket: the model already reads the true `headingPath`, which is richer and
domain-neutral (it works on sources with no canonical section taxonomy, e.g. *Wealth of Nations*).

---

## Requirements Traceability

Carried from the origin requirements doc (see origin: Requirements, Acceptance Examples). Each
requirement is advanced by the listed unit(s).

| Req | Summary | Unit(s) |
| --- | --- | --- |
| R1 | Structure-aware, deterministic, capped selector with priority order: mentions → ±1 adjacent body → same-`headingPath` siblings → label/alias-containing | U1, U2 |
| R2 | Cap total blocks (`maxEvidenceBlocksPerConcept`); fill by R1 priority; graceful degrade; sibling sub-cap | U1, U2 |
| R3 | Selection scoped to `extractableBlocks` (body-only contract); no references/appendices/captions/placeholders | U1 |
| R4 | Render `prev`/`next` adjacency in the block prompt renderer alongside `heading` | U3 |
| R5 | Selection is purely deterministic — no LLM call, no embeddings | U1 |
| R6 | Verbatim-evidence floor unchanged; every kept passage still verifies against its cited block | U2 (preserved by construction), U5 |
| R7 | No `sectionRole` classifier, no role veto/weighting, no new asserted edge, no layer-split change | U1, U2, U3 |
| R8 | Prompts and rendering stay domain-neutral; selection uses structural position only | U1, U3 |
| R9 | Real mixed-domain re-run (InstructKG + economics + datalab-markdown of 2507.02554v2); compare incomplete-CEP count and demotions vs F1 baseline | U4, U5 |
| R10 | Spot-check recovered Definition Passages trace verbatim to an R1 newly-included block; no precision regression | U5 |
| R11 | Findings under `tmp/`, not a standing benchmark/oracle | U5 |

Acceptance Examples AE1 (R1/R9), AE2 (R6/R10), AE3 (R2), AE4 (R7) are enumerated as test scenarios
or rule-14 inspection checks in the units below.

---

## Key Technical Decisions

- **KTD1 — Selector home: `domain-core` pure function.** Extract the neighborhood logic from the
  private `evidenceNeighborhood` helper into `selectEvidenceNeighborhood(...)` in
  `packages/domain-core/src/index.ts`, beside `extractableBlocks`. Rationale: the selection is pure
  deterministic structure logic over `SourceBlock[]` with zero LLM involvement (R5) — exactly the
  "deterministic envelope around the model" that AGENTS rule 11 says must be unit-tested. Keeping it
  in the application layer as a private helper leaves the priority/cap/dedup logic untestable in
  isolation. (User-confirmed.)

- **KTD2 — Adjacency is over the extractable-block sequence, not the raw block array.** "±1 adjacent
  *body* blocks" (R1.2) means the previous/next **extractable** block, skipping interleaved
  non-extractable placeholders (figure/table placeholders, captions). This best matches the defect
  (the explaining paragraph is the adjacent *body* block, even if a figure placeholder sits between
  them in raw order) and honors R3 by construction. Alternative considered: ±1 over raw
  `document.blocks` order then filter to extractable — rejected because a placeholder immediately
  after a mention would consume the radius and hide the real next paragraph.

- **KTD3 — Priority-ordered fill with dedup, then cap.** Build an ordered candidate list in R1
  priority order (1. mentions, 2. ±radius adjacent body, 3. same-`headingPath` siblings up to the
  sibling sub-cap, 4. label/alias-containing), dedup by `blockId` preserving first occurrence, then
  truncate to `maxEvidenceBlocksPerConcept` (R2). Mention-first fill guarantees AE3: a concept
  mentioned many times in a long section yields a mention-first neighborhood, never the whole
  section.

- **KTD4 — Caps and radius are configurable with re-run-tuned defaults.** Introduce a
  `EvidenceNeighborhoodConfig { maxEvidenceBlocksPerConcept; siblingCap; adjacencyRadius }` with
  starting defaults `maxEvidenceBlocksPerConcept = 12`, `siblingCap = 4`, `adjacencyRadius = 1`.
  These are *starting* values; U5's re-run is allowed to retune them before the plan closes (origin
  Outstanding Questions: cap values and radius are "decided by the re-run"). They are distinct from
  the existing `maxMentionsPerConceptPerSource` (default 6), which bounds CEP *output* mentions, not
  *input* neighborhood blocks.

- **KTD5 — Parent heading block is NOT added as a neighborhood block.** The rendered `headingPath`
  already carries the section title to the model; the heading block's own text is typically
  low-value. Relying on the rendered path avoids spending cap budget on a near-empty block (origin
  Outstanding Question, resolved). The heading block can still enter via the label/alias bucket if it
  literally contains the label.

- **KTD6 — `prev`/`next` rendering mirrors the adjacency model (KTD2).** `renderBlocks` emits the
  neighboring **extractable** block ids as `prev=…`/`next=…` attributes alongside the existing
  `heading=…`, omitting the attribute at sequence boundaries. This lets the model read local ordering
  to distinguish a genuine definition from an unrelated adjacent sentence (supports R10 precision),
  while staying domain-neutral (R8).

- **KTD7 — Pipeline config hash bump.** Bump the worker's `PIPELINE_CONFIG_HASH`
  (`apps/kg-worker/src/knowledgeGraphWorker.ts:50`) from `cep-definition-bearing-admission-v36` to a
  `structure-aware-neighborhood-v37`-style string so re-run artifacts are attributable to this
  change. Follows the existing manual-string convention; no hashing machinery is introduced.

- **KTD8 — No port change.** `ConceptConditionedEvidenceProfileExtractionPort.extract` already
  accepts `evidenceNeighborhood: SourceBlock[]` (`packages/ports/src/index.ts:53-67`). The widened
  set flows through the existing port shape; the renderer change is internal to the litellm adapter.

---

## High-Level Technical Design

Data flow for one subject concept (deterministic; no LLM in selection):

```
document.blocks ──► extractableBlocks (R3 body-only filter)
                        │
                        ▼
   selectEvidenceNeighborhood(extractable, { mentionBlockIds, labels }, config)   ◄── KTD1, domain-core
                        │  priority-ordered, deduped, capped (KTD3)
   ┌────────────────────┼───────────────────────────────────────────┐
   │ 1. mention blocks                                                │
   │ 2. ±radius adjacent body blocks (over extractable seq, KTD2)     │
   │ 3. same-headingPath siblings (≤ siblingCap)                      │
   │ 4. label/alias-containing blocks                                 │
   └────────────────────┬───────────────────────────────────────────┘
                        ▼  SourceBlock[]  (≤ maxEvidenceBlocksPerConcept)
        executeExtractionRun call site (replaces private evidenceNeighborhood)
                        │
                        ▼
   evidenceProfileExtraction.extract({ ..., evidenceNeighborhood })   ◄── port unchanged (KTD8)
                        │
                        ▼
   renderBlocks(neighborhood)  →  "[b12 type=paragraph heading=… prev=b11 next=b13] <text>"   ◄── KTD6, R4
                        │
                        ▼
   LLM emits VERBATIM definition/mention passages
                        │
                        ▼
   applyEvidenceProfilePolicy  →  verbatim floor verifies every quote against blockText (R6, UNCHANGED)
```

The only widened surface is the *set of blocks a quote may be drawn from*. Worst case of a too-wide
window is a recoverable, inspectable citation, never a hallucinated one (origin Key Decisions).

---

## Implementation Units

### U1. Pure structure-aware neighborhood selector in `domain-core`

**Goal:** Add `selectEvidenceNeighborhood` as a pure, deterministic, capped, priority-ordered
function in `domain-core`, fully unit-tested in isolation.

**Requirements:** R1, R2, R3, R5, R7, R8.

**Dependencies:** none.

**Files:**
- `packages/domain-core/src/index.ts` — add `EvidenceNeighborhoodConfig` type,
  `DEFAULT_EVIDENCE_NEIGHBORHOOD_CONFIG`, and `selectEvidenceNeighborhood(blocks, subject, config)`
  beside `extractableBlocks`.
- `packages/domain-core/src/selectEvidenceNeighborhood.test.ts` — new test file (or co-located test
  if the package convention prefers `*.test.ts` next to source; mirror `groundingModel.test.ts`).

**Approach:**
- Signature (directional, not prescriptive):
  `selectEvidenceNeighborhood(blocks: SourceBlock[], subject: { mentionBlockIds: Set<string>; labels: string[] }, config: EvidenceNeighborhoodConfig): SourceBlock[]`.
  `labels` is the lowercased set of canonical label + aliases (R1.4).
- Filter to `extractableBlocks` first (R3), preserving array order; index that sequence for adjacency
  (KTD2).
- Build the ordered candidate list per KTD3 priority, dedup by `blockId` (first-wins), truncate to
  `config.maxEvidenceBlocksPerConcept` (R2).
- Same-`headingPath` sibling match: compare full `headingPath` arrays for equality; cap the sibling
  contribution at `config.siblingCap` before the global cap (R2).
- No LLM, no embeddings, no `sectionRole` bucket, no regex section taxonomy (R5, R7, R8).

**Patterns to follow:** `extractableBlocks`/`isExtractableBlock` (`domain-core/src/index.ts:38-44`)
for pure, exported, array-in/array-out helpers; `groundingModel.test.ts` for `node:test` style.

**Test scenarios:**
- Mention block is always included. (input: subject with one mention block → output contains it)
- **Covers AE1.** Adjacent definition recovery: concept named in body block N, explained in body
  block N+1 (N+1 is neither a mention nor label-containing) → N+1 is included via the adjacency
  bucket.
- KTD2 skip: a `figure_placeholder` sits between mention block N and explaining body block N+2 →
  N+2 is the adjacent body block and is included; the placeholder is not.
- Same-`headingPath` sibling included when not adjacent and not label-containing.
- **Covers AE3.** Cap + priority: a concept with more mention blocks than
  `maxEvidenceBlocksPerConcept` in a long section yields exactly `maxEvidenceBlocksPerConcept` blocks,
  all mentions, no siblings (mention-first fill).
- Sibling sub-cap: a section with many siblings contributes at most `siblingCap` of them.
- Dedup: a block that is both a mention and a same-section sibling appears once.
- Label/alias bucket: a distant block containing only an *alias* (not the canonical label) is
  included via bucket 4.
- **Covers AE4 / R3.** `reference`, `appendix`, `caption`, `table_placeholder`, `figure_placeholder`
  blocks never appear in the output even when they contain the label or are array-adjacent.
- Empty mentions: subject with no mentions falls back to label/alias-containing blocks only.
- Determinism: same inputs → identical ordered output across calls.

**Verification:** `selectEvidenceNeighborhood.test.ts` passes; selection is provably scoped to
extractable blocks and capped.

---

### U2. Wire the selector + config into the extraction run; retire the private helper

**Goal:** Replace the private `evidenceNeighborhood` in `executeExtractionRun.ts` with a call to
`selectEvidenceNeighborhood`, plumb the neighborhood config through the run, and keep the verbatim
floor untouched.

**Requirements:** R1, R2, R6 (preserved by construction), R7.

**Dependencies:** U1.

**Files:**
- `packages/application/src/executeExtractionRun.ts` — delete the private `evidenceNeighborhood`
  (lines 242-249); import and call `selectEvidenceNeighborhood` at the call site (line 131); add an
  optional `evidenceNeighborhoodConfig?` input field defaulting to
  `DEFAULT_EVIDENCE_NEIGHBORHOOD_CONFIG`; pass `exactAliases(subject)` (already computed) as the
  label/alias set.
- `packages/application/src/executeExtractionRun.test.ts` — update any assertions that depend on the
  old (narrower) neighborhood contents; add an orchestration-level assertion that an adjacent-block
  definition flows into the extractor's `evidenceNeighborhood` arg.

**Approach:**
- Compute `mentionBlockIds` from `subject.mentions` and lowercased labels from
  `exactAliases(subject)`; call `selectEvidenceNeighborhood(document.blocks, { mentionBlockIds,
  labels }, config)`.
- Do **not** touch `applyEvidenceProfilePolicy` or `blockText` — the verbatim floor already verifies
  every quote against the full-document `blockText` map (`executeExtractionRun.ts:54`,
  `applyEvidenceProfilePolicy.ts`), so a wider input set cannot relax it (R6).
- Keep `definitionBearingEvidence` hint plumbing exactly as is (core-only, KTD2 of the prior CEP
  reset) — orthogonal to this change.

**Patterns to follow:** existing call-site assembly (`executeExtractionRun.ts:120-147`);
`exactAliases` (`executeExtractionRun.ts:222-224`).

**Test scenarios:**
- A subject whose definition lives in an adjacent block: the fake extractor records its received
  `evidenceNeighborhood` and the assertion confirms the adjacent block id is present (orchestration
  proof that U1 is wired, not re-testing U1's internals).
- **Covers AE2 / R6.** A canned extractor response quoting a *newly-included adjacent block*
  verbatim → `applyEvidenceProfilePolicy` accepts it (the quote verifies); a canned response quoting
  text absent from every block → rejected. (This exercises the deterministic verbatim envelope with
  the wider input; it asserts the transform, not model judgment — AGENTS rule 11.)
- Config override: passing a smaller `maxEvidenceBlocksPerConcept` shrinks the neighborhood the
  extractor receives.
- Regression: existing orchestration tests (core/optional tiering, demotion counts) still pass with
  the wider neighborhood.

**Verification:** `executeExtractionRun.test.ts` passes; the private helper is gone; no port or
policy signature changed.

---

### U3. Render `prev`/`next` adjacency in the block renderer

**Goal:** Extend `renderBlocks` to emit `prev`/`next` neighboring extractable block ids alongside the
existing `heading`, so the model can read local ordering.

**Requirements:** R4, R7, R8.

**Dependencies:** none (independent of U1/U2; can land in parallel).

**Files:**
- `packages/infrastructure-litellm/src/extractionAdapters.ts` — extend `renderBlocks`
  (lines 57-64).
- `packages/infrastructure-litellm/src/extractionAdapters.test.ts` — add `renderBlocks` rendering
  tests (none exist today per grep).

**Approach:**
- `prev`/`next` are computed over the **rendered set's** extractable sequence (KTD6/KTD2): for each
  block, the id of the previous/next block *in the array passed to `renderBlocks`*. Omit the
  attribute at the boundaries (first block has no `prev`, last has no `next`).
- Output shape (directional): `[b12 type=paragraph heading="A › B" prev=b11 next=b13] <text>`.
- Domain-neutral: only structural ids and the existing heading path are emitted — no role labels, no
  section taxonomy (R7, R8).
- `renderBlocks` is shared by discovery and admission prompts too (`extractionAdapters.ts:81,149`);
  the added attributes are additive and harmless there. Confirm those prompts still read sensibly
  (no scenario change expected).

**Patterns to follow:** the existing `heading=` conditional emission (`extractionAdapters.ts:60`).

**Test scenarios:**
- Middle block renders both `prev=` and `next=` with the correct neighbor ids.
- First block omits `prev`; last block omits `next`.
- `heading=` still renders alongside `prev`/`next` when `headingPath` is non-empty; omitted when
  empty.
- Single-block input renders neither `prev` nor `next`.
- Block text and `type=` are unchanged from current output (characterization of the existing fields).

**Verification:** `extractionAdapters.test.ts` passes; rendered output carries adjacency only as
additive structural attributes.

---

### U4. Worker config, pipeline-hash bump, and third-fixture manifest entry

**Goal:** Make the re-run runnable and attributable: bump `PIPELINE_CONFIG_HASH`, pass any
neighborhood config through the worker, and register the datalab-markdown variant of 2507.02554v2 as
the third re-run fixture.

**Requirements:** R9 (enabling).

**Dependencies:** U1, U2.

**Files:**
- `apps/kg-worker/src/knowledgeGraphWorker.ts` — bump `PIPELINE_CONFIG_HASH` (line 50, KTD7); pass an
  `evidenceNeighborhoodConfig` into `executeExtractionRun` if non-default values are chosen (default
  otherwise — no pass-through needed if defaults stand).
- `fixtures/manifest.json` — add a fixture entry for
  `fixtures/markdown/datalab-output-2507.02554v2.pdf.md` (the file already exists, 142 KB).

**Approach:**
- New manifest entry mirrors the InstructKG datalab-markdown entry (`fixtureId`
  `instructkg-2602-17111v1`): `contentType: "text/markdown"`, `declaredDomain: "machine learning
  systems"` (matching the existing PDF fixture `aira-dojo-2507-02554v1` so cross-source identity
  stays consistent, ADR-0015), a distinct `fixtureId` (e.g. `aira-dojo-2507-02554v1-md`), title and
  source carried from the PDF entry, and a `curation` note stating it is the datalab/marker
  Markdown variant used for the structure-aware-neighborhood re-run (skips the Docling step the PDF
  fixture uses). Reason for the markdown variant: deterministic input, isolates the neighborhood
  change from PDF-conversion variance.
- This is curated-source registration under `fixtures/` (AGENTS rule 10), not generated output.

**Patterns to follow:** the `instructkg-2602-17111v1` manifest entry (`manifest.json:33-42`).

**Test scenarios:** `Test expectation: none -- config/manifest data change; behavior is validated by
the U5 rule-14 re-run, not unit tests.`

**Verification:** `worker:kg register-from-manifest` registers the new fixture;
`worker:kg run-extraction <new-sourceResourceId>` executes against it.

---

### U5. Rule-14 real-use re-run and disposable comparison report

**Goal:** Fire real mixed-domain extraction on the three fixtures, compare incomplete-CEP counts and
ungroundable-core demotions against the F1 baseline, spot-check recovered definitions, and record
findings under `tmp/`.

**Requirements:** R9, R10, R11, R6 (real-use confirmation).

**Dependencies:** U1, U2, U3, U4.

**Execution note:** This is the AGENTS rule 14 mandatory evaluation loop. Real LLM calls
(DeepSeek V4 Flash extractor, gpt-oss-120b `kg-independent-judge`); no automated test substitutes for
this inspection.

**Files:**
- `tmp/2026-06-18-structure-aware-neighborhood/` — re-run dumps and `rule-14-evaluation.md`
  (gitignored scratch, AGENTS rule 10; never a standing benchmark, R11).

**Approach:**
- Reset/register as needed (hard DB reset allowed, AGENTS rule 9), then run extraction on the three
  fixtures: InstructKG (`instructkg-2602-17111v1`), economics (`wealth-of-nations-bk1-ch1-3`), and
  the new datalab-markdown 2507.02554v2.
- Capture per-run `incomplete` CEP count and `demotedCoreCount` (the worker already logs
  `CEPs=N(incomplete=M)`, `executeExtractionRun.ts:200-205`).
- Compare against F1 baseline: InstructKG 9 incomplete, economics 1
  (`tmp/2026-06-17-f1-enrichment-eval/rule-14-evaluation.md`).
- For a sample of newly-completed CEPs, trace the recovered Definition Passage back to its cited
  block and confirm (a) it verifies verbatim, (b) the cited block is an R1 *newly-included* block
  (adjacent or sibling), and (c) it is the genuine explaining passage, not a nearby-but-unrelated
  sentence (R10 precision check).
- If results indicate the caps/radius are mistuned (e.g., too-wide windows admitting wrong
  definitions, or still-missing definitions), retune `DEFAULT_EVIDENCE_NEIGHBORHOOD_CONFIG` (KTD4)
  and re-run before closing.
- Write the rule-14 note (Milestone / Fixture / Real model calls / Result / Useful output / Defects
  / Changes after inspection / Caveats / Safe to continue).

**Test scenarios:** `Test expectation: none -- this is real-use evaluation, not an automated test.
Evidence is the tmp report and inspected artifacts (AGENTS rule 11/14).`

**Verification (success criteria, see origin: Success Criteria):**
- Fewer incomplete CEPs and fewer ungroundable-core demotions than the F1 baseline, attributable to
  definitions recovered from adjacent/sibling blocks (AE1: InstructKG incomplete count drops below 9).
- No Definition-Passage precision regression on inspection; verbatim floor holds (AE2).
- Result classified `PASS` / `FIX_FIRST` / `EXPERIMENT_ONLY` / `BLOCKED` per the rule-14 rubric. A
  `FIX_FIRST` (e.g., wrong-block definitions accepted) blocks closing until the caps/rendering are
  corrected.

---

## Scope Boundaries

### In scope
Neighborhood construction (U1/U2), `prev`/`next` rendering (U3), worker/manifest enabling (U4), and
the disposable rule-14 re-run (U5).

### Deferred for later (the "structure in decisions" track — carried from origin)
- Structure influencing **concept admission** beyond the existing neural heading-read demotion.
- Structure **weighting evidence quality** / Mention-Passage salience.
- Structure constraining **relation / typed-assertion extraction**.
- Structure informing **prerequisite ordering** / **graph connectivity** (overlaps the active F3
  densification track, owned there).
- A derived `sectionRole` field, only as a future measured module if an experiment earns it.
- **Table preservation** (promoting `table_placeholder` to extractable) — no current defect earns it;
  F1 sparsity is bridge-shaped, not table-shaped.

### Outside this product's identity (carried from origin)
- LLM-knowledge filling of asserted CEPs — world knowledge lives only in the derived layer's
  `llm_grounded` nodes (ADR-0019/0023).
- Any symbolic veto over neural output that is not a measured module (AGENTS rule 16).
- Embeddings in neighborhood selection or identity (ADR-0012 stands).

### Deferred to follow-up work (plan-local)
- None identified. The change is confined to the units above.

---

## Risks & Mitigations

- **Too-wide window admits a nearby-but-wrong definition** (precision regression). Mitigation: the
  verbatim floor still binds (R6); `prev`/`next` rendering (U3) helps the model distinguish ordering;
  U5's R10 spot-check is the gate, and a `FIX_FIRST` retunes caps before closing.
- **Cap squeezes out the explaining block on heavily-mentioned concepts.** Mitigation: AE3
  mention-first fill is intentional, but U5 inspects whether real concepts lose their definition to
  the cap; if so, raise `maxEvidenceBlocksPerConcept` or lower mention priority weight (KTD4 retune).
- **`headingPath` equality is too strict or too loose** across parsers (markdown vs plaintext vs
  HTML). Mitigation: U5 covers all three input formats; *Wealth of Nations* (flat/empty headingPath)
  is the loose-grouping probe, InstructKG/2507 the deep-heading probe.
- **Shared `renderBlocks` change leaks into discovery/admission prompts.** Mitigation: attributes are
  additive and structural only; U3 confirms discovery/admission prompts still read sensibly.

---

## Dependencies / Assumptions

- `SourceBlock` already carries `headingPath`, `blockType`, and array order — adjacency and
  same-section grouping derive with no schema change (`domain-core/src/index.ts:14-20`).
- The port already accepts `evidenceNeighborhood: SourceBlock[]` — no `@lrnki/ports` change (KTD8).
- The definition is, in the common case, present in the source — the defect is retrieval, not
  absence. Genuinely-undefined concepts still demote to `optional` or live as derived `llm_grounded`
  nodes; that path is unchanged.
- Hard DB reset and single-migration rewrites remain allowed during development (AGENTS rules 8, 9).

---

## Sequencing

1. **U1** (pure selector + tests) — foundation, no dependencies.
2. **U3** (renderer) — independent; can land in parallel with U1.
3. **U2** (wire selector into run) — depends on U1.
4. **U4** (worker hash bump + manifest) — depends on U1, U2.
5. **U5** (rule-14 re-run) — depends on all; gates the milestone per AGENTS rule 14 before any
   downstream complexity.

---

## Sources / Research

- `packages/application/src/executeExtractionRun.ts:131,222-249` — current call site, `exactAliases`,
  private `evidenceNeighborhood`, `demoteUngroundableCores`.
- `packages/domain-core/src/index.ts:12-44,116-122` — `SourceBlock`, `EXTRACTABLE_BLOCK_TYPES`,
  `extractableBlocks`, `BlockEvidence`/`mentions`.
- `packages/ports/src/index.ts:53-67` — extract port input (already takes `evidenceNeighborhood`).
- `packages/infrastructure-litellm/src/extractionAdapters.ts:57-64,205,283,304` — `renderBlocks`,
  neural illustrative demotion, Definition-Passage prompt, neighborhood consumption.
- `apps/kg-worker/src/knowledgeGraphWorker.ts:50,178-207,429-456` — `PIPELINE_CONFIG_HASH`,
  `runExtraction`, command dispatch.
- `fixtures/manifest.json:33-52` — InstructKG datalab-markdown and 2507 PDF fixture entries.
- `tmp/2026-06-17-f1-enrichment-eval/rule-14-evaluation.md` — F1 baseline (InstructKG 9, economics 1
  incomplete CEPs).
- `docs/adr/0019-graph-enrichment-derived-layer.md`,
  `docs/adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md` — sanctioned home
  for generated grounding (`llm_grounded`), keeping LLM knowledge out of asserted CEPs.
- `AGENTS.md` rules 9 (DB reset), 10 (`fixtures/` vs `tmp/`), 11 (test the deterministic envelope),
  14 (real-use validation), 16 (symbolic gates earn their veto), 17 (domain-neutral prompts).

# ADR-0026: Typed Study Item Bank

## Status

Accepted (2026-06-21). Supersedes ADR-0025 for **item identity** (the Card Bank /
Response Log derived-node subject model and grounding-provenance contract from 0025
otherwise stand). Plan 2 of the `2026-06-21` brainstorm.

## Context

The learner-calibrated study loop shipped with a single study mechanic: self-assessment.
A learner revealed an answer and self-reported "got it / missed it", writing a
`graded(self)` row. The product will not keep self-assessment as the way a learner
*studies*: studying should be auto-graded, and one concept should be able to carry
several study mechanics as the bank grows (multi-select, free-text, mini-games later).

Two structural problems followed from the old `Card` shape:

1. A fixed `{ question, answerKey, selfReportPrompt }` card with one card per node is too
   narrow for several mechanics per node.
2. "Which mechanics does this concept support?" must be answered honestly from the
   concept's grounded evidence, not from a hand-kept concept→type table that would drift
   the instant evidence regenerates (AGENTS rule 18).

## Decision

The single `Card` shape becomes a **typed Study Item** discriminated union, keyed on
`itemType`. The rename is full (AGENTS rule 18): `Card` → `StudyItem`, the item identity
`cardId` → `studyItemId`, the column `card_id` → `study_item_id`, the bank/generation/
store names, and the `card_bank` artifact → `study_item_bank`. No stale "card"
name survives pointing at a typed item.

### Discriminant

`StudyItemType = "self_assessment" | "option_select" | "multi_option_select" |
"free_text" | "mini_game"`. The first two are concrete; the last three are reserved in
the discriminant with no payload built this round (R14) so new mechanics slot in without
a model reshape.

- `self_assessment` keeps the prior recall payload `{ question, answerKey,
  selfReportPrompt, citations }` and is now **calibration only** (R8). Self-assessment
  "retreats to calibration": calibration's `self_report` path is untouched.
- `option_select` carries `{ question, options }` — four options, exactly one keyed
  correct, a click writes a deterministic `graded(auto)` row with no judge and no
  self-report (R9).

### Per-type grounding contracts; supported types are a query (R12)

A concept's supported item types are the **byproduct** of attempting generation against
each type's grounding contract, never a stored map. `supportedItemTypes(derivedNodeId)`
is `SELECT DISTINCT item_type FROM study_items WHERE derived_node_id = $1`. There is no
`concept_supported_types` table and no `supportedItemTypes` column — a second
representation would drift the instant evidence regenerates (rule 18).

- self-assessment is supported when a recall card grounds and its citations verify
  verbatim (the prior path).
- option-select is supported when generation **and** the deterministic guard both pass.

### Generated, sibling-conditioned distractors; grounded correct answer (R10)

Option-select generation runs for *every* node — a uniform mechanism so any concept can
yield a studying item regardless of neighborhood density. The correct answer is grounded
in the node's own evidence and verified verbatim exactly as card answer keys are today.
Distractors are **generated**, conditioned on same-domain sibling-concept evidence so
they read like real domain answers, and tagged `provenance: "generated"`. Sibling
context is prompt-context only: a sibling-poor concept still generates, just with thinner
flavor — it never degrades to no item.

### Deterministic guard (rule 16-permitted veto)

`validateOptionSelectItem` enforces *provable structural guarantees*: exactly four
options, all distinct after normalization, exactly one flagged correct, the correct
option's citation traces to the node's grounding verbatim (reusing the card-citation
verifier), and every non-correct option labeled `generated`. These are the same class of
veto as the verbatim-citation check rule 16 allows — a checkable property, not a lexical
opinion. The guard never inspects distractor *semantics* (that would be the forbidden
heuristic gate; distractor quality is judged only by the rule-14 human pass). Failing the
guard is **not** a run failure: the node simply lacks an option-select item and falls
back to self-assessment-only / cardless-for-studying (R13).

### Auto-graded write; self-assessed study write deleted

`appendOptionSelectOutcome` re-derives the keyed-correct option server-side from the DB
by `studyItemId` (never trusting the client's correctness claim), compares it to the
chosen option, and appends one `graded` row — `correct`/1.0 on a match, `incorrect`/0
otherwise — under `graderIdentity: "auto"`, with no `submittedAnswer`, no LLM call, no
self-report. In the same change the self-assessed *study* write
(`appendSelfAssessedGrade`, `selfAssessment.ts`, `selfAssessCard`, the "Got it /
Missed it" controls) is deleted (R8, rule 18). Calibration's `self_report` path is
untouched.

## Consequences

- The bank is a downstream projection: it reads the authoritative graph and the Derived
  Graph Layer and mutates neither (R15). Item generation imports no graph/enrichment
  write port.
- `study_items` carries shared columns with type-specific columns gated by a `CHECK` on
  `item_type`; `UNIQUE (derived_node_id, item_type)` allows at most one item per type per
  node this round. The correct option lives in `study_item_options`; its grounding lives
  in `study_item_citations`.
- Item-type support is computed eagerly at build time for the two enabled types; lazy /
  per-request generation is deferred (KTD7).
- Distractor *quality* is model-dependent and not test-guaranteed; it is established only
  by the rule-14 real-use inspection. If systematically poor, the next step is a measured
  neural judge (rule 16), not expanding the deterministic guard.
- The reserved three types (`multi_option_select`, `free_text`, `mini_game`) are the next
  mechanics to implement behind the discriminant, with no model reshape required.

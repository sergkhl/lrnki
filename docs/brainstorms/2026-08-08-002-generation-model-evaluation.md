---
title: Generation Model Evaluation - Brainstorm
type: brainstorm
date: 2026-08-08
---

# Generation Model Evaluation — MiMo v2.5 vs DeepSeek v4 Flash

**Status:** Shaping. Not a plan; no unit exists. Written at the close of
`2026-08-07-001 (matching item quality)`, which surfaced the findings below and proved that the test
this decision was waiting on does not answer it. Needs a planning interview before any code.

**The question.** A 2026-08-08 bake-off put `deepseek-v4-flash` ahead of the production extractor
`mimo-v2.5` on yield, latency, and price. Should production generation move? This document records
what is measured, what is not, and the two preconditions that make it a larger change than it looks.

## What is actually measured

`litellm/config.yaml` owns the measurement (AGENTS rule 5); it is summarized here only to scope it.
Three arms, 16 nodes × 2 draws, identical inputs, reasoning off, scored by **downstream yield** —
each arm's facet replayed through the production matching generator + guard, generator held constant:

| Arm | Items | Notes |
| --- | --- | --- |
| `mimo-v2.5` | 12 of 16 | incumbent; declines nodes |
| `mimo-v2.5-pro` | 11 of 16 | measured and rejected; do not re-test |
| `deepseek-v4-flash` | **16 of 16** | zero guard rejections, ~3× lower median latency, tighter tail |

The yield win is **partly bought by never declining**: DeepSeek skipped 0 of 96 type-decisions, and
hand inspection of the nodes v2.5 declined found off-node drift (an NADW board keyed to AABW), a
label-cued board whose matches are just neighbour node names, and one **false match** ("freshwater
lowers density by expanding water molecules"). Its facet text is also off-spec at 206 chars mean
against v2.5's 69, for a schema asking for a "short" facet — and that text rides into three
downstream prompts per node.

So the honest summary is: **confirmed better on yield, latency, and price; unmeasured to suspect on
truth**, which is the axis that decides it.

## Why the pre-registered re-decision test is void

The bake-off wrote its own re-decision rule: *"Re-decide once Matching Assignment Verification ships:
if those extra items survive it, the coverage win is real; if it vetoes them, v2.5's skips were
right."*

That test does not work, and the matching plan's U4 is why. Matching Assignment Verification checks
**fit, not claim truth** ([ADR-0026](../adr/0026-typed-study-item-bank.md), D8): a false but
unambiguous match passes it by design, and off-node drift is not an assignment defect at all. Its
measured subtraction was 4 finally rejected of 30 generated, every one for ambiguity. It is the wrong
instrument for the exact failure class DeepSeek's extra items carried.

**Consequence: we are further from a decision than when the bake-off was written, not closer.** The
evidence this needs — a direct A/B whose scoring is claim truth on the items each arm uniquely
produces — does not exist and has to be built.

## Blast radius: one alias, eleven consumers

This is the finding that most changes the shape of the work. `study-item-blueprint` — the only stage
the bake-off measured — resolves through `kg-claim-extraction`, and so do **ten other prompts**:

```
cep-extraction                     grounding-generation           missing-prerequisite-proposal
concept-lesson-generation          layer-purpose                  study-item-blueprint
study-option-select-generation     study-matching-generation      study-impostor-generation
learner-scaffold-outline-generation                learner-scaffold-content-generation
```

Moving that alias moves the CEP extraction contract ([ADR-0007](../adr/0007-extract-concept-evidence-profiles-in-concept-context.md)),
Concept Lessons ([ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md)), all three study-item
generators, minted prerequisites, and the scaffold surface — on evidence gathered from **1 of 11
consumers**, whose metric held one of the other ten constant. A separate five aliases
(`default-model`, `kg-concept-discovery`, `kg-concept-admission`, `kg-concept-synthesis`,
`kg-domain-inference`) also point at `mimo-v2.5`, so "move generation to DeepSeek" is not one
decision — the *scope* is itself an open question.

## Two hard preconditions

**1. `grounding-generation` is on this alias, so the judge must move in the same change.**
[ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md) requires
judgment over generated nodes to use a family independent of the extraction **and grounding**
generator, and states that whichever of the pair moves second must move in the same change. The judge
became `deepseek-v4-flash-0731` on 2026-08-07 (`23f7146`) specifically to escape the Groq
requests-per-minute ceiling on OpenRouter's shared account that took out **every** judge stage at
once. So moving `kg-claim-extraction` to DeepSeek pushes the judge back into the family whose
availability failure caused the swap, or onto an unmeasured third family — and the judge is itself
only qualified for its shipped matching configuration, not for its five other duties. **This
precondition has no answer today, and it is what actually gates the work.**

**2. The prefix-cache pin is part of the incumbent's cost, and the comparison ignored it.**
MiMo is provider-pinned to the single xiaomi host so the ~23k-token document re-sent on every
admission batch can warm a per-host prefix cache (`cache_read_input_token_cost` is set on the
deployment); OpenRouter load-balancing would spread those calls across hosts whose caches are
per-host and never warm it. The bake-off scored short per-node blueprint calls, where that cache is
irrelevant. Any price or latency claim about the document-heavy stages must be made against MiMo's
**cached** cost, and a DeepSeek arm has to show it can be pinned and warmed the same way — which
costs the multi-provider fp8 resilience the judge deployment currently relies on.

Beyond those: AGENTS rule 5 names MiMo as production extraction, so the switch is a rule amendment;
and [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md) now states that evidence is
scoped to the model that produced it, so every gate measured under MiMo is retired by the move.

## Candidate options

1. **Split `study-item-blueprint` onto its own alias and move only that.** Confines the change to the
   one consumer that was actually measured, leaves the grounding generator and CEP extraction on
   MiMo, and — because the blueprint is neither extractor nor grounding generator — plausibly does
   not trip ADR-0023's pair constraint at all. **Leading candidate**, but the interview must settle
   the ADR-0023 reading explicitly rather than assume it, and must decide whether the blueprint's
   off-spec facet verbosity is acceptable given it feeds three downstream prompts.
2. **Move `kg-claim-extraction` wholesale.** Needs the judge relocation, a claim-truth A/B across
   several of the eleven consumers, and a full ADR-0013 re-gate. Largest option; currently blocked on
   precondition 1.
3. **Do not switch; close the question.** Record the bake-off as decided-against and stop paying
   attention cost. Cheapest, and defensible while precondition 1 has no answer.
4. **Give matching claim-truth verification instead.** Attacks the underlying gap (matching is the
   one type with no truth check, ADR-0026 D8) rather than the model choice, and would make a future
   A/B scorable by machine. Independently valuable; does not by itself decide the model.

## Carried from the matching plan

Two generation-side changes were deliberately not shipped there, so `fix/matching-item-quality` would
merge exactly as its U4 gate measured it. Both belong to whichever plan next pays for a real-use gate
cycle:

- **Remove the blueprint's matching-facet constraint.** It declined a real node
  (`Surface ocean circulation`, "only two distinct answers") while the collapse it guards against
  could not be reproduced — 3 forced draws on that exact node and facet produced no collapsing board,
  and all 4 admitted direction-of-effect items were discriminable with clean diagonals. It is
  conservative rather than protective. **Removing it should precede any A/B**: it is a *decline*
  instruction, and the A/B's headline metric is yield-where-MiMo-declines-and-DeepSeek-does-not, so
  leaving it in confounds exactly the comparison being made. Do not tune it against these nodes
  (AGENTS rule 17).
- **Raise `MATCHING_GENERATION_ATTEMPTS`** (`packages/application/src/generateStudyItemBank.ts:69`,
  currently 2, beside `OPTION_SELECT_*` and `IMPOSTOR_*`). The measurement the matching plan waited
  for exists: matching's second attempt fails routinely on a hard node (3 of 3 on the reproduced
  case; `Seawater density` lost its item to the distinctness veto after its retry). Monotone-safe —
  a third attempt is still guarded and still judged — so it can only add items or cost one call. An
  asymmetric budget is justified because matching's failure is structural (board-level distinctness)
  rather than per-candidate.

## Open questions for the planning interview

1. **Scope**: one stage (option 1), one alias, or the whole extractor assignment?
2. **Does ADR-0023's pair constraint reach the blueprint?** It is neither extractor nor grounding
   generator, but it shapes the facet that the judged matching item is built from.
3. **Where does the judge go** if `kg-claim-extraction` moves? `gpt-oss-120b` carries the Groq
   exposure that forced the swap; `qwen3-235b-a22b-2507` was measured forced-tool OK but failed
   quality parity on whole-set ordering (a different task); nothing else is measured.
4. **What is the A/B's scoring instrument?** Hand inspection of claim truth on each arm's unique
   items (ADR-0013), or build matching claim-truth verification first (option 4) and score by machine?
5. **How many domains and how many draws** make the result readable under
   [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md)? The
   bake-off's 2 draws are thin for a decision this wide.
6. **Which gates get re-run** versus recorded as unqualified, per the ADR-0013 evidence-scope rule?

## Do not re-litigate

- **`mimo-v2.5-pro` is measured and rejected** — 11 of 16, the only arm to produce guard rejections,
  and more expensive. Do not re-test it on this stage.
- **The 2026-06-24 "deepseek flash is disproven" note is not about this model.** It measured
  `deepseek-flash-no-thinking` on *whole-set prerequisite ordering*, months before `v4-flash-0731`,
  and `litellm/config.yaml` now says so explicitly. It is not evidence about per-item judging or
  about generation.
- **`kg-prerequisite-ordering` stays on `gpt-oss-120b`** and keeps its Groq exposure; whole-set
  ordering needs a reasoning model and the flash-generation result above stands for that task.

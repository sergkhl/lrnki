---
title: Matching Item Quality - Plan
type: fix
date: 2026-08-07
execution: code
---

<!--
Plan hygiene — docs/plans/README.md owns these rules; this is a signpost, not a second definition.
  * The Validation Log is append-only within a unit and REWRITTEN to one entry when that unit closes.
  * Record one current metric value and its invariant, never the trajectory that produced it.
  * Open work goes in the single `Open findings` section, never in a per-entry "not done" list.
  * Durable mechanics belong in docs/adr/, AGENTS.md, CONTEXT.md, a rig README, or a skill — never
    here. This plan is deleted at completion.
  * Caps: Validation Log ~200 lines, this file ~600, the status header 15. Over a cap means
    consolidate BEFORE appending.
-->

# Matching Item Quality

**Status:** All four units are implemented and gated; U4 **PASSES** with one acceptance clause **not
met**. Both 5-draw probes pass, both real-use runs ran on the shared VPS deployed container after
`pnpm db:reset` (D11), and all 26 admitted matching items were hand-inspected — of which **one**
still carries an ambiguous pair set, against an acceptance bar of none. Next action is a decision,
not code: accept that ~4% tail and close the plan, or spend one more unit on judgment stability. The
Open findings also hold two live decisions this work surfaced (the blueprint's over-firing
matching-facet constraint, `MATCHING_GENERATION_ATTEMPTS`) and the ADR sweep the judge swap owes.

**Decision state:** Interview-locked 2026-08-07. D1–D13 were each chosen in the planning interview;
every recommendation was accepted as offered.

**Precondition:** done — `fix/study-item-grounding` fast-forwarded into `main` at `f1224c3`; work
continues on `fix/matching-item-quality`.

## Goal capsule

Matching is the one Study Item type that has been defective since its first real measurement, and
the one type deliberately outside Study Item Key Verification. The 2026-08-07 hand-inspection of all
16 matching items (61 pairs) found three distinct defect classes needing three distinct mechanisms —
a per-candidate truth judge sees none of them:

1. **Tautological pairs** are a *generation* problem: the verbatim-quote guard makes "match = the
   quoted bullet, prompt = its paraphrase" the cheapest passing item, so some pairs are solvable by
   string overlap and test nothing.
2. **Ambiguous prompt sets** are a *verification* problem: nothing ranges over the pair set asking
   whether exactly one match fits each prompt, so a learner who knows the material can be marked
   wrong — the harm class the impostor uniqueness rule just closed.
3. **Graph vocabulary in learner copy** ("dependent concept", "sibling water mass") is *upstream
   contamination*: the Concept Lesson prompt frames its neighbor lists in graph meta-language,
   applications bullets absorb it, and matching quotes bullets verbatim.

After this work: the matching prompt manufactures facet-spanning pairs and the guard rejects
containment-degenerate ones; every guarded matching item passes **Matching Assignment Verification**
— an N×N cross-family fit check with a deterministic uniqueness rule — before admission; and lesson
prose stops carrying graph vocabulary at the source, for every lesson consumer.

## Canonical inputs

- Engineering and greenfield enforcement: [AGENTS.md](../../AGENTS.md), especially rules 1, 5, 6,
  13, 14, 16, 17, 18, 21.
- Project language: [CONTEXT.md](../../CONTEXT.md) — *Study Item Bank*, *Study Item Key
  Verification*, *Concept Lesson*, *Recall Challenge*.
- Study Item Bank contract, amended by this plan: [ADR-0026](../adr/0026-typed-study-item-bank.md).
- Concept Lesson substrate: [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md).
- Neural Stage Descriptors and mechanical config hashes:
  [ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md).
- Real-source inspection gate: [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md);
  non-deterministic measurement: [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md).
- Single shared learner environment / deployed-container authority:
  [ADR-0036](../adr/0036-run-single-shared-learner-environment-during-testing.md),
  [ADR-0040](../adr/0040-serve-public-api-only-from-the-deployed-container.md).

Source files that own the current behavior:
[`study-matching-generation.prompt`](../../packages/infrastructure-litellm/prompts/study-matching-generation.prompt),
[`concept-lesson-generation.prompt`](../../packages/infrastructure-litellm/prompts/concept-lesson-generation.prompt),
[`matchingGuard.ts`](../../packages/application/src/matchingGuard.ts),
[`verifyStudyItemKeys.ts`](../../packages/application/src/verifyStudyItemKeys.ts) (the wiring
pattern U3 mirrors), [`gateByJudgment.ts`](../../packages/application/src/gateByJudgment.ts),
[`generateStudyItemBank.ts`](../../packages/application/src/generateStudyItemBank.ts),
[`studyItemGenerationAdapters.ts`](../../packages/infrastructure-litellm/src/studyItemGenerationAdapters.ts),
[`toolSchemas.ts`](../../packages/infrastructure-litellm/src/toolSchemas.ts).

There is no linked brainstorm. Problem framing came from the 2026-08-07 U2 hand-inspection recorded
in the deleted grounding plan (`git log --diff-filter=D -p -- docs/plans/2026-08-05-001-*.md`) and
the planning interview; this ready plan owns the implementation design until the work completes.

## Repository evidence and problem statement

### Frozen defect inventory — Thermohaline circulation, 16 matching items / 61 pairs, 2026-08-07

Frozen here because the source expedition is reset before the first gate run and the plan that
recorded it is deleted.

1. **Tautological pairs.** `Upwelling` (all three pairs) and `Downwelling` ordinal 0 restate the
   prompt as the match; for `Upwelling` ordinals 0 and 1 the match **contains the prompt verbatim**,
   so the pairing is solvable by string overlap and tests nothing.
2. **Ambiguous prompt sets.** `Thermohaline circulation disruption` ordinals 0 and 2 are near
   synonyms on both sides; `Seawater density` ordinal 3 ("surface water becoming cooler or saltier")
   subsumes ordinals 0 and 1; `Ocean overturning cells` ordinal 0 (deep water formation) against
   ordinal 1 (downwelling) is a distinction the lesson itself blurs by calling deep water formation
   "a specialized form of downwelling".
3. **Graph vocabulary in learner copy.** Two matches read "Deep ocean currents are a *dependent
   concept*…" and "a *sibling* water mass". Matching only — options, impostor statements, and
   questions were clean.

Positive control: `North Atlantic Deep Water` is the ideal shape — four crisp, mutually exclusive
facet prompts (salinity / temperature / depth / what it drives) against four factually correct
values. The redesigned prompt aims at exactly this shape; the U4 probe's clean board reconstructs it.

### Mechanism confirmations (2026-08-07 exploration)

- The matching prompt receives **no sibling context** — `studyItemTemplateData` renders `siblings`
  but `study-matching-generation.prompt` never references it. The graph vocabulary arrives through
  quoted lesson text, not through the matching call.
- The lesson prompt frames its neighbor lists as "(prerequisites)", "(dependents)", and "Sibling
  concepts" (`concept-lesson-generation.prompt:20-25`), and the section-kind schema description
  repeats "prerequisite, dependent, and sibling neighbors" (`toolSchemas.ts:654`). Nothing forbids
  that vocabulary in learner prose. The bullet-grounding fix that recovered coverage (24→48) made
  every applications bullet quotable, giving the contamination a verbatim path into match text.
- The guard's only degeneracy check is exact normalized equality of prompt and match
  (`matchingGuard.ts:33`); its existing anti-cueing defense is one prompt sentence that U2 measured
  as insufficient.
- No verifier ranges over a matching item's pair set. Key verification asks per-candidate claim
  truth, which admits a tautological pair (it is true) and cannot express cross-pair fit.

### Problem class and conventional practice (AGENTS rule 21)

- **Tautology** is the item-writing literature's **clang association / cueing** defect: a surface
  association between stem and keyed answer lets a testwise examinee answer without knowing the
  material. Conventional remedy: author-side rules against lexical overlap between stem and key,
  enforced at review. This plan applies the same split — generation rules in the prompt, plus a
  deterministic reject for the one provable subclass (full containment).
- **Ambiguity** is the matching/extended-matching-question rule that **each premise must have
  exactly one defensible answer within a homogeneous option set**. Conventional remedy: a reviewer
  checks every premise against every option, not just the keyed one — the N×N check U3 ships,
  the same "verify every candidate, not the key" posture Study Item Key Verification adopted.
- **Graph vocabulary** is **prompt/meta-language leakage** into generated content. Conventional
  remedy: mark internal context as internal and prohibit its vocabulary in output, at the stage
  that owns the text — the lesson generator, not its quoting consumers.

No bespoke method is introduced anywhere in this plan.

## Interview-locked decision ledger

**D1 — Keep and fix matching.** Deletion (greenfield license) and demotion were considered and
rejected: matching is a third of the bank, the only cross-facet discrimination mechanic, and all
three fixes are prompt-level or mirror shipped wiring — cheaper than ripping out the guard, grading,
partial-credit semantics, board UI, and Recall Challenge lineups.

**D2 — All three fixes.** Severity differs (ambiguity: learner marked wrong for the right answer;
tautology: mastery inflation; vocabulary: immersion/ADR-0033 discipline) but each is either
learner-harming or near-free.

**D3 — One plan, sequenced units.** The TODO's "three distinct fixes" warning forbids pretending one
mechanism covers all three; it does not require three plan files. The fixes share one subsystem, one
regeneration rig, and one inspection protocol, and the gates must be sequenced for attribution.

**D4 — Fix 1 shape.** Redesign the matching prompt (facet-spanning pairs in the North Atlantic Deep
Water shape; the match side must not restate the prompt) **and** extend the guard's equality check to
normalized full containment: reject when one side wholly contains the other. Containment is the
provable subclass of "solvable by string overlap" (rule 16); the prompt owns the paraphrase subclass;
the U2 gate measures both — and rule 16's removal clause is armed: if the containment veto rejects
legitimate pairs, it is removed, not tuned.

**D5 — Fix 2 judge shape.** One call per guarded matching item: the judge sees the question, all
prompts, and all matches, and classifies **every (prompt, match) cell** as `fits` / `does_not_fit` /
`unclear` with a reason, echoing both ordinals. Deterministic admission mirrors key verification's
rule: admit iff **no non-keyed cell is `fits`** and **no keyed cell is `does_not_fit`**; `unclear`
never vetoes; a cell the judge never returned is `unclear`. The grid (not per-prompt fit-sets) was
chosen because it also exposes a mis-keyed pair, and because sparse-list outputs are the shape this
generator family has historically fumbled (see the flat-impostor schema note in `toolSchemas.ts`).

**D6 — Unavailability.** Judge unreachable → the matching item **passes through unverified**: that
is matching's status quo, every pair retains a verbatim mechanical anchor, and its worst failure is
a `partial` grade rather than a taught falsehood. Dropping would gut a third of the bank under the
throttling U4 observed on real traffic. This extends ADR-0026's harm asymmetry, not replaces it.

**D7 — Veto budget.** Veto → one regeneration whose `retryFeedback` names the offending cells and
the judge's reasons → guard → one re-verification → reject as an inspectable rejected row. Mirrors
the shipped key-verification flow; retry-budget changes remain a separate measured decision.

**D8 — Fallback rung stays closed for matching.** Matching Assignment Verification checks *fit*,
not *claim truth*, so the D6 interlock of the grounding plan still holds: forgiving a lost quote is
admissible only where a judge checks the claim it no longer anchors. Matching keeps resolving
citations through the verbatim rungs alone.

**D9 — Fix 3 shape.** Root-fix the lesson stage only: (1) reword the neighbor-list labels in
`concept-lesson-generation.prompt` into learner-neutral framing; (2) add one system-prompt sentence
— the neighbor lists are internal context; never call anything a "concept", "node", "prerequisite",
"dependent", or "sibling" in learner-facing text; write about the subject matter directly; (3)
reword the `toolSchemas.ts:654` section-kind description that repeats the same vocabulary. No lexical
guard — a regex over "dependent" or "sibling" false-negatives on legitimate domains (dependent
variables, sibling species), exactly what rule 16 forbids. **Amended by measurement:** D9 also
excluded item-prompt edits on the premise that item copy was clean. U2 found graph vocabulary in a
matching question, so the prohibition now covers the item prompts too, from one shared partial.

**D10 — Sequencing.** U1 (both prompt-side fixes) → U2 (gate) → U3 (judge) → U4 (gate). U2 records
ambiguity incidence as U4's baseline but does not gate on it — U1 ships nothing that targets it.

**D11 — Environment.** Merge `fix/study-item-grounding` → `main` first; branch
`fix/matching-item-quality`. Iterate locally with free hard resets; run both real-use gates on the
shared VPS deployed container after `pnpm db:reset`, proving the container runs the freshly built
image (compare `docker inspect … .Image` against the image id — see TODO environment notes).

**D12 — Naming and documentation.** New CONTEXT.md term **Matching Assignment Verification**,
distinct from Study Item Key Verification because it asks a different question. Amend ADR-0026's
"matching — deliberately unverified" interlock paragraph and CONTEXT's key-verification term in the
same change as U3. No new ADR: this extends policy ADR-0026 already owns.

**D13 — Gate topics and pass bars.** U2 regenerates `Thermohaline circulation` — the only topic with
a pair-level defect inventory — and passes when no inspected pair is surface-solvable, learner copy
carries zero graph vocabulary (lessons and items), coverage holds, and the containment veto caused
no false-negative loss. U4 regenerates Thermohaline plus one fresh different-domain topic (rule 17)
and passes when no admitted item carries an ambiguous pair set, coverage is 48-of-48 where judges
were reachable, and veto counts are reported by rule.

## Target design

### Matching generation (U1)

The prompt's pair contract becomes role-asymmetric and facet-spanning: each prompt names a distinct
facet, aspect, or situation of the node; each match carries the content answering *only* that facet;
**when that answer is a named term the match is the term itself, never a definition of it**; the pair
set must be mutually exclusive — no match may plausibly answer another pair's prompt; **every match
differs from every other match, resolved by re-choosing the aspect rather than padding a repeated
answer**; and the match must not restate or contain the prompt's wording. The question must announce
the pairing the pairs actually implement. Citation requirements are unchanged.
Prompt language stays domain-neutral (rule 17). The guard adds one check beside the existing
equality veto, with a stable reason string for gate greps:

```text
normalize(prompt) === normalize(match)          -> reject (existing)
normalize(match).includes(normalize(prompt))
  || normalize(prompt).includes(normalize(match)) -> reject: "matching prompt and match must not
                                                     contain one another"
```

### Lesson generation (U1)

Neighbor lists rendered as learner-neutral framing (for example "Concepts a learner meets just
before this one:" / "Concepts a learner typically studies next:" / "Related concepts in the same
domain:"), one prohibition sentence in the system prompt, and the `kind` description in
`toolSchemas.ts` reworded. Config hashes re-derive mechanically (ADR-0034); no manual bump.

### Matching Assignment Verification (U3)

One prompt file, one descriptor, one stage — on the existing cross-family `kg-independent-judge`
alias, so no `litellm/config.yaml` change. Prompts keep their pair ordinals; matches are presented
sorted by normalized text **and renumbered by sorted position**, with the application holding the
presentation-index → pair-ordinal map. Deterministic, so a re-run judges the same board — and it
removes the whole diagonal cue rather than only its positional half. *(Amended during U3: this
originally said matches keep their pair ordinals attached. Sorting alone hides the key by position
while the printed pair ordinal hands it straight back, more legibly than position ever leaked it.
A judge that can read the key has no reason to test any other cell.)*

```text
generate + guard (round 1)            STAGE matching-generation
        |
        v
gateByJudgment over guarded items     STAGE matching-assignment-verification
        |- admitted ................. item
        |- vetoed ................... regenerate with cell-level feedback,
        |                             guard, verify once more, else reject
        `- judge unavailable ........ admit unverified (D6)
```

Tool schema, modeled on the key-verification verdict array:

```ts
z.object({
  verdicts: z.array(z.object({
    promptOrdinal: z.number().int(),
    matchOrdinal: z.number().int(),
    verdict: z.enum(["fits", "does_not_fit", "unclear"]),
    reason: z.string().min(1)
  }).strict())
}).strict()
```

`matchingAssignmentVetoReason` is a deterministic function over the grid implementing D5. Expected
budget shifts U4 must report against: +1 judge call per matching item (16 per topic) plus vetoed
regenerations; matching's worst case moves from 2 generation calls to 3 (the same shift impostor
took); the topic-generation stage denominator moves **15 → 16**; and a third verification bracket
can overlap the two existing ones, so peak independent-judge load is capped by its own new
concurrency constant — that knob, never production generation concurrency, is what moves if the
gate sees 429s.

## Implementation units

### U1 — matching prompt redesign, containment veto, lesson vocabulary root-fix

- Rewrite `study-matching-generation.prompt` pair rules per the target design, mirroring every rule
  into the `toolSchemas.ts` matching `describe` text.
- Add the containment veto to `validateMatchingItem` beside the equality check.
- Constrain matching facets in `study-item-blueprint.prompt`: a facet whose answers collapse onto one
  or two values cannot be built on a one-to-one board.
- Own the graph-vocabulary prohibition in `prompts/partials/learner-copy-vocabulary.prompt` and
  include it from the lesson and all three item prompts; reword their internal neighbor-list framing
  and the `toolSchemas.ts` kind/neighbor descriptions to match.

Tests: containment veto rejects both directions after normalization; a legitimate overlapping pair
(shared words, no containment) passes; exact equality still rejects; reason strings match the gate
greps; existing guard tests stay green.

### U2 — prompt-fix gate (real-use pass 1)

Reset the shared schema, deploy, regenerate `Thermohaline circulation`. Hand-inspect **every**
matching pair (ADR-0013) against the frozen inventory: surface-solvable pairs, graph vocabulary in
any learner copy (lessons and all item types), and ambiguity incidence — recorded as U4's baseline,
not gated. Record items-per-type, rejections by reason, and specifically whether the containment
veto rejected anything legitimate (rule 16 removal clause). Coverage must hold at 48-of-48.

### U3 — Matching Assignment Verification, with same-change documentation

Add: `study-matching-assignment-verification.prompt`; schema + validator in `toolSchemas.ts`;
descriptor in `studyItemGenerationAdapters.ts`; `MatchingAssignmentVerificationPort` in
`packages/ports`; verdict types in `domain-core`; `STAGE_TAGS.matchingAssignmentVerification` with
its catalog entry in `operationTimelineCatalog.ts` and learner copy in `stageCopy.ts` ("Checking the
pairs"); the `gateByJudgment` phase (`verifyMatchingAssignments.ts`) with
`matchingAssignmentVetoReason` and its own concurrency constant; the stage in
`expeditionJournal.ts`'s `EXPECTED_TOPIC_GENERATION_STAGE_PLAN` (denominator 15 → 16); port
construction in `learnerGeneration.ts` and `knowledgeGraphWorker.ts`; `configHashes.test.ts`
stage-tag list.

Documentation in the same change: amend ADR-0026's interlock paragraph; amend CONTEXT.md's *Study
Item Key Verification* term and add *Matching Assignment Verification*.

Tests: a non-keyed `fits` vetoes; a keyed `does_not_fit` vetoes; `unclear` (including a missing
cell) never vetoes; a stubbed grid reconstructing the `Seawater density` subsumption shape is
rejected through the cross-fit branch; unavailability admits; the regeneration feedback names the
offending cells; persisted item order is a function of node order under out-of-order judgment
resolution; the match presentation order is the deterministic normalized sort.

### U4 — correctness gate (real-use pass 2) and probes

1. **Probes, live judge, 5 draws each.** A reconstructed ambiguous board (one prompt subsuming two
   others, the `Seawater density` shape) must be vetoed through the cross-fit branch 5 of 5; a
   reconstructed clean board (the `North Atlantic Deep Water` facet shape) must be admitted 5 of 5 —
   the discrimination-not-distrust control.
2. **Two runs, one reset and one deploy, sequential:** `Thermohaline circulation` for
   comparability, plus one fresh topic in a different domain (rule 17).
3. Hand-inspect every admitted matching item in both runs for ambiguity; record items-per-type,
   veto counts by rule branch, regeneration rescue rate, unavailability admissions, stage
   wall-clock, and the live stage denominator (16).

## Acceptance

- `pnpm check` green; `pnpm test:db` green against `lrnki_test` only.
- U2 passes its D13 bar, with ambiguity incidence recorded as baseline and a rule-16 verdict on the
  containment veto (kept clean, or removed with the removal recorded).
- Both U4 probes pass; no admitted item in either U4 run carries an ambiguous pair set; coverage is
  48-of-48 wherever judges were reachable; the two subtraction/addition directions (assignment
  vetoes vs. unavailability admissions) are reported separately.
- ADR-0026 and CONTEXT.md are amended in the same change as U3's code.
- A gate that cannot be attributed is not evidence: if U2's delta is ambiguous, diagnose before U3.

## Out of scope

- **Matching claim-truth verification and the fallback citation rung** (D8) — fit is not truth; a
  consistently-matching false pair set survives this plan by design and stays a real-use inspection
  responsibility.
- **Option-select and impostor changes** — measured clean for these defect classes.
- **Retry-budget changes** — the existing constants stay unless U4 measures routine second-attempt
  failure, which is a separate decision.
- **The matching board UI and grading semantics** — `partial` scoring is untouched.
- **Progressive readiness / generation wall-clock** — U4 records the stage cost as input to that
  standing TODO follow-up; this plan does not act on it.

## Validation Log

One entry per closed implementation unit; see the hygiene comment at the top of this file.

### U1 — matching prompt redesign, containment veto, lesson vocabulary root-fix (2026-08-08)

Commits: `d71d52b`, `7ebe4ac`. `pnpm check` and `pnpm test:db` green.

**Proved.** The matching pair contract is role-asymmetric and written to **both** places the model
reads it — the prompt file and the forced-tool `description` fields; a rule in only one makes the
next gate's delta unattributable. Three rules: **role asymmetry** (the prompt names an aspect, the
match carries its answer), **named terms** (when the answer is a named term the match must BE that
term, and the question must announce the pairing the pairs implement), and **distinct matches**,
stated as "re-choose the aspect" rather than "make the answers look different" — padding a repeated
answer into distinctness *is* the paraphrase defect. The graph-vocabulary prohibition is owned by
`prompts/partials/learner-copy-vocabulary.prompt` and included by the lesson and all three item
prompts (rule 18); dependent stage hashes re-derive mechanically (ADR-0034).

**Invariants a re-run must not break.**

- Containment stays **contiguous word sequence** containment — never a character `includes` (wrong
  in both directions at once, both pinned by a mutant-verified test) and never a non-contiguous
  "all the prompt's words appear somewhere" check, which is a heuristic rule 16 forbids here.
- Equality, containment, and distinctness keep **distinct** reason strings; a gate greps
  `must not contain one another`, `must differ`, and `must be distinct` separately.
- No lexical vocabulary guard exists anywhere, by D9: `dependent` and `sibling` have legitimate
  domain senses — U4 met one. The prohibition is a prompt rule; a vocabulary query is inspection.
- Judge prompts keep their own internal labels: their output is verdicts, never learner copy.
  `learner-scaffold-*` is exempt for the same reason — an adjacent-layer gap, not an omission.

### U2 — prompt-fix gate, real-use pass (2026-08-08)

`Thermohaline circulation`, Oceanography, full production pipeline after `pnpm db:reset`, 16 nodes,
16 matching items / 61 pairs hand-inspected. **Result: PASS.**

**Proved.** Coverage **48 of 48, zero rejections**. The containment veto fired zero times and cost
zero items — the **rule 16 verdict is keep, not remove**. The paraphrase-degeneracy class is gone:
no match in 61 pairs restates its own prompt, and every terminology-shaped node answers with the
name, against a baseline where `Pycnocline` was degenerate on all four pairs. Relationship
vocabulary eliminated: zero `dependent`/`sibling`/`prerequisite`/`node` in 549 learner-copy rows.

**Attribution that must not be re-litigated.** An intermediate run lost two matching items to
`matching matches must be distinct`, reproduced **3 of 3** against the real model. The cause was
upstream — the blueprint assigned a facet whose answer space holds two values while the board needs
four — so U1's named-term rule did not create that defect, it exposed one the old prompt hid by
padding. The matching-facet constraint added to `study-item-blueprint.prompt` restored 48 of 48, but
**it is stated, not proven**, and U4 measured it over-firing (see Open findings).

**Handed to U4 as its ambiguity baseline (D10).** Two admitted items would fail an assignment
check: `Freshwater input effects on thermohaline circulation` (matches 1 and 3 interchangeable, 0
also fits prompt 3) and `Salinity effect on seawater density` (prompts 2 and 3 near synonyms).

### U3 — Matching Assignment Verification, with same-change documentation (2026-08-08)

Commit `d8d3bf2`. `pnpm check` and `pnpm test:db` green. Real-model evidence here is a **1-draw live
probe**, superseded by U4's 5-draw probes and two full runs.

**Proved.** Matching runs a third verification bracket. `matching-assignment-verification` sits after
`matching-generation` in the shape option-select and impostor already use — guard → judge →
deterministic veto → one informed regeneration → guard → verify once → settle. Stage denominator
**15 → 16**.

The **control flow is owned once**: `verifyGuardedItems.ts` holds the two-round envelope all three
verified types share, and each type contributes only its question, its veto rule, and its
unavailability disposition. Copying a second orchestrator would have put "a vetoed item gets exactly
one informed regeneration" in two places (rule 18). The subject type is F-bounded because
`regenerate` must return *another subject of its own type* — that is what makes the second pass
judge the NEW candidates rather than re-judging the vetoed ones.

**Invariants a re-run must not break.**

- The match presentation is a **deterministic function of the item** (normalized text sort,
  renumbered by sorted position). A random shuffle makes a re-run's disagreement unreadable;
  attaching pair ordinals re-opens the key leak. The contract is owned by
  `MatchingAssignmentVerificationPort`'s doc comment and ADR-0026.
- `unclear`, and a cell the judge never returned, **never veto** — in either branch. An N×N grid is
  where this bites hardest: a short response leaves whole rows unjudged.
- Matching's unavailability disposition is **pass-through** (D6), the opposite of impostor's, and it
  depends on matching keeping its verbatim-only citation rungs (D8). If matching ever opts into the
  generated-passage fallback, this disposition must change with it.
- The veto reason starts `matching assignment verification rejected the item:` and names the
  offending cells by text — it is both the rejected-row reason and the regeneration feedback.
- The bank test's matching stub returns `unclear` for every cell and **cannot** confirm the key,
  because the presentation hides it: the cheapest standing proof of the key-hiding.
- `DEFAULT_ITEM_VERIFICATION_CONCURRENCY` is the single knob all three brackets read — that is what
  moves on 429s, never production generation concurrency.

**Documented in the same change (D12).** ADR-0026 gains the Matching Assignment Verification
paragraphs, the key-hiding rationale, matching's pass-through row in the unavailability asymmetry,
and the containment veto; CONTEXT.md gains the term and narrows *Study Item Key Verification* to
"true and unique".

### U4 — correctness gate, probes and two real-use runs (2026-08-08)

- **Milestone:** Matching Assignment Verification live over the full pipeline, plus U1's pair
  contract and containment veto, judged on the shared deployed container.
- **Fixture and source type:** two topic expeditions on the VPS after `pnpm db:reset` and a deploy
  of `d8d3bf2` — `Thermohaline circulation` (Oceanography, for comparability) and
  `Monetary policy transmission` (Economics, fresh domain, rule 17). 16 derived nodes each; **all
  26 admitted matching items and their 95 pairs hand-inspected** (ADR-0013), plus an 867-row
  learner-copy vocabulary scan with its positive control.
- **Real model calls used:** yes, throughout. The container was proved to be the freshly built
  artifact by comparing `docker inspect lrnki-learner-api --format '{{.Image}}'` against
  `docker compose images learner-api`, and by finding the new prompt file inside it.
- **Result: PASS**, with one acceptance clause **not met** — see the residual below. The probes
  pass outright; the stage removes the defect class it was built for; one admitted item in 26 still
  carries an ambiguous pair set.

**Probes, 5 draws each, live `deepseek-v4-flash-0731`.** The reconstructed `Seawater density`
subsumption board was **vetoed 5 of 5**, every draw through the cross-fit branch with 4 offending
cells and no keyed `does_not_fit`, on a non-identity permutation. The reconstructed
`North Atlantic Deep Water` facet board was **admitted 5 of 5** with exactly the four keyed cells
fitting — the discrimination-not-distrust control. Both returned the full 16-cell grid in every
draw. **Caveat that belongs to the judge's qualification:** at production sampling (temperature 0,
seed 7) the grids were *identical* across all five draws and only the free-text reasons varied, so
this measures the shipped configuration's stability, not the model's dispersion under sampling.

**The stage does its job, and both branches fire in real use.** Four items were finally rejected by
assignment verification: three through the cross-fit branch and one — `Policy rate pass-through` —
through **keyed `does_not_fit`**, a mis-keyed pair. That second branch is the one a per-prompt
fit-set could not have exposed, and D5 chose the grid partly for it.

**Both subtraction/addition directions, separated.** Assignment vetoes subtracted **4** items; judge
unavailability added **0** unverified ones, because there were **zero** non-success calls across
2,532 in the window — no throttling at all, so the D6 pass-through was never exercised. The other
losses are neither: one guard rejection (`Seawater density`, duplicate matches, after its retry) and
one blueprint decline. Coverage is **45 of 48 per run**, with nothing lost to an unreachable judge.

**Round-1 vetoes and the rescue rate** are recoverable only from `LiteLLM_SpendLogs`, since a
rescued item leaves no row anywhere in the application schema: 18 verification calls over 14 round-1
items and 19 over 16 give **7 round-1 vetoes**, of which the one informed regeneration **rescued 3**
— all three in run 1, none of the three in run 2. Budget: 37 judge calls, **$0.038 for both topics**,
3.3–3.4 s a call, stage wall-clock 35.0 s and 27.6 s against run totals of 323 s and 215 s. Live
denominator **16**.

**Residual: one admitted item carries an ambiguous pair set**, so this acceptance clause is not
met at 1 of 26. `Balance sheet channel` prompt 1 — "Channel that operates through changes in asset
prices feeding into borrower net worth" — is keyed to `Asset price channel`, but that description is
defensibly the balance sheet channel's own asset-price path, which is keyed to prompt 0. Replaying
all 26 admitted items through the shipped stage put the judge's stability beyond doubt (**25 of 26
identical, 0 unavailable, every grid complete**) and this was the single disagreement: the replay
**vetoed** it. So the rule is at the edge of its sensitivity on this board rather than blind to it —
though the replay's reason misread prompt 2's "alongside" directionally, reaching the right verdict
by the wrong cell.

**Vocabulary and surface-solvability.** 867 learner-copy rows, control 737, exactly one `dependent`
— "heavily dependent on bank-intermediated credit", the legitimate domain sense, which is **evidence
for D9's refusal to add a lexical guard** (rule 16) rather than a defect. One bare `concept`
survives, now in a lesson body rather than U2's item question: same adherence class, still not
answerable with a veto. The containment veto fired zero times; the shared-word shortlist is
dominated in Economics by "channel" appearing in *every* match, which cues nothing, and the residual
cue-y shape is the named-term one, inherent to keying a named term.

**Safe to continue downstream: yes.** Four genuinely ambiguous items removed and the U2 baseline's
two-per-topic incidence down to one in 26; the residual is a quality tail, not a foundation defect.

### Open findings

- **The blueprint's matching-facet constraint now over-fires, and the direction-of-effect worry did
  not survive measurement.** U4 found 4 of 26 admitted items carrying the direction-of-effect facet
  shape, and all four are discriminable — each match names its own property — with clean diagonals on
  replay. The U2 collapse is not reproduced. The constraint, meanwhile, cost a real item: it declined
  `Surface ocean circulation` for having "only two distinct answers (right in NH, left in SH)".
  Forcing generation on that exact node with that exact facet, 3 draws, produced **no** collapsing
  board — the generator re-chose aspects, as U1's distinct-matches rule tells it to, and the judge
  admitted all three with perfect diagonals. So the decline is conservative rather than protective.
  Removing or narrowing it is a live decision; do not tune it against these nodes (rule 17).
- **Matching Assignment Verification does NOT settle the blueprint model question, and U4 is why.**
  The bake-off in `litellm/config.yaml` beside `kg-claim-extraction` records `deepseek-v4-flash`
  yielding 16 of 16 matching items against MiMo v2.5's 12 by never declining a node, with the extra
  items carrying **off-node drift and one false match**. This stage checks *fit*, not claim truth
  (D8) — a false but unambiguous match passes it by design, and off-node drift is not an assignment
  defect at all. Its measured subtraction is 4 finally rejected of 30 generated, all for ambiguity.
  So it is the wrong gate for that failure mode; the decision needs either claim-truth verification
  for matching (explicitly out of scope here) or a direct A/B of the blueprint model.
- **Matching's second generation attempt is now known to fail routinely on a hard node** (3 of 3 on
  the reproduced case before the fix; U4 saw it again, `Seawater density` losing its item to
  `matching matches must be distinct` after its retry). The plan puts retry-budget changes out of
  scope pending measurement; that measurement now exists, so raising `MATCHING_GENERATION_ATTEMPTS`
  is a live, separate decision.
- **One admitted item in 26 still carries an ambiguous pair set** (`Balance sheet channel`, run 2),
  so the acceptance clause "no admitted item carries an ambiguous pair set" is not met. The shipped
  rule vetoes that board on a re-judgment, so the lever is judgment stability on borderline boards —
  a second draw, or a stricter reading of "defensibly" in the prompt — not a new mechanism. Whether
  a ~4% ambiguity tail is acceptable is a product call this plan should not make silently.
- **Judge competence on `deepseek-v4-flash-0731` is qualified for the shipped configuration, and
  only that.** Evidence is now U4's two 5-draw probes (correct veto through the cross-fit branch,
  clean admit on the control, full grids in all 10 draws) plus a 26-item replay agreeing with
  production 25 times with zero unavailability. But production sampling is temperature 0 with a fixed
  seed and the probe grids were **identical across draws**, so nothing here measures dispersion under
  sampling. Do not read the shipped key-verification evidence (30 of 30 impostors clean) as covering
  this model; it was measured under gpt-oss-120b. Beware of citing the 2026-06-24 "flash is
  disproven" note against it: that measured a *previous* flash generation on whole-set ordering, and
  `litellm/config.yaml` now says so explicitly.
- **Why the judge moved, kept for the ADR sweep.** All three U2 attempt failures were
  `forced_tool_exhaustion` on `kg-independent-judge` while every `kg-claim-extraction` stage (MiMo
  v2.5) passed first try — Groq's RPM ceiling on OpenRouter's shared account taking out every judge
  stage at once, because ADR-0006's forced-tool provider lock (`provider.only: ["groq"]`,
  `allow_fallbacks: false`, after a 2026-07-06 failover landed on a provider that rejects forced
  `tool_choice`) is paid for in availability. `kg-prerequisite-ordering` still runs gpt-oss-120b and
  still carries that exposure. Mechanism and the 401/429/`no_tool_call` separation are owned by
  `docs/plans/TODO.md`'s Environment section; what belongs to the ADR sweep is the *rationale for the
  swap itself*.
- **Documentation debt to clear before this plan closes.** `docs/plans/TODO.md` is over its ~150-line
  cap and owes a consolidation — the ~55-line Environment section belongs in owning READMEs per the
  destination map. And the judge swap is a durable architectural decision affecting ADR-0007/0005 and
  ADR-0013 evidence; it is currently recorded only in `litellm/config.yaml` comments and here, so it
  needs an ADR amendment rather than dying with this plan.

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

**Status:** In progress — U1 and U2 are closed; U2 **PASSES** on its re-run. Next action: U3, the
Matching Assignment Verification stage, with its ADR-0026 and CONTEXT.md amendments in the same
change. The residual matching defect U2 leaves behind is ambiguity, which is exactly what U3 checks.

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
alias, so no `litellm/config.yaml` change. Matches are presented to the judge sorted by normalized
text with their pair ordinals attached: deterministic, and it removes the diagonal position cue an
aligned listing would leak.

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

Commits: `d71d52b` plus this unit's follow-up fix. `pnpm check` and `pnpm test:db` are green.

**Proved.** The matching pair contract is role-asymmetric in both places the model reads it: the
prompt file and the forced-tool `description` fields. Every contract rule this unit added is written
to **both**; a rule in only one of them makes the next gate's delta unattributable.

The pair contract now carries three rules, each closing a gap where the guard or the board enforced
something the prompt never stated:

1. **Role asymmetry** — the prompt names an aspect, the match carries its answer.
2. **Named terms** — when the answer to an aspect is a named term, the match must BE that term, never
   a definition of it, and the question must announce the pairing the pairs actually implement. This
   is what U2's first pass proved missing: the model resolved a terminology node by writing a
   definition on both sides.
3. **Distinct matches** — the guard has always rejected duplicate match texts, because the board
   cannot render two identical tiles, but the prompt never asked for it. Stated now, together with
   the instruction to *re-choose the aspect* rather than pad a repeated answer into looking different
   — padding is how the pre-U1 prompt hid this, and padding is the paraphrase defect.

The containment veto is computed over **word sequences, not normalized characters**. A character
`includes` is wrong in both directions simultaneously, and both are pinned by a test verified against
a mutant: it rejects `Heap` / `Cheapest region to grow at runtime` (subword) and it misses
`Allocates memory at runtime` inside `…allocates memory, at runtime…` (punctuation). Contiguous word
containment is the provable reading of "one side wholly contains the other" and therefore the only
part of the cueing defect rule 16 lets a deterministic gate own.

The graph-vocabulary prohibition is owned by one file,
`prompts/partials/learner-copy-vocabulary.prompt`, and included with `{{> … }}` by the lesson and all
three item-generation prompts (rule 18). `promptFileDependencyBytes` folds partial bytes into the
config hash, so editing the shared rule re-derives every dependent stage's hash mechanically
(ADR-0034). Each prompt keeps its own one-line internal-context lead-in; the shared file owns only
the prohibition. The internal context itself was relabeled from "neighbor concepts" to "neighboring
topics" everywhere, because a prompt that forbids a word while using it to describe its own input is
self-undermining — the leak mechanism D9 identified is the model copying the framing it is given.

**Invariants a later unit or re-run must not break.**

- Containment stays *contiguous word* containment. A non-contiguous "all the prompt's words appear
  somewhere in the match" check is a heuristic, not a guarantee, and rule 16 forbids it here.
- Equality, containment, and distinctness keep **distinct** reason strings; the gate greps
  `must not contain one another`, `must differ`, and `must be distinct` separately.
- Matching still opts out of the generated-passage citation fallback (D8). U3 verifies fit, not
  claim truth, so it does not unlock that rung.
- No lexical guard exists anywhere, by D9: `dependent` and `sibling` have legitimate domain senses.
  The prohibition is a prompt rule; the vocabulary query in the gate is an inspection query, never a
  veto.
- `study-item-key-verification.prompt` still renders a `Sibling concepts:` label. That is a judge
  prompt whose output is verdicts, never learner copy, so it is deliberately untouched. The same
  reasoning exempts `learner-scaffold-*` — Support Path copy was outside this gate's measured set and
  is an adjacent-layer gap, not a silent omission.

**Hands off to U3.** Two rig facts, both of which cost a run to learn:

- Drive an API composed from the working tree
  (`LEARNER_API_PORT=… tsx --env-file=.env apps/learner-api/src/index.ts`), never the running
  `lrnki-learner-api` container: `.prompt` files are baked into the image.
- **Restart that process after every prompt edit.** `readPromptFile` and `readPartial` cache by path
  in module state, so a long-lived API serves the prompts it read first and reports green on the
  previous behavior — the container trap, reproduced inside the working-tree escape from it.

### U2 — prompt-fix gate, real-use pass (2026-08-08)

- **Milestone:** U1's matching pair contract (role asymmetry, named terms, distinct matches), the
  containment veto, and the learner-copy vocabulary root-fix.
- **Fixture and source type:** topic expedition `Thermohaline circulation`, Oceanography, 16 derived
  nodes, 16 matching items / **61 pairs**, every pair hand-inspected (ADR-0013), plus a 549-row
  learner-copy vocabulary scan. Discovery is non-deterministic, so the node *labels* differ from the
  frozen inventory's run; the node count and the terminology-shaped node class are what carry over.
- **Real model calls used:** yes — full production pipeline after `pnpm db:reset`.
- **Result: PASS**, with one residual defect class recorded below and handed to U3/U4.

**Met.** Coverage is **48 of 48 with zero rejections**. The containment veto fired zero times and cost
zero items, so the **rule 16 verdict is keep, not remove**. The paraphrase-degeneracy class that made
the first pass FIX_FIRST is **gone**: no match in 61 pairs restates its own prompt, and every
terminology-shaped node now answers with the name — `Ocean upwelling` keys nitrates/phytoplankton/
zooplankton/euphotic zone, `Surface ocean currents` keys `Wind` and `Gulf Stream`, `Temperature
effect on seawater density` keys `thermal expansion coefficient`. Against a baseline where
`Pycnocline` was degenerate on all four pairs and `Upwelling` was string-solvable on two of three,
this is the intended shape. Relationship vocabulary is **eliminated**: zero occurrences of
`dependent`, `sibling`, `prerequisite`, or `node` in 549 learner-copy rows.

**Residual, recorded not gated.** One bare `concept` survives, in one matching question of 48
("Match each thermohaline circulation concept to…"). The rule is now stated in both the prompt and
the schema description, so this is adherence, not coverage — and rule 16 forbids answering it with a
lexical veto. And on the two nodes whose facet is a direction-of-effect mapping, the pairs are
low-discrimination: `Seawater density` pair 2 puts `pressure` in both the prompt and its own match,
uniquely within that item, which is one surface-solvable pair in 61.

**The coverage story, attributed by probe.** An intermediate run of this gate lost two matching items
to `matching matches must be distinct`. Re-running matching generation for exactly those nodes
against the real model reproduced it **3 of 3** — and the cause was upstream: the blueprint had
assigned `pairing each factor with its effect on density`, a facet whose answer space holds two
values while the board needs four distinct ones, so duplicates were *forced*. Two things follow.
First, U1's named-term rule did not create the defect; it exposed one the old prompt hid by padding
matches into distinctness. Second, the fix had to say "re-choose the aspect", not "make the answers
look different", or the cure reintroduces the disease. With the prompt rule and a matching-facet
constraint added to `study-item-blueprint.prompt`, coverage returned to 48 of 48.

**The blueprint constraint is stated but unproven.** The blueprint still assigned collapsing facets to
2 of 16 nodes in the passing run (`density effect of each factor on seawater`). Those items are now
admitted rather than rejected, because the generator resolves them into distinct matches — which is
why coverage recovered and also why those two items are the low-discrimination ones. The rule is kept
because it addresses a *proven* hard-failure mode, not because it was measured to work.

**Ambiguity incidence — U4's baseline, not gated here (D10).** Two items would fail an assignment
check. `Freshwater input effects on thermohaline circulation`: matches 1 and 3 are interchangeable
and match 0 also fits prompt 3. `Salinity effect on seawater density`: prompts 2 and 3 are near
synonyms ("North Atlantic deep water formation" / "Polar deep water formation mechanism") with
matches that swap freely. Both are the harm class — a learner who knows the material is marked wrong
— and both are what D5 chose the full N×N grid to expose.

**Method note that cost a false green.** An earlier inspection reported "zero vocabulary hits" because
the query used `jsonb_array_elements_text` on `concept_lesson_sections.items`, which is `text[]`;
psql printed the error and an empty result, which reads exactly like a clean pass. Every zero-row
quality assertion in this gate now carries a positive control in the same query — here, 74 of 97
bullets matching a common-word regex proves the scan reads text at all.

**Safe to continue downstream: yes.** The blocking defect is fixed and the residual is ambiguity,
which is precisely U3's subject.

### Open findings

- **Direction-of-effect facets still produce low-discrimination matching items, and U3 is now the
  tie-breaker on how to fix it.** The blueprint constraint added in U1 did not stop them (2 of 16
  nodes in the passing run), and the generator rescues them into admissible-but-weak pairs. The other
  lever — a stronger blueprint model — was measured on 2026-08-08 and is recorded in
  `litellm/config.yaml` beside `kg-claim-extraction`: `deepseek-v4-flash` yields 16 of 16 matching
  items against MiMo v2.5's 12, but never declines a node, and the extra items include off-node drift
  and one false match. That decision is deliberately deferred to this stage. **U4 must therefore
  report two things it would not otherwise:** how many admitted items carry the direction-of-effect
  shape, and whether the assignment judge vetoes the items a non-declining blueprint adds — the
  second is what settles the model question. Do not fix either by tuning prompt text against the
  density nodes; that is fixture tuning (rule 17).
- **Matching's second generation attempt is now known to fail routinely on a hard node** (3 of 3 on
  the reproduced case before the fix). The plan puts retry-budget changes out of scope pending
  measurement; that measurement now exists for one node, so raising `MATCHING_GENERATION_ATTEMPTS` is
  a live, separate decision rather than a hypothetical one.
- **Judge competence on `deepseek-v4-flash-0731` is smoke-tested, not measured.** The judge moved off
  gpt-oss-120b to a single DeepSeek v4 flash deployment (user decision, 2026-08-07) and there is
  deliberately **no fallback**, so verdicts stay attributable from the alias alone. Evidence so far is
  only two live probes: a U3-shaped verdict grid returned all four cells as real objects with correct
  verdicts, and a two-candidate claim check classified true/false correctly with sound reasons. That
  is schema compliance plus a smoke test, not discrimination measurement. **U4's probes are now doing
  double duty** — they qualify the new judge as well as the new stage, so a failure there must be
  diagnosed against both. Do not read the shipped key-verification evidence (30 of 30 impostors clean,
  captured defect rejected 5 of 5) as covering this model; it was measured under gpt-oss-120b.
  Beware of citing the 2026-06-24 "flash is disproven" note against it: that measured a *previous*
  flash generation on whole-set ordering, and `litellm/config.yaml` now says so explicitly.
- **Why the judge moved, kept for the ADR sweep.** All three U2 attempt failures were
  `forced_tool_exhaustion` on `kg-independent-judge` while every `kg-claim-extraction` stage (MiMo
  v2.5) passed first try. The cause was Groq's requests-per-minute ceiling on OpenRouter's *shared*
  account, which account credit cannot relieve — credits buy tokens, not request rate, so a funded
  balance and a sustained 429 coexist normally. The alias had no failover by design
  (`provider.only: ["groq"]`, `allow_fallbacks: false`) because OpenRouter failover once landed on a
  provider that rejects forced `tool_choice` with a 400 (expedition `bd89e63a`, 2026-07-06) — ADR-0006
  paid for in availability, taking out every judge stage at once. `kg-prerequisite-ordering` still
  runs gpt-oss-120b and therefore still carries that exposure. Failure modes stay separable by status:
  `401` = dead LiteLLM virtual key, `429` = upstream request rate, `{"kind":"no_tool_call"}` = a
  saturated bracket degrading. Never lower production generation concurrency to make a gate pass.
- **Documentation debt to clear before this plan closes.** `docs/plans/TODO.md` is over its ~150-line
  cap and owes a consolidation — the ~55-line Environment section belongs in owning READMEs per the
  destination map. And the judge swap is a durable architectural decision affecting ADR-0007/0005 and
  ADR-0013 evidence; it is currently recorded only in `litellm/config.yaml` comments and here, so it
  needs an ADR amendment rather than dying with this plan.

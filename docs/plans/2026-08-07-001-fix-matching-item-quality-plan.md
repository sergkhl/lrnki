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

**Status:** In progress — U1 shipped (`d71d52b`); U2 ran and returned **FIX_FIRST**. Next action: add
the named-term rule to the matching prompt plus the vocabulary prohibition to the item prompts, then
re-run U2. Do not start U3 until U2 passes — it verifies fit, not paraphrase-degeneracy.

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
reword the `toolSchemas.ts:654` section-kind description that repeats the same vocabulary. No
item-prompt edits (their copy measured clean) and no lexical guard — a regex over "dependent" or
"sibling" false-negatives on legitimate domains (dependent variables, sibling species), exactly what
rule 16 forbids.

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
the pair set must be mutually exclusive — no match may plausibly answer another pair's prompt; and
the match must not restate or contain the prompt's wording. Citation requirements are unchanged.
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

- Rewrite `study-matching-generation.prompt` pair rules per the target design.
- Add the containment veto to `validateMatchingItem` beside the equality check.
- Reword `concept-lesson-generation.prompt` neighbor labels + prohibition sentence; reword the
  `toolSchemas.ts:654` kind description.

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

### U1 — matching prompt redesign, containment veto, lesson vocabulary root-fix (2026-08-07)

Commits: `d71d52b`. `pnpm check` and `pnpm test:db` are green.

**Proved.** The matching pair contract is role-asymmetric in both places the model reads it: the
prompt file and the forced-tool `description` fields, which still carried the old "the match side is
the corresponding example, scenario, description, or application from the lesson" framing. Leaving
that description in place would have let the generator keep quoting a bullet and paraphrasing it into
the prompt — the exact cheapest-passing-item path — while the prompt file said otherwise, so U2's
delta would have been unattributable.

The containment veto is computed over **word sequences, not normalized characters**. A character
`includes` is wrong in both directions simultaneously, and both directions are pinned by a test that
was verified against a mutant: it rejects `Heap` / `Cheapest region to grow at runtime` (subword) and
it misses `Allocates memory at runtime` inside `…allocates memory, at runtime…` (punctuation).
Contiguous word containment is the provable reading of "one side wholly contains the other" and is
therefore the only part rule 16 lets a deterministic gate own.

**Invariants a later unit or re-run must not break.**

- Containment stays *contiguous word* containment. A non-contiguous "all the prompt's words appear
  somewhere in the match" check is a heuristic, not a guarantee, and rule 16 forbids it here.
- Equality and containment keep **distinct** reason strings; the gate greps
  `must not contain one another` and `must differ` separately.
- Matching still opts out of the generated-passage citation fallback (D8). U3 verifies fit, not
  claim truth, so it does not unlock that rung.
- The lesson vocabulary fix lives at the **lesson** stage only. No lexical guard exists anywhere, by
  D9: `dependent` and `sibling` have legitimate domain senses. The prohibition is a prompt rule and
  the inspection query in U2 is an inspection query, never a veto.
- `study-item-key-verification.prompt` still renders a `Sibling concepts:` label. That is a judge
  prompt whose output is verdicts, never learner copy, so it is deliberately untouched.

**Hands off to U2.** The gate must drive an API composed from the working tree
(`LEARNER_API_PORT=… tsx --env-file=.env apps/learner-api/src/index.ts`), never the running
`lrnki-learner-api` container: `.prompt` files are baked into the image, so a container older than
the prompt edit judges the previous behavior and reports green.

### U2 — prompt-fix gate, real-use pass 1 (2026-08-07)

- **Milestone:** U1's matching pair redesign, containment veto, and lesson vocabulary root-fix.
- **Fixture and source type:** topic expedition `Thermohaline circulation`, Oceanography, 16 derived
  nodes, 16 matching items / **62 pairs**, every pair hand-inspected (ADR-0013). Node count matches
  the baseline run, which is what makes the pair-level delta attributable to U1 rather than to a
  different graph.
- **Real model calls used:** yes — full production pipeline after `pnpm db:reset`, driving an API
  composed from the working tree, **not** the container (see U1's hand-off).
- **Result: FIX_FIRST.** Three of the four D13 criteria are met; the tautology criterion is not, and
  the residual defect is precisely attributed.

**Met.** Coverage is **48 of 48** with **zero rejections**. The containment veto fired zero times and
cost zero items, so the **rule 16 verdict is keep, not remove** — no false negative to answer for.
The baseline's verbatim-overlap tautologies are gone: no pair in the run has word-sequence
containment, where the baseline had `Upwelling` solvable by string overlap on two of three pairs.
Relationship vocabulary is **eliminated** — zero occurrences of `dependent`, `sibling`,
`prerequisite`, or `node` across all 463 learner-copy rows, against a baseline that read "a
*dependent concept*" and "a *sibling* water mass".

**Not met — the paraphrase subclass survives, concentrated in one item.** `Pycnocline` is degenerate
on **all four** pairs: each match restates its own prompt by synonym substitution ("Density gradient
driven by salinity changes" → "The component of the pycnocline caused by variations in salt
concentration"; "Global deep-ocean current system powered by density differences" → "A worldwide
circulation pattern driven by density contrasts"). A learner solves these with no oceanography at
all, and the keyed answers that *should* be there are names — halocline, thermocline, thermohaline
circulation. Its question states the inverted contract outright: "Match each oceanographic term to
its correct definition", so the model put a definition on **both** sides.

**Diagnosis, and why it is a prompt gap rather than a model limit.** `Ocean stratification` pair 0
carries the *identical prompt text* — "Layer where density rises sharply with depth" — and answers
**"The pycnocline"** correctly, in the same run, from the same model. `Seawater density` likewise
answers with names ("Haline contraction", "The pycnocline"). The redesigned prompt tells the model a
match "CARRIES the content answering that aspect" but never says that **when the answer is a named
term, the match must be that term, not a description of it**. On a terminology-shaped node the model
resolves the ambiguity the wrong way. One sentence closes it.

**Ambiguity incidence — U4's baseline, not gated here (D10).** Two items would fail an assignment
check. `Thermohaline feedback mechanisms`: salt-advection feedback *is* a positive feedback and
thermal feedback *is* a negative one, so matches 0↔2 and 1↔3 are interchangeable and a learner who
knows the material can be marked wrong. `Deep water formation`: all three prompts are region
questions, and "The North Atlantic" (pair 0) **contains** "The Labrador Sea and Nordic Seas" (pair 2);
pair 0 also keys brine rejection to the North Atlantic when brine rejection is the Antarctic
mechanism, so it may be mis-keyed as well — the shape D5 chose the full grid to expose.

**Residual vocabulary.** Two hits of the bare word `concept`, both self-referential framing: a lesson
applications bullet ("This coupling concept bridges…") and a matching *question* ("Match each ocean
stratification concept to its correct description"). The lesson prompt already forbids this, so that
one is adherence. The matching question is not covered at all: **D9's premise that item copy measured
clean is now falsified by measurement**, so the prohibition sentence belongs in the item prompts too.

**Method note that cost a false green.** The first inspection pass reported "zero vocabulary hits"
because the query used `jsonb_array_elements_text` on `concept_lesson_sections.items`, which is
`text[]` — psql printed the error and an empty result, which reads exactly like a clean pass. Any
zero-row quality assertion needs a positive control in the same query; adding one surfaced 463 rows
and the 2 real hits.

**Safe to continue downstream: no.** Fix the naming gap and re-run this gate before U3. U3 verifies
*fit*, not paraphrase-degeneracy, so it would ship over this defect without catching it.

### Open findings

- **A judge verdict can no longer be attributed from our own records, and U4 depends on attribution.**
  `kg-independent-judge` now has a LiteLLM deployment fallback to
  `openrouter/deepseek/deepseek-v4-flash-0731` (user decision, 2026-08-07). Our
  `operation_run_stages` rows record only the **alias**; the **deployment** that actually served the
  call is recorded in LiteLLM's spend logs. So "was this board admitted because it is clean, or
  because the flash fallback missed the ambiguity?" is unanswerable from the stage row alone. U4 must
  read the spend logs alongside its veto counts and report the judge mix, or its
  discrimination-not-distrust control (a clean board admitted 5 of 5) proves nothing about the
  primary judge. This is the measurement cost the fallback bought availability with.
- **The flash fallback is scope-limited and that limit is not enforced mechanically.** Measured
  2026-06-24, deepseek flash returned 0 edges on an 11-node whole-set ordering task where
  gpt-oss-120b produced a correct 11-edge DAG, so it is disproven for holistic reasoning and must
  never back `kg-prerequisite-ordering`. Judge stages are per-item classification, a different task
  shape, and a live forced-tool probe with the U3 verdict-grid schema returned all four cells as real
  objects with correct verdicts. Nothing prevents a later edit from extending the fallback to the
  ordering alias except the comment saying not to.
- **Why the fallback was needed, kept for the ADR sweep.** All three U2 attempt failures were
  `forced_tool_exhaustion` on `kg-independent-judge`, while every `kg-claim-extraction` stage (MiMo
  v2.5) passed first try. The cause is Groq's requests-per-minute ceiling on OpenRouter's *shared*
  account (`provider_name: "Groq"`, `is temporarily rate-limited upstream`), which account credit
  cannot relieve — credits buy tokens, not request rate, so a funded balance and a sustained 429
  coexist normally. The alias had no failover by design: `provider.only: ["groq"]` +
  `allow_fallbacks: false`, because OpenRouter provider failover once landed on a provider that
  rejects forced `tool_choice` with a 400 (expedition `bd89e63a`, 2026-07-06). That is ADR-0006's
  guarantee paid for in availability, and it took out **every** judge stage at once, including both
  shipped key-verification brackets. Failure modes stay separable by status: `401` = dead LiteLLM
  virtual key, `429` = upstream request rate, `{"kind":"no_tool_call"}` = a saturated bracket
  degrading. Do not lower production generation concurrency to make a gate pass.
- **The TODO environment note's Groq attribution is right; its framing is incomplete.** Correct it
  when U2 closes: the metering is Groq's, surfaced through OpenRouter, and the remedy the error names
  is BYOK at `openrouter.ai/settings/integrations`. Also record that
  `openrouter/deepseek/deepseek-v4-flash-0731` is locked to the `deepseek/fp8` tag deliberately —
  the model's 23 endpoints include **fp4** variants, and drifting quantization would make judge
  verdicts non-reproducible (ADR-0028). The curated widening, if first-party DeepSeek throttles, is
  other **fp8** tags only (`baseten/fp8`, `novita/fp8`, `parasail/fp8`).

---
title: Study Item Grounding and Key Verification - Plan
type: fix
date: 2026-08-05
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

# Study Item Grounding and Key Verification

**Status:** Ready

**Decision state:** Interview-locked. D1–D11 were chosen directly in the planning interview; D12 was
delegated to the recommended answer and is recorded as such. Re-evaluated 2026-08-05 before
implementation: D6/D9 amended — the fallback rung moves to U3 and applies only to the judge-verified
item types, so the D6 interlock is structural rather than aspirational — with a matching D5
refinement, and mechanical corrections to D8, the passage-id scheme, and the U3 inventory.

**Implementation state:** **U1 shipped** (2026-08-05); what it built, the invariants it establishes,
and what U2 is therefore measuring are the U1 entry in the [Validation Log](#validation-log). U2 —
the coverage gate — has not run, so no measured delta exists yet. U3 and U4 are untouched. Two steps
precede U2: [Execution order before U2](#execution-order-before-u2).

## Goal capsule

Two learner-visible defects in one generation pass share one cause: the Study Item grounding contract
verifies *quote mechanics* and never *claim truth*. It is simultaneously too weak — a "true"
statement that quotes a real passage can still be false, which marks a learner wrong for the right
answer — and too strict, because a quote the model failed to reproduce destroys the item, and on the
2026-08-05 shared run that destroyed **half the Study Item Bank**.

After this work:

1. a lesson has exactly one grounding shape, addressed by unique passage ids, and a citation resolves
   through a deterministic resolution ladder instead of an all-or-nothing string match, whose
   fallback rung exists only for the judge-verified item types;
2. every candidate answer in an option-select and impostor item is checked by an independent
   cross-family judge, and the item is admitted only when its answer key is unique;
3. the lie-only validity judge it replaces is gone, not left beside it.

## Canonical inputs

- Engineering and greenfield enforcement: [AGENTS.md](../../AGENTS.md), especially rules 1, 4, 5, 6,
  9, 13, 14, 16, 17, 18, 19, 21.
- Project language: [CONTEXT.md](../../CONTEXT.md) — *Study Item Bank*, *Concept Lesson*,
  *Grounding Provenance*, *Recall Challenge*.
- Deep-module boundary: [ADR-0001](../adr/0001-adopt-greenfield-deep-module-architecture.md).
- Forced named tool schemas: [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md).
- Real-source inspection gate: [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md).
- **Study Item Bank contract, amended by this plan:**
  [ADR-0026](../adr/0026-typed-study-item-bank.md).
- Shared operation-stage timelines and spend attribution:
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md).
- Concept Lesson substrate: [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md).
- Neural Stage Descriptors and config hashes:
  [ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md).
- Single shared learner environment: [ADR-0036](../adr/0036-run-single-shared-learner-environment-during-testing.md).
- Non-deterministic quality measurement:
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md).

Source files that own the current behavior:
[`generateStudyItemBank.ts`](../../packages/application/src/generateStudyItemBank.ts),
[`impostorGuard.ts`](../../packages/application/src/impostorGuard.ts),
[`optionSelectGuard.ts`](../../packages/application/src/optionSelectGuard.ts),
[`matchingGuard.ts`](../../packages/application/src/matchingGuard.ts),
[`gateByJudgment.ts`](../../packages/application/src/gateByJudgment.ts).

There is no linked brainstorm. Problem framing came from the 2026-08-05 real-use validation and the
planning interview; this ready plan owns the implementation design until the work completes.

## Repository evidence and problem statement

### Measured baseline — shared VPS, 2026-08-05, thermohaline expedition

Frozen here because the shared application schema is reset before the first gate run (D11).

| Fact | Value |
| --- | --- |
| Derived nodes | 16 |
| Study items that exist | **24 of a possible 48** |
| option-select | 11 items, 5 rejected |
| matching | **2 items, 14 rejected** |
| impostor | 11 items, 5 rejected |
| Rejections reading `citation does not verify against grounding` | **23 of 24** |
| Other rejection | 1 × `matching matches must be distinct` |
| Nodes with zero study items | `Seawater density`, `Surface ocean heat transport`, `Thermohaline circulation climate feedback` |

The TODO entry recorded this as "3 of 16 concepts have no study item". The real figure is that
**half the bank never generated**, matching is effectively non-functional, and one deterministic
failure accounts for 23 of the 24 losses. The local development database shows the same signature:
28 nodes, 70 of 84 items, 3 item-less nodes — all `llm_grounded`, all of which *have* a lesson. The
model wrote the lesson and then failed to quote its own text back.

### The captured correctness defect

The `Deep ocean return flow` impostor item, persisted with the designated lie at ordinal 3:

| Ordinal | `is_impostor` | Statement |
| --- | --- | --- |
| 0 | f | Deep ocean return flow is the slow, continuous movement of cold, dense water masses along the ocean floor from high-latitude regions toward the equator and into other ocean basins. |
| 1 | f | Deep ocean return flow completes the lower limb of the global thermohaline circulation, balancing the surface currents that transport warm water poleward. |
| 2 | **f** | **Deep ocean return flow is also known as the deep western boundary current.** |
| 3 | t | Deep ocean return flow is driven primarily by wind-induced convergence of surface currents that pushes water downward into the ocean interior. |

Ordinal 2 is stored as a *true* statement and is false: the DWBC is one western-intensified limb **of**
the return flow, not a synonym for it, and it contradicts ordinal 0's basin-spanning floor-hugging
description. A learner who knows the difference is marked wrong for the right answer.

### The four defects behind those numbers

1. **Colliding generated passage ids.** `generateStudyItemBank.ts:677` mints
   `` `${lesson.derivedNodeId}:${generatedPassageKind}:0` `` and `:689` mints
   `` `${lesson.derivedNodeId}:${passageKind}:lesson` ``, where the kind collapses every non-`definition`
   section to `mention`. Lessons routinely carry two or three generated citations, so two sections
   render as two prompt bullets carrying **the same id** (`studyItemGenerationAdapters.ts:259`).
   `resolveGroundingCitation` resolves with `passages.find(...)` — first match wins — so quoting the
   second section while citing the shared id is an unavoidable, undiagnosable rejection.
2. **The pre-gate and the grounding builder disagree about what grounding exists.**
   `groundedLessonFragments` (`:630-638`) counts `section.items` bullets and citations;
   `studyItemGroundingFromLesson` (`:655-698`) turns only citations, else `SUBSTANTIVE_KINDS` section
   text, into passages. `Block Structure` passed the matching pre-gate on three `applications`
   bullets the generator was never shown. Two functions, one fact — an AGENTS rule 18 violation.
3. **Option-select never receives its retry feedback.** `StudyItemGenerationPort.generateOptionSelect`
   accepts `retryFeedback` and `study-option-select-generation.prompt:22` renders
   `{{retryFeedbackBlock}}`, but the caller at `:331-362` never passes it. Matching and impostor both
   do. Option-select's "retry" is a blind re-roll of the same failing call.
4. **Only the keyed lie is ever checked for truth.** `impostorGuard.ts:71-82` proves each truth cites
   a passage and quotes it verbatim, which says nothing about whether the *restatement* holds;
   `:499-511` then judges the designated lie alone. Nothing in the pipeline can observe a second
   false statement. Option-select has the mirror hole: exactly one option carries `isCorrect`, but
   nothing checks that no distractor is also true.

### Problem class and conventional practice (AGENTS rule 21)

The established class is **answer-key uniqueness and distractor validity in Automatic Item
Generation**, resting on **claim-level attribution / faithfulness verification**. Both literatures
converge on the same practice: a generated item is verified by checking *every* candidate answer
against an independent verifier, not by checking the key alone, and attribution is established by
resolving a claim to identified evidence rather than by requiring the generator to reproduce a span
exactly. This plan adopts that conventional shape. No bespoke method is introduced; the only project
specialization is which of the three verdicts is permitted to veto (D5).

## Interview-locked decision ledger

**D1 — Scope.** One plan covers both halves: the recorded impostor correctness defect and the
citation-driven coverage collapse. They are the same contract failing in opposite directions.

**D2 — Mechanism.** Replace the lie-only judge with **whole-item key verification**: one judge call
per item classifies *every* candidate as true / false / unclear, and a deterministic rule enforces
answer-key uniqueness. Impostor call count is unchanged.

**D3 — Verified item types.** Impostor **and** option-select. Matching is out: its failure mode is
prompt ambiguity across pairs, which needs a different question shape and has no observed evidence.
Matching still benefits from every U1 coverage fix, because all three guards share
`resolveGroundingCitation`.

**D4 — Judge posture.** Domain truth, not passage entailment. Ask whether the candidate is true of
this concept in this Declared Domain, with grounding passages and siblings as context and all
candidates visible at once so an internal contradiction is observable. Strict entailment would
return "not stated" for the DWBC statement, since no passage contradicts it.

**D5 — Veto policy.** Veto only on a confident opposing verdict, which is what
[`gateByJudgment`](../../packages/application/src/gateByJudgment.ts) already structurally guarantees
and what AGENTS rule 16 requires:

- **impostor** is admitted iff the keyed lie is `claim_false` **and** no other statement is `claim_false`;
- **option-select** is admitted iff no distractor is `claim_true` **and** the key is not `claim_false`;
- `unclear` never vetoes — "the judge was unsure" is not a provable guarantee.

Judge unavailability keeps today's asymmetry, which ADR-0026 already justifies by harm: impostor
drops (a true "lie" teaches a falsehood; impostor absence is the designed safe state), option-select
passes through unverified (its status quo, and the node's only primary activity). The pass-through
covers only items whose mechanical anchor held: an option-select item admitted through the D9
fallback rung has no verbatim anchor, so absent a resolved verdict it drops like an impostor — the
fallback is admissible only under an actual verification (D6).

**D6 — Coverage fix.** U1 fixes the three deterministic defects — unique passage ids, one
grounding-shape owner, option-select retry feedback — plus the deterministic id-repair rung in the
citation resolver. The generated-passage fallback rung is admissible *only* because D2 adds semantic
verification — the two halves interlock, and neither is correct alone — so the fallback lands in U3,
in the same change as the judge, and applies only to the two judge-verified item types. Matching,
which D3 leaves unverified, resolves citations through the verbatim rungs alone.

**D7 — Judge wiring.** Each verified type gets a batched verification phase driven by
`gateByJudgment` under its own `STAGE_TAG` and its own concurrency constant. This migrates the one
divergent judge caller into the shared rule-16 home and puts peak `gpt-oss-120b` load under a single
explicit knob — which matters, because the TODO environment notes record that deployment throttling
the pipeline under concurrent brackets.

**D8 — One prompt, two descriptors.** A single `study-item-key-verification.prompt`, shared by two
`NeuralStageDescriptor` instances: `stageTag` is a single descriptor field baked into
`stageConfigHash`, so the D7 stage split forces two instances over the one prompt file. Impostor
passes its four statements as standalone claims and **omits** the item question, whose meta-form
("which statement is FALSE?") would corrupt per-statement judging. Option-select passes its question
as framing so each option reads as "the answer is *option*"; the question block is a template
conditional that renders empty for impostor.

**D9 — Citation resolution ladder.** For a **generated** passage: (1) cited id + verbatim quote;
(2) if the quote verifies verbatim against a *different* generated passage, use that passage — the
model quoted correctly and cited the wrong id, and repairing that is deterministic, not a threshold;
(3) for the judge-verified item types only, otherwise store the cited passage's full text as the
citation. Rungs 1–2 land in U1 for all three guards; rung 3 lands in U3 beside the judge it depends
on and is never offered to matching (D6). An unknown `passageId` still rejects. **Source** passages
keep the hard verbatim requirement unchanged. No similarity heuristic appears anywhere, so AGENTS
rule 16 holds.

**D10 — Bullet grounding.** The single grounding-shape owner emits each `section.items` bullet as its
own passage, always labeled `generated` with the node's `derivedNodeId` and never inheriting a parent
source citation — a model-written bullet is not source text, and labeling it as one is exactly the
masquerade ADR-0026 forbids. The pre-gate then counts precisely what the generator will see.

**D11 — Sequencing and gates.** Coverage first with its own real-use gate, then key verification with
a second gate. Measuring them together would make an item-count change unattributable. U2 therefore
measures the deterministic fixes alone and its recovery may be partial: the fallback rung and the
verification it depends on land together in U3 and are measured together in U4, which is the correct
joint measurement for an interlocked pair.

**D12 — Environment (delegated, recommended answer).** Iterate and run automated tests locally against
the local Compose stack, hard-resetting freely. Run **both real-use gates on the shared VPS against
the deployed container**, because ADR-0036 makes dev equal prod and ADR-0040 makes the container the
artifact that matters — a gate run anywhere else measures something that is not shipped. Reset the
shared application schema with `pnpm db:reset` *immediately before* each gate run: a clean schema
makes the item-count ratio unambiguous and removes the defective expedition at the first opportunity
rather than the last. `db:reset` touches only the application schemas, so the LiteLLM virtual-key
trap in the TODO environment notes does not fire.

## Target design

### Grounding shape — one owner

```text
ConceptLesson
     |
     |  lessonGroundingShape(lesson)          <- the ONLY answer to
     v                                           "what grounding does this lesson yield?"
{ provenance, passages[] }
     |                     |
     v                     v
structuralPreGate    option-select / matching / impostor generation
(counts passages)    (prompt renders passages)
```

`groundedLessonFragments` is deleted. `structuralPreGateBlueprint` counts the passages the generator
will actually receive, so a pre-gate pass can no longer promise grounding that does not exist and a
pre-gate decline can no longer hide grounding that does.

Passage ids become unique and stable per lesson:

| Passage source | id |
| --- | --- |
| Section citation or section body | `` `${derivedNodeId}:s${sectionIndex}` `` |
| Bullet *i* of a section's `items` | `` `${derivedNodeId}:s${sectionIndex}:i${i}` `` |

`sectionIndex` is the section's position in `lesson.sections`: `ConceptLessonSection` carries no
ordinal field, and the array order is the persisted order, so the index is stable per lesson.

The `kind` field (`definition` / `mention`) stays on the passage and is still rendered, because the
prompt uses it; it stops participating in identity, which is what caused the collision.

### Citation resolution ladder

`resolveGroundingCitation` in `optionSelectGuard.ts` is the single shared resolver for all three
guards, so rungs 1–2 land once and reach matching without a matching-specific change; the rung-3
fallback is a caller opt-in taken only by the two verified guards (D6), and the resolver reports
which rung admitted the citation so the D5 unavailability rule can see a fallback-admitted item:

```text
find(passageId)
  |- not found ................................ reject  (nothing resolvable)
  |- found, quote verifies .................... cite it                       (unchanged)
  |- found, quote verifies on ANOTHER
  |    generated passage ...................... cite THAT passage             (id repair, U1)
  |- found, source passage, quote fails ....... reject                        (unchanged)
  `- found, generated passage, quote fails .... option-select / impostor: cite the
                                                whole cited passage           (fallback, U3)
                                                matching: reject
```

### Key verification

One prompt file behind two Neural Stage Descriptors (D8), cross-family independent of the MiMo
generator on the existing `kg-independent-judge` alias (`gpt-oss-120b`), so no `litellm/config.yaml`
change is required.

```text
generate + guard (round 1)          STAGE study-item-generation / impostor-generation
        |
        v
gateByJudgment over guarded items   STAGE option-select-key-verification
        |                                 / impostor-key-verification
        |- admitted ......................... item
        |- vetoed ........................... regenerate with a feedback string
        |                                     naming the offending candidate and the
        |                                     judge's reason, guard, verify once more
        `- judge unavailable ................ impostor: drop / option-select: admit
```

Spend attribution is unaffected by the bracket split: `forcedToolStage.ts:48` tags spend with
`descriptor.stageTag`, so a retry generation call made inside a verification bracket is still
attributed to its generation stage.

New tool schema, modeled on the existing `conceptLessonRedundancyJudgmentValidator` array shape:

```ts
z.object({
  verdicts: z.array(z.object({
    ordinal: z.number().int(),
    verdict: z.enum(["claim_true", "claim_false", "unclear"]),
    reason: z.string().min(1)
  }).strict())
}).strict()
```

`claim_true` / `claim_false` rather than `true` / `false` so a verdict is never confused with a
boolean at a call site.

Prompt constraints (AGENTS rule 17): domain-neutral throughout, no fixture concept or expected
outcome, and the tool `description` field is as neutral as the templates.

## Implementation units

### U1 — Lesson grounding shape, unique ids, resolution ladder, option-select retry

- Rename/extend `studyItemGroundingFromLesson` into the single exported grounding-shape owner; emit
  section passages and `items` bullet passages under the new unique id scheme (D10).
- Delete `groundedLessonFragments`; `structuralPreGateBlueprint` counts the owner's passages.
- Implement D9 rungs 1–2 inside `resolveGroundingCitation`; the rung-3 fallback is deliberately
  absent until U3 lands it beside the verification it depends on (D6).
- Thread `retryFeedback` into the option-select attempt loop, matching the matching/impostor shape.

Tests: unique ids across a multi-section multi-bullet lesson; a bullet passage is never labeled
`source`; rung 2 repairs a wrong id; a quote that verifies against no passage still rejects for
every guard (no fallback exists yet); a source passage with a failing quote still rejects; an
unknown id still rejects; the second option-select attempt carries the first attempt's reason.

### Execution order before U2

Two steps precede U2. They are independent of the shared environment and of each other.

1. **Green the deterministic gates before running a measured one.** `pnpm test:db` is red on a
   test-isolation race ([TODO](./TODO.md) owns the defect). It sits on this plan's acceptance list
   and will sit on U3's, and a measured gate run beside a red automated gate makes every later "was
   that mine?" more expensive to answer, not less.
2. **Spend nothing before spending something.** The local development database holds a free replay
   corpus of persisted lessons. Size U1's deterministic effect there — colliding ids under the old
   scheme, added grounding per lesson, and whether any node's pre-gate count *drops* below a type
   threshold — before a run that costs a shared-host deploy and production tokens.

U2 then needs operator consent, not just plan authorization: D12 permits the shared VPS, a
`db:reset` on the shared application schema, and production spend, but permission in a plan is not
the operator saying go on a shared environment.

### U2 — Coverage gate (real-use pass 1)

Reset the shared schema, deploy, regenerate the thermohaline topic, record items-per-type and
item-less nodes against the frozen baseline table above. No key verification and no fallback rung
exist yet, so any movement is attributable to U1's deterministic fixes alone; partial recovery is
expected, because the paraphrased-quote class is recovered only by U3's fallback. Hand-inspect every
recovered matching item (ADR-0013): matching volume jumps from its 2-item baseline, and D3's revisit
trigger — ambiguous or false pairs in the recovered flow — is observable only by looking.

### U3 — Study Item Key Verification, with same-change deletion (AGENTS rule 18)

Add: the D9 rung-3 fallback in `resolveGroundingCitation`, opted into by the option-select and
impostor guards, never offered to matching (D6), with the resolver reporting which rung admitted the
citation; `study-item-key-verification.prompt` behind the two descriptors (D8); the tool schema and
validator in `toolSchemas.ts`; `createStudyItemKeyVerificationPort` in
`studyItemGenerationAdapters.ts`; `StudyItemKeyVerificationPort` in `packages/ports`; the verdict
types in `domain-core`; `STAGE_TAGS.optionSelectKeyVerification` and
`STAGE_TAGS.impostorKeyVerification`; the two `gateByJudgment` phases and
`DEFAULT_KEY_VERIFICATION_CONCURRENCY`; catalog entries in `operationTimelineCatalog.ts`; the
`study_items` list in `expeditionJournal.ts`'s `EXPECTED_TOPIC_GENERATION_STAGE_PLAN`, which drives
the learner-facing progress total and must gain the two new stages in the same change the
lie-validity stage leaves it; learner copy in `stageCopy.ts` ("Checking the answers" for
option-select, keeping "Checking the decoys" for impostor); port construction in
`learnerGeneration.ts` and `knowledgeGraphWorker.ts`.

Delete in the same change: `ImpostorLieValidityJudgmentPort`, `ImpostorLieValidityJudgment`,
`ImpostorLieValidityVerdict`, `impostor-lie-validity-judgment.prompt`,
`impostorLieValidityJudgmentSchema` / `Validator` / `Descriptor`,
`createImpostorLieValidityJudgmentPort`, `STAGE_TAGS.impostorLieValidityJudgment` and its catalog,
`stageCopy`, and `expeditionJournal.ts` stage-plan entries, and every call site — the acceptance
grep, not a file list, is the ledger. `configHashes.test.ts` asserts the descriptor stage-tag list
and must be updated in the same change.

Documentation in the same change: amend [ADR-0026](../adr/0026-typed-study-item-bank.md) lines 65–74,
which state the lie-only judge policy and become false on merge; add the **Study Item Key
Verification** term to [CONTEXT.md](../../CONTEXT.md). No new ADR — this corrects a policy ADR-0026
already owns rather than opening a new architectural axis.

Tests: the two uniqueness rules including the exact captured DWBC verdict set; `unclear` never
vetoes; a `claim_false` on a non-keyed statement vetoes; rung 3 stores the whole generated passage
for option-select and impostor while the same quote failure still rejects for matching; judge
unavailability drops the impostor, admits a verbatim-anchored option-select, and drops a
fallback-admitted option-select (D5); the retry feedback names the offending candidate.

### U4 — Correctness gate (real-use pass 2) and defect replay

1. **Replay probe.** Push the four captured `Deep ocean return flow` statements through the new judge
   and assert `claim_false` for **both** ordinal 2 and ordinal 3, so the uniqueness rule rejects the
   item. Reconstructable from the table above if the row is gone.
2. **Two real-use runs.** Reset, deploy, regenerate the thermohaline topic for direct comparability
   on `Seawater density`, plus one fresh topic in a different domain so the fix cannot have been
   tuned to oceanography (AGENTS rule 17).
3. Hand-inspect every impostor item in both runs for a second false statement, and record
   items-per-type, item-less nodes, veto counts by rule, and the study-items stage wall-clock against
   the 324 s baseline.

## Acceptance

- `pnpm check` green, and `pnpm test:db` green against `lrnki_test` only.
- U2 records a measured coverage delta from the frozen baseline, attributable to U1 alone, and every
  recovered matching item is hand-inspected against D3's revisit trigger.
- The replay probe returns `claim_false` for both false statements in the captured item.
- Both U4 runs are hand-inspected with no impostor carrying a second false statement, and U4's
  Validation Log entry states items-per-type, item-less nodes, veto counts, and stage wall-clock.
- The deletion ledger in U3 is complete: no `ImpostorLieValidity*` identifier survives anywhere.
- ADR-0026 and CONTEXT.md are updated in the same change as the code.

A gate that cannot be attributed is not evidence. If U2's delta is ambiguous, diagnose before
starting U3 rather than folding the uncertainty into the second gate.

## Out of scope

- **Matching key verification** (D3) — different question shape, no observed evidence. Revisit if
  U2's matching recovery exposes ambiguous pairs.
- **Impostor `reveal` correctness.** The reveal is passed to the judge as context, as today, but
  carries no verdict of its own.
- **Question-text truth** for either item type.
- **Progressive readiness / the 324 s wait.** U4 records the stage wall-clock as input to that
  standing follow-up; this plan does not act on it. The new verification stages do give the waiting
  surface two more named stages, which is incidental, not the goal.
- **Retry budget changes.** The existing two-attempt constants stay; if U4 shows the second attempt
  routinely failing, that is a separate measured decision.

## Validation Log

One entry per closed implementation unit; see the hygiene comment at the top of this file.

### U1 — grounding shape, unique ids, resolution ladder, option-select retry — closed 2026-08-05, `7417fbd`

Deterministic only: no real model calls and nothing measured, so this unit is evidence about code,
not about quality. U2 owns the first measurement. `pnpm check` green apart from the standing AE9 e2e
flake; `pnpm test:db` red on the test-isolation race that `TODO.md` owns, which is not this unit's.

Proved:

- `lessonGroundingShape.ts` is the single grounding-shape owner. Section passages are
  `` `${derivedNodeId}:s${sectionIndex}` ``, bullet passages `` `${…}:i${bulletIndex}` ``. A section
  contributes its citation text, or — when uncited and of a `SUBSTANTIVE_KINDS` kind — its body;
  bullets always contribute, always `generated` (D10).
- `groundedLessonFragments` and `studyItemGroundingFromLesson` are both deleted (AGENTS rule 18).
  `structuralPreGateBlueprint` counts the owner's passages; its three decline reasons name "grounding
  passages" rather than "fragments", and the three "no grounded sections" rejection reasons read "the
  lesson yields no grounding passages to anchor an item" — the grep targets U2 measures against.
- `resolveGroundingCitation` implements rungs 0–2. There is no fallback rung; U3 lands it beside the
  verification it depends on (D6).
- Option-select's attempt loop passes the previous attempt's guard reason as `retryFeedback`.

Invariants a later unit or a re-run must not break:

- Passages are deduplicated by the shared `normalizeOptionText` collapse, so a pre-gate count stays a
  count of *distinct* grounding as ADR-0026 states, and the same text never reaches the generator
  under two ids.
- Rung 2 searches only *generated* passages, so a repair can never mint a `source` citation from an
  id nobody cited; a source passage with a failing quote still rejects.

Hands off to U2: because bullets are now grounding *the generator is shown*, an item whose quote
lives in a bullet is admitted where it previously was not — the `Covers R10` orchestrator test
flipped from two item types to three for exactly that reason. Expect U2's recovery to include that
class and the paraphrased-quote class to stay rejected until U3.

### Open findings

- None recorded.

---
title: Concept Lesson Grounding Depth
type: brainstorm
date: 2026-08-29
---

# Concept Lesson grounding depth

**Status:** Shaping. The problem is measured and accepted; the design decisions below are unresolved,
so this is not yet a plan. It was split out of
the abandoned Source Expedition Leg plan retained in commit `212cf90`
on 2026-08-29 because it changes the Concept Lesson contract, which that plan must not do.

## Question

A Concept Lesson is usually one paragraph. Should it be deeper, and if so, how much of its Concept
Evidence Profile should it use?

## Measured framing

All figures are read-only from the five committed accepted packages on 2026-08-29 and cover the 183
qualified Concept Lessons on their trails.

| Lesson grounding passages | Lessons | Mean source evidence available | Mean lesson sections |
|---|---:|---:|---:|
| 1 | 140 | 4.24 | 1.09 |
| 2 | 12 | 5.67 | 2.00 |
| 3 or more | 31 | 6.06 | 2.52 |

- Every one of the 140 one-passage lessons had at least two source evidence passages available, and
  76 had at least three. The supply is present and unused.
- The trail holds 108 published-Concept stops and 75 Enrichment Node stops. A published Concept has
  6.31 evidence passages available as a mean; 71 of those 108 still produced a one-section lesson. An
  Enrichment Node has 2.25 Mention Passages as a mean, and 69 of 75 produced a one-passage lesson.
- Passage count tracks lesson **section** count and not available evidence. Compare the two right
  columns above.
- 122 of the 140 one-passage lessons came from the normal generator. Only 18 came from
  `source-extractive-definition-v1`, the precision fallback, which emits one section by construction.
- `definition` appears on nearly every lesson. `examples` and `formulas` are rare. Each whole path
  carries only 11–15 lesson bullets.
- The five Curated Sources hold 3,800–5,700 words for 31–44 Concepts, roughly 120–140 words per
  Concept.

## Mechanism

[`lessonGroundingShape`](../../packages/application/src/lessonGroundingShape.ts) is the single answer
to what grounding a Concept Lesson yields, and it counts sections and bullets. A section body becomes
a passage only when it carries a citation or its kind is in `SUBSTANTIVE_KINDS`
(`definition`, `examples`, `formulas`). An uncited `gist`, `intuition`, or `applications` body
contributes nothing; only its bullets do, and
[`assembleConceptLesson`](../../packages/application/src/assembleConceptLesson.ts) caps those at four
per list section.

So a lesson that is one definition paragraph yields exactly one passage, however much verified
evidence sits behind its Concept.

## Why it matters

The Study Item generators are shown exactly these passages and nothing else — the Concept Lesson is
the only substrate. A one-passage lesson asks the impostor generator to derive three distinct
verbatim-resolving truths from one passage, and the matching generator to derive three or four pairs
from it. The Leg plan removes the passage-count pre-gate that refused those attempts, which makes
the attempt honest but does not make the substrate richer.

Grounding depth is therefore the supply side of mixed practice, and the Leg plan's own measured
feasibility gap is downstream of it.

## Unresolved decisions

1. **How deep should a lesson be?** This is a learner-experience question before it is a supply
   question. A longer lesson is not automatically better, and
   [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md) values flow.
   Name the learner-visible goal before the mechanism.
2. **Which lever.** Candidates, not yet ranked: ask the generator for a second substantive cited
   section when the evidence supports one; make a `gist`, `intuition`, or `applications` body
   grounding-eligible when it verbatim-resolves against a passage; raise the bullet yield; or let the
   extractive fallback emit more than one Definition Passage.
3. **Is `SUBSTANTIVE_KINDS` the right boundary** for grounding eligibility, or should eligibility
   follow citation resolution rather than section kind? The current rule is a kind allowlist, and the
   measured cost of the allowlist is the 17 `applications` and `intuition` sections per path that
   yield nothing.
4. **Whether the Curated Sources need deepening separately** for the 75 Enrichment Node stops, whose
   supply really is about two Mention Passages. Source prose is the only lever there.
5. **What re-validates.** A deeper lesson changes the Concept Lesson contract and therefore the
   qualified asset config hash, and
   [`lessonOptionSelectAnswer`](../../packages/application/src/lessonGroundingShape.ts) derives the
   option-select answer from the first substantive section. Concept Lesson and option-select quality
   evidence both become unqualified.

## Constraints this must not break

- [ADR-0026](../adr/0026-typed-study-item-bank.md) provenance honesty. A model-written bullet is not
  source text and must never be labeled as one. A deeper lesson must not manufacture citations.
- Rule 17. Lesson and judge prompts stay domain-neutral, tuned on no fixture concept or outcome.
- Rule 16. No heuristic lexical or surface-pattern gate earns a hard veto here.
- Source lesson admission keeps its current strength. Depth must not be bought by relaxing the
  verbatim citation rungs or the substantive-section minimum.

## Sequencing note

Both this work and the Leg plan invalidate the five accepted packages and force a full regeneration
with production model calls. Landing them in one regeneration is much cheaper than two. If this
becomes a plan, decide deliberately whether it sequences before the Leg plan's U6, shares that
regeneration, or waits for a later one.

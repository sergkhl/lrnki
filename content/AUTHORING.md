# Authored Expedition guide

Author the exact runtime document under [ADR-0042](../docs/adr/0042-author-expeditions-directly-without-runtime-models.md).
The [content schema](../packages/learner-runtime/src/contentSchema.ts) owns shapes and the
[qualifier](../packages/learner-runtime/src/contentQualifier.ts) owns structural/reference guarantees.

## Authoring loop

1. Research current, inspectable online sources. Prefer original or official material and
   authoritative syntheses supporting the exact claims; remembered facts are insufficient.
2. Author the Expedition directly in `expedition.json`, using lowercase kebab-case human-readable
   keys and an explicit route. Do not add generated identities or derived route metadata.
3. Run `pnpm content:check` from the repository root and repair every diagnostic without suppressing
   or weakening a refusal.
4. Give a fresh-context reviewer only the learner-safe projection. It records every answer and
   rationale before seeing private grading or opening sources, noting teaching sufficiency, cueing,
   pacing, Support use, and Guardian repetition.
5. Give the same reviewer the exact private document and every cited source. Inspect every authored
   surface against the [semantic quality rubric](#semantic-quality-rubric).
6. Record `PASS` or concrete `FIX_FIRST` findings in the active plan's Validation Log. Repair every
   `FIX_FIRST` and repeat the same review boundary on the exact repaired revision before acceptance.

## Teaching and Activity design

Use enough Lesson sections to teach the objective before grading; do not add filler to meet a word
or section count. Section kinds and exact reference resolution are not teaching-quality proxies.

A worked example may scaffold acquisition. Higher-band and Guardian-eligible Activities require
transfer to a fresh setting, preserving the reasoning structure without repeating the example's
objects and answer-bearing contrast.

Alternatives must remain plausible under a named local misconception and comparable in length,
tone, qualification, and grammatical fit. The correct answer must not be identifiable as the
longest, most polished, least absolute, or only carefully bounded choice.

## Route and game contract

Follow the schema's Leg/Stop limits and the qualifier's Activity-family and Guardian-pool rules.
Array order is instructional order. Prerequisites reference earlier Stops only and express necessary
learning order; do not add dependencies merely to make a trail look linear.

Use the [mastery/game policy](../docs/adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md)
when choosing pacing and challenges. Learner-safe correctness includes presentation order: no
universal option position, statement position, or matching transform may reveal a key. Public order
is stable for an Activity and derived independently of authored order.

## Exact-reference Support Paths

An Explorable Term must be an exact substring in a rendered Lesson section and name a Support Path
on that Stop. Each path explicitly references option-select Activities on other Stops in the same
Expedition, never its parent.

Choose targets that repair the term's likely confusion. A missing or poor destination is an authoring
defect; there is no search or generated fallback. Runtime evidence and visibility follow
[the Support decision](../docs/adr/0037-persist-learner-scoped-scaffold-detours.md).

## Source credits and disclosures

Assign Source Credits to each claim's supporting evidence. A page naming a technique is insufficient
for a procedure unless it explains that procedure; add a supporting source or narrow the teaching.
Shared vocabulary and link reachability do not establish support.

Follow the source schema for credit metadata and ordered references. Preserve a canonical public
HTTPS URL, a learner-useful title and authority, the access date, and source version/date when
available. Teaching remains original prose and must not be presented as a source quotation.

Lesson references are public before grading. Explanation references stay private until the graded
explanation is revealed, under [the API boundary](../docs/adr/0035-separate-learner-app-static-spa-typed-api.md).

## Semantic quality rubric

Inspect every Lesson, Activity, answer, alternative, explanation, pair, impostor reveal, prerequisite,
Explorable Term, Support target, difficulty step, and Guardian pool. Record `FIX_FIRST` for:

- a material claim unsupported by its cited online evidence, or a Lesson insufficient to reason
  through its Activities;
- an incorrect/non-unique answer, implausible alternatives, or correctness cued independently of
  mastery; Matching must be a genuine bijection and each impostor board must have exactly one false
  statement, at least two supported truths, and a useful reveal;
- an explanation that fails to support the keyed distinction, or displayed credits that do not
  resolve to the exact authored source metadata at the required point in grading;
- prerequisite leakage or an incoherent, incomplete route;
- an unrendered Explorable Term or a Support destination that does not repair its local confusion;
- a difficulty curve acting as a hidden prerequisite, or Guardian pools that are unwinnable or cannot
  exercise the mastery they claim to protect;
- private correctness in a pre-answer view, including truth kinds, pair maps, positional channels,
  or server content objects.

Record review agreement and uncertainty. Sparse coverage, explicit asset absence, uncertain optional
edges, and non-material wording, difficulty, or ordering imperfections may remain only when they
cannot change source support, grading, prerequisite closure, or completion.

A `PASS` is bounded to the exact sources, authored claims, and revision inspected. It does not prove
independent factual truth, support arbitrary external sources, or guarantee future URL availability.

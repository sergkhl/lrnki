# Authored Expedition guide

This directory is learner content, not generated build output. Codex CLI is an offline author: it
researches inspectable online sources, writes the exact `expedition.json` consumed by the learner
server, runs the repository qualifier, and repairs every diagnostic. The repository has no Codex
client, prompt, model port, compiler, package, installer, source fetcher, or database representation
for content.

## Authoring loop

1. Research the domain through current, inspectable online sources. Prefer open original or official
   material and authoritative syntheses that support the exact claim; do not rely on remembered facts.
2. Choose a coherent learner-visible route and author its Legs, Stops, prerequisites, lessons,
   activities, Support Paths, and Guardian pools directly in `expedition.json`.
3. Use lowercase kebab-case human-readable keys. Never add UUIDs, hashes, indexes, generated
   identities, database keys, or derived route metadata.
4. Run `pnpm content:check` from the repository root. Read every structured diagnostic and repair the
   document; never suppress or weaken a refusal to admit one Expedition.
5. Give a fresh-context reviewer only the learner-safe projection. The reviewer records every answer
   and rationale before seeing private grading or opening sources, and notes teaching sufficiency,
   cueing, pacing, Support use, and Guardian repetition.
6. Then give the same reviewer the exact private document and every cited source. It inspects every
   visible claim, answer, alternative, explanation, pair, impostor reveal, prerequisite, Support
   target, difficulty step, and Guardian pool against the cited evidence.
7. Record `PASS` or concrete `FIX_FIRST` findings in the active plan's Validation Log. Repair every
   `FIX_FIRST` and re-run the same boundary on the exact repaired revision before acceptance.

`pnpm content:check` proves structure and exact source-credit resolution. It does not prove that
prose teaches, that a source supports a claim semantically, or that a route feels coherent. Those
remain direct-inspection and real-use judgments.

## Teaching depth

The old generation pipeline often reduced a lesson to one paragraph even when its source held
several useful lines of evidence. Direct authoring resolves that supply problem without replacing it
with a word-count target. The learner-visible goal is a compact lesson that gives the learner enough
of a mental model to reason before being graded.

For each Stop:

- state the idea in language appropriate to the declared audience;
- show how to recognize or use it, preferably with a concrete contrast or worked example;
- surface the misconception most likely to produce a tempting wrong answer;
- explain what changes in a judgment or decision when the idea is applied;
- use as many distinct sections as those teaching moves require, ordinarily two to four, and never
  add filler merely to meet a count;
- keep one section only when it genuinely teaches the complete small idea rather than merely naming
  it;
- ensure every activity is answerable from the lesson and its cited source, while avoiding copy that
  simply gives away the answer by position or formatting.

A worked example may scaffold first acquisition, but difficulty and Guardian authority require
transfer. Higher-band and Guardian-eligible Activities use a fresh setting whose underlying
reasoning structure is the same; they do not repeat the worked example's objects and answer-bearing
contrast closely enough to reward recall of the example.

Section kinds are not a proxy for quality. Exact source resolution establishes provenance; direct
inspection establishes whether the source supports the authored teaching. Authored prose is never
misrepresented as a source quotation.

## Route and game contract

- Array order is instructional order. Author exactly three Legs with four to seven Stops each and
  only reference prerequisite Stops that occur earlier in the Expedition.
- Every Stop has one lesson and at least one option-select activity. Every Expedition contains
  option-select, matching, and impostor play; each Leg contains matching or impostor play that is
  available in its Guardian pool.
- Options must be mutually distinguishable in the context of the prompt. Matching must be a genuine
  bijection with unique left and right labels. An impostor activity has exactly one false statement,
  at least two source-supported truths, and a reveal that explains the distinction.
- All alternatives remain plausible under a named local misconception and comparable in length,
  tone, qualification, and grammatical fit. The correct response is not identifiable as the longest,
  most polished, least absolute, or only carefully bounded choice.
- Learner-safe correctness is a presentation property, not merely a field-removal property. Public
  option, statement, and matching-column order is stable for one Activity but derived independently
  from authored order; no universal position or transform may reveal an answer or pair map.
- Guardian pools reference existing activity keys. A Leg pool references only activities in that
  Leg. The Expedition pool exercises all three families.
- `requires` expresses necessary learning order, not a desire to make a trail look linear. Do not
  add a prerequisite when a learner can understand the Stop independently.

## Exact-reference Support Paths

An Explorable Term is an exact substring in one rendered lesson section. It names one Support Path
on that Stop. The Support Path explicitly references one or more option-select activities on other
Stops in the same Expedition; it never points back to its parent Stop.

Choose a Support target that actually helps the learner repair the local confusion. There is no
label search, generated fallback, retry, polling, or generating/failed Support state. A missing or
poor destination is an authoring defect to repair in the document.

## Source credits and disclosures

Each Expedition owns one keyed `sourceCredits` collection. Every Lesson section and every
answer-bearing explanation carries a non-empty ordered `sourceCreditKeys` array whose keys resolve
inside that Expedition. Credits identify the source with a canonical public HTTPS URL, learner-useful
title and authority metadata, an access date, and version/date information when the source exposes it.

Source credit assignment is claim-specific: a page that names a technique does not support an
authored procedure unless it substantively explains that procedure. Add a directly inspectable
source that teaches the operation or narrow the teaching and grading to what the cited material
actually establishes. Shared vocabulary and link reachability are never semantic evidence.

Authored teaching remains original prose; do not copy source passages or keep a second tracked source
packet. Source credits and Lesson references are public. Activity explanation references remain
private until grading reveals the explanation. No source fetch occurs in build or runtime, and link
availability is never a learner-api startup dependency.

## Semantic quality rubric

Record `FIX_FIRST` for any of these:

- a learner-visible material claim is unsupported by its cited online evidence;
- an answer is incorrect, non-unique, or distinguishable only through a trick unrelated to mastery;
- a lesson or activity assumes knowledge across an unsatisfied prerequisite;
- a Support destination does not repair the term's likely confusion;
- the authored order does not form a coherent completable route;
- a Guardian pool cannot exercise the mastery it claims to protect;
- private correctness information appears in a pre-answer learner view.

Sparse coverage, explicit asset absence, uncertain optional edges, and non-material wording,
difficulty, or ordering imperfections are safe incompleteness only when they cannot change source
support, grading, prerequisite closure, or completion. Record them without weakening qualification.

A `PASS` is bounded to the exact sources and authored claims inspected on the recorded revision. It
does not establish independent factual truth, support arbitrary external sources, or promise that a
source URL will never move.

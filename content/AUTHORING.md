# Authored Expedition guide

This directory is learner content, not generated build output. Codex CLI is an offline author: it
reads one project-owned `source.md`, writes the exact `expedition.json` consumed by the learner
server, runs the repository qualifier, and repairs every diagnostic. The repository has no Codex
client, prompt, model port, compiler, package, installer, or database representation for content.

## Authoring loop

1. Read the complete local primer. Do not rely on remembered facts that the primer does not support.
2. Choose a coherent learner-visible route and author its Legs, Stops, prerequisites, lessons,
   activities, Support Paths, and Guardian pools directly in `expedition.json`.
3. Use lowercase kebab-case human-readable keys. Never add UUIDs, hashes, indexes, generated
   identities, database keys, or derived route metadata.
4. Run `pnpm content:check` from the repository root. Read every structured diagnostic and repair the
   document; never suppress or weaken a refusal to admit one Expedition.
5. Inspect the learner-safe projection tests and then inspect every visible claim, answer,
   explanation, pair, impostor reveal, Support target, and source anchor against `source.md`.
6. Record `PASS` or `FIX_FIRST` in the active plan's Validation Log. Repair every `FIX_FIRST` before
   treating the Expedition as ready.

`pnpm content:check` proves structure and exact anchor existence. It does not prove that prose
teaches, that a quote supports a claim semantically, or that a route feels coherent. Those remain
direct-inspection and real-use judgments.

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

Section kinds are not a proxy for quality. Exact source resolution establishes provenance; direct
inspection establishes whether the source supports the authored teaching. Authored prose is never
misrepresented as a source quotation.

## Route and game contract

- Array order is instructional order. Author three to five Stops per Leg and only reference
  prerequisite Stops that occur earlier in the Expedition.
- Every Stop has one lesson and at least one option-select activity. Every Expedition contains
  option-select, matching, and impostor play; each Leg contains matching or impostor play that is
  available in its Guardian pool.
- Options must be mutually distinguishable in the context of the prompt. Matching must be a genuine
  bijection with unique left and right labels. An impostor activity has exactly one false statement,
  at least two source-supported truths, and a reveal that explains the distinction.
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

## Source anchors and disclosures

Every lesson section and every answer-bearing explanation carries:

```json
{
  "heading": "Exact Markdown heading text without # markers",
  "quote": "Exact byte-for-byte excerpt under that heading"
}
```

The quote is inspection evidence, not learner copy. Keep it narrowly sufficient and verify that it
supports the full nearby claim rather than sharing only vocabulary. Each Expedition also owns its
learner-visible source disclosures in `sourceCredits`; there is no database join that can repair a
missing disclosure later.

## Semantic quality rubric

Record `FIX_FIRST` for any of these:

- a learner-visible material claim is unsupported by the local primer;
- an answer is incorrect, non-unique, or distinguishable only through a trick unrelated to mastery;
- a lesson or activity assumes knowledge across an unsatisfied prerequisite;
- a Support destination does not repair the term's likely confusion;
- the authored order does not form a coherent completable route;
- a Guardian pool cannot exercise the mastery it claims to protect;
- private correctness information appears in a pre-answer learner view.

Sparse coverage, explicit asset absence, uncertain optional edges, and non-material wording,
difficulty, or ordering imperfections are safe incompleteness only when they cannot change source
support, grading, prerequisite closure, or completion. Record them without weakening qualification.

The primers are project-owned playtest sources accepted for this product slice. A `PASS` does not
claim independent factual verification or support for arbitrary external sources.

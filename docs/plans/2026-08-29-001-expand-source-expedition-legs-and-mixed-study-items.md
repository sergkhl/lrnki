---
title: Expand Source Expedition Legs and Qualify Mixed Study Items - Plan
type: implementation
date: 2026-08-29
execution: code
---

# Expand Source Expedition Legs and Qualify Mixed Study Items

**Status:** In progress — U0 froze the five-package baseline and proved the hard mixed-Leg route
feasible after passage-count veto removal; U1 is next

**NEXT:** U1 introduces the one shared, source-cued Expedition Route Plan and proves its pure
topological order, 3–5-Concept partition, bonus coverage, determinism, and explicit failure paths.

**Decision state:** Accepted by the owner on 2026-08-29 and amended the same day after design
review. A normal Leg contains 3–5 Concepts, targeting four. Every Concept keeps one qualified
option-select; every Leg adds at least one qualified matching or impostor Study Item; and every
Expedition uses all three Study Item families. The amendments: family admission uses the
option-select analogue (KTD4); Expedition Guardian family reservation is best effort over learner
state (KTD6); the per-Leg mix rule keeps a pre-decided degrade path (KTD5); and Concept Lesson
grounding depth is out of scope, shaped in
[its own brainstorm](../brainstorms/2026-08-29-001-concept-lesson-grounding-depth.md).

## Goal capsule

- **Objective:** Replace the accidental one-Concept Leg shape with one deterministic, coherent
  3–5-Concept route plan and make the existing matching and impostor families safely learner-ready.
- **Learner-visible goal:** A Leg should feel like a short learning chapter rather than one
  `theory → question → crystal` triplet. It presents 3–5 Concepts, mixed practice, and then a
  Guardian that retrieves across the Leg.
- **Mastery relationship:** Preserve [ADR-0032](../adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md):
  a Concept is mastered only after its required lesson and every selected current activity are
  complete; Recall Challenge evidence never changes acquisition mastery.
- **Content boundary:** Preserve [ADR-0026](../adr/0026-typed-study-item-bank.md): Study Item
  suitability remains sparse per Concept, and a missing family never authorizes fabricated content.
  The Source Expedition publication contract, not the neutral bank, owns Leg-level coverage.
- **Deep module boundary:** One application-owned Expedition Route Plan supplies ordered Concepts,
  Legs, anchors, summit, and selected non-option activities to qualification, Study Session, Recall
  Challenge, and accepted-package validation. No consumer re-derives a competing section plan.
- **Content authority:** The five accepted Markdown primers remain project-owned local-playtest
  Curated Sources under [`fixtures/accepted-paths/manifest.json`](../../fixtures/accepted-paths/manifest.json).
  This work improves source fidelity and instructional structure; it does not claim external factual
  verification or generalize the result to arbitrary sources.
- **Validation route:** Apply the [lrnki validation skill](../../.agents/skills/validate-lrnki/SKILL.md).
  Automated invariants, real production-model artifact inspection, real-backend web, and a fresh
  Debug iOS Simulator remain separate evidence classes.
- **Deployment boundary:** This plan authorizes local development generation, the guarded lrnki
  application-schema reset, model-free package installation, real local API/web, and Simulator
  validation. It does not authorize deployment, a shared-host reset, a physical-device run, or a
  production write.

## Established problem classes and recognized practice

### A prerequisite DAG is being used as an instructional chunker

[`expeditionSections.ts`](../../packages/application/src/expeditionSections.ts) currently makes every
terminal trusted-DAG node a milestone and every isolated node a singleton section. The prerequisite
graph can answer which Concept must precede another; it cannot, by itself, answer which adjacent
Concepts form a useful learning chapter. Sparse edge coverage therefore becomes sparse pedagogy.

The conventional repair is to separate hard dependency order from soft instructional sequence:
perform a stable topological sort whose tie-break prefers source order, then partition that one order
under explicit pacing and coherence constraints. Prerequisites remain hard gates; source structure
guides only choices among simultaneously valid nodes.

### Segmentation has collapsed into under-practice

Segmenting complex material into learner-paced units helps manage cognitive load, but one immediate
question after one theory card supplies little delayed retrieval. The bounded repair is not a longer
passive lesson: it is a 3–5-Concept segment followed by mixed acquisition practice and a retrieval
challenge over already-passed items. This is consistent with the learner-paced
[segmenting principle](https://www.cambridge.org/core/books/abs/multimedia-learning/segmenting-principle/37240877DDA0362355ADB39936027982),
the delayed-recall benefit measured for
[repeated retrieval](https://pubmed.ncbi.nlm.nih.gov/18276894/), and the retention benefit summarized
by the [distributed-practice meta-analysis](https://pubmed.ncbi.nlm.nih.gov/16719566/). These sources
support retrieval and pacing; the exact 3–5 range is the owner-selected product constraint and the
existing five-ward Guardian budget, not a claimed universal cognitive optimum.

### A passage-count heuristic is suppressing typed generation

[`generateStudyItemBank.ts`](../../packages/application/src/generateStudyItemBank.ts) currently
declines impostor generation below two lesson grounding passages and matching below three. Neither
count proves that one rich passage cannot support three distinct truths or pairs. The deterministic
guards already own checkable structure and citation resolution, while Answer-Key Verification,
Matching Assignment Verification, and source-material support own the semantic harm classes.

Under repository rule 16, the repair is to remove the heuristic count veto, keep only provable
preconditions, and let the named semantic gates decide. This may increase honest rejected-candidate
counts; it must not turn generator success into learner admission.

### Qualified content and route identity can drift independently

Current asset identity includes the unordered qualified node set and lesson/item identities, but not
the ordered Leg partition or anchors. A route could therefore change Guardian scopes while retaining
an accepted identity. The conventional content-addressed repair is to include the exact route policy,
ordered Leg plan, anchors, summit, and selected Study Item identities in the snapshot identity that
adoption, learner reads, and immutable Recall Challenge lineups already pin.

## Current repository facts

All facts below were re-read from the current source and the five committed accepted packages on
2026-08-29. Environment, database, Model Assignment, package, and Simulator facts are time-sensitive;
each implementation unit re-resolves the ones it uses.

| Source Expedition | Concepts | Trusted edges | Current Legs | Singleton Legs | Current Leg-size distribution |
|---|---:|---:|---:|---:|---|
| Critical Thinking | 31 | 6 | 26 | 22 | 22×1, 3×2, 1×3 |
| Probability and Statistics | 44 | 14 | 34 | 25 | 25×1, 8×2, 1×3 |
| Personal Finance | 37 | 25 | 28 | 19 | 19×1, 9×2 |
| Machine Learning | 31 | 10 | 26 | 21 | 21×1, 5×2 |
| Neuroscience of Memory and Attention | 40 | 14 | 32 | 27 | 27×1, 4×2, 1×5 |

- The five packages expose 183 path Concepts across the shared 141-Concept registry. They currently
  produce 146 Legs, 114 of them singleton Legs (78%).
- [`projectExpeditionSections`](../../packages/application/src/expeditionSections.ts) claims
  terminal-node prerequisite cones, then only splits sections over the five-ward budget and merges
  itemless sections. It has no minimum Leg size or instructional-order input.
- [`buildTrailView`](../../packages/application/src/studySessionTrail.ts) correctly adds one theory
  stop when a lesson exists, every selected Study Item segment, then one crystal capstone. With one
  qualified item on a singleton Concept, three visible stops are therefore the intended projection
  of the wrong upstream assets and Leg partition, not a rendering count bug.
- [`sourceExpedition.ts`](../../packages/application/src/sourceExpedition.ts) filters qualification to
  `option_select` and every accepted Concept currently has exactly one. Its `totalStopCount` is the
  number of qualified Concepts even though the learner catalog renders it as “playable stops.”
- The neutral banks already contain 26 matching and 43 impostor candidates on the 183 playable
  Concepts. They are not source-family-qualified and are intentionally excluded from learner assets.
- The structural pre-gate records 140 impostor declines because a qualified lesson has only one
  grounding passage. Matching records the same 140 one-passage declines plus 12 two-passage
  declines. The remaining candidates still require complete family-specific source admission; raw
  existence is not readiness evidence.
- [`sourceMaterialClaims.ts`](../../packages/application/src/sourceMaterialClaims.ts) projects all
  learner-visible lesson and option-select fields, but has no matching or impostor subjects,
  locations, or field-treatment tripwires.
- Matching already enforces 3–4 distinct pairs with resolved citations and a separate N×N unique
  assignment verdict. Impostor already enforces three truths, one generated lie, a corrective reveal,
  resolved truth citations, and Answer-Key Verification. Those neutral guards remain authoritative
  for their existing harm classes.
- The five source documents already carry useful authored major-section order: seven sections for
  Critical Thinking, Probability and Statistics, and Personal Finance; ten for Machine Learning and
  Neuroscience. Every qualified lesson can be mapped to at least one direct source citation and its
  persisted heading path/locator.
- A source-order topological preference is feasible. Trusted prerequisites usually agree with source
  order; the three observed backward Personal Finance edges prove why trusted dependencies must still
  override it.
- [`selectRecallLineup`](../../packages/application/src/recallChallenge.ts) round-robins Concepts and
  Legs, ranks least prior exposure, and caps at five/seven wards. It supports every Study Item type
  but has no family-coverage reservation, so newly admitted matching/impostor items alone would not
  guarantee a mixed Guardian.
- [`SourceExpeditionAssetExpectation`](../../packages/ports/src/index.ts) carries lesson and item IDs
  plus an asset identity. The accepted package v1 validator explicitly requires every qualified item
  to be `option_select` and carries no route plan.

## Locked product and module design

### KTD1 — Define one normal Leg and preserve existing rewards

A normal Leg contains 3–5 admitted Concepts; four is the preferred size. Every Concept contributes:

1. its current qualified Concept Lesson;
2. exactly one qualified option-select Study Item;
3. any route-selected matching/impostor Study Item attached to that Concept; and
4. its existing crystal capstone.

Qualification admits every option-select that passes its checks today, so one per Concept holds by
data accident rather than by rule. Make the rule explicit: when a Concept has more than one
qualifying option-select, the current one is the lowest Study Item ID and the others stay inspectable
but uncurrent. Qualification enforces this, so KTD7's validator asserts a fact the qualifier already
guarantees instead of discovering it at export.

Every Leg selects at least one non-option Study Item. Across the whole Expedition, at least one
matching and at least one impostor are selected. Select the minimum set satisfying those constraints,
normally one bonus item per Leg; permit at most two in one Leg when that is necessary to expose both
families, including an Expedition containing only one Leg.

The acquisition trail therefore contains `3 × conceptCount + selectedBonusCount` visible stops per
Leg: 10 at the minimum and 17 at the maximum. One crystal remains the reward for completing one
Concept, and one Guardian victory remains the Leg-fusion reward. There is no new currency, reward,
activity family, Leg-level mastery store, or parallel objective.

All selected current Study Items remain required acquisition activities. A wrong or unanswered bonus
keeps its Concept incomplete exactly as a wrong or unanswered option-select does today. Calibration
`known`, prerequisite readiness, Response Log identity, and Support Path evidence isolation do not
change.

### KTD2 — Replace terminal-cone sectioning with one Expedition Route Plan

Create one pure application deep module with an interface equivalent to:

```text
planExpeditionRoute(
  admitted Concepts,
  trusted prerequisite edges,
  optional instructional source cues,
  qualified Study Item candidates,
  route policy
)
  -> planned(ordered Concepts, ordered Legs, anchors, summit, selected bonus items)
   | unavailable(reason, diagnostics)
```

Its source-owned output contains:

```text
policy identity
orderedDerivedNodeIds
legs[]:
  legIndex
  anchorDerivedNodeId
  derivedNodeIds[]
  selectedBonusStudyItemIds[]
summitDerivedNodeId
```

The module performs one stable topological sort. A trusted prerequisite is always earlier than its
dependent. Among simultaneously ready nodes, source cues rank first when the nodes belong to the
same immutable source document; otherwise rank by difficulty, canonical label, then stable node ID.
Uncertain edges never become gates or ordering constraints.

Over that fixed order, solve a deterministic contiguous partition and bonus assignment jointly.
Hard constraints are:

- every admitted Concept appears once and only once;
- every Leg has 3–5 Concepts;
- every Leg has at least one qualified matching or impostor candidate on one of its Concepts — the
  one constraint carrying a pre-decided degrade path (KTD5);
- the Expedition selects both matching and impostor; and
- no Leg selects more than two bonus items.

Rank valid solutions lexicographically by:

1. fewest source-major-heading transitions inside Legs;
2. lowest total `abs(legSize - 4)`;
3. fewest selected bonus Study Items;
4. smallest matching/impostor selection-count difference; and
5. earliest boundary vector, source position, family order (`matching`, then `impostor`), and stable
   Study Item ID.

The final Concept of each Leg is its stable Guardian anchor and learner-visible milestone. The final
Concept in the route is the derived summit. The exact algorithm and thresholds are reversible source
policy and belong here/source tests, not a new ADR.

Replace the current terminal claiming and split/merge policy; do not retain it as a fallback. Source
Expedition qualification, Study Session, Recall Challenge, catalog/package export, and validation
consume the same finished route plan. Future non-source Expeditions use the same 3–5 topological
partition without source-heading or source-publication mix requirements if their held availability
is later reopened.

### KTD3 — Derive instructional cues from immutable admitted source evidence

Extend `SourceEvidenceRecord` with the already-persisted `sourceDocumentId`, parser `blockId`, and
`locator`; no new database column is needed. For each qualified Concept Lesson, select the earliest
direct source citation on a retained substantive `definition`, `examples`, or `formulas` section.
Resolve that exact resource/block pair through `SourceEvidenceReadPort`.

Within one source document, compare positions by the locator form the parser supplied:

1. page and then `characterStart` when present;
2. slide and then `characterStart` when present;
3. document-level `characterStart`;
4. XPath; then
5. natural parser `blockId` and stable source block ID.

The current Markdown primers resolve through document-level `characterStart`. Do not parse numeric
prefixes from heading text. `headingPath` supplies coherence boundaries, not order authority. Across
different source documents there is no implied curricular order, so the route falls back to the
topological difficulty/label/ID rank rather than inventing a resource order.

If a source-qualified lesson cannot resolve its required direct citation, existing lesson/source
qualification fails before route planning. The route planner never manufactures a cue from generated
text or uses a model call.

### KTD4 — Give all three Study Item families complete source admission

Replace the option-only source Study Item admission seam with one family-complete module. Family
handlers share evidence resolution, source-support evaluation, qualified identity assignment, and
rejection reporting, while retaining separate named semantic gates.

Extend the lossless material-claim projection and compile-time field-treatment records:

- **Option-select:** preserve the existing question/key, explanation, distractor invalidity,
  exact-reference, source-support, and Answer-Key Verification contract.
- **Matching:** project the learner-visible instruction plus every prompt/match relationship. Every
  relationship must have an accepted source-support decision; the neutral guard must resolve every
  citation a pair claims; and Matching Assignment Verification must find exactly one defensible
  whole-board assignment.
- **Impostor:** project every true statement and the corrective reveal as source-support claims. The
  one keyed lie is a distractor-invalidity claim, never a source-support claim. Every truth citation
  a statement claims must resolve, the lie remains honestly generated and uncited, and Answer-Key
  Verification must accept exactly three truths plus one false statement.

The admission bar is the option-select bar applied per family, so Source Expedition qualification
stays a deterministic re-check over persisted rows and never calls a model:

1. the item's `groundingProvenance` is not `generated`;
2. every learner-visible relationship carries an accepted source-support decision; and
3. a citation resolves against its immutable source block exactly when the persisted row claims
   `source` provenance.

A matching pair or impostor truth whose persisted provenance is `generated` — it resolved against a
generated Concept Lesson passage, which the impostor guard already permits deliberately — stays
admissible when rule 2 accepts it. It keeps its `generated` label; admission never rewrites it into
a source quote or source citation. Requiring source provenance on *every* relationship would be
stricter than option-select, whose keyed answer alone must be source-cited, and would reject most
existing candidates for a provenance the neutral guards already record honestly. Missing decisions,
unresolved evidence, unsupported material conditions, a wrong/non-unique key, or an ambiguous
matching board reject the candidate.

For a source-derived bank, admitted matching and impostor items receive the same qualified Source
Expedition config identity as lessons and option-select items. Rejected and unselected candidates
remain inspectable in the neutral artifact and never enter `currentStudyItemIds`.

### KTD5 — Remove the false count veto without replacing it with best effort

The pre-blueprint deterministic gate may decline a family only when the Concept Lesson is absent or
produces no grounding passage at all. Remove the `matching >= 3 passages` and `impostor >= 2 passages`
rules. Passage count remains useful report data but not an admission decision.

`structuralPreGateBlueprint` currently holds two roles: the pre-gate that intersects a blueprint
result, and the value returned when the blueprint port is absent or its call throws. Split it. The
pre-gate keeps only the provable preconditions above, and a separate blueprint-unavailable fallback
approves option-select alone. Deleting the two count rules from the shared function would instead
flip that fallback open for all three families — the opposite of this decision — so the split
belongs to the same change and carries its own negative test.

The semantic Study Item Blueprint continues to decide which families are suitable for one Concept.
Unavailability is not permission to guess matching/impostor suitability. A blueprint-approved family
uses the existing bounded generator retries and named verification stages.

After family admission, route planning produces a coverage report containing the ordered Concepts,
candidate family IDs, selected bonuses, uncovered windows, and exact generator/admission rejection
reasons. `study_item_mix_unavailable` keeps a candidate out of the accepted catalog when no valid
3–5 partition exists. Do not publish an option-only fallback.

The per-Leg mix rule stays a hard constraint, and its fallback is decided here rather than under
pressure at U6. The U0 probe measures one path's post-veto yield. If a path then still admits no
valid partition, the per-Leg rule stops being a hard constraint and becomes the KTD2 objective's
first rank — maximize covered Legs, ahead of the existing rank 1 — and each uncovered Leg publishes
with a recorded `leg_mix_absent` diagnostic. The Expedition-wide
"both bonus families" rule never degrades and stays a hard admission gate. Degrading is an
owner-visible recorded event, never a silent relaxation, and it changes no source, key, assignment,
prerequisite, or route gate.

If one of the five fixtures still fails, classify the gap from that report and repair the layer the
measurement names, not the nearest one. Repair a generic prompt/guard only when the failure is
generic. Grounding scarcity is usually a Concept Lesson limit rather than a Curated Source limit:
every one of the 140 one-passage lessons already had two or more source evidence passages available,
so adding source prose repairs only the Enrichment Nodes whose supply really is about two. Concept
Lesson grounding depth is out of scope here and is shaped in
[its own brainstorm](../brainstorms/2026-08-29-001-concept-lesson-grounding-depth.md); this plan may
consume a deeper lesson but must not change the lesson contract to obtain coverage. Never repeat an
unchanged failed model arm for luck and never weaken source, key, assignment, prerequisite, or route
gates to obtain coverage.

### KTD6 — Make trail and Guardian consumers family-aware

`QualifiedSourceExpeditionAssets` carries the finished route plan. `getStudySession`, pure Study
Session composition, Recall Challenge scope projection, and challenge creation accept it rather than
calling `deriveFlooredExpedition` independently. Each consumer validates that its detail/item inputs
match the plan's exact IDs and fails closed on mismatch.

The existing Study Item projection already renders all families. Preserve canonical per-Concept
order: option-select, matching, impostor. Theory remains before every activity and the capstone remains
after every selected activity. Stop state, next-stop choice, resume, crystal growth, and section
totals derive from these actual selected segments.

For a Leg Guardian:

1. reserve one latest-correct item from the Leg's anchor Concept at position 0, preferring that
   Concept's selected non-option item when it has one — the anchor is the Leg's learner-visible
   milestone and lineup selection already forces it first, so family reservation must not displace
   it;
2. reserve one latest-correct selected non-option item when step 1 did not already take one;
3. cover every remaining Concept with one latest-correct representative where possible;
4. rank equivalent candidates by least prior challenge exposure and the existing deterministic
   challenge tie-break; and
5. keep the existing five-ward maximum.

A bonus item substitutes for that Concept's option-select in the lineup, so a five-Concept Leg still
fits five wards. The Leg Guardian guarantees at least two families, not necessarily all three.

For the Expedition Guardian, reserve one latest-correct item from each of option-select, matching,
and impostor *where the eligible pool holds one*, then fill by distinct Leg, distinct Concept, least
prior exposure, and the existing tie-break up to seven wards. Family reservation is best effort over
learner state, never a precondition: the neutral latest-outcome rule lets a later wrong answer
reopen an already-passed stop, and a Leg victory is permanent, so one legitimate re-answer can empty
a family from the pool after the summit has unlocked. An absent family therefore narrows the lineup;
it never refuses or fabricates one. The existing `no_eligible_items` unavailability still covers a
genuinely empty pool. The provable guarantee — that all three families exist among current assets —
is a route/asset invariant proved once in qualification and package validation (KTD7), not a
lineup-time veto over mutable progress.

### KTD7 — Version identity, package, and learner-facing count together

Bump the qualification contract to `source-expedition-learner-assets-v3`. The asset identity payload
includes the route-policy identity, ordered Concept IDs, ordered Legs, anchors, summit, selected
bonus IDs, and the existing qualified lesson/item identities. Reordering, repartitioning, or changing
the selected family mix necessarily changes the identity.

Rename `totalStopCount` to `totalConceptCount` through the Source Expedition candidate, catalog API,
learner query types, fixtures, and real-use tooling. Catalog cards render “concepts.” Actual stop
counts remain Study Session/Leg projection facts and are never estimated from the candidate count.

Bump the sealed format to `lrnki.accepted-path-package.v2`. Its qualification header carries the
exact route plan and `totalConceptCount`. Strict validation proves:

- route node closure and one occurrence per qualified node;
- 3–5 Concepts per Leg, exact anchors, and exact summit;
- one current qualified lesson and one current option-select for every route Concept;
- selected bonus membership, family payload/child-row closure, per-Leg coverage, Expedition-wide
  matching/impostor coverage, and no off-route selected item; and
- equality among the package qualification identity, catalog identity, and freshly re-derived live
  qualification.

This change needs no persisted table or code-first Drizzle shape change. The v1 JSON contract and
option-only validator are deleted in the same unit; no compatibility reader remains under the
greenfield policy.

Changing the qualification contract invalidates the current five packages and learner asset
identities. Validate all replacement v2 packages before the destructive step, then use the existing
guarded runbook to reset only the named lrnki application schemas and install the complete package
set model-free. Never remove the PostgreSQL volume. Existing development users, sessions,
expeditions, responses, and awards are intentionally discarded; deployed/shared data is out of
scope.

### KTD8 — Keep evidence classes and source incompleteness honest

Automated tests prove deterministic envelopes, not material usefulness. Production-model generation
and direct inspection must examine every route-selected matching/impostor item, its source-support
decisions, its key/assignment verdict, and its visible correction/explanation. Record the actual
per-path Leg-size and family histograms; do not retain a metric trajectory.

`FIX_FIRST` remains an unsupported learner-visible claim, incorrect or non-unique key, ambiguous
matching assignment, trusted-prerequisite leak, incoherent/non-completable route, or an Expedition
missing a bonus family. A rejected/unselected neutral candidate is safe incompleteness, as is a Leg
recorded `leg_mix_absent` under KTD5's degrade path.

Real-backend web proves the served learner contract. A fresh Debug iOS Simulator proves only local
native presentation and interaction for the exact tested revision. No Android, automated-native,
physical-device, deployed, distributable, or production authority is inferred.

## Scope boundaries

In scope:

- the shared Expedition route/Leg authority and current Source Expedition consumer chain;
- source qualification for option-select, matching, and impostor;
- generator pre-gate correction and route coverage diagnostics;
- Study Session, Guardian selection, catalog terminology, accepted-package v2, the five replacement
  packages, and required web/Simulator validation; and
- plan/index/TODO/README lifecycle updates and durable source/tests/runbook ownership.

Out of scope:

- a fourth Study Item family, cross-Concept Study Item identity, or learner-specific generated
  neutral content;
- requiring every family on every Concept;
- changing acquisition mastery, calibration, prerequisite confidence, difficulty floor, Support
  Path evidence, reward currency, shield/recovery rules, or leaderboard scoring;
- reopening Synthetic Topic Generation, model-grounded prerequisites, or generated Support Steps;
- external fact verification of the project primers, arbitrary-source readiness claims, content
  search/authoring UX, or a moderation workflow; and
- deployment, shared-host reset, production data, Android, physical-device, or distributable builds.

## Implementation units and execution order

Units are exclusive and execute U0 through U8 in order. None is declared parallel-safe: route types,
qualification identity, package contracts, and the five generated artifacts are coupled. A read-only
review lane may inspect a unit, but only the integration lane edits this plan, the plan index, or
`TODO.md`. Before each unit, re-read the current plan status and coordination files.

### U0 — Freeze the defect and contract tests

- Recompute the five-package Concept, edge, Leg, singleton, Study Item family, lesson-passage, and
  rejection-reason summaries from the committed packages with one reusable read-only report.
- Add failing focused tests for 3–5 Leg size, source-order/topological behavior, Leg-level mixed
  coverage, Expedition-wide family coverage, honest Concept counts, and route-sensitive asset
  identity.
- Freeze the five current package digests/identities in the Validation Log before regeneration.
- Probe post-veto yield on one path before U1. Regenerate the Neuroscience Study Item Bank against
  its existing Enrichment Run with the two passage-count rules removed locally and not committed,
  then record its bonus-capable Concept count and longest uncovered window. Neuroscience is the worst
  observed case, so its result bounds the other four. This is the plan's earliest feasibility
  evidence and it decides whether KTD5's degrade path is needed.
- **Acceptance:** The focused tests fail for the named current defects and pass for unrelated
  prerequisite closure, mastery, grading, and package safety invariants; the probe measurement is in
  the Validation Log; and no implementation behavior change is committed in this unit.

### U1 — Introduce the shared Expedition Route Plan

- Add source cue resolution through the enriched evidence read and implement the pure topological
  order plus joint partition/bonus solver from KTD2–KTD3.
- Replace terminal-cone claiming/split/merge rather than layering a second route algorithm.
- Cover isolated nodes, dense DAGs, shuffled inputs, same/different source documents, locator
  fallbacks, the backward Personal Finance edges, totals from three upward, deterministic tie-breaks,
  no-solution diagnostics, and stable anchors/summit.
- **Acceptance:** Pure tests prove exact node coverage, topological validity, 3–5 sizing, target-four
  optimization, source coherence, bonus constraints, deterministic replay, and explicit failure.

### U2 — Qualify matching and impostor against source material

- Extend material-claim subjects, locations, field-treatment tripwires, evaluation stitching, and
  citation settlement for all three families.
- Replace option-only source admission with the family-complete owner and delete superseded paths.
- Remove passage-count vetoes while retaining provable preconditions, bounded generation, blueprint
  suitability, structural guards, Answer-Key Verification, and Matching Assignment Verification.
- **Acceptance:** Focused tests admit supported single-passage examples and an accepted
  generated-provenance relationship, and reject every missing decision, unresolved/misattributed
  claim, unsupported reveal, true lie, false truth, non-unique key, surface-cued/ambiguous board, or
  dishonest source provenance.

### U3 — Bind Source Expedition qualification to route and mix

- Compute the route only after predecessor-closed lesson/item family qualification, select the
  minimum bonus set, and return `study_item_mix_unavailable` plus structured diagnostics when no
  valid plan exists.
- Carry the finished plan through open/adopt/activate/authorize results and bind it into asset
  identity v3.
- Ensure unselected/rejected candidates remain inspectable but cannot be graded, referenced, or
  recalled as current learner assets.
- **Acceptance:** Source Expedition tests cover successful mixed routes, every unavailable arm,
  stale identity at publication/adoption/open/authorization, and no learner write on failure.

### U4 — Consume the plan in Study Session, Guardian, and catalog UI

- Pass the plan into Study Session and Recall Challenge composition; remove independent section
  derivation and enforce plan/detail/item consistency.
- Implement family-aware Leg and Expedition lineup reservation without changing ward budgets,
  least-exposure rotation, immutable replay, recovery, or challenge evidence isolation.
- Rename the candidate count and update learner/API/component/intercepted fixtures and copy.
- **Acceptance:** Projection tests prove 10–17 acquisition stops per normal Leg, canonical activity
  order, independent completion, unchanged mastery/prerequisite behavior, mixed Leg Guardians,
  three-family Expedition Guardians while every family is eligible, a narrowed but never refused
  summit lineup after a family is re-answered wrong, accurate progress, and honest catalog counts.

### U5 — Replace accepted package v1 with v2

- Update port types, strict parser/serializer, relational closure validator, export/install module,
  CLI, manifest schema, tests, and operator runbook for route-bearing mixed-family packages.
- Delete the v1 literal and option-only qualification checks in the same unit.
- Exercise foreign-key closure for matching pairs and impostor statements and identity sensitivity to
  route/item changes.
- **Acceptance:** Canonical v2 round-trip is byte-stable; malformed route/family packages fail before
  writes; complete-set validation precedes reset; catalog rows still publish last; installation
  performs no model call and writes no learner/auth/progress data.

### U6 — Regenerate and qualify the five current paths

- Re-resolve production Model Assignments, generate each path in manifest order against one shared
  live Concept registry, and run the new qualification/coverage report.
- Inspect every selected matching/impostor candidate and its evidence/key/assignment result. Repair
  only classified generic defects or honest project-source gaps under KTD5; do not rerun unchanged
  failures for luck.
- Export replacement v2 packages only after all five satisfy route, family, source, key,
  prerequisite, and playability gates.
- **Acceptance:** Every path has only 3–5-Concept Legs, every Leg has selected non-option practice or
  a recorded `leg_mix_absent`, every Expedition selects all three families, every selected item is
  source-qualified, and the manifest owns the exact replacement package digests.

### U7 — Prove model-free reset/install and the complete repository gate

- Validate all five package files before the reset, resolve the exact development database, perform
  the guarded application-schema reset, install the set model-free, and repeat the install/export
  comparison from a fresh reset.
- Prove one shared registry, exact IDs/routes/assets/catalog order, zero user/session/learner/award/
  operation rows, and no PostgreSQL-volume deletion.
- Run `pnpm test:db`, `pnpm check`, accepted-package tests, link/JSON/whitespace checks, and
  `git diff --check`; triage failures under the validation skill rather than relabeling baselines.
- **Acceptance:** Both installs reproduce byte-identical accepted identities and the complete
  repository gate is green at the exact implementation revision.

### U8 — Real-use web, Simulator, and lifecycle closure

- Through the real local API/web flow, inspect first, middle, and final Legs of all five paths and
  complete one full Expedition through its mixed Leg Guardians and three-family summit Guardian.
- On a fresh Debug iOS Simulator, inspect representative three-, four-, and five-Concept Legs,
  option-select/matching/impostor interaction, progress/resume, crystal completion, mixed Guardian,
  and summit arrival on the exact tested revision.
- Re-run the smallest repository gate invalidated by any native fix. Record evidence authority and
  teardown disposable learner data.
- Move durable mechanics to source/tests/runbooks, update README/TODO/index status at each batch,
  reduce `Open findings` to `_None._`, consolidate the Validation Log, commit the completed plan, and
  delete it only in a later plan-deletion commit.
- **Acceptance:** The exit test below passes with no Android, physical-device, deployed,
  distributable, production, or release claim.

## Exit test

The plan is complete only when all of the following are true:

1. One source-owned route module is the only authority for ordered Concepts, 3–5-Concept Legs,
   anchors, summit, and selected bonuses; terminal-cone sectioning is gone.
2. Every accepted Concept has one qualified lesson and one qualified option-select; every accepted
   Leg has qualified matching or impostor practice, or a recorded `leg_mix_absent` under KTD5's
   degrade path; and every accepted Expedition contains all three families without fabricated or
   unsupported content.
3. Study Session, mastery, progress, catalog counts, Leg Guardian, Expedition Guardian, adoption,
   authorization, and immutable challenge replay consume the same route/asset identity.
4. The five v2 packages pass exhaustive deterministic qualification, direct selected-item
   inspection, model-free double reinstall, `pnpm test:db`, and `pnpm check`.
5. Real-backend web and fresh Debug iOS Simulator evidence pass for the exact revision, with their
   evidence classes stated honestly and disposable learner state removed.
6. Durable policy/mechanics live in ADRs, source, tests, or README; the plan Validation Log is
   consolidated; `Open findings` is `_None._`; the index and TODO agree; and no owner-only action
   remains unrecorded in `BLOCKERS.md`.

## Validation Log

### U0 — Five-package baseline and post-veto feasibility probe — 2026-08-30

- **Implementation:** `pnpm accepted-paths report` now validates the canonical manifest/package set
  and recomputes route, family, grounding, rejection, source-cue, and target-contract summaries
  without environment loading or database access. Its focused suite freezes 183 Concepts, zero
  trusted topological violations, 140 one-passage lessons, full-bank family totals of 183
  option-select/26 matching/43 impostor, and the current singleton-heavy route. No learner behavior,
  qualification, package, or generation policy changed in U0.
- **Frozen package identities:** Critical Thinking `8f0977a457b0a8cc0c2fc8d2d7182d09b3c27f6071e2529cf019b5177cbdeec4`
  / `source-expedition-assets-02cb55fe3bee71d8e631851445c47d313433892c91b236f4ddcb91ea6e6514fc`;
  Probability and Statistics `1c45b20e55626671947d2ed4eabcbe4528697cbbc139f638c5946d03e86f8bc0`
  / `source-expedition-assets-91e00849e8e5449a14837893d0d774e1b5a5b0dd958dfd2250d020d7cc77e961`;
  Personal Finance `0f6b75fb670348a9e23aadd16232bd88437f6be16a585ccdaaa45c4997e04fa2`
  / `source-expedition-assets-0a7ddc24fde0326b3fb89c358555a6a951080f2a2eaab95d2f419da87318395f`;
  Machine Learning `45b2dc125c5fdbca7c30b3cae2b910bf2674472c222f5ced6c1da745de9bcc6f`
  / `source-expedition-assets-9c6323b38a47c0880333b61948755ebe7233f8ef50a2432775ebb9897d139857`;
  Neuroscience `ffabde24ea0fc862e9b962dfb38740d807b1947f94e6fb87ba92aadb3496589e`
  / `source-expedition-assets-9999fce0841f211ee7c25744a50744c6542be51adc2ef9f138981966a15ce500`.
  All five use asset config `source-expedition-learner-assets-v2:study-item-bank-acebfee04913`.
- **Focused regression:** the baseline report, prerequisite closure, source-expedition, mastery,
  grading, replay, and package-safety tests pass. The six named target-contract bodies execute and
  fail under `node:test` TODO status for Leg size, explicit source-cued routing, Leg mix,
  Expedition-wide families, honest Concept count, and route-sensitive identity. Both affected
  workspaces typecheck; ESLint, package-set validation, and `git diff --check` pass.
- **Post-veto probe:** against the existing Neuroscience Enrichment Run
  `344ad479-54b7-465c-a7a0-780417ec2c64`, one standard-concurrency production MiMo v2.5 generation
  ran with only the two passage-count vetoes temporarily removed; the source patch was then restored.
  The terminal neutral bank has 40 current lessons/source cues, 38 option-select, 14 matching, and
  36 impostor items. Thirty-six of 40 Concepts are bonus-capable, the longest source-cued uncovered
  run is one, and a hard 3–5-Concept mixed partition exists. KTD5's `leg_mix_absent` degrade path is
  therefore not activated for U1. The two missing option-select items failed the unchanged
  duplicate-option guard, so this bank is not an accepted path.
- **Direct inspection:** all 50 bonus artifacts were inspected: 52 matching pairs contain 50 source
  and two generated relationships; 108 impostor truths contain 104 source and four generated
  relationships; all pass the current mechanical family shapes. Two unselected impostor corrections
  are internally false: Retrieval Practice Effect attributes its dopamine lie to acetylcholine and
  neuromodulators, and Retrieval calls an equal-strengthening lie true of Retrieval-Induced
  Forgetting while describing reduced access. U2 already owns this exact family-complete
  material-claim and correction-support defect class; neither candidate is admitted.
- **Real-use quality:** Milestone U0 feasibility probe; fixture Neuroscience of Memory and Attention;
  real model calls yes; result `EXPERIMENT_ONLY`; useful output is the measured route-feasibility
  bound; defects are the two false corrections and two absent option-select items; changes after
  inspection are none because the veto patch was reverted; remaining caveats are source-family
  admission, unresolved MiMo quantization identity, and no accepted route; safe downstream use is
  U1 route implementation only, never learner admission or publication.
- **Authority boundary:** committed-package inspection, local automated checks, one production-model
  generation into the guarded development database, and direct neutral-artifact inspection only.
  The development database now contains that unaccepted experimental terminal bank. No real-backend
  web, native, deployed, physical-device, production, or release evidence was produced.

### Planning baseline and design review — 2026-08-29

- **Authority:** Read-only current source, the five committed accepted-package projections, current
  coordination documents, and primary learning-research sources. No database, model, web, or native
  run. The `Current repository facts` table owns the baseline counts. For the review, the KTD2/KTD3
  route planner, `lessonGroundingShape`, and the family admission bars were re-implemented from this
  plan's text and replayed over the packages; the replay reproduces the plan's own 140/152 pre-gate
  decline counts and the 140/12/31 lesson-passage split, which is its positive control.
- **Locked owner choices:** 3–5 Concepts per normal Leg, target four; one option-select per Concept;
  at least one selected matching/impostor per Leg; both bonus families per Expedition; existing
  mastery and rewards preserved.
- **Measured — route feasibility is the plan's load-bearing bet.** Under KTD2/KTD3 the hard
  "3–5 Concepts and one bonus candidate per Leg" partition has NO solution today for Critical
  Thinking, Neuroscience, and Probability and Statistics, and only a minimum-Leg-count solution for
  Machine Learning (7) and Personal Finance (8), which suppresses the target-four rank entirely.
  Bonus-capable Concepts are 11/31, 7/31, 5/40, 11/37, 9/44. The binding condition is spread, not
  count: interior gaps between bonus-capable Concepts must be at most 8 and end gaps at most 4;
  observed longest runs are 12/6/11/7/10. KTD5's veto removal must supply the difference.
- **Measured — family provenance.** 10 of 39 matching and 21 of 67 impostor bank items carry a
  source citation on every relationship; 60 of 143 pairs and 66 of 201 truths are honest
  `generated` rows; 67 of 67 lies are generated and uncited as designed.
- **Measured — the one-passage lesson is a lesson limit, not a source limit.** Every one of the 140
  one-passage lessons had at least 2 source evidence passages available and 76 had at least 3 (mean
  4.24; 6.31 across the 108 published-Concept stops). Passage count tracks lesson SECTION count
  (1.09/2.00/2.52) and not available evidence (4.24/5.67/6.06). 122 of the 140 came from the normal
  generator and 18 from the extractive definition fallback; `applications`, `intuition`, and `gist`
  bodies yield no grounding passage, and each path carries only 11–15 lesson bullets.
- **Amended on this evidence:** KTD4 admission bar (option-select analogue; a generated-provenance
  relationship is admissible under an accepted source-support decision); KTD6 Expedition Guardian
  (best-effort family reservation, provable guarantee moved to KTD7) and Leg anchor precedence; KTD5
  pre-gate/fallback split, pre-decided per-Leg degrade path, and repair-layer correction; KTD1
  lowest-ID option-select rule; and a U0 yield probe before U1. Concept Lesson grounding depth left
  this plan for its own brainstorm.
- **Handoff invariant:** Implementation must fix route planning and source family admission together.
  Merely grouping arbitrary current Concepts, removing the option-only filter, or changing catalog
  copy does not satisfy the plan.

## Open findings

_None._

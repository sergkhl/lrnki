# Architecture deepening review — candidates

Date: 2026-07-07. Produced by the `improve-codebase-architecture` skill: surface **deepening
opportunities** — refactors that put more behaviour behind smaller interfaces — using the
architecture vocabulary in `.agents/skills/improve-codebase-architecture/LANGUAGE.md` (module,
interface, depth, seam, adapter, leverage, locality) and the project language in `CONTEXT.md`.

This supersedes the 2026-07-03 review (deleted when its Candidates 1–2 shipped; recoverable at
`git show 6d0d56c^:docs/brainstorms/2026-07-03-architecture-deepening-review.md`). Its three open
candidates were re-verified against the current tree and appear below, renumbered, with updated
evidence — two of them upgraded by code that landed since (generation queue, expedition durability,
rescued-node labeling, learner grading actions). Its rejected-findings ledger is carried forward at
the end so future reviews don't re-surface them.

No interfaces are proposed yet; each candidate is a problem statement plus a plain-English
direction.

---

## Candidate 1 — Make the operation-timeline catalog provably complete (found drift: `rescued-node-labeling` spend is silently dropped)

**Status: ACCEPTED and IMPLEMENTED (2026-07-07)** via plan `2026-07-07-002` (now deleted). All four
live tags catalogued, both dead tags deleted, and the completeness/disjointness set-equality
assertion installed in `operationTimelineCatalog.test.ts`. Real-use gate (rule 14) recovered
$0.0187 of formerly-dropped `knowledge-boundary-probe` spend on one enrichment run and $0.0030 of
`impostor-lie-validity-judgment` on one study-items run — see the TODO validation entry. Candidate 3
(forced-tool descriptors) can feed its `stageTag` into the same assertion when it lands.

**Recommendation strength: Strong** (contains a live defect)

**Files**

- `packages/application/src/operationTimelineCatalog.ts:39-52` (`OPERATION_TIMELINE_CATALOG.enrichment`)
- `packages/domain-core/src/index.ts:1711` (`STAGE_TAGS.rescuedNodeLabeling = "rescued-node-labeling"`)
- `packages/application/src/enrichmentNodeMinting.ts:180` (runs the stage),
  `packages/infrastructure-litellm/src/enrichmentAdapters.ts:200` (tags the LLM call)
- `packages/application/src/bottleneckReport.ts:125` (`spendStageBelongsToOperation` filter)
- `packages/application/src/operationTimelineCatalog.test.ts:44-57` (codifies the incomplete list)

**Problem**

Grilling (2026-07-07) found the drift is 4× the initially reported size. Diffing `STAGE_TAGS`
against the catalog: **six** tags appear in no operation's catalog entry, four of them live:

- `rescued-node-labeling` — runs as an enrichment timeline stage (`enrichmentNodeMinting.ts:180`).
- `concept-set-synthesis` and `knowledge-boundary-probe` — `runSyntheticGeneration` reports as
  operation type `"enrichment"` (`runSyntheticGeneration.ts:109`) and runs both as stages; the
  probe is K-sampled, so this is real recurring spend on every topic expedition since 2026-07-01.
- `impostor-lie-validity-judgment` — spend-tagged (`studyItemGenerationAdapters.ts:305`) inside
  the `study_items` impostor stage; its sibling judge `lesson-redundancy-judgment` *did* get a
  catalog entry, this one didn't.
- `answer-grading` and `learner-simulation` — dead vocabulary from the retired measurement-mode
  era (last live use deleted with the grading-judge experiment); referenced today only by the
  learner `stageCopy` map. Rule 18: delete, don't catalog.

For each live tag, `spendStageBelongsToOperation(tag, op)` returns `false`, so `bottleneckReport`
filters that spend out of every bottleneck and journey-cost report — invisible to exactly the
reports TODO #2 depends on. The catalog's own test asserts the same incomplete lists, so CI stays
green.

This is not the previously-rejected "stage-name duplication" finding (the catalog *composes*
`STAGE_TAGS`, single-sourced). It is an **incompleteness** failure: registering a stage is a
same-change convention across `STAGE_TAGS` + `stage()` call + spend tag + catalog entry, and
nothing checks the last step happened. One representation of "which stages belong to enrichment"
lives in the running code (`stage(...)` calls), a second in the catalog — kept congruent by hand,
and it drifted within three days of the stage shipping.

**Solution**

Add the four live tags to their owning catalogs, delete the two dead tags (with their `stageCopy`
entries). Then deepen: make completeness a checked property of the catalog's interface — a
set-equality assertion that the union of catalog LLM stages **equals** the `STAGE_TAGS` values and
is pairwise disjoint across operations. Set equality catches both failure directions at once: an
orphaned live tag (all four defects above) and dead vocabulary (both stale tags above). ADR-0029's
same-change registration rule becomes machine-enforced instead of remembered.

**Benefits**

- **Correctness now**: enrichment cost reports stop under-counting.
- **Locality**: the "which operation owns this stage" fact gets one authority with a completeness
  guarantee; the whole class of silently-orphaned spend disappears for every future stage.

**Before / after**

```
Before:  new stage = STAGE_TAGS entry + stage() call + spend tag + catalog entry
         (4th step optional in practice; forgetting it silently orphans spend)
After:   same steps, but a completeness assertion fails the build when any
         STAGE_TAGS value is missing from (or duplicated across) the catalog
```

---

## Candidate 2 — Move learner grading composition out of the server-action seam into an application use-case

**Status: ACCEPTED and IMPLEMENTED (2026-07-07)** via plan `2026-07-07-004` (now deleted); current
status and the rule-14 real-use PASS live in [TODO.md](../plans/TODO.md). Key
grilling outcomes: the guard reuses the existing `getByEnrichment` read (the brainstorm's combined
keyed-item store method was rejected as aggregate-crossing), and the verdict/lesson-read
node-membership check is preserved via a light `EnrichmentInspectionReadPort` boolean read.

**Recommendation strength: Strong**

**Files**

- `apps/admin-lab/src/app/learn/actions.ts` (417 lines, 8 raw `sql<…>` blocks, **no test file**)
  — `submitLearnerOptionSelect` (91-139), `submitLearnerImpostor` (141-189),
  `submitLearnerMatching` (191-259), `validateLearnerMatchingAttempt` (261-291),
  `setLearnerVerdict` (293-320), `clearLearnerVerdict` (322-348), `markLearnerLessonRead` (350-375)
- `packages/application/src/gradedSelectionOutcome.ts:41-85` (the deliberately thin graders)
- `packages/infrastructure-postgres/src/PostgresLearnerLoopStores.ts:229,292-311`
  (`toMatchingPair`/`toCitation` — the row→domain mapping duplicated by the action)

**Problem**

Every graded-write server action hand-writes multi-table SQL that (a) re-derives the "is this
expedition ready and active for this learner" guard — the same join appears **seven times**
(`actions.ts:106,156,206,275,304,332,360`) — (b) resolves the server-side answer key from
`study_items`/`study_item_options`/`impostor_statements`/`matching_pairs`, and only then calls a
thin application grader. The sharpest instance, `submitLearnerMatching:219-243`, reconstructs a
full `MatchingItem` domain object from raw rows including the Grounding Provenance discriminant —
a second, hand-synced copy of the row→domain mapping that already lives in
`PostgresLearnerLoopStores`. CONTEXT.md's Study Session contract says composition happens "behind
an application use-case, not the UI"; the grading half of Learner State writes currently lives in a
`"use server"` module where the security-relevant guard is untestable through any interface
(`src/app/learn/` has no test file — the only untested logic-bearing module on the learner surface).

**Deletion test**: deleting the inlined SQL does not make complexity vanish — it reappears — so it
is real behaviour, just parked at the wrong seam.

**Solution**

One application use-case (e.g. "grade an active-expedition study response") owning
load-guard-resolve-append behind the existing store ports: a store method returns the keyed item
scoped to `(learner ref, active expedition)`, the use-case grades and appends via the existing
outcome helpers, and each server action collapses to one call. The seven guard joins and the
`MatchingItem` reconstruction disappear; the verdict/lesson-read actions get the same guard from
the same place.

**Benefits**

- **Locality**: the active-expedition guard and the answer-key resolution each get one home;
  today a guard change is a seven-site edit in a UI file.
- **The interface becomes the test surface**: grading (including the "expedition no longer
  active" refusal) becomes testable with fake stores like every other use-case; today it is
  reachable only through a live server action with embedded SQL.
- **Leverage**: a future non-admin-lab Learner App front-end (already foreshadowed by the second
  composition root, Candidate 4) reuses grading instead of re-writing it.

**Before / after**

```
Before:  UI server action = guard SQL ×7 + key-resolution SQL + row→domain rebuild
         + thin application grader call                       (untested, 417 lines)
After:   UI server action = one use-case call
         use-case = guard + resolve + grade + append          (tested via fake stores)
```

---

## Candidate 3 — Forced-tool operation descriptors + mechanically derived config hash

**Status: IMPLEMENTED 2026-07-08 except the deferred real-use gate** via
[docs/plans/2026-07-08-001](../plans/2026-07-08-001-refactor-neural-stage-descriptors-dotprompt-plan.md).
The durable policy is now [ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md):
descriptor unit is the forced tool call, prompts live in dotprompt `.prompt` files whose
frontmatter owns the model alias, config hashes derive from file bytes + schema JSON, zod schemas
stay single-sourced per ADR-0006, and ports stay.

**Recommendation strength: Strong** (carried from 2026-07-03 Candidate 3, upgraded — the drift it
predicts has now happened once)

**Files**

- `packages/infrastructure-litellm/src/*Adapters.ts` — now **24** adapter classes implementing a
  `*Port` (up from ~20; five new since 2026-07-03: rescued-node labeling, lesson-redundancy judge,
  declared-domain inference, impostor lie-validity judge, study-item blueprint)
- `packages/infrastructure-litellm/src/toolSchemas.ts` (563 lines)
- `apps/kg-worker/src/knowledgeGraphWorker.ts:76` (`PIPELINE_CONFIG_HASH = "definition-quality-judge-v38"`)
- `packages/application/src/studyItemBankConfig.ts:1` (`STUDY_ITEM_BANK_CONFIG_HASH = "study-item-bank-v3"`)
  — a second hand-bumped hash, consumed by both the worker (`knowledgeGraphWorker.ts:617`) and the
  learner generation root (`apps/admin-lab/src/lib/learnerGeneration.ts`)

**Problem**

Unchanged from the previous review, and growing: every adapter is the same shallow shape —
`constructor(client, model)`, render prompts, `client.call({model, messages, toolName,
toolDescription, parameters, validator, tags})`, map result. The deep behaviour already lives in
`LiteLlmForcedToolClient`; what each adapter adds is *knowledge* (prompt, schema, alias, stage
tag), scattered across ~6 files per stage. Each of the five stages added since the last review
paid the full 6-file spread, and one of them dropped a step (Candidate 1's catalog omission) —
empirical proof the hand-synced spread drifts. The configuration identity guarding Extraction Run
attribution (ADR-0017) remains a hand-bumped string; there are now **two** such hashes plus an
unversioned `enrichmentConfigHash: "banded-difficulty"` in `runGraphEnrichment.ts`.

**Solution**

One descriptor module per LLM operation — `{alias, toolName, toolDescription, schema (or schema
builder), validator, stageTag, renderSystem, renderUser, mapResult}` — executed by one generic
forced-tool adapter. Per-judgment **ports stay** (they are the test surface and the
application-facing seam); only the adapter-class ceremony collapses. Config hashes derive
mechanically from the descriptor set + model aliases, so "bump on change" becomes automatic, and
the descriptor's `stageTag` can feed Candidate 1's catalog completeness check from the same
source.

**Benefits / caveats** — as recorded in the 2026-07-03 review: locality (one descriptor file per
neural stage), leverage (new stage = descriptor + port + catalog entry), the stale-hash
misattribution class disappears. ADR-0006 fully preserved (schemas stay single-sourced from zod;
fail-closed unchanged); runtime-bounded schemas need descriptor support for schema *builders*;
prompts dominate line count and won't shrink — the win is knowledge consolidation, not lines.
The grilling pass over the descriptor interface (schema builders, per-call retries, model-alias
ownership) completed 2026-07-08; the linked plan owns its outcomes.

**Before / after**

```
Before:  stage knowledge = adapter class + toolSchemas entry + alias const + STAGE_TAGS
         + catalog entry + worker wiring + hand-bumped config hash        (6–7 sites, ×24)
After:   stage knowledge = descriptor module (+ port + catalog entry)
         config hash = hash(descriptors)                                  (mechanical)
```

---

## Candidate 4 — Deduplicated composition: the second root made the wiring seam real

**Status: client-policy half ACCEPTED and IMPLEMENTED (2026-07-08); grouping half REJECTED on a
refuted premise.** Grilling verified the client-construction duplication verbatim and shipped
`createNeuralClients()` / `resolveNeuralClientBaseOptions()` in
`packages/infrastructure-litellm/src/neuralClients.ts` — env base config, the
discovery/deterministic/probe/embedding sampling policy, and every rationale comment now live
once; both roots (and the boundary-probe calibration sweep's env mapping) consume it, and the
policy is pinned by request-body tests in `neuralClients.test.ts`. Deliberately NOT a CONTEXT.md
term (user decision — infrastructure policy, not domain language). The `runGraphEnrichment`
input-grouping half is **rejected**: its "two adapters make the grouping a real seam" premise is
false — `runGraphEnrichment` has exactly one caller (the kg-worker); the learner path calls the
sibling `runSyntheticGeneration` via `generateTopicExpedition`, never `runGraphEnrichment`. Do
not re-propose the grouping unless a real second caller of `runGraphEnrichment` exists.

**Recommendation strength: Worth exploring** (upgrade of 2026-07-03 Candidate 5, which was
Speculative pending "a second composition root")

**Files**

- `apps/kg-worker/src/knowledgeGraphWorker.ts:118-145` (`buildContext`: `baseClient`,
  deterministic client `temperature: 0, seed: 7`, probe client `temperature: 0.7`, embedding
  client, ~20 adapters)
- `apps/admin-lab/src/lib/learnerGeneration.ts:34-60` (`baseClientConfig()` + the same
  deterministic/probe/embedding trio + ~15 adapters + 6 stores for `generateTopicExpedition`)
- `packages/application/src/runGraphEnrichment.ts:133-190` (input object: now **13 ports** +
  config + 3 summary callbacks + `newNodeId` + 2 ids; `rescuedNodeLabelingJudge` added since the
  last review)

**Problem**

The previous review kept port-grouping Speculative because wiring happened exactly once. That
condition no longer holds: Synthetic Topic Generation for learner expeditions gave the Admin Lab
its own composition root, which re-states — near-verbatim — the worker's client-construction
policy: same env keys, same `temperature: 0, seed: 7` determinism decision, same moderate-
temperature Knowledge-Boundary Probe client. The *rationale comments* (why the probe runs at 0.7,
why seed 7) live only in the worker copy. That policy is now a second hand-synced representation
of one fact; a temperature/seed/alias change must be remembered in two apps. Meanwhile the
`runGraphEnrichment` input sprawl keeps growing with each new judge.

**Solution**

Extract the shared client-construction policy (base config from env, deterministic client, probe
client, embedding client — with the rationale comments moving with it) into one factory both roots
call; per-root adapter/store wiring stays explicit at each root (that part is the composition
root's job — see the rejected-findings ledger). Separately and more speculatively, shape
`runGraphEnrichment`'s input as aggregates mirroring its sub-orchestrations (node-assembly group,
dedup group) now that two callers exist — two adapters make the grouping a real seam.

**Benefits**

- **Locality**: the determinism/probe-temperature policy — a measured, load-bearing decision
  (ADR-0030) — gets one home with its rationale.
- **Leverage**: the eventual dedicated Learner App backend becomes a third caller of the factory,
  not a third copy.

---

## Candidate 5 — One staleness rule for "a generating run is dead"

**Status: ACCEPTED and IMPLEMENTED (2026-07-07)** as part of the completed
"Expedition generation latency and operation-run liveness fixed" work recorded in
[TODO.md](../plans/TODO.md). Current shape: `packages/application/src/operationRunLiveness.ts`
owns the operation heartbeat window, deadline derivation, and UI stale predicate; the supervisor
computes one `staleBefore` per tick and passes it to operation-run reaping and expedition
claim/fail paths. The Postgres expedition store still owns the richer SQL lease predicate behind
its port, preserving package dependency direction.

**Recommendation strength: Strong** (small)

**Files**

- `packages/application/src/operationRunLiveness.ts` (single TypeScript operation-run liveness rule)
- `apps/admin-lab/src/lib/topicGenerationSupervisor.ts` (computes one shared `staleBefore`)
- `apps/admin-lab/src/components/learn/GenerationProgressCard.tsx` (imports the shared stale
  predicate)
- `apps/admin-lab/src/app/admin/lab/operations/page.tsx` (imports the shared stale predicate)
- `packages/infrastructure-postgres/src/PostgresLearnerExpeditionStore.ts:129-139`
  (`generatingStaleness` — the richer SQL lease predicate)

**Problem**

Before implementation, the rule "an operation heartbeat is stale after 2 minutes" existed four
times: once as the SQL input to the claim/fail predicate, and three more times as an independently
declared TypeScript constant with two re-implementations of the comparison. If the reclaim window
changed, the supervisor's relaunch behaviour and the two UI "stalled" badges could silently
disagree.

**Solution**

Implemented: export one application-owned constant plus `operationStaleBefore` and
`isStaleOperation`; import them at the supervisor and UI sites. The SQL store keeps the lease
predicate local and receives `staleBefore` from the supervisor instead of importing application.

**Benefits**

- **Locality**: one number, one comparison, one place to change the operation heartbeat window.
  The richer expedition reclaim rule remains behind the Postgres adapter where the claim semantics
  live.

---

## Candidate 6 — Give `domain-core` and `ports` internal structure

**Recommendation strength: Worth exploring** (carried from 2026-07-03 Candidate 4, unchanged in
kind, slightly worse in degree)

**Files**

- `packages/domain-core/src/index.ts` — now **1,749 lines**, 159 top-level exports. Concern
  clusters: source/extraction primitives (1–577), publication model (578–730), relation predicate
  registry (732–775), enrichment/rescue/minting/dedup/identity (775–1090), difficulty/ordering/
  labeling (1091–1332), study items + Concept Lessons (1333–1626), calibration/response-log +
  `STAGE_TAGS` (1628–1749).
- `packages/ports/src/index.ts` — now **1,155 lines**, 47 `*Port` interfaces: neural ports
  (55–270), persistence stores (271–330), enrichment/synthetic (334–465), learner-state/difficulty
  (462–475), expedition/study-bank/lesson/response stores (476–717), Inspection Read Model
  (718–990), run-stage timelines (993–1085), spend/journey reads (1085–1155).

**Problem / solution** — as recorded in the previous review: both packages are single-file barrels
commingling concerns that never change together; understanding "the rescue path" means bouncing
between three line-ranges. Split each internally into concern-scoped files re-exported from the
existing barrel (import specifiers unchanged, pure file moves). Navigability for maintainers and
AI, not behaviour — hence not Strong. Cheap and zero-risk.

---

## Candidate 7 — Let the Study Session projection own per-stop completion

**Recommendation strength: Speculative**

**Files**

- `packages/application/src/studySessionProjection.ts:413-423` (`nodeIsComplete` — the completion
  rule: lesson read AND every activity segment latest-correct)
- `apps/admin-lab/src/components/learn/trailView.ts:99-104,184-198` (`growthFraction`,
  `stateForStop` — re-folds the same primitives per stop)
- `apps/admin-lab/src/components/learn/ActivitySheet.tsx:72-92` (`ActivityController` recomputes
  `buildTrailView` and embeds the untested "next stop = first following non-locked stop" rule)

**Problem**

CONTEXT.md defines the completion rule as *one rule* driving gating, the capstone gem, and
per-stop visuals. The projection exposes it only at node granularity (`locked`/`frontier`/
`mastered`); `trailView` independently re-derives per-stop completion and crystal growth from the
same primitives (`lessonReadByNode`, `latestOutcomeByStudyItemId`) and asserts congruence by
comment ("one completion rule, one visible truth"), not by construction. Both folds sit downstream
of the projection seam (no raw DB in the UI — good); the friction is only that the rule is written
in two languages that must stay congruent by hand.

**Solution**

Have the Study Session projection emit per-stop state (and growth fraction) on each expedition
step, making it the sole author of completion; `trailView` becomes pure re-shaping. As a smaller
independent step, extract `ActivityController`'s advance rule into a tested pure helper in
`trailView.ts` and stop recomputing `buildTrailView` inside the sheet.

**Why only Speculative**

`buildTrailView` passes the deletion test emphatically (12 consumers) and every logic helper
around it is tested; the duplication has not demonstrably drifted. The small `ActivityController`
extraction is worth doing regardless; the projection-emits-stops move is a judgment call to take
only if per-stop rules keep accreting UI-side.

---

## Noted, no action proposed

- **The generation-queue fence protocol spans three files by nature** — fence-token semantics in
  `generateTopicExpedition.ts:31-50`, fenced UPDATE in `PostgresLearnerExpeditionStore.updateProgress:214-235`,
  staleness/reclaim in `generatingStaleness:130-145`. Reasoning about double-spend requires all
  three, but this is inherent to a DB-claim lease, the code is well-commented, and the supervisor
  already frames the whole seam as disposable (Restate/Temporal replaces it). At most: one doc
  pointer tying the three together.
- **`LiteLlmForcedToolClient`: "which failure kinds are re-promptable"** lives implicitly in both
  `buildRetryMessages` and the classifier's return shapes. Correct today; a small locality wrinkle
  to keep in mind when touching retry.
- **`EXPECTED_TOPIC_GENERATION_STAGES` in `generationProgress.ts:11-23`** mirrors pipeline stage
  order as a UI progress *estimate* (documented as such) — a fifth home for stage-order knowledge,
  but non-authoritative; would dissolve into Candidate 3's descriptors if those ship.

---

## Examined and rejected

Carried forward from the 2026-07-03 review so future reviews don't re-surface them; all were
re-checked or remain structurally unchanged.

- **Unify the judgment ports behind one "judgment orchestrator".** Each port has a distinct domain
  input shape and is the test surface for its application stage; shared behaviour is already deep
  in `LiteLlmForcedToolClient`. Candidate 3 captures the real residue.
- **Postgres adapters "split by feature epoch, not seam".** The store/read split follows ADR-0027
  and is principled.
- **Stage-name strings duplicated across vocabulary/catalog/worker.** Refuted as *duplication* —
  the catalog composes `STAGE_TAGS` single-sourced. (Candidate 1 is the different, real gap:
  catalog **incompleteness** is unchecked.)
- **`LearnerStatePort` as a hypothetical seam.** Deliberate ADR-0024 placeholder for IRT/KT.
- **Worker `buildContext` as pass-through wiring.** It is the composition root; explicit wiring is
  its job (ADR-0001). Candidate 4 proposes sharing only the *client-construction policy* across
  the two roots, not hiding the wiring.
- **Tests reaching past interfaces.** Refuted; module interfaces are the test surfaces throughout.
- **Hardening Admin Lab operations surfaces.** `operations/page.tsx` is formatting + JSX over read
  models; ADR-0011 says minimal/disposable. No gold-plating.
- **`vocabulary.ts`/`stageCopy.ts` as duplication.** Each is the single themed mapping ADR-0033
  requires, consumed via one accessor. Compliant, not duplicated.

## Already deep — keep as exemplars

- `liteLlmRetry.ts` (`runWithTransportRetries` + `classifyTransportFailure`) — 83 lines, one
  generic function, two real adapters layering their own `classify`; owns the load-bearing
  "timeout is terminal — never blind-retry paid work" rule in exactly one place.
- `PostgresLearnerExpeditionStore.claimNextGenerating`/`generatingStaleness` — `FOR UPDATE …
  SKIP LOCKED` claiming, fence clearing, and a single-sourced staleness predicate behind a
  two-method port surface (the SQL side of Candidate 5 is already right).
- `LiteLlmForcedToolClient.call<T>()` — retry budgets, tag propagation, NUL stripping, corrective
  re-prompting, Zod validation, redacted failure trail behind one method (ADR-0006 made deep).
- `crystalGeometry.ts` — two exported functions (`crystalSpec`, `visibleShards`) over a body of
  deterministic geometry, fully tested; textbook depth on the learner surface.
- The learner read-model lib injectors (`learnerStudySession.ts`, `learnerLoop.ts`,
  `learnerExpedition.ts`, `operationTimeline.ts`) — pages stay declarative; the DB-client
  lifecycle rule lives once.

---

## Top recommendation

Two-step. **First, Candidate 1's defect fix** (four catalog entries + two tag deletions + the
set-equality assertion) — it is hours of work and both enrichment and study-items cost reports are
currently under-counting, which TODO #2's next optimization pass will read. **Then Candidate 2** (the learner-grading use-case) as the first real
deepening: it is bounded, it moves a security-relevant, seven-times-duplicated guard behind a
testable interface, and it honors the Study Session contract that composition lives behind
application use-cases. Candidate 3 remains the largest structural win — now with drift evidence in
its favor — grilled 2026-07-08 and planned (see its status note above).

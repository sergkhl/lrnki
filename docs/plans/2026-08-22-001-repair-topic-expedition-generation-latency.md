---
title: Restore Topic Expedition Generation to Seven Minutes - Plan
type: performance
date: 2026-08-22
execution: code
---

# Restore Topic Expedition Generation to Seven Minutes

**Status:** In progress — U0–U1 complete; U2 next

**Decision state:** Locked. The accepted problem framing and stage-profile deletion test remain in
[Candidate 2 of the architecture-deepening brainstorm](../brainstorms/2026-08-19-001-architecture-deepening-review.md#candidate-2--give-topic-expedition-generation-one-application-owned-stage-profile).
This plan owns only the active implementation design and its validation record.

## Goal capsule

- **Objective:** Restore one otherwise-idle, semantically successful 15–16-concept Cellular
  Respiration Topic Expedition to atomic `ready` in at most 420 seconds, measured from the
  enrichment-operation start through Study Item Bank completion, without weakening any generation
  or admission policy.
- **Problem class:** A barrier-heavy fan-out/fan-in pipeline. The established remedy is bounded,
  backpressured pipelining: downstream work begins when its own prerequisite resolves rather than
  after an unrelated whole batch. This follows Node's conventional
  [stream/backpressure model](https://nodejs.org/api/stream.html); LiteLLM continues to own aliases,
  deployments, fallback, and physical-route scheduling, including its operational
  [parallel-request controls](https://docs.litellm.ai/docs/routing#max-parallel-requests-async).
- **Authority:** Follow [AGENTS.md](../../AGENTS.md), [CONTEXT.md](../../CONTEXT.md),
  [ADR-0001](../adr/0001-adopt-greenfield-deep-module-architecture.md),
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md),
  [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md),
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md),
  [ADR-0030](../adr/0030-confidence-gated-synthesis.md), and
  [ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md).
- **Validation route:** Apply the
  [lrnki validation skill](../../.agents/skills/validate-lrnki/SKILL.md). Local automated evidence
  owns deterministic scheduling, ordering, projection, type, and hash contracts. Production-model
  local API/DB evidence owns latency and route behavior. Direct persisted-artifact inspection owns
  quality. No layer silently substitutes for another.
- **Completion:** Close U0–U4 in order. Commit the detailed final Validation Log before moving
  durable status into `TODO.md`, marking the brainstorm candidate implemented, removing this plan
  from the index, and deleting it in a separate consolidation commit. No new ADR is warranted:
  scheduling and progress projection are reversible implementation choices under existing ADRs.

## Planning-sensitive repository facts

- `claimAdmission.ts` currently opens three non-overlapping whole-wave brackets: every question plan
  must finish before any independent answer begins, and every answer must finish before any factual
  judgment begins. All three roles share one width of four.
- Historical enrichment operation `9a713a49-f306-4bb6-b060-a1616418ffed` is strong regression
  evidence, not the current baseline: 16 concepts took 956.8 seconds, including 203.3 seconds of
  question planning, 316.1 seconds of independent answering, and 284.4 seconds of factuality
  judgment. The verification calls peaked at exactly four and had no corresponding provider,
  schema, timeout, or 429 error. It predates the final one-pass admission change and excludes Study
  Item Bank time.
- `SourceLessGroundingAdmission.admitBatch` is already the deep caller interface. Planner,
  answerer, judge, queue, and route topology are implementation knowledge and must not cross it.
- `expeditionJournal.ts` manually lists six enrichment stages and ten Study Item Bank stages. It
  omits the three verification stages that Synthetic Topic Generation emits, so a running omitted
  stage becomes falsely indeterminate and its completion cannot advance progress.
- The broad `OPERATION_TIMELINE_CATALOG` is authoritative for every operation type but cannot by
  itself distinguish Synthetic Topic Generation from source-grounded Graph Enrichment. Topic
  Expedition therefore needs a narrower application-owned flow profile that is mechanically
  checked against the catalog.
- Current default operation identities before this change are
  `synthetic-topic-generation-0b1ab66013e0`, `graph-enrichment-dfb9ae848b85`, and
  `learner-scaffold-generation-7ab16c2fc80e`. Execution-width changes must leave them byte-identical.

## Acceptance contract

A qualifying single-run attempt must satisfy every item:

1. It begins with no other Topic Expedition active in the local development queue.
2. Concept synthesis returns 15–16 candidates and at least 15 enter claim verification.
3. The attempt is semantically successful, completes the Study Item Bank, and atomically changes
   its learner expedition to `ready`.
4. Enrichment-operation start through Study Item Bank completion is at most 420 seconds.
5. The attempt has no 429, provider timeout, cooldown exhaustion, schema failure, or unexplained
   fallback.
6. Persisted Grounding Bundles, prerequisite structure, lessons, and every Study Item family are
   useful and consistent with their admitted grounding and verified keys.

An earlier semantically rejected attempt is retained as quality evidence but does not count as a
successful latency baseline. The successful-attempt clock excludes API queue/claim delay while the
report still records request and claim times separately.

## Locked technical design

### KTD1 — Preserve one deep admission interface

Deepen the implementation behind `SourceLessGroundingAdmission.admitBatch`. Do not add an adapter,
new caller method, per-call override, queue interface, or provider-topology parameter. Preserve:

- two complete independent verification packets initially;
- a third complete packet only for unresolved objections;
- two distinct judge families and same-model replicated-rejection quorum;
- draft-blind answering and exactly one positive target per terminal judgment call;
- atomic passage settlement, exactly one Grounding Bundle draft, and no regeneration; and
- input-order outcomes with no partial result on failure.

### KTD2 — Separate execution widths without changing behavior identity

Replace `SourceLessGroundingAdmissionPolicy.verificationConcurrency` with:

```ts
verificationExecution: {
  questionPlanningConcurrency: number;
  answeringConcurrency: number;
  factualityJudgmentConcurrency: number;
}
```

The factuality width is one shared cap across both judge families. These are execution-only values,
like the existing candidate/probe widths, and remain excluded from Synthetic Generation, Graph
Enrichment, and Scaffold Generation config identities. Existing semantic policy changes must still
change those hashes. No HTTP, persisted schema, migration, or learner response type changes are
allowed.

### KTD3 — One bounded, abort-safe promise pipeline per sample wave

For each verification packet, keyed by original candidate and sample index:

1. Start draft-aware question planning through the planner limiter.
2. As soon as that packet's plan resolves, start its draft-blind answer through the answer limiter.
3. As soon as its answer resolves, enqueue its target × judge calls through the one shared judgment
   limiter.
4. Before releasing work, open exactly one aggregate bracket for each role in the sample wave. The
   three different brackets may overlap; a stage name must never overlap itself.
5. Merge only after all required work settles, ordered by original candidate, sample, original
   target, and judge index regardless of completion order.

On the first failure, atomically stop every limiter from starting queued work. Allow already-running
calls to settle; close every opened bracket with either its originating error or an explicit
upstream-abort detail; rethrow the original error object; and return or persist no partial admission
result. Do not use unbounded eager fan-out, nested retries, or a second provider semaphore.

### KTD4 — One application-owned Topic Expedition stage profile

Add one in-process application module. Its reusable producer group descriptors record phase, stage
tag, conditionality, repeatability, and concurrency grouping; the composed Topic Expedition profile
is the Expedition Journal's only flow-specific stage authority.

| Phase | Conceptual stages | Required profile semantics |
| --- | ---: | --- |
| Enrichment | 9 | conditional domain inference; concept synthesis; knowledge-boundary probe; conditional Grounding Generation; conditional/repeatable question planning, independent answering, and factuality checking; overlapping prerequisite ordering and intrinsic difficulty |
| Study Item Bank | 10 | preserve the existing layer-purpose, lesson, redundancy, blueprint, three activity-family, and three verification-stage conditionality |

Synthetic Generation and Study Item Bank producers consume the shared group descriptors. The
Expedition Journal consumes the composed profile. Exactness tests mechanically prove that every
producer emission is represented, every profile stage belongs to its broad operation catalog, and
the profile does not pull in Graph Enrichment-only stages.

### KTD5 — Project honest fixed progress and explicit fiction copy

Delete the Journal's manual six-stage list and derive generation facts from the profile:

- report the fixed total `9 + 10 = 19`;
- count repeated successful occurrences once, so disagreement sampling cannot inflate progress;
- during execution, do not pre-count an absent conditional stage; on phase success fill that phase
  to its `9/19` or `19/19` boundary;
- when several pipeline stages are open, expose the earliest still-open stage in profile order; and
- keep all three verification stages determinate.

Every stage displayed for Topic Expedition generation must have explicit fiction-voiced learner
copy. Add distinct copy for verification-question planning, independent answering, and factuality
checking. Do not add an ETA, countdown, progressive readiness, partial publication, or fabricated
remaining-work count.

### KTD6 — Calibrate only the execution profile

Try equal planner/answerer/judgment widths in order: `8`, `12`, `16`.

- At each width, obtain one successful representative attempt satisfying the concept/verification
  cardinalities. Freeze the first width that passes the 420-second and infrastructure contracts.
- Repeat a width once after a transport/provider failure. A repeated matching failure disqualifies
  it, stops upward escalation, and restores the last safe width.
- Advance after a semantically successful attempt over 420 seconds with no infrastructure error.
- Record rejected earlier attempts as quality failures, not latency passes.
- If no safe width passes, record `FIX_FIRST`, leave this plan in progress, and do not compensate
  with a Model Assignment change, weaker admission, unbounded concurrency, fabricated progress, or
  false completion claim.

The frozen profile is then exercised by starting Cellular Respiration and Database Transaction
Isolation Levels together through the existing two-run supervisor. Both successful attempts must
avoid starvation, stale reclaim, 429/timeout exhaustion, and unattributed provider drift. The
seven-minute threshold does not apply to this contention soak.

## Implementation units and commit boundaries

### U0 — Ready plan and current-code baseline

1. Link this plan first from `docs/plans/README.md`, add one current `TODO.md` entry, and link it from
   the accepted brainstorm candidate.
2. With the existing production-composed loopback learner API healthy and the Topic Expedition
   queue otherwise idle, start Cellular Respiration through the authenticated learner route.
3. Record source/image identity; API request and durable claim times; expedition attempts/status;
   enrichment and Study Item timelines; candidate/core/admitted counts when persisted; stage
   durations; LiteLLM call counts, concurrency, spend, errors, and actual provider attribution.
4. Keep diagnostics in gitignored `tmp/`, append the consolidated result below, and commit the plan
   and baseline before changing code.

### U1 — Bounded verification pipeline

1. Replace the policy shape and deepen `claimAdmission.ts` with role limiters, deterministic merge,
   aggregate overlapping brackets, and first-error abort/drain behavior.
2. Add interface-level deterministic tests for downstream overlap, every cap, shared judges,
   ordering, initial/disagreement sampling, replicated rejection, target isolation, no regeneration,
   and planner/answerer/judge failure handling.
3. Prove execution-width hash exclusion and semantic-policy hash sensitivity. Run focused
   application and infrastructure-LiteLLM checks, then append one U1 entry and commit.

### U2 — Stage profile and Journal projection

1. Add the producer/profile module and replace producer literals with its descriptors.
2. Replace Journal progress interpretation and add explicit learner copy for every profiled stage.
3. Test exact producer/profile/catalog coverage, repeat deduplication, concurrent earliest-open
   selection, determinate verification stages, `9/19`, `19/19`, and copy completeness.
4. Run focused application, learner-app, reporter/read-model checks, append one U2 entry, and commit.

### U3 — Frozen default and successful single-run evidence

1. Calibrate widths `8 → 12 → 16` under KTD6 and freeze the first safe passing default.
2. For the passing operation ids, inspect every `operation_run_stages.error_detail`, generation
   attempts, LiteLLM error row, SpendLogs route/model/provider attribution, concurrency, and spend.
   Every zero-error assertion includes a positive SpendLogs control over the same operation ids.
3. Inspect the actual persisted expedition: Declared Domain fit; held-out/rejected dispositions;
   representative foundation, middle, and summit Grounding Bundles; the whole prerequisite DAG;
   representative lessons; and every Study Item family beside admitted grounding and verified key.
4. Record `PASS`, `FIX_FIRST`, `INCONCLUSIVE`, or the narrower verdict required by the real-use
   route. Commit the frozen default and successful evidence separately.

### U4 — Two-run soak, repository gate, and consolidation

1. Run the two-topic supervisor soak and inspect starvation, reclaim, error, and route attribution.
2. Run focused packages first, then `pnpm test:db` and full `pnpm check`. Inspect individual failures;
   automated success proves deterministic contracts only.
3. Append the final detailed U4 evidence and commit it before consolidation.
4. In a separate commit, update the existing Source-less Grounding Admission completed outcome in
   `TODO.md`, replace its one plan-less validation with the final latency result, mark Candidate 2
   implemented, remove this plan from the index, and delete this completed plan.

## Deterministic acceptance matrix

- A packet answer begins before the last planner finishes; a judgment begins before the last answer
  finishes.
- Planner and answerer stay inside their independent caps; both judges together stay inside one
  judgment cap.
- Completion order cannot perturb candidate, passage, target, sample, or judge ordering.
- Initial/disagreement sampling, replicated-rejection, one-target judgments, and one-pass Grounding
  Generation are behaviorally unchanged.
- Planner, answerer, and judge failures stop queued starts, drain in-flight calls, close all opened
  brackets, preserve the originating error, and yield no partial result.
- Execution-width changes leave all three operation hashes byte-identical; existing semantic changes
  continue to alter them.
- The stage profile exactly covers producer emissions and catalog membership; repetitions count
  once; concurrent verification stages stay determinate; success reaches `9/19` then `19/19`.
- Every learner-displayed Topic Expedition stage has explicit fiction-voiced copy.

## Out of scope and safety boundaries

- Preserve all current Model Assignments, Provider Routes, prompts, sample counts, K values,
  rejection quorum, one-target judgments, supervisor concurrency, retry policy, and atomic readiness.
- Do not change HTTP contracts, persisted schemas, migrations, learner-facing response types, shared
  LiteLLM state, Compose topology/services, deployed systems, production data, or physical devices.
- Use the repo-root environment and development database for real calls. Generated reports remain in
  gitignored `tmp/` and retained documentation never links to them.
- Preserve commit `eb1568c` and unrelated work. Never deploy, reload shared LiteLLM, or substitute a
  different model/provider to meet the time budget.

## Validation Log

### U0 — Ready plan and current-code baseline — complete; diagnostic semantic rejection

- Environment/source: clean local `main` at preserved HEAD `eb1568c`; the production-composed
  loopback learner API used image
  `sha256:9783fea6a8d0489cd71535a80ef8cf5cb33ab2e42d250d3a9e01a6fbdec2c6a7`,
  built from working-tree base `dff3b2d`. The intervening commit changes only Docker/dev-loop files,
  README/TODO, and root commands—not application, prompt, admission, or route behavior. The API was
  healthy and the development Topic Expedition queue had zero generating rows before the run.
- Procedure/claim: an exact reserved `.invalid` learner submitted Cellular Respiration through the
  authenticated `/expedition/start` route. The API accepted the request; the durable row was created
  at `2026-08-22T13:21:37.210Z`, claimed four milliseconds later, and enrichment operation
  `c3ce2e6f-4bcb-4297-8f87-f103ac8da6dc` ran once from `13:21:37.267Z` to `13:59:43.290Z`
  (`2,286.023 s`). The detached client harness did not retain a defensible response-duration
  measurement, so only durable acceptance and claim timing are asserted.
- Cardinality/result: concept synthesis produced 16 candidates; probe and Grounding Generation
  totals prove all 16 were core and entered verification. The initial wave had 32 complete packets;
  the existing disagreement rule selected seven third packets. No admitted count is available:
  admission returned no partial result and the operation failed closed before persistence.
- Timeline: domain inference `7.120 s`; concept synthesis `8.031 s`; probe `14.550 s`; Grounding
  Generation `45.173 s`; initial planning `372.544 s`; initial answering `516.115 s`; initial
  factuality `1,018.811 s`; disagreement planning `70.345 s`; disagreement answering `61.425 s`;
  disagreement factuality `171.846 s`. Ordering, difficulty, and Study Item Bank never began.
- Error/route positive controls: all ten opened stage rows closed `ok:true` with no `error_detail`.
  The same operation id had 445 SpendLogs rows and zero non-success/error rows: 39 planner, 40
  answerer, and 158 factuality calls each peaked at the configured width four; the probe peaked at
  40, Grounding Generation/node embedding at eight, and total observed concurrency at 40. Spend was
  `$0.19256623` over 1,078,830 prompt and 319,326 completion tokens.
- Attribution: the answerer and primary judge stayed on the configured Parasail FP8 DeepSeek route;
  planner and challenger stayed on the DigitalOcean-pinned GPT-OSS route, whose quantization is
  undeclared and therefore route-sensitive. The probe used its declared cross-family Qwen fallback
  for 23 of 160 calls; SpendLogs do not expose that OpenRouter fallback's physical provider or
  quantization. No claim-role fallback, attempted retry, or unattributed provider drift appeared.
- Quality/persistence verdict: **semantic rejection; not a successful latency baseline.** The panel
  correctly rejected over-broad bundles including Cellular Respiration, Glycolysis, Pyruvate
  Oxidation, and Oxidative Phosphorylation. The learner expedition ended `failed` on attempt one;
  zero enrichment, artifact, node, or Study Item rows exist for the operation. This proves the
  current barrier regression and atomic failure behavior, not the 420-second success contract.
- Cleanup/evidence boundary: the exact reserved learner was removed and the queue returned to zero.
  Evidence is local API-supervisor + development Postgres + real production-model route only; not
  deployed, browser, native, physical-device, successful end-to-end latency, or implementation
  evidence. Generated diagnostics remain in gitignored `tmp/`.

### U1 — Bounded verification pipeline — complete; local deterministic evidence

- Interface/policy: `SourceLessGroundingAdmission.admitBatch` remains the sole caller interface.
  The former shared `verificationConcurrency` is now the execution-only `verificationExecution`
  object with independent planning, answering, and shared factuality-judgment widths. Defaults stay
  equal at four in this unit; no model, prompt, sample, quorum, K value, HTTP type, persistence
  shape, or retry behavior changed.
- Scheduling/failure semantics: each packet now enters answering when its own plan resolves and
  judgment when its own answer resolves. One limiter per role bounds queued starts; both judge
  families share the factuality limiter. Each sample wave opens its three aggregate brackets before
  releasing work, never overlaps the same stage across waves, and merges by candidate, sample,
  original target, and judge index. The first failure aborts queued starts across all roles, drains
  running calls, closes remaining brackets with the origin or an explicit upstream-abort carrier,
  and rethrows the original error object without returning a partial result.
- Deterministic contracts: interface-level tests force an answer to start while later plans remain
  blocked and a judgment to start while later answers remain blocked; mechanically saturate the
  independent `2/3/4` role caps; prove the combined judge peak is four; reverse planning, answering,
  and judge completion order; and preserve candidate, target, sample, judge, passage-settlement,
  initial/disagreement-sampling, replicated-rejection, target-isolation, and no-regeneration
  behavior. Planner, answerer, and judge origin failures each stop with only two calls started under
  a cap of two, remain pending until the second in-flight call drains, close all three brackets, and
  escape by object identity with no result.
- Hash/regression evidence: changing each execution width independently leaves Synthetic
  Generation, Graph Enrichment, and Scaffold Generation identities unchanged; semantic admission
  variants still perturb them. Exact defaults remain `synthetic-topic-generation-0b1ab66013e0`,
  `graph-enrichment-dfb9ae848b85`, and `learner-scaffold-generation-7ab16c2fc80e`.
  `@lrnki/application` typecheck and its full local suite passed; the focused admission plus scaffold
  set passed; `@lrnki/infrastructure-litellm` typecheck, focused hash tests, and full local suite
  passed; `git diff --check` passed.
- Evidence boundary: this is local automated evidence for scheduling, failure, ordering, semantic
  regression, types, and config identity only. It does not establish production-model quality,
  provider capacity, end-to-end latency, Journal projection, or learner copy; U2 and U3 own those
  gates.

### Open findings

- U2–U4 remain unimplemented and unvalidated; next add the shared stage profile and derive the
  Journal and learner copy from it.
- A future passing run must supply the successful end-to-end baseline this semantic rejection could
  not provide; do not compare `2,286.023 s` to the acceptance threshold as if it produced `ready`.

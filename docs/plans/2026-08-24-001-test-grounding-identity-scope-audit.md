---
title: Test a Same-Call Grounding Identity-Scope Audit - Plan
type: quality-experiment
date: 2026-08-24
execution: code
---

# Test a Same-Call Grounding Identity-Scope Audit

**Status:** Blocked — U0–U2 and U4 complete; candidate rejected; U3 skipped; owner decision required

**Decision state:** Authorized by the owner on 2026-08-24 as one contract-only experiment ahead of
[Plan 003](./2026-08-23-003-unify-source-less-grounding-on-deepseek.md). The candidate may change
only the Grounding Generation prompt/forced-tool contract so the one existing model call returns a
domain-neutral identity-scope audit and the initial Grounding Bundle together. It may not change a
Model Assignment, Provider Route, caller input, admission policy, verifier, call topology, retry
policy, or persistence contract. One material scope defect in the multi-draw direct matrix or the
first production-composed Topic operation ends this candidate and reopens the Grounding Generation
Model Assignment decision.

## Goal capsule

- **Objective:** Test whether making the generator state one selected sense, its cross-system
  identity invariant, context-specific qualifiers, and one material narrowing counterexample in the
  same forced-tool response improves the semantic scope of the initial Grounding Bundle.
- **Deep module boundary:**
  `SourceLessGroundingAdmission.forOperation(stage).admitBatch(candidates)` and its input/outcome
  types remain unchanged. `GroundingGenerationPort.generate(input)` continues to return only the
  existing `GeneratedGroundingBundle`; callers do not receive or act on the audit.
- **Frozen admission behavior:** Preserve one initial Grounding Bundle, no regeneration, exact claim
  projection, two independently planned verification packets, draft-blind answering, both
  independent judge families, replicated-rejection quorum, one-target judgments, stable ordering,
  failure drain, and atomic persistence. The audit is generation scaffolding, never admission
  evidence or a deterministic semantic veto.
- **Frozen topology:** Preserve the complete Model Assignments, Provider Routes, quantizations,
  sampling parameters, fallbacks, and operation-neutral aliases implemented by
  [Plan 003](./2026-08-23-003-unify-source-less-grounding-on-deepseek.md#approved-model-role-topology).
  The candidate adds no model call, neural stage, retry, fallback, or semantic rerun.
- **Authority:** Follow [AGENTS.md](../../AGENTS.md), [CONTEXT.md](../../CONTEXT.md),
  [ADR-0001](../adr/0001-adopt-greenfield-deep-module-architecture.md),
  [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md),
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md),
  [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md),
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md),
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md),
  [ADR-0030](../adr/0030-confidence-gated-synthesis.md), and
  [ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md).
- **Validation route:** Apply the
  [lrnki validation skill](../../.agents/skills/validate-lrnki/SKILL.md). Deterministic tests own
  structure and unchanged-interface claims; direct production-model draws are `EXPERIMENT_ONLY`;
  one production-composed local Topic operation supplies the first real-use kill gate. None is
  deployed, production-data, browser, native, emulator/simulator, physical-device, latency, or
  release evidence.
- **Handback:** A passing candidate returns Plan 003 to execution order for the rest of its U4
  affected-consumer matrix. It does not itself qualify the worker, Graph Enrichment, generated
  Support Steps, the remaining Topic operations, or the separate seven-minute latency contract.

## Problem class and recognized practice

### Context-induced identity-scope narrowing

The established defect class is context-induced identity-scope narrowing: a broad concept is
defined as its familiar textbook realization inside the originating topic, so a typical system,
location, timing, or mechanism becomes a universal identity condition. Plan 003's first
production-composed operation exposed that defect after one direct draw over the same case had
passed; its independent verification correctly rejected the generated definition. The current
domain-neutral Grounding prompt already prohibits common-case universalization, so another
unstructured instruction is not a distinct root-cause experiment.

[FActScore](https://aclanthology.org/2023.emnlp-main.741/) supports decomposing generated text into
atomic factual claims rather than trusting a blended passage. This repository already applies that
practice after generation. [Chain-of-Verification](https://arxiv.org/abs/2309.11495) supports
planning verification questions and answering them independently of the draft; this plan preserves
that draft-blind, cross-family path unchanged.

The candidate instead tests a small structured decomposition inside the original generation call:
the generator must expose the identity conclusion and its most relevant boundary before returning
the bundle. This is an experiment, not a guarantee. Research on
[unfaithful chain-of-thought explanations](https://arxiv.org/abs/2305.04388) shows that plausible
model explanations need not reveal the actual basis of a result, so the audit is never accepted as
proof or shown as a deliberation transcript. It carries concise conclusion fields only, and the
independent answer/judge families remain the factual authority.

[Self-Refine](https://arxiv.org/abs/2303.17651) improves outputs through iterative model feedback and
regeneration. That method is expressly excluded: it would add calls, expose a draft to feedback, and
replace the frozen one-draft invariant. No failed audit or rejected bundle is revised inside this
candidate.

## Current repository facts

- The external `SourceLessGroundingAdmission` interface returns stable ordered admitted, held-out,
  or rejected outcomes. Its default policy retains three verification samples, a two-sample
  replicated-rejection quorum, one-target judgments, candidate concurrency eight, and verifier
  concurrency four. None is an experiment variable.
- Grounding Generation currently receives Declared Domain, canonical label, aliases, same-context
  peers, and the originating Topic or scaffolded anchor. Its domain-neutral prompt already requires
  a cross-system invariant and forbids turning a common case into a universal definition.
- `submit_generated_grounding_bundle` currently returns only flat `definitions`, `mentions`, and
  `rationale` fields. The adapter validates them, adds owner-neutral provenance, and returns the
  existing `GeneratedGroundingBundle` through `GroundingGenerationPort`.
- The Grounding descriptor participates in Graph Enrichment, generated Scaffold, default Synthetic,
  and Topic-routed Synthetic config hashes. Its prompt/schema change must perturb those four
  identities and no Study Item Bank, Concept Canonicalization, Extraction, operation-stage profile,
  or unrelated descriptor identity.
- Plan 003's U2 owns the exact three known-defect Grounding inputs and current direct-route contract.
  Its U4 owns the complete affected-consumer matrix. This successor changes only the number of
  retained draws before re-running the first Topic fixture; it does not redefine either fixture.
- Successful raw forced-tool arguments must be observable from the direct harness and the existing
  operation-tagged LiteLLM response record. Reverify that capability before relying on it. If the
  current local log schema does not retain the production-composed response, stop before activation;
  do not add a callback, observer, table, API field, or persisted audit to make the experiment pass.
- The planning snapshot is clean revision `e2ca540`. These are repository and prior retained
  real-use facts only; no environment, loaded-revision, account, provider, or database claim is
  carried forward without re-verification.

## Locked candidate design

### KTD1 — Keep the audit behind the existing deep interface

The forced tool keeps the name `submit_generated_grounding_bundle` and returns one strict object:

```ts
type GroundingGenerationToolResult = Readonly<{
  identityScopeAudit: Readonly<{
    selectedSense: string;
    identityInvariant: string;
    contextSpecificQualifiers: readonly string[];
    materialNarrowingCounterexample: string | null;
  }>;
  bundle: Readonly<{
    definitions: readonly { text: string }[];
    mentions: readonly { text: string }[];
    rationale: string;
  }>;
}>;
```

The existing definition and mention cardinalities, strictness, passage shape, and rationale
requirements apply unchanged inside `bundle`. The four audit fields mean:

- `selectedSense` names the one established sense used in this Declared Domain and context;
- `identityInvariant` states the minimal functional, membership, or causal condition shared by the
  relevant valid cases without importing a merely common realization;
- `contextSpecificQualifiers` lists topic, peer, anchor, implementation, population, location,
  timing, type, version, or mechanism details that may be relevant but are not part of that shared
  identity; an empty list is allowed when none is material; and
- `materialNarrowingCounterexample` gives one valid relevant case that a tempting narrower
  definition would wrongly exclude, or `null` only when no such case is established.

All field and prompt descriptions remain domain-neutral and contain no fixture concept, expected
answer, provider, or model-family language. The prompt asks for the concise audit before finalizing
the bundle in the same tool call and requires the two sections to agree. A Definition Passage must
still stand alone after the audit is discarded; it may not refer to “the audit,” “the invariant
above,” or surrounding hidden context.

The strict adapter parses both sections, maps only `result.bundle` through the existing provenance
mapper, and returns the same `GeneratedGroundingBundle`. The audit does not enter
`GroundingGenerationPort`, `GroundingAdmissionOutcome`, claim targets, verification questions,
answers, judgments, operation artifacts, learner payloads, or PostgreSQL. The parsed raw response is
retained only as disposable experiment evidence through existing transport/log behavior.

### KTD2 — Permit only the forced-tool contract seam

The implementation may change only:

- the Grounding Generation prompt and its directly owned domain-neutral partial;
- the generated-Grounding Zod validator / forced-tool schema;
- the Grounding adapter's private tool-argument type and projection from nested `bundle`;
- directly affected tests and exact config-hash expectations; and
- this plan's status and validation record plus the three coordination altitudes.

It may not change ports, domain types, application admission code, caller composition, stage tags,
operation membership, concurrency, retries, prompt/model frontmatter, `litellm/config.yaml`, database
schema, migrations, persistence, HTTP contracts, learner projections, or any other neural
descriptor. Mechanical test fixtures may adopt the new response shape but may not change behavior.

Do not add a semantic validator that compares audit words with bundle words, a lexical blacklist,
domain-specific counterexample catalog, score, confidence threshold, audit-based acceptance, or
fallback bundle. Zod may prove only structural guarantees. Any semantic disagreement remains a
human-inspection finding in the experiment and a factual-verification concern in the unchanged
admission module.

### KTD3 — Prove one-call and unchanged-interface behavior deterministically

Focused tests must prove:

1. the tool schema requires exactly one complete audit and one existing-shape nested bundle, rejects
   missing/extra fields, rejects empty required strings, and accepts an empty qualifier list or null
   counterexample without weakening bundle cardinalities;
2. the adapter makes exactly one client call, returns the same owner-neutral
   `GeneratedGroundingBundle`, and exposes no audit field through the port result;
3. admission still makes one Grounding Generation invocation per core candidate and preserves its
   exact output types, verification packet count, draft blindness, two-family judgments, quorum,
   ordering, failure drain, and atomic settlement;
4. rendered prompt, tool name, tool description, and schema are domain-neutral and contain none of
   the three direct-matrix fixture terms or their expected counterexamples;
5. Graph Enrichment, Scaffold, default Synthetic, and Topic Synthetic hashes change because of the
   Grounding descriptor, while Study Item Bank, Concept Canonicalization, Extraction, and the
   nineteen-stage Topic profile remain exact; and
6. the complete source/config diff contains no Model Assignment, Provider Route, sampling,
   fallback, retry, policy, port, domain, composition, persistence, or migration change.

Local automated evidence proves those contracts only. It does not prove the audit is truthful, the
bundle is useful, DeepSeek can serve the larger schema reliably, or any consumer can complete.

### KTD4 — Run a fixed multi-draw direct matrix

After U1 is committed, reverify the current DeepInfra endpoint identity, declared FP8 quantization,
supported forced-tool parameters, reasoning-disabled behavior, and no-provider-fallback request.
Catalog data is preflight metadata; each served response must carry its own provider/model evidence.

Run the exact three known-defect inputs frozen by
[Plan 003 KTD6](./2026-08-23-003-unify-source-less-grounding-on-deepseek.md#ktd6--qualify-the-production-retry-envelope-not-a-lucky-draw)
through the changed Grounding descriptor, with three declared draws per input. Preserve DeepSeek V4
Flash 0731, DeepInfra FP8 only, reasoning off, temperature 0, seed 7, and the existing production
forced-tool correction envelope. These are nine declared initial generation invocations, not an
open-ended search: a structurally corrected attempt belongs to its original draw, while a semantic
failure is never replaced by another draw.

Retain the rendered request, strict parsed audit and bundle, raw response, attempts, exact
model/provider/quantization, latency, tokens, and recorded/estimated cost for each completed draw in
one disposable report. Inspect each audit and bundle separately. A material scope defect includes:

- a selected sense or identity invariant that excludes an established relevant case;
- a common location, timing, system, population, implementation, type, version, or mechanism stated
  as universally necessary;
- a material narrowing qualifier omitted from the audit and then asserted universally in a passage;
- a false or non-responsive counterexample, or an audit that identifies a valid counterexample
  while the bundle still contradicts it; or
- any definition or mention whose scope is materially false even when the audit looks correct.

The first material scope defect ends the candidate immediately. Do not complete later draws, tune
the contract, switch a route, or retry the semantic case. Record the failure, add an owner action in
`BLOCKERS.md` to reopen the Grounding Generation Model Assignment decision, keep the verifier
assignments frozen absent separate evidence, and proceed only to repository handback. A terminal
schema, route, quantization, attribution, or response-retention failure is also `FIX_FIRST` and stops
the matrix, but it is classified by the layer it actually proves.

All-nine semantic success is still `EXPERIMENT_ONLY`: direct calls do not exercise admission,
atomic persistence, or a learner operation.

### KTD5 — Use the first production-composed Topic as the real-use kill gate

Only after the complete direct matrix passes, rebuild/recreate the exact committed candidate through
the root detached-Compose runbook on a valid host checkout. Reverify loaded source/config identity,
health, the public Grounding alias, the exact assignment and route, and successful response-argument
retention. Do not activate if the audits cannot be inspected without a code or persistence change.

Reset only the development application data required by the owning runbook, then run the first
[Plan 003 U4](./2026-08-23-003-unify-source-less-grounding-on-deepseek.md#u4--run-affected-consumer-real-use-qualification)
Topic fixture, Cellular Respiration, exactly once through the production-composed local API. The
candidate adds no stage or call: Knowledge-Boundary Probe, one Grounding Generation call per core
candidate, independently planned/draft-blind verification, both judge families, quorum settlement,
and the nineteen-stage profile remain as composed.

Build one disposable joined report from the operation timeline, artifacts, existing prompt renderer,
operation-tagged LiteLLM responses, SpendLogs, and error records. Inspect every Grounding audit beside
its mapped bundle, every verification answer and both judgment families, all surviving generated
nodes and learner assets, attempts/fallbacks/errors, call attribution, and atomic settlement. Every
zero-row assertion has a same-query positive control; raw recorded and usage-derived estimated spend
remain distinct.

The Topic gate passes only when the operation settles atomically `ready`, all generated content is
useful in direct inspection, every audit/bundle pair is scope-correct and internally consistent, and
no contract, route, assignment, attribution, or persistence defect remains. Audit prose cannot
override a verifier rejection or excuse a flawed bundle.

One material scope defect anywhere in this operation ends the candidate and reopens the Grounding
Generation Model Assignment decision exactly as in KTD4. Do not spend on a second Topic, worker,
Graph, or Support Step case. Any other terminal operation failure is `FIX_FIRST` at its actual
authority layer and also stops the candidate until recorded. If the operation passes, its exact
evidence becomes the first Plan 003 U4 Topic result; Plan 003 resumes with its remaining Topic
operations and affected consumers rather than repeating this run.

## Evidence and decision boundaries

| Evidence | What it may prove | What it cannot prove |
| --- | --- | --- |
| Focused local automation | Strict shape, one-call mapping, unchanged interfaces/policy, hash scope | Semantic truth, model reliability, or usefulness |
| Three-by-three direct matrix | Observed same-assignment contract reliability and scope across retained draws | Admission, atomic persistence, consumer usefulness, or deployment |
| First production-composed Topic | Local real-use kill-gate quality and atomic settlement for Cellular Respiration | Remaining Plan 003 consumers, seven-minute latency, deployed or device behavior |
| Remaining Plan 003 U4 matrix | Complete affected-composition quality handback | Seven-minute latency until the latency plan measures it |

No all-green lower-altitude result upgrades a higher-altitude gate. One material defect dominates
aggregate pass counts and rejects the candidate rather than becoming a percentage.

## Implementation units and commit boundaries

### U0 — Commit the authorized design and source snapshot

1. Re-read the active plan headers, Validation Logs, Open findings, execution order, owner blocker,
   external admission/port interfaces, current Grounding schema/prompt, and Plan 003 failure record.
2. Freeze the clean source revision and exact authorized seam without trusting loaded environment,
   provider, account, or database claims from the prior session.
3. Commit this plan, README/TODO status altitudes, predecessor handoffs, and drained blocker together.
   Make no implementation edit or model call.

### U1 — Implement the same-call contract without activation

1. Apply KTD1–KTD3 only. Keep model frontmatter and all configuration byte-identical.
2. Run the Grounding schema/adapter/admission tests, config-hash and operation-stage tests, affected
   package typechecks, targeted lint, and source/config diff audit.
3. Append exact evidence, hashes, exclusions, and a real-use `INCONCLUSIVE` statement; commit the
   candidate source and plan status as one batch. Do not call a provider or reload a process.

### U2 — Execute the multi-draw direct experiment

1. Reverify the route and run KTD4 sequentially. Stop on the first declared failure.
2. Inspect and retain each completed raw audit/bundle pair plus exact attribution in one disposable
   report; do not link tracked documentation to it.
3. Append the durable per-case/draw verdict and authority boundary. If a material scope defect
   occurs, add the model-assignment owner action to `BLOCKERS.md` in the same status commit.
4. Commit U2 evidence separately. Proceed to U3 only after all nine draws pass.

### U3 — Activate once and run the first Topic kill gate

1. Reverify host/runbook safety, rebuild/recreate the exact U2 commit, and prove loaded identity and
   successful raw-response inspectability before application data changes.
2. Execute KTD5 once, inspect the complete joined result, clean only created fixture state, and
   record exact operation ids, hashes, calls, tokens, costs, errors/fallbacks, positive controls,
   artifacts, and semantic findings.
3. Commit detailed U3 evidence. On a material scope defect, create the model-assignment blocker and
   do not run any later Plan 003 case. On pass, hand the exact first-Topic evidence to Plan 003.

### U4 — Repository handback and lifecycle

1. Run the smallest complete dependency-graph repository gate justified by the changed files,
   including production builds only where the affected package graph requires them. Keep browser,
   native, device, deployment, production-data, latency, and release claims excluded.
2. Update this plan, README, and TODO with the exact outcome. A failed candidate remains blocked on
   the owner Model Assignment decision; a passed candidate makes Plan 003's remaining U4 matrix the
   next actionable work.
3. Commit detailed U4 evidence. After a pass, consolidate durable status separately, then delete this
   completed plan in its own later commit under the documentation lifecycle rules.

Implementation units are exclusive and must run in order. This plan declares no parallel-safe unit.

## Out of scope and safety boundaries

- No Model Assignment, Provider Route, quantization, reasoning, sampling, fallback, prompt
  frontmatter, LiteLLM deployment, or provider-account change.
- No extra model call, pre-draft, regeneration, feedback/refinement loop, semantic retry, ensemble,
  retrieval, second bundle, post-hoc repair, or alternate candidate under this plan.
- No admission-policy, verification-planning, answering, factuality-judgment, quorum, projection,
  concurrency, timeout, retry-budget, or atomic-settlement change.
- No port, domain type, persisted schema, migration, table, operation artifact, HTTP contract,
  learner projection, Admin Lab surface, observer, callback, or audit persistence.
- No domain-specific prompt/schema term, lexical veto, heuristic score, deterministic semantic
  rejection, or fixture-derived production rule.
- No production write, deployment, browser, native, emulator/simulator, physical-device, release,
  or latency calibration. Shared Compose remains host-only, detached, and root-runbook governed.
- Preserve unrelated dirty work and reverify every environment, route, rig, fixture, account, and
  loaded-revision claim at the unit that would rely on it.

## Validation Log

### U0 — authorized design and source snapshot — 2026-08-24 — complete

- Clean revision `e2ca540` was re-read with the active README/TODO order, Plan 002/003 status headers,
  Plan 003 U4 failure evidence and Open findings, and the owner-only blocker. The 2026-08-24
  authorization exactly drains that blocker and creates this contract-only successor ahead of Plan
  003; no other active plan becomes executable through this documentation change.
- Source inspection confirmed the unchanged external admission outcomes, one-bundle generation seam,
  three-sample/two-rejection policy, two judgment ports, current flat Grounding tool result, existing
  identity-context prompt, and adapter projection into `GeneratedGroundingBundle`. The locked
  candidate changes no public/application port or persisted type.
- Primary research retained the established atomic-fact and independent-verification practices,
  excluded iterative regeneration, and classified the audit as fallible scaffolding rather than
  evidence. The exact field contract, three-by-three direct matrix, first-Topic kill gate, and
  assignment-reopen rule are now implementation-owned here.
- Local Markdown link targets and anchors, TODO caps/section shape, the single Open findings section,
  plan/document line limits, and `git diff --check` passed for the documentation candidate.
- No source implementation, prompt, schema, config, loaded process, database, fixture, provider,
  model call, deployment, browser/native/device, latency, or release action occurred. This is
  repository planning evidence only.

### U1 — same-call contract without activation — 2026-08-24 — complete

- `submit_generated_grounding_bundle` now requires one strict `identityScopeAudit` beside one
  nested existing-shape `bundle`. All four audit fields are required; required strings and qualifier
  entries are non-empty; the qualifier list may be empty; and the narrowing counterexample may be
  null. The forced-tool normalizer preserves `minLength` beside the nullable scalar type union, so
  the Zod validator remains the one source for both the provider schema and boundary validation.
- The Grounding adapter still makes exactly one client call and maps only the nested bundle to the
  unchanged owner-neutral `GeneratedGroundingBundle`. No audit field reaches the application port,
  admission outcome, claim targets, persistence, or learner payload. The prompt asks for the audit
  and bundle in the same response, requires their agreement and a stand-alone Definition Passage,
  retains the exact model/tool frontmatter, and contains none of the three fixed-case terms or their
  named narrowing examples.
- Exact affected identities are Graph Enrichment `a0e6b35234de`, generated Scaffold
  `8f3a4b62eaf4`, default Synthetic `888dbb88fa4e`, and Topic Synthetic `c12fb231e16d`. Unaffected
  identities remain default/Topic Study Item Bank `d574e02753f9` / `02d755d9fae1`, Concept
  Canonicalization `ce3969a22bea`, and Extraction `114ec9e8ddf5`; the Topic profile remains nineteen
  stages.
- `pnpm --filter @lrnki/infrastructure-litellm test`, the focused application
  `sourceLessGroundingAdmission.test.ts`, both affected-package typechecks, and targeted ESLint all
  passed. Those checks retain one-draft generation, two independently planned packets, draft-blind
  answers, both judge families, replicated-rejection quorum, stable ordering, failure drain, and
  all-or-nothing settlement. `git diff --check` and the source/config audit found no port, domain,
  application, Model Assignment, Provider Route, sampling, fallback, retry, persistence, migration,
  operation-stage, or prompt-frontmatter change.
- Excluded pre-fix attempt: the first focused schema run correctly rejected nullable `anyOf` carrying
  `minLength`; it was not counted as evidence. The mechanical forced-tool normalization was fixed,
  its constrained-nullable regression was added, and the focused plus full suites passed afterward.

#### Real-use quality evaluation

- **Milestone:** committed-candidate source contract before provider activation.
- **Fixture and source type:** no real-use fixture was permitted in U1; deterministic sentinel and
  mixed-domain structural cases only.
- **Real model calls used:** no.
- **Result:** `BLOCKED` at U1's ordered no-provider boundary; usefulness remains `INCONCLUSIVE`
  until U2 and U3.
- **Useful output observed:** none; no neural output was produced.
- **Defects observed:** none at the deterministic contract layer.
- **Changes made after inspection:** preserved non-empty validation in the strict nullable wire
  schema after the excluded pre-fix dialect failure.
- **Remaining caveats:** audit truthfulness, bundle scope, larger-schema reliability, exact route
  attribution, response retention, and consumer usefulness are unqualified.
- **Safe to continue downstream:** yes to U2's fixed direct experiment only; no to activation,
  consumer qualification, latency work, deployment, or release claims.

### U2 — fixed direct matrix — 2026-08-24 — complete; candidate rejected

- Candidate `5ce34a23ca8588a030c270271b5781ff9da714d5` entered the fixed matrix without
  activation. Current endpoint metadata attributed `deepseek/deepseek-v4-flash-0731` to DeepInfra at
  declared `deepinfra/fp8` and advertised reasoning, temperature, seed, tools, and forced tool-choice
  support. The request pinned only that FP8 route, disabled provider fallback and reasoning, used
  temperature zero / seed seven, and retained the complete request, raw response, parsed audit, and
  mapped bundle in one gitignored disposable report.
- Declared invocation 1, Pyruvate Oxidation draw 1, returned HTTP 200 in one attempt after 8,545 ms
  as request `gen-1787545955-hvKSdve7Uhx8KDbTbXBB`. Model, provider, forced tool, strict schema,
  stage tag, sampling, and no-reasoning checks all matched. It used 1,966 prompt and 402 completion
  tokens with zero reasoning tokens; raw recorded and catalog-estimated cost both resolve to USD
  0.00022964. This is a direct-contract pass only.
- Semantic inspection rejected the candidate. The audit made the pyruvate dehydrogenase complex and
  NAD+ reduction part of the identity invariant, and the Definition Passage repeated both as
  universally necessary. The audit noticed only the eukaryotic-mitochondrial versus prokaryotic-
  cytosolic location counterexample; it omitted the material enzyme/electron-acceptor variation.
  Established anaerobic pyruvate:ferredoxin oxidoreductase instead catalyzes oxidative
  decarboxylation of pyruvate to acetyl-CoA and CO2 with ferredoxin, as directly observed in a
  [primary metabolic-flux study](https://pmc.ncbi.nlm.nih.gov/articles/PMC2937365/). The selected
  sense and identity invariant therefore exclude a relevant valid case: a material mechanism-scope
  defect under KTD4.
- The kill rule ended the candidate immediately. Pyruvate draws 2–3 and all six Transaction
  Isolation / Labor Productivity draws were intentionally not run; no replacement draw, prompt
  tuning, route switch, semantic retry, activation, database change, or later consumer call
  occurred. U3 is permanently skipped for this candidate. The owner-only Grounding Generation Model
  Assignment decision is reopened in `BLOCKERS.md`; verifier assignments remain frozen.

#### Real-use quality evaluation

- **Milestone:** fixed multi-draw direct experiment, stopped at its first material defect.
- **Fixture and source type:** the frozen production-shaped Pyruvate Oxidation input; direct
  production-model call rather than a curated-source or composed learner operation.
- **Real model calls used:** yes; one declared draw and one HTTP attempt.
- **Result:** `FIX_FIRST` for semantic scope despite a strict contract/route pass.
- **Useful output observed:** the audit correctly separated cellular location from identity and the
  adapter retained one well-formed bundle without exposing the audit through its mapped result.
- **Defects observed:** the audit and bundle jointly narrowed identity to the PDH/NAD+ mechanism and
  excluded established PFOR/ferredoxin oxidation.
- **Changes made after inspection:** none; this experiment forbids tuning or replacing a failed draw.
- **Remaining caveats:** the other eight direct draws, admission, persistence, and every consumer
  remain unqualified for this candidate.
- **Safe to continue downstream:** yes to U4 repository handback only; no to U3, Plan 003 consumer
  spending, latency work, deployment, or release claims.

### U4 — repository handback and lifecycle — 2026-08-24 — complete

- Handback revision `75373c19eee505dc2b7da817bfd9da0d25336837` passed the complete affected
  dependency-graph gate: `pnpm db:check` verified the single 58-table Drizzle baseline; all eleven
  workspace typechecks passed; full workspace `pnpm test` exited successfully; and `pnpm lint`
  reported zero errors and eleven warnings, none in the changed files.
- The affected production build, `pnpm --filter @lrnki/admin-lab build`, passed with every static and
  dynamic route compiled. Learner API compilation was already exercised by its identical passing
  TypeScript build/typecheck command, and KG Worker has no production-build script. No changed
  dependency reaches the learner-web export, so no unrelated client artifact was built.
- The green workspace test command retained its non-failing mocked Better Auth query diagnostics and
  existing learner-app post-test Expo logger warning; the zero exit is local automated evidence, not
  a claim that those diagnostics were repaired by this candidate.
- U2's semantic `FIX_FIRST` remains controlling. No new model call, database-backed suite,
  development-data reset, Compose process, browser, deployment, production-data, native,
  emulator/simulator, physical-device, latency, or release action occurred in U4. No predecessor
  validation was upgraded, and this rejected plan is retained rather than consolidated or deleted.
- The README, TODO, predecessor handoffs, and owner blocker now agree: there is no executable unit
  in this plan chain until the owner chooses a new Grounding Generation Model Assignment or abandons
  the affected Source-less Grounding consumer work.

### Open findings

- **BLOCKED:** the owner must choose the next Grounding Generation Model Assignment or explicitly
  abandon the affected Source-less Grounding consumer work, as recorded in
  [BLOCKERS.md](./BLOCKERS.md). No unit in this plan is actionable before that decision.
- The candidate is terminally rejected; do not resume its remaining eight direct draws or use its
  strict-contract success as semantic, admission, persistence, or consumer evidence.
- Plan 003 and the latency plan remain on hold behind the owner Model Assignment decision and a new
  successful, fully inspected Grounding baseline respectively.

---
title: Deepen Source-less Grounding Context and Answer Correlation - Plan
type: quality
date: 2026-08-23
execution: code
---

# Deepen Source-less Grounding Context and Answer Correlation

**Status:** On hold — U0–U1 complete; remaining qualification delegated to execution-order plan 003

**Decision state:** U0–U1 are locked and implemented. The owner-approved
[operation-neutral DeepSeek Grounding plan](./2026-08-23-003-unify-source-less-grounding-on-deepseek.md)
supersedes this plan's preserved-assignment design and owns all remaining route, activation,
affected-consumer, and handback work. This plan has no executable unit while that successor is live.

## Goal capsule

- **Objective:** Give Grounding Generation the already-owned concept identity context it currently
  loses, replace redundant answer-array key correlation with one exact key-indexed forced-tool
  object, and obtain complete mixed-domain Topic Expedition, Graph Enrichment, and Support Step
  evidence without weakening Source-less Grounding Admission.
- **Deep module:** `SourceLessGroundingAdmission.forOperation(stage).admitBatch(candidates)` remains
  the sole application interface. It derives batch-local identity context and hides generation,
  planning, draft-blind answering, judgment, correlation, and settlement. Model-specific output
  shape remains behind the existing LiteLLM adapters.
- **Frozen invariants:** Keep one initial Grounding Bundle, no regeneration, exact claim projection,
  two independently planned verification packets, draft-blind answers, two cross-family judge
  families, replicated-rejection quorum, one-target judgments, atomic failure/persistence, and all
  nineteen conceptual stages.
- **Model topology:** The
  [execution-order successor](./2026-08-23-003-unify-source-less-grounding-on-deepseek.md#approved-model-role-topology)
  is the sole owner of the approved assignment and Provider Routes. The identity-context and
  exact-correlation interfaces implemented here remain unchanged inputs to that topology.
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
  interface, correlation, hashing, and invariant claims; exact served calls own provider contract;
  local production-model runs plus direct artifact inspection own usefulness. None substitutes for
  deployed, browser, native, physical-device, or release evidence.
- **Completion:** Preserve the U0–U1 Validation Log until the successor supplies fresh route and
  real-use evidence. Then consolidate this implemented interface outcome without duplicating the
  successor's evidence and delete this plan in its own later commit.

## Problem classes and recognized practice

### Context loss during decontextualized generation

The observed defect is coupled decontextualization and factual-scope overgeneralization: a broad
candidate is interpreted through a familiar textbook case, and the learner-facing sentence omits
the type, system, population, or implementation that makes that case true. The repeated failures
covered mitochondrial Pyruvate Oxidation, hidden-until-commit transaction isolation, and time-only
labor productivity across three domains.

[Decontextualization](https://aclanthology.org/2021.tacl-1.27/) defines the conventional goal as a
stand-alone sentence that preserves meaning from its richer context. [FActScore](https://aclanthology.org/2023.emnlp-main.741/)
supports checking generation as atomic facts rather than one blended passage. The current pipeline
already performs atomic, independent verification; the missing input is the concept identity
context that Concept Set Synthesis already owns. Supplying aliases and same-batch peers is therefore
the smallest conventional root-cause change. It is not another prompt-only scope audit, schema
decomposition, or neural pre-draft—the three rejected experiment families already recorded by the
latency plan.

### Redundant opaque-key correlation in forced-tool output

The answerer currently emits an array whose every element must repeat an opaque `questionKey`.
Xiaomi completed 38 same-operation answer calls, then exhausted all three corrective attempts on
one six-entry packet, ending at `answers.5.questionKey`. The one-question descriptor sentinel never
exercised that failure shape.

The conventional structural form is an object whose properties are the code-owned keys. JSON
Schema's [`properties`, `required`, and `additionalProperties`](https://json-schema.org/draft/2020-12/json-schema-core)
can require exactly one answer at every known key and reject every unknown key. The adapter maps
that object back into the existing ordered port result. This removes redundant model-authored
correlation data rather than adding retries or trusting a repair heuristic. Independent answering
stays separate from planning and judgment, as supported by
[Chain-of-Verification](https://arxiv.org/abs/2309.11495).

## Current repository facts

- `runSyntheticGeneration` retains aliases in `SynthesizedConcept` but drops them when it constructs
  `GroundingAdmissionCandidate`. The admission module receives the complete batch yet sends only
  Declared Domain, canonical label, and topic/anchor context to Grounding Generation. Same-batch
  peer identities are therefore available before the seam but absent behind it.
- The shared Grounding prompt already asks for atomic, scope-qualified, stand-alone definitions.
  More instructions without new identity data failed the real-use gate, so wording alone is not a
  candidate remediation.
- `buildClaimVerificationAnsweringValidator` requires an array of `{ questionKey, answer }`, then
  rechecks known-key coverage and uniqueness. The adapter returns the same array to application
  validation. The application needs ordered answers, not the provider's redundant array shape.
- `NeuralStageDescriptor.sentinelInput` drives the schema identity in `stageConfigHash`; the current
  answerer sentinel contains one key. A failure-shaped multi-key sentinel is required so the
  persisted identity covers the structural contract used in production.
- Grounding Generation and Verification Answering are shared by Topic Expedition generation,
  Graph Enrichment's generated prerequisites, and generated Support Steps. A prompt/schema change
  invalidates prior usefulness evidence for all three consumers even though their Model Assignments
  stay fixed.
- `renderPromptFile` is the production renderer used by `executeForcedToolStage`; a disposable
  report can reconstruct initial messages from exact typed inputs without adding a logging port.
  `LiteLlmSpendLogsReadAdapter` already distinguishes raw provider spend from usage-derived BYOK
  estimates using versioned prices in `litellm/config.yaml`. Raw SpendLogs alone are not the owning
  cost read path.

## Locked technical design

### KTD1 — Enrich identity behind the existing admission interface

Keep `SourceLessGroundingAdmission.forOperation(stage).admitBatch(candidates)` as the sole caller
interface. Add aliases to `GroundingAdmissionCandidate`; callers already own them and must pass an
explicit empty list when none exist. Do not expose peer lists, prompt fields, or generator mechanics
through that interface.

Inside the admission module, derive one immutable identity context for each candidate:

```ts
type GroundingIdentityContext = Readonly<{
  aliases: readonly string[];
  peerConcepts: readonly Readonly<{
    canonicalLabel: string;
    aliases: readonly string[];
  }>[];
}>;
```

Peers are the other candidates in the same admission call with the same Declared Domain and
Grounding Admission Context. Preserve validated batch order, omit the candidate itself, normalize
only for deduplication, and retain original learner-visible spelling. No candidate from another
domain, originating topic, or scaffolded anchor may leak into the context.

Pass this value only through the internal `GroundingGenerationPort.generate` input. Render aliases
as alternate names of the same identity and peers as nearby concepts the definition must not
silently absorb or substitute. The wording remains domain-neutral and may not contain fixture
concepts. The generated tool schema, `GeneratedGroundingBundle`, persisted Derived Graph shape, and
learner-facing passage remain unchanged.

This earns depth at the admission interface: Synthetic Generation, generated-prerequisite minting,
and Support Step generation receive the same behavior without learning how peers are derived. Tests
cross `admitBatch`, not a new public context-builder seam.

### KTD2 — Make answer correlation structural inside the adapter

Change only the forced-tool argument shape to:

```ts
type ClaimAnsweringArgs = {
  answers: Readonly<Record<string, string>>;
};
```

For each request, build a strict object schema whose `properties` and `required` arrays contain every
exact code-owned key and whose `additionalProperties` is false. Each property is one non-empty,
self-contained answer. Reject duplicate input keys before the provider call; JSON objects cannot
represent duplicate properties as distinct validated answers, and the strict validator rejects a
missing or unknown key.

The adapter maps the object to `ClaimVerificationAnswer[]` in input-question order. Do not change
`ClaimVerificationAnsweringPort.answer`, application correlation validation, packet scheduling,
answering concurrency, retry budget, timeout, question count, or draft blindness. The model sees no
target key or generated draft.

Replace the one-key answerer sentinel with six production-shaped opaque keys, including the long
colon-delimited form that failed. Focused tests cover one, three, and six keys; reverse provider
property order; missing, extra, empty, and duplicate input keys; malformed JSON; and all three
corrective attempts. Delete array-shape tests and definitions in the same change.

### KTD3 — Delegate the superseded route and qualification design

The preserved-assignment matrix, observation procedure, and affected-consumer campaign previously
owned here are superseded by the
[operation-neutral successor](./2026-08-23-003-unify-source-less-grounding-on-deepseek.md#locked-technical-design).
That plan keeps the U0 identity context and U1 exact-key answer object but changes their Model
Assignments as an independent role bundle under ADR-0023. This plan must not issue another provider
draw, mutate a loaded process, or duplicate the successor's Validation Log.

## Implementation units and commit boundaries

### U0 — Context-bearing Grounding input

1. Add candidate aliases and derive same-context peers inside Source-less Grounding Admission.
2. Pass the internal identity context to the existing Grounding Generation adapter and render it
   domain-neutrally without changing the output/persisted schema.
3. Update all callers and interface-level tests; prove no cross-domain/context leakage, one draft,
   exact outcome correlation, and unchanged admission/settlement policy.
4. Run focused application, infrastructure-LiteLLM, and composition tests plus both package
   typechecks and targeted lint. Append U0 evidence and commit.

### U1 — Exact-key answer object

1. Replace the answer array schema/validator with the request-specific exact-key object and map it
   back to the unchanged port result in input order.
2. Replace the sentinel and focused tests, including the six-key failure shape and retry failures.
3. Recompute all affected hashes and prove unrelated descriptors, Study Item Bank, stage profile,
   scheduling, and admission policy unchanged.
4. Run the changed-package suites/typechecks/lint, append U1 evidence, and commit.

### U2–U4 — Superseded; no executable batch

The execution-order successor owns served contracts, activation, real-use qualification, repository
gates, and latency handback. After it passes, consolidate U0–U1 as the implemented context and
correlation outcome, link the durable successor outcome from `TODO.md`, and delete this plan in a
separate commit. If the successor blocks, leave this plan on hold rather than restoring the retired
MiMo Grounding route.

## Deterministic acceptance matrix

- `admitBatch` remains one interface; aliases reach Grounding Generation and peers are derived only
  from the same validated batch/domain/context in deterministic order.
- Context-bearing prompt rendering contains aliases and peers without fixture terms, target text,
  source claims, or a second Grounding draft.
- The answer schema exposes each input question key exactly once as a required object property and
  rejects every missing, extra, empty, or unknown key before application settlement.
- The adapter returns answers in input order even when provider property order differs; application
  validation remains an independent fail-closed check.
- Verification planning, answering, and judgment retain their current scheduling, caps, failure
  drain, question counts, sample count, quorum, one-target judgments, and stage tags.
- Effective hashes change for every affected source-less operation and no unaffected operation;
  the successor owns their newly approved Model Assignments and Provider Routes.
- Topic Expedition remains exactly nineteen conceptual stages, and no learner/persistence/HTTP
  contract changes.

## Evidence and decision gates

The U0–U1 implementation remains accepted only when:

1. Identity context remains batch-local, deterministic, domain/context isolated, and invisible to
   callers other than through the unchanged admission outcome.
2. Answer correlation remains a strict exact-key object at the provider seam and the unchanged
   ordered port result at the application seam.
3. The successor passes every served-route and affected-consumer gate under its approved topology;
   this plan does not restate or independently qualify those claims.

Green automated suites or the completed U0–U1 commits do not qualify learner usefulness. The
successor's passing evidence still does not authorize release before the latency plan's 420-second
baseline and soak.

## Out of scope and safety boundaries

- No further source, route, provider, or runtime work is authorized by this on-hold plan. The linked
  successor exclusively owns the approved model reassignment and its safety boundaries.
- No persisted schema, migration, HTTP contract, Admin Lab surface, permanent evaluation module,
  logging callback, or tracked report.
- Do not retry the discarded prompt-only scope audit, definition-decomposition schema, or neural
  evidence-first pre-draft variants from the latency plan.
- No full source-format campaign unless the selected real fixture cannot exercise generated
  prerequisites; use the smallest real consumer gate that does.
- No deployment, production write, browser, emulator/simulator, physical-device run, or release
  action. Shared Compose remains host-only, detached, and root-runbook governed.
- Preserve unrelated dirty work and re-verify current routes, fixtures, queue state, and environment
  before trusting this planning snapshot.

## Validation Log

### Planning research and cutover handoff — 2026-08-23 — complete

- Local production-composed evidence covered four mixed-domain Topic operations: all failed before
  persistence, three on repeated scope overgeneralization and one on answerer schema exhaustion.
  Provider recovery itself passed under natural Novita-to-Parasail load.
- The stage matrix retained seventeen stages and accepted only the two deepening seams above. Twelve
  downstream stages remain unqualified because no operation reached graph completion or Study Item
  Bank; no `COMBINE` or `REMOVE` had supporting evidence.
- Source inspection located the lost concept identity data before the deep admission interface and
  the redundant key correlation inside the LiteLLM adapter. The selected design adds behavior
  behind those existing interfaces instead of exposing a Topic-specific pipeline or provider shape
  to callers.
- Primary research supports meaning-preserving decontextualization, atomic factual evaluation, and
  independently answered verification questions. JSON Schema supplies the exact required-object
  structure for code-owned answer keys.
- Existing source owns both observability gaps: the prompt renderer can reconstruct initial
  messages from exact typed input, and the SpendLogs adapter estimates zero-recorded-cost BYOK rows
  separately. No new persistence or logging seam is justified.
- This is repository research and local real-use evidence only—not implemented successor behavior,
  successful learner assets, deployed, browser, native, physical-device, latency, or release
  evidence.

### U0 — Context-bearing Grounding input — 2026-08-23 — complete

- `GroundingAdmissionCandidate` now requires caller-owned aliases. Synthetic Topic Generation passes
  synthesized aliases; Graph Enrichment and generated Support Steps pass explicit empty lists. The
  unchanged `admitBatch` interface derives one frozen identity context per candidate, preserves the
  validated batch order and learner-visible spelling, deduplicates identities by normalized label,
  and includes only peers with the exact same Declared Domain and Grounding Admission Context.
- Grounding Generation alone receives candidate aliases and same-context peers. Its domain-neutral
  prompt identifies aliases as the same identity and peers as nearby distinct identities; the
  generated tool schema, Grounding Bundle, claim projection, one-draft settlement, ordering, and
  persisted shapes are unchanged.
- Focused local automation passed for the admission interface, Synthetic Topic Generation, Graph
  Enrichment minting and operation composition, generated Support Steps, Grounding Generation
  rendering, config-hash registry, and Topic routing. `@lrnki/ports`, `@lrnki/application`, and
  `@lrnki/infrastructure-litellm` typechecks plus targeted ESLint passed. The first hash and Topic
  routing runs failed only on the prior exact expected identities and passed after intentional
  re-baselining.
- Current default identities are `graph-enrichment-7f3f772bb21e`,
  `learner-scaffold-generation-0a71975fa183`, and
  `synthetic-topic-generation-4fc21bcd9522`; the Topic-scoped Synthetic identity is
  `synthetic-topic-generation-f8258c9c9332`. Study Item Bank and the nineteen-stage Topic profile
  stayed unchanged.
- This is local source, type, lint, deterministic interface, prompt-rendering, and composition
  evidence. No production-model call, activated local composition, real-use artifact, deployed,
  browser, native, physical-device, latency, or release claim is made.

### U1 — Exact-key answer object — 2026-08-23 — complete

- Verification Answering now exposes every code-owned question key exactly once as a required
  property of a strict `answers` object. Duplicate or empty input keys fail before provider
  dispatch; missing, extra, and empty output values fail schema validation. The adapter maps the
  provider object back to the unchanged ordered `ClaimVerificationAnswer[]` port result.
- The answerer descriptor sentinel now carries six opaque production-shaped keys, including the
  long colon-delimited failure shape. Focused tests passed for one-, three-, and six-key schemas,
  reverse provider property order, malformed JSON, missing and extra properties across all three
  allowed transport attempts, and independent application-level correlation failure. The initial
  adapter run exposed one obsolete three-answer expectation while the planner correctly returned
  nine questions; the corrected test now asserts complete input-order mapping.
- The full `@lrnki/infrastructure-litellm` suite and typecheck passed. Focused application admission
  and Topic stage-profile tests plus targeted ESLint passed, preserving packet scheduling,
  concurrency, retry budget, draft blindness, question counts, replicated-rejection settlement,
  one-target judgments, and the exact `9 + 10 = 19` Topic profile.
- Current default identities are `graph-enrichment-3cd73a12f2f2`,
  `learner-scaffold-generation-be49ba010024`, and
  `synthetic-topic-generation-901788bb7bd4`; the Topic-scoped Synthetic identity is
  `synthetic-topic-generation-9a8f4f1cb34b`. Study Item Bank remained byte-identical at
  `study-item-bank-d574e02753f9` by default and `study-item-bank-02d755d9fae1` under Topic routing;
  no unrelated descriptor or operation membership changed.
- This is local source, strict-schema, retry-envelope, deterministic correlation, type, lint, hash,
  and composition evidence. It does not prove any production model or reachable provider can serve
  the new contracts, nor any real-use, deployed, browser, native, physical-device, latency, or
  release claim.

### U2 — Served-contract qualification — 2026-08-23 — blocked (`FIX_FIRST`)

- Candidate revision `61da45e532cf5c5db746da319f58745d15ae27b6` entered the bounded direct-route
  matrix before any loaded process changed. The current OpenRouter endpoint registry attributed the
  reachable routes to Xiaomi, DeepInfra, and Parasail respectively and reported FP8 for
  `xiaomi/fp8`, `deepinfra/fp8`, and `parasail/fp8`. A correctly authenticated local LiteLLM
  `/models` read also listed all four public aliases in KTD3. An earlier unauthenticated read caused
  only by an env-unloaded shell was excluded and made no credential or route claim.
- The first required case reconstructed the complete effective Grounding prompt for Pyruvate
  Oxidation with both aliases, all five same-context peer identities, the Declared Domain, and the
  originating topic. The exact shared deployment request used Xiaomi MiMo v2.5, reasoning disabled,
  temperature 0, seed 7, the strict named tool, Xiaomi-only provider routing, and no provider
  fallback.
- OpenRouter returned HTTP 200 from the expected `xiaomi/mimo-v2.5` model and Xiaomi provider in
  7.404 seconds with exactly one `submit_generated_grounding_bundle` call. Its tool arguments were
  invalid JSON at position 687, after 1,514 prompt and 235 completion tokens. This is a schema
  contract miss, not an excluded transport failure, so KTD3 forbids a retry or any later matrix
  case. The disposable report carries run tag `source-less-u2-direct-1787499208132`; this durable
  entry retains the qualifying facts without depending on a gitignored artifact.
- No public-alias proof, API rebuild/activation, development-database reset, affected-consumer run,
  deployment, browser, native, physical-device, latency, or release action occurred. U0–U1 remain
  committed local evidence, but neither U2 nor plan completion passed.

### Open findings

- **NEXT:** execute the
  [same-call audit experiment](./2026-08-24-001-test-grounding-identity-scope-audit.md) at README
  order 1. Plan 003 remains the final qualification owner after that experiment; do not resume this
  plan's superseded U2 matrix.
- Revision `61da45e` failed its first qualifying shared-MiMo observation with malformed tool JSON.
  That result remains valid for the old candidate but does not prove persistent MiMo incapability or
  identity-context causation. The owner-approved topology retires MiMo Grounding rather than
  claiming to repair it.
- The latency plan remains blocked until the successor produces one successful, fully inspected
  quality baseline. Do not restart width calibration from the current all-failed operations.

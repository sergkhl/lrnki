---
title: Deepen Source-less Grounding Context and Answer Correlation - Plan
type: quality
date: 2026-08-23
execution: code
---

# Deepen Source-less Grounding Context and Answer Correlation

**Status:** Ready — U0 context-bearing Grounding input next

**Decision state:** Locked. Grounding Generation and Verification Answering are the only stages to
`DEEPEN`; the other seventeen Topic Expedition stages remain `KEEP`. This plan fixes those two
interfaces, qualifies every affected source-less consumer, and hands a quality-qualified pipeline
to the separate latency plan. It does not reopen the DeepSeek cutover or stage topology.

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
- **Model topology:** Keep the committed Model Assignments and Provider Routes. Topic generation is
  DeepSeek V4 Flash 0731 FP8; Topic primary answering/judgment is Xiaomi MiMo v2.5 FP8; Topic
  planning/challenge/ordering is GPT-OSS 120B FP4 on Novita with the qualified Parasail fallback.
  Shared source-less consumers retain their existing aliases.
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
- **Completion:** Close U0–U4 in order. A passing U3 qualifies the changed source-less quality
  topology and unblocks the
  [seven-minute latency plan](./2026-08-22-001-repair-topic-expedition-generation-latency.md); only
  that plan's successful latency baseline and soak may remove the remaining release block.

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

### KTD3 — Preserve assignments and qualify the new exact contracts

Both changes alter Neural Stage Descriptor behavior. Recompute and test the effective Synthetic
Topic Generation, Graph Enrichment, and Scaffold Generation hashes; Study Item Bank and every
unaffected operation hash must remain byte-identical. The Topic profile remains `9 + 10 = 19`.

Before local production activation, run exact forced-tool calls through:

1. shared MiMo and Topic DeepSeek Grounding Generation with context-bearing inputs for the three
   observed defect classes;
2. shared DeepSeek and Topic Xiaomi answerers with one-, three-, and six-key objects; and
3. every reachable existing provider fallback for those public aliases.

Use complete effective prompts, strict named tools, frozen sampling/reasoning inputs, exact model,
quantization, deployment, and physical-provider attribution. A semantic preflight is inspected but
never upgraded to end-to-end usefulness. If the same assignment cannot serve the new contract,
record `FIX_FIRST`; do not substitute a model, widen quantization, add client-side alias switching,
or increase retries. A Provider Route amendment requires its own evidence before activation.

### KTD4 — Use existing observation owners

Keep reports in gitignored `tmp/`. For every inspected first-attempt call, reconstruct the initial
messages through the same descriptor `templateData` and `renderPromptFile` path production uses,
paired with the exact typed input recoverable from operation artifacts and tagged tool outputs. If
an exact input cannot be recovered, state that limit; do not call source text alone a rendered
prompt. Persisted stage-error detail remains the authority for corrective-attempt failures.

Read calls, tokens, recorded spend, and usage-derived BYOK estimates through
`new LiteLlmSpendLogsReadAdapter(url, readLitellmProxyConfig())`. Report recorded and estimated spend
separately. Every zero-error, zero-asset, or zero-fallback assertion must include a positive control
over the same operation rows. Do not add a table, migration, observer port, callback, Admin Lab
surface, or tracked report for this qualification.

### KTD5 — Requalify every affected real-use consumer

After deterministic and served-contract gates pass, rebuild the exact local production composition,
reset only the development application database, and run serially:

1. Topic Expeditions for Cellular Respiration, Database Transaction Isolation Levels, Comparative
   Advantage in Classical Economics, and one Cellular repeat;
2. the smallest current real curated-source Graph Enrichment fixture that actually exercises a
   generated prerequisite through Source-less Grounding Admission; and
3. one production-model generated Support Step that actually exercises Grounding Generation and
   Verification Answering.

All four Topic operations must become atomically `ready`; at least one must exercise every one of
the nineteen conceptual stages. Inspect every generated Grounding Bundle, every admission verdict,
the full prerequisite graph, all difficulty bands, every Layer Purpose and Concept Lesson, every
Blueprint, every admitted/rejected Study Item, all verification outputs, and both Cellular variants.
The three prior scope defects must be absent or explicitly and correctly qualified. The answerer
must have exact key coverage with no forced-tool exhaustion, hidden fallback, or unexplained retry.

Inspect the generated prerequisite and Support Step beside their admitted grounding and consuming
artifact. A stage HTTP/schema pass is not usefulness evidence. A rejection remains valid evidence
but does not qualify a Topic operation as ready. Do not compensate with weaker admission, lower
quorum, regenerated Grounding, a lexical veto, or discarded failing outputs.

Record end-to-end and per-stage wall time, calls, tokens, recorded/estimated cost, aliases,
deployments, providers, retries, and errors. This plan does not tune execution width or claim the
420-second goal; it supplies the successful quality baseline the latency plan currently lacks.

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

### U2 — Served-contract qualification and activation

1. Run KTD3's bounded matrices before changing a loaded process. Stop at the first complete pass per
   exact route; one excluded transport failure may retry once, never a semantic/schema miss.
2. Rebuild and activate only the exact committed local production composition through the root
   runbook and host boundary. Verify source/config hashes and health.
3. Send unique tagged public-alias calls and match alias, deployment, model, quantization, provider,
   forced tool, key coverage, and identity context. Append U2 evidence and commit status separately.

### U3 — Affected-consumer real-use qualification

1. Execute KTD5 through the real-use route and build one disposable joined report using KTD4.
2. Inspect every required output and error/fallback; assign `PASS`, `FIX_FIRST`, `INCONCLUSIVE`, or
   the narrower verdict the evidence supports. Do not proceed past a `FIX_FIRST` seam.
3. Append exact operation ids, current hashes, authority, quality findings, latency, calls, tokens,
   recorded/estimated cost, and persistence positive controls. Commit the detailed evidence.

### U4 — Consolidate and unblock latency work

1. Run the relevant repository gate after U3 passes. A full workspace gate is required only if the
   changed dependency graph makes the focused package gates insufficient; record the chosen scope.
2. Move durable mechanics to source/README/validation skill as appropriate, current outcome to
   `TODO.md`, and no reversible prompt/schema detail to an ADR.
3. Mark the latency plan ready only if U3 supplies a successful quality baseline. Record the exact
   remaining 420-second and soak gates without claiming release.
4. Commit detailed U4 evidence, then consolidation and plan deletion separately under AGENTS.md.

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
  every reachable route resolves to its pre-plan Model Assignment.
- Topic Expedition remains exactly nineteen conceptual stages, and no learner/persistence/HTTP
  contract changes.

## Evidence and decision gates

The candidate passes only when:

1. Every changed descriptor and reachable route passes the exact served contract with attributable
   model, quantization, provider, and retry evidence.
2. The four Topic runs all reach `ready`, collectively exercise all nineteen stages, and pass direct
   inspection across the three domains and repeated topic.
3. Grounding output correctly handles the three established scope defects without relying on later
   sentences to narrow an earlier false definition.
4. Answering has exact correlation under the failure-shaped object and no forced-tool exhaustion.
5. Graph Enrichment and Support Step gates exercise the changed shared seams and their persisted
   outputs are useful and provenance-honest.
6. Every executed descriptor has inspected input/output evidence; all learner assets, errors,
   retries, and fallbacks are accounted for.
7. Recorded and estimated cost remain distinguished, and every zero-row claim has a same-query
   positive control.

Any failed item is `FIX_FIRST`. Green automated suites, direct preflights, or partial operations do
not qualify learner usefulness. A passing plan still does not authorize release before the latency
plan's 420-second baseline and two-run soak.

## Out of scope and safety boundaries

- No model reassignment, quantization change, new provider, stage combine/remove, new pipeline,
  retrieval, regeneration, verifier-authored patch, quorum/sample reduction, execution-width tune,
  or learner UX mechanic.
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

### Open findings

- **NEXT:** implement U0 only: preserve the `admitBatch` interface, add candidate aliases, derive
  same-context peers internally, update the Grounding input/rendering, validate, persist all three
  status altitudes, and commit before U1.
- The latency plan remains blocked until U3 produces one successful, fully inspected quality
  baseline. Do not restart width calibration from the current all-failed operations.

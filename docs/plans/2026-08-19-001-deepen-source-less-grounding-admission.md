---
title: Deepen Source-less Grounding Admission - Plan
type: refactor
date: 2026-08-19
execution: code
---

# Deepen Source-less Grounding Admission

**Status:** In progress — U1 complete; U2 next

**Decision state:** Grilling-locked. The user accepted the external interface direction and then
delegated every remaining Candidate 1 decision to the recommended answer. The linked brainstorm is
the canonical owner of the accepted problem framing, requirements, outcome policy, and scope.

**Implementation state:** Not started. This plan was created in a documentation-only turn; no
application code, source type, port, prompt, schema, adapter, generated migration, or test has been
changed or validated as implementation evidence.

## Goal capsule

- **Objective:** Implement Candidate 1 from the
  [architecture deepening review](../brainstorms/2026-08-19-001-architecture-deepening-review.md):
  put Source-less Grounding Admission behind one deep application interface, replace the private
  Synthetic Topic Generation implementation and both shorter caller paths, and admit every positive
  factual claim plus the answer key of a generated Support Step before atomic publication.
- **Authority:** Follow [AGENTS.md](../../AGENTS.md), [CONTEXT.md](../../CONTEXT.md),
  [ADR-0001](../adr/0001-adopt-greenfield-deep-module-architecture.md),
  [ADR-0012](../adr/0012-embeddings-permitted-except-prerequisite-derivation.md),
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md),
  [ADR-0019](../adr/0019-graph-enrichment-derived-layer.md),
  [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md),
  [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md),
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md),
  [ADR-0030](../adr/0030-confidence-gated-synthesis.md),
  [ADR-0034](../adr/0034-neural-stage-descriptors-dotprompt-config-hashes.md),
  [ADR-0037](../adr/0037-persist-learner-scoped-scaffold-detours.md), and
  [ADR-0039](../adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md).
- **Research basis:** The established problem class and generate-then-verify basis are canonical in
  ADR-0030. ADR-0026 owns the current Study Item Key Verification and its rule-16 treatment; U3
  generalizes that named scope to Answer-Key Verification without changing the existing rule. This
  plan does not create a bespoke lexical or similarity gate.
- **Validation route:** Route every implementation-unit check through the
  [lrnki validation skill](../../.agents/skills/validate-lrnki/SKILL.md). Each closed unit records
  one consolidated entry using the required
  [real-use quality note](../../.agents/skills/validate-lrnki/references/real-use-quality.md#required-note),
  with production model calls where behavior depends on an LLM; automated checks remain a separate
  evidence class and cannot close the quality gate alone.
- **Execution profile:** Four ordered units spanning domain types, application modules, ports,
  LiteLLM prompts/adapters/config identity, Graph Enrichment and learner-api composition, the
  code-first Drizzle schema, Postgres mappings, and focused tests. The persisted-shape change is a
  greenfield reset: regenerate the single baseline mechanically and reset the application schemas;
  add no compatibility type, dual read, JSON fallback, or incremental migration.
- **Stop conditions:** Stop and re-plan if draft blindness cannot be made structural; if the positive
  claim projector cannot exhaustively cover the generated Support Step without treating intended
  distractors as positive facts; if a second real anchored shape requires several anchors; if
  real-use evidence shows one shared behavioral admission policy is unsafe for a consumer; or if an
  unrecognized database lineage would require hand-editing generated migration artifacts.
- **Completion:** Close U1–U4 in order, consolidate one Validation Log entry per unit, move only
  durable final decisions to their canonical owners, update `TODO.md`, and then delete this plan.
  Retire Candidate 1's completed material from the shared brainstorm without deleting the unresolved
  findings for other candidates. Do not retain superseded ports, prompts, config fields, stage-owner
  lists, tests, comments, or documentation definitions.

## Planning-sensitive repository facts

The brainstorm owns the full evidence and deletion test. These current facts determine the
implementation sequence:

- `runSyntheticGeneration.ts` owns the only complete probe → generation → claim-targeted planning →
  draft-blind answering → monotonic comparison → bounded regeneration implementation.
- `enrichmentNodeMinting.ts` calls Grounding Generation directly after durability, while
  `learnerScaffoldGeneration.ts` probes and grounds before generating unchecked final content.
- The three grounding-verification ports and their prompts require a synthetic `topic`; the final
  comparison returns a rewritten `GeneratedGroundingBundle` instead of artifact-neutral judgments.
- `GeneratedGroundingBundle` repeats `derivedNodeId` and graph-specific anchor ids. A generated
  Support Step currently persists only `payload` in `learner_scaffold_steps`.
- `verifyStudyItemKeys.ts` already owns the correct option-select veto rule, but
  `StudyItemKeyVerificationPort` is graph/Study-Item-shaped and `verifyGuardedItems` owns a nested
  regeneration envelope that Scaffold Generation must not reuse.
- `neuralOperationRegistry` and `OPERATION_TIMELINE_CATALOG` currently register the complete
  admission stages only for Synthetic Topic Generation; Scaffold lists only probe, embedding, and
  Grounding Generation.

## Locked technical design

### KTD1 — One constructed, batch-only external interface

Add `packages/application/src/sourceLessGroundingAdmission.ts`. Its public source interface is:

```ts
type GroundingAdmissionCandidate = Readonly<{
  candidateKey: string;
  canonicalLabel: string;
  declaredDomain: string;
  context:
    | { kind: "originating_topic"; topic: string }
    | {
        kind: "scaffolded_anchor";
        anchor: {
          reference: string;
          canonicalLabel: string;
          definitionPassages: readonly [string, ...string[]];
        };
      };
}>;

type GroundingAdmissionOutcome =
  | { candidateKey: string; disposition: "admitted"; probe: CoreProbeSummary; bundle: GeneratedGroundingBundle }
  | { candidateKey: string; disposition: "held_out"; reason: "knowledge_boundary"; probe: BoundaryProbeSummary }
  | { candidateKey: string; disposition: "rejected"; reason: "grounding_verification_exhausted"; probe: CoreProbeSummary; rationale: string };

interface SourceLessGroundingAdmission {
  forOperation(stage: StageBracket): {
    admitBatch(candidates: readonly GroundingAdmissionCandidate[]): Promise<readonly GroundingAdmissionOutcome[]>;
  };
}
```

`createSourceLessGroundingAdmission` binds all required neural/embedding ports and the canonical
policy once. `admitBatch([])` returns `[]` without opening a stage. Non-empty input is validated
before neural work; keys are unique; results preserve input order. One failed required dependency
rejects the whole call without a partial result. A singleton caller passes one candidate. Do not add
`admitOne`, callbacks, artifact kinds, optional topic/anchor combinations, attempt overrides, or a
grounding strategy registry.

### KTD2 — One package-internal positive-claim implementation

Add `packages/application/src/claimAdmission.ts`, imported directly only inside the application
package. It owns:

```ts
type PositiveClaimTarget = { targetKey: string; text: string };
type ClaimJudgment = { targetKey: string; disposition: "accepted" | "rejected"; rationale: string };
```

The implementation runs claim-targeted question planning, proves complete/known target coverage,
answers without any draft or target text field, correlates every answer exactly, and obtains an
independent judgment for each target. It returns judgments, never learner text or a rewritten
artifact. Unknown/duplicate targets, missing coverage, answer mismatch, malformed output, or an
attempt to introduce text is a deterministic contract error.

Generalize the current grounding-verification ports, tool schemas, adapters, and domain-neutral
prompts around these owner-neutral target types. Replace `GroundingFactualityRevisionPort` with a
judgment port; the application applies the judgments. Retain the existing stable stage tags so this
refactor does not reopen Candidate 2's Topic Expedition stage-profile decision.

Use two code-owned settlement policies, not caller callbacks:

- Grounding Bundle settlement drops rejected original passages in original order, changes no other
  metadata, and rejects the whole draft when no Definition Passage survives.
- Generated Support Step settlement rejects the complete structured payload when any positive
  target is rejected; it never removes or rewrites a learner-facing field.

### KTD3 — Make the Generated Grounding Bundle owner-neutral

Remove `derivedNodeId` from `GeneratedGroundingBundle` and rename
`scaffoldedAnchorConceptIds` to owner-neutral `groundingAnchorReferences`. The bundle retains Grounding
Origin, definitions, mentions, generating model, and rationale. The enclosing Enrichment Node or
generated Support Step owns durable identity; `candidateKey` is run-local correlation only and is
never persisted in the bundle.

Make `GroundingGenerationPort` consume the same closed context as admission. Rejection feedback is
created only inside the bounded module and remains hidden. Update every bundle constructor,
selection/projection helper, persistence mapper, fixture, and test in the same unit; do not accept
both old and new JSON shapes.

### KTD4 — Map outcomes at the three rightful caller seams

- **Synthetic Topic Generation:** pre-mint candidate correlation keys, batch all deduplicated
  concepts, retain measured holdouts in `SyntheticProbeDisposition`, assemble nodes only from
  admitted results, and turn any exhausted factual rejection into deterministic whole-operation
  failure before Derived Graph Layer persistence.
- **Prerequisite minting:** durability stays first. Batch the durability-kept proposals for one
  anchor through admission. Add a separate inspectable `GroundingAdmissionDisposition` to the
  Derived Graph Layer trace. A boundary holdout keeps the domain/label reservation for the run; an
  exhausted anchor-conditioned factual rejection releases it for a later anchor. Neither creates a
  node or consumes a minted-node budget slot. Keep proposal/anchor/run bounds outside admission.
- **Scaffold Generation:** batch the settled outline's generated labels while references bypass
  admission. Either non-admission omits that generated label. Only an admitted bundle can enter the
  content-attempt envelope and be persisted. Existing fenced publication and no-safe-step aggregate
  failure remain the only publication authority.

Replace each consumer's six-or-shorter dependency bag with `SourceLessGroundingAdmission`; keep role,
identity, trace, durability, persistence, and operation lifecycle in the caller.

### KTD5 — One complete Support Step content-attempt envelope

Keep `contentDraftAttempts` in Scaffold Generation. Each attempt executes, in order:

```text
fresh content draft
  → structural payload validation
  → congruence re-pick
  → exhaustive positive-claim admission
  → Answer-Key Verification
  → accept the complete payload
```

A resolved structural, congruence, factual, or key rejection consumes that one attempt and supplies
bounded feedback to a fresh complete draft. No check owns a nested retry. Congruence unavailability
skips only its quality veto and continues to both required assurance checks. Required claim/key
dependency unavailability escapes the envelope unchanged, consumes no additional content attempt,
and reaches the existing transient-versus-deterministic fenced lifecycle.

Add a pure, exhaustively typed positive-claim projector over lesson section text/items/diagram
caption and specification, question, explanation, and the keyed correct option. Exclude ids,
provenance markers, the already-admitted label, and non-keyed distractors. A future payload field must
cause a compile/test failure until its claim treatment is explicit.

### KTD6 — Deepen Answer-Key Verification without importing its retry loop

Generalize `StudyItemKeyVerificationPort` to owner-neutral `AnswerKeyVerificationPort` and rename its
prompt/schema comments accordingly. Preserve the existing option-select and impostor Neural Stage
Descriptors and deterministic rules. The option-select request contains its question, grounding
context, and every candidate in deterministic key-independent order; it contains no `isCorrect`,
server key, derived-node requirement, or generator-position signal.

Expose one application-internal one-shot classification/veto function. Neutral Study Items continue
to call it through `verifyGuardedItems`, preserving their two-round regeneration and ADR-0026
unavailability asymmetry. Scaffold Generation calls the one-shot function once per content attempt:
a confidently false key or confidently true distractor rejects the draft; `unclear` is not promoted
to a hard veto; required unavailability throws. Register the option-select descriptor under both
`study_items` and `scaffold`.

Amend ADR-0026 in U3 only enough to make its named verification scope and shared Support Step use
current; do not add a second ADR or change neutral Study Item behavior.

### KTD7 — One policy identity and mechanically exact attribution

Add one canonical `SourceLessGroundingAdmissionPolicy` with the existing calibrated probe behavior,
two Grounding Bundle draft attempts, candidate concurrency, and verification concurrency. All three
consumers reference the same default. Attempt count, probe sample count, and agreement threshold are
behavior; candidate/probe/verification widths are execution policy.

Include behavior plus the embedding model and exact descriptors in Graph Enrichment, Synthetic Topic
Generation, and Scaffold Generation config hashes. Exclude execution widths. Register the probe,
embedding, Grounding Generation, question-planning, answering, and factual-judgment stages under every
operation that can run them. Derive shared stages and compare registry owner sets directly with the
Operation Timeline catalog; delete the hand-maintained `SHARED_STAGES` ownership assumption.

Do not implement Candidate 2's flow-specific Topic Expedition stage profile here. The runtime stage
names used by Synthetic Topic Generation remain stable.

### KTD8 — Persist admitted evidence beside generated Support Steps

Add required `groundingBundle` to `ScaffoldGeneratedStep`. In
`packages/infrastructure-postgres/src/schema/learnerState.ts`, add nullable JSONB
`grounding_bundle`; strengthen the step-shape CHECK so a generated row requires both payload and
bundle while a reference row permits neither. Update publish, hydrate, learner-owned step reads,
hide/restore, grading, and generated-step audit mappings. The learner-facing Study Session projection
continues to expose only key-free teaching/activity content, not the bundle or verification evidence.

After editing the Drizzle schema, run `pnpm db:generate`; never edit the generated SQL, snapshot, or
journal by hand. `pnpm db:check` must pass, then use the guarded reset path from the root README. DB
tests run only through `pnpm test:db` against `lrnki_test`.

### KTD9 — Same-change deletion and composition

Composition roots construct the deep module from the existing independent generator/judge model
families and inject it into:

- `apps/kg-worker/src/knowledgeGraphWorker.ts` for Graph Enrichment and Synthetic Topic Generation;
- `apps/learner-api/src/learnerGeneration.ts` for Topic Expedition generation; and
- `apps/learner-api/src/learnerScaffoldGeneration.ts` for Scaffold Generation.

Delete the synthetic-local orchestration and validator, direct minting/scaffold Grounding Generation
paths, synthetic-specific verification port shapes, rewritten-bundle comparator, duplicated config
knobs, stale comments, and superseded tests in the same units that replace them. Consumer tests inject
the small finished admission interface; only the deep module tests fake every neural dependency.

## Implementation units

### U1 — Deep admission module and Synthetic Topic Generation cutover

**Primary files:** `packages/domain-core/src/index.ts`, `packages/ports/src/index.ts`, new
`packages/application/src/{claimAdmission,sourceLessGroundingAdmission}.ts`,
`runSyntheticGeneration.ts`, `knowledgeBoundaryProbe.ts`, their tests and barrel,
`packages/infrastructure-litellm/src/{groundingGenerationAdapters,toolSchemas,configHashes}.ts`, the
three verification prompts/adapters/tests, `apps/kg-worker/src/knowledgeGraphWorker.ts`, and
`apps/learner-api/src/learnerGeneration.ts`.

**Work:** Implement KTD1–KTD3, move the complete existing sequence behind the new interface, change
probe embedding unavailability from fabricated boundary to propagated failure, cut Synthetic Topic
Generation over, centralize policy/config identity, and delete the old private implementation and
synthetic-shaped ports.

**Tests:** Invalid policy/candidates fail before neural work; empty batch is inert; measured boundary
never grounds; embedding unavailability throws; every passage is planned; answering cannot receive a
draft; answer mismatch fails; judgments can only drop original passages; only rejected candidates
regenerate with feedback; exhaustion returns `rejected`; thrown dependencies return no partial
array; completion order cannot perturb result order; stage waves and totals are exact. The Synthetic
consumer test proves holdout trace mapping, node assembly, factual-rejection atomic failure, and one
module seam rather than neural-port orchestration.

**Gate:** Focused domain/application/LiteLLM tests and typechecks, config-hash/descriptor exactness,
then one production-model Synthetic Topic Generation run. Inspect every admitted bundle and holdout;
record `PASS`, `FIX_FIRST`, `EXPERIMENT_ONLY`, or `BLOCKED` under the real-use route before U2.

### U2 — Model-grounded prerequisite minting cutover

**Primary files:** `packages/domain-core/src/index.ts`, `packages/application/src/enrichmentNodeMinting.ts`,
`runGraphEnrichment.ts`, their tests, `operationTimelineCatalog.ts`,
`packages/infrastructure-litellm/src/configHashes.ts`, and `apps/kg-worker/src/knowledgeGraphWorker.ts`.

**Work:** Implement KTD4's minting path and KTD7's Graph Enrichment ownership. Add the distinct
admission disposition and reservation-scope rules; structurally pair an enabled proposal path with
the admission module; remove direct `GroundingGenerationPort` from minting.

**Tests:** Durability always precedes admission; only admitted results consume node/run budgets;
holdout remains reserved across later same-domain anchors; factual rejection releases for a later
anchor; admission dependency failure aborts without a partial Derived Graph Layer; dispositions stay
separate and inspectable; the registry/catalog/config hash includes the complete shared policy.

**Gate:** Focused application/worker/config tests, then real Graph Enrichment over the Rust curated
fixture with production model calls. Inspect proposals, both disposition classes, every minted
bundle, and absence of an unadmitted node. Any zero-row assertion carries a positive control over the
same proposals in the same query.

### U3 — Generated Support Step assurance and durable evidence

**Primary files:** `packages/domain-core/src/learnerScaffold.ts`, `packages/ports/src/index.ts`,
`packages/application/src/{learnerScaffoldGeneration,verifyStudyItemKeys,verifyGuardedItems}.ts` and
tests, `packages/infrastructure-litellm/src/{studyItemGenerationAdapters,configHashes,toolSchemas}.ts`
and prompt/tests, `packages/infrastructure-postgres/src/schema/learnerState.ts`,
`PostgresLearnerScaffoldStore.ts` and tests, the generated baseline artifacts,
`apps/learner-api/src/learnerScaffoldGeneration.ts`, and ADR-0026.

**Work:** Implement KTD4–KTD8 for Scaffold Generation: grounding batch, pure positive-claim
projection, one content-attempt envelope, shared one-shot Answer-Key Verification, mandatory failure
semantics, bundle-on-step persistence, exact timeline/config registration, and generated baseline
regeneration. Keep projections key/evidence-free and publication fenced/atomic.

**Tests:** Reference steps bypass all generation; non-admitted generated labels are omitted; admitted
bundles alone enter content generation; every projected positive field is covered; distractors are
excluded from factual admission but all options reach key verification in key-independent order;
each resolved rejection consumes one—not nested—attempt; congruence unavailability still reaches
both required checks; required unavailability escapes without another draft; safe peers survive;
zero survivors fail atomically; stale fences publish nothing. DB tests prove the generated/reference
CHECK, round-trip bundle equality, immutable hide/restore, grading, audit read, and no partial publish.

**Gate:** `pnpm db:generate`, `pnpm db:check`, focused source tests/typechecks, and `pnpm test:db`.
Then request one real generated Support Step against a ready curated-source expedition with production
model calls. Inspect its payload and admitted bundle together, independently check the lesson,
question, explanation, key, and distractors, and confirm the operation timeline/config hash contains
every stage. A reference-only result does not exercise this gate and must be replaced by a term that
produces a generated step.

### U4 — Cross-consumer regression and real-use closure

**Work:** Run the repository gate, repeat the smallest representative real-use matrix, inspect the
finished artifacts rather than aggregate status, fix any `FIX_FIRST` result inside the owning unit,
and consolidate the Validation Log. Use the Rust curated fixture for source-grounded minting/Scaffold
and one source-less topic in a different Declared Domain, such as DNA replication in molecular
biology. Fixture concepts may appear in evaluation inputs, never in prompts, tool descriptions,
deterministic gates, or expected source logic.

**Automated gate:** `pnpm check`, plus `pnpm test:db` separately against `lrnki_test`. Read each
failing subcommand rather than reporting only a composite exit code. Finish with `git diff --check`,
stale-symbol searches, and a final authority/links review. The intercepted-web subgate inside
`pnpm check` is broad regression evidence only; it does not establish a new web claim for this
application-layer change.

**Real-use gate:** Production model calls are required. For each consumer, record representative
admitted and non-admitted output, useful content, defects, operation stages, config identity, and the
evidence boundary. Store generated reports in gitignored `tmp/`; retain only the consolidated result
in this plan. This is local real-use quality evidence, not deployed, browser, native, or
physical-device evidence.

## Acceptance

- All three consumers cross `SourceLessGroundingAdmission`; deleting it would force the complete
  policy and orchestration to reappear in all three.
- No Derived Graph Layer node or immutable generated Support Step can be assembled from a held-out,
  rejected, unavailable, or unchecked source-less draft.
- The Grounding Bundle and Support Step policies share one draft-blind claim implementation while
  retaining their different settlement rules and attempt owners.
- Generated Support Steps persist exactly the accepted payload and owner-neutral bundle; rejected
  drafts, raw verifier exchanges, feedback, attempt counts, and redundant pass flags do not persist.
- Answer-Key Verification is key-hidden, checks every option, preserves ADR-0026's neutral Study Item
  behavior, and never introduces a nested Scaffold retry.
- Every operation hash and timeline owns exactly the behavior/descriptors/stages it may execute;
  execution-only concurrency does not perturb artifact identity.
- The code-first Drizzle schema and generated baseline are mechanically identical; DB tests target
  only `lrnki_test`; the development schema is reset rather than compatibility-migrated.
- The detailed synthetic-local path, direct minting/scaffold grounding paths, old bundle fields,
  synthetic-shaped verification ports/prompts, and manual shared-stage ownership list are absent.
- U1, U2, and U3 each have valid automated and real-use evidence, and U4 is `PASS` before downstream
  work proceeds.

## Out of scope

- Candidate 2's Topic Expedition execution-profile/progress module and the known Expedition Journal
  hand-list drift.
- Web-grounded retrieval, a strategy/plugin registry, source-cited admission, or a new Grounding
  Origin.
- Multi-anchor grounding, consumer-specific admission policy, or per-call attempt/config overrides.
- Changing Graph Enrichment durability policy, neutral Study Item retry/unavailability semantics,
  Scaffold congruence policy, publication fencing, learner grading, rewards, or mastery isolation.
- Learner UI, intercepted/deployed web, native emulator/simulator, or physical-device validation;
  no presentation behavior changes in this plan.
- Model reassignment outside the two U1 claim-verification roles. The user authorized the draft-blind
  answerer and primary factuality judge to move from Qwen3-235B to pinned DeepSeek V4 Flash 0731;
  their prior quality evidence is invalid, and U1 reruns every affected gate under that assignment.

## Validation Log

### U1 — Deep admission module and Synthetic Topic Generation cutover — PASS (2026-08-19)

- **Milestone:** Synthetic Topic Generation now crosses the one Source-less Grounding Admission
  seam. Knowledge-Boundary Probe failure propagates; draft-blind claim planning, answering, and the
  two-family factuality panel settle only original passages; one bounded rejected-draft regeneration
  remains application-owned. The claim answerer and primary factuality judge use pinned DeepSeek V4
  Flash 0731; the planner and challenger use GPT-OSS-120B.
- **Automated evidence:** `@lrnki/domain-core` 39/39, `@lrnki/application` 762/762, and
  `@lrnki/infrastructure-litellm` 163/163 passed. Root `pnpm typecheck` passed all 11 typed workspace
  projects. The suites cover invalid and empty batches, propagated embedding failure, complete
  passage coverage, draft-blind answering, answer correlation, monotonic settlement, bounded
  regeneration, atomic dependency failure, deterministic ordering, exact stage waves, the synthetic
  consumer seam, and model/provider/fallback-sensitive operation hashes.
- **Model qualification:** the pinned 0731 claim route passed the exact answer and judgment schemas,
  a five-target production-style smoke, and the full 22-target matrix: all 12 unsafe claims were
  rejected and all 10 safe controls accepted. Parasail FP8 is primary and DeepInfra FP8 is its
  explicit same-model backup. GPT-OSS-120B uses DigitalOcean primary and Groq same-model backup.
- **Production-model real use:** local Synthetic Topic Generation for `DNA replication` in
  `molecular biology` succeeded as enrichment `54a09387-a193-45e1-823a-48be2fee65a1`, operation run
  `3d41d5d2-96e3-42da-967d-ff0f1f4b7bca`. The persisted artifact hash is
  `synthetic-topic-generation-2c7d199e35c5`. All 16 measured probe dispositions were
  `core_knowledge`; the same query supplied the 16-row positive control beside zero boundary rows,
  zero boundary nodes, and zero core ghosts. Automated tests retain the boundary-to-holdout trace
  proof for the branch this run did not produce.
- **Persisted inspection:** all 16 admitted Grounding Bundles and all 41 passages were read. Every
  bundle has the owner-neutral six-field shape, at least one Definition Passage, no synthetic anchor
  reference, and generated provenance; all 41 passages contain learner-useful text and no false
  source locator or quotation. The final biology claims agree with authoritative molecular-biology
  references. The narrow retained DNA polymerase I definition is accurate and its adjacent mention
  supplies the primer-removal role. The first origin-of-replication draft overgeneralized origins as
  specific sequences; the panel rejected it, the sole bounded regeneration replaced it with a
  functionally defined genomic region, and only that accepted bundle persisted.
- **Routing and timeline:** the run exercised 40 answer packets (Parasail 39, DeepInfra fallback 1)
  and 106 primary-judge calls (Parasail 105, DeepInfra fallback 1), all on exact model
  `deepseek/deepseek-v4-flash-0731`. The independent challenger completed 106 logical judgments on
  DigitalOcean GPT-OSS; one schema-correction request made 107 provider calls. The 17 persisted
  Operation Timeline rows record the initial two-sample wave, six disputed third samples, the one
  regenerated candidate, ordering, difficulty, symbolic disposal, and atomic persistence.
  Knowledge-Boundary Probe also exercised its existing Qwen3-30B backup for 38 of 160 draws; the
  Qwen embedding route completed 16 node embeddings.
- **Evidence boundary:** this is production-model local application-pipeline and persisted-database
  evidence. It is not intercepted or real-backend web, deployed, native emulator/simulator, or
  physical-device evidence. Safe to continue to U2: **yes**.

### Open findings

- None recorded.

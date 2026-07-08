---
title: "refactor: neural stage descriptors with dotprompt files and mechanical config hashes"
type: refactor
date: 2026-07-08
origin: Candidate 3 of docs/brainstorms/2026-07-07-architecture-deepening-review.md, grilled
  2026-07-08. User decisions — prompts move out of code into dotprompt (.prompt) files now, not
  later, because the file format both closes the hash gap and is the desired future prompt home;
  the .prompt frontmatter owns the LiteLLM model alias (model changes are made in LiteLLM config,
  so the alias is stable indirection, not composition-root policy); hash strategy is
  "data-first" (Option A upgraded by dotprompt: hash file bytes + schema JSON + scalars), not a
  build-time source hash and not hand-bumped per-descriptor revisions.
---

# refactor: neural stage descriptors with dotprompt files and mechanical config hashes

## Summary

Every LLM stage today is an adapter class of the same shallow shape — `constructor(client, model)`,
render prompts, `client.call({...})`, map result — spread across ~6 hand-synced sites per stage
(adapter class, `toolSchemas.ts` entry, `*_MODEL` alias const, `STAGE_TAGS`, catalog entry, worker
wiring), with run-attribution identity guarded by **three hand-bumped strings**
(`PIPELINE_CONFIG_HASH = "definition-quality-judge-v38"` in `knowledgeGraphWorker.ts`,
`STUDY_ITEM_BANK_CONFIG_HASH = "study-item-bank-v3"` in `studyItemBankConfig.ts`, and
`enrichmentConfigHash: "banded-difficulty"` / `"synthetic-topic-generation"` inside the two default
config objects). The spread demonstrably drifts: each of the five stages added since 2026-07-03
paid the full spread and one dropped the catalog step (the Candidate 1 defect). Problem framing and
depth vocabulary are owned by the
[architecture deepening review, Candidate 3](../brainstorms/2026-07-07-architecture-deepening-review.md).

The deepening: one **Neural Stage Descriptor** per forced tool call — a `.prompt` (dotprompt
format) file owning the stage's textual knowledge (model alias, tool name, tool description,
system + user Handlebars templates) plus a small typed TypeScript rim (zod schema/validator,
stage tag, retry budget, result mapping) — executed by one generic forced-tool executor. The 24
adapter classes and 17 `*_MODEL` consts are deleted; per-judgment **ports stay** as the
application-facing seam and test surface. Each operation's config hash derives mechanically from
its descriptors' file bytes + schema JSON + scalars, so "bump on change" stops being remembered
and the stale-hash misattribution class disappears. Because the hash input is disk-read file
bytes (never bundled function source), the kg-worker (tsx) and admin-lab (Next-bundled) roots
compute identical hashes for identical trees.

Exploration facts the design must absorb (verified 2026-07-08 against the tree):

- The descriptor unit is the **forced tool call**, not the adapter class: admission makes 2 tool
  calls, intrinsic difficulty 2, study-item generation 3 (with 3 stage tags). Count: **27
  descriptors** behind ~22 port methods (26 distinct tool calls + the rescue-seam second
  attribution of the definition-passage-quality judge).
- Four stages build schema + validator **per call** from input size/keys (prerequisite ordering,
  rescued-node labeling, admission, core selection); two stages carry per-call `maxRetries: 1`.
- `LiteLlmDefinitionPassageQualityJudgmentAdapter` is constructed twice with different stage tags
  (`definition-passage-quality` extraction gate at `knowledgeGraphWorker.ts:186`,
  `rescue-definition-quality` enrichment rescue seam at `:221`) — same prompt knowledge, two spend
  attributions.
- Every system prompt is already a static string array; only user prompts interpolate input, via
  loops/numbering that Handlebars expresses. `renderConcept` is deliberately shared by the
  ordering and difficulty prompts so their quote formatting cannot drift — it becomes a shared
  Handlebars **partial** whose bytes join both hashes.
- Some aliases are shared **by reference** (`CONCEPT_LESSON_GENERATION_MODEL =
  EVIDENCE_PROFILE_MODEL`, three consts aliasing `kg-independent-judge` rationale). Frontmatter
  makes each file state its alias literally; the cross-family-judge rationale comments move into
  the `.prompt` files, and LiteLLM config remains the single owner of alias → backing model.

Out of scope: the embedding transport (`LiteLlmNodeEmbeddingAdapter` / `LiteLlmEmbeddingClient` —
not a forced tool call; its `kg-node-embedding` alias const stays), `LiteLlmForcedToolClient`
internals (retries, tagging, NUL stripping, fail-closed validation are untouched), sampling/client
policy at the composition roots (Candidate 4's seam — deliberately NOT moved), any LiteLLM config
change, any schema change, and any prompt **content** change (byte-identical rendering is an
acceptance criterion).

## Problem Frame and Requirements

Grilled 2026-07-08; this section owns the requirements until completion.

- **R1 — One descriptor per forced tool call.** Each of the 27 forced tool calls gets one Neural
  Stage Descriptor: a `.prompt` file + typed rim. Multi-call ports (admission, intrinsic
  difficulty, study-item generation) become factories composing several descriptors behind the
  unchanged port interface.
- **R2 — Dotprompt files own textual stage knowledge.** The `.prompt` frontmatter owns the model
  alias (user decision), the forced tool name, and the tool description; the body owns the system
  and user Handlebars templates. Zod schemas/validators stay in TypeScript as the single source
  (ADR-0006); output schemas never appear in frontmatter (rule 18 — no second representation).
- **R3 — One generic executor, ports unchanged.** A single `executeForcedToolStage(client,
  descriptor, input)` renders templates, builds/loads schema + validator, calls
  `LiteLlmForcedToolClient.call`, and applies `mapResult`. Every adapter class collapses to a
  one-line port factory `createXPort(client)`. No application use-case signature changes.
- **R4 — Mechanical per-operation config hashes.** The three hand-bumped hash strings are replaced
  by derived hashes: `sha256` over the operation's identity seed + each owned descriptor's prompt
  file bytes (including referenced partials/helpers), schema JSON evaluated at a documented
  sentinel input, and scalars (stage tag, tool name, max retries) + the operation's app-level
  config object (e.g. `difficultySampleCount`, probe K/threshold). Both composition roots must
  derive byte-identical hashes from an identical tree.
- **R5 — Prompt-content fidelity.** For representative fixture inputs, the rendered
  system/user messages are **byte-identical** to the pre-refactor render (golden tests captured
  before migration). The refactor changes where prompt knowledge lives, never what the model sees.
- **R6 — Catalog congruence.** Every descriptor's `stageTag` must be an LLM stage of its owning
  operation in `OPERATION_TIMELINE_CATALOG` — asserted by test next to the existing set-equality
  assertion, closing the loop Candidate 1 left open ("the seam C3 plugs into").
- **R7 — Rule 18 deletions in the same change.** The 24 adapter classes, their `*_MODEL` consts,
  the three hand-bumped hash strings, and superseded render helpers are deleted as each unit
  lands; no legacy path survives.
- **R8 — Durable records.** A new ADR records the descriptor + dotprompt + mechanical-hash policy;
  `CONTEXT.md` gains the **Neural Stage Descriptor** term (added at grilling time); rule-14
  real-use gate before completion.

## Key Technical Decisions

- **KTD1 — Descriptor unit = forced tool call.** The class was never the knowledge boundary; the
  tool call is. Ports remain the aggregation seam (a factory may close over 3 descriptors).
- **KTD2 — Dotprompt as file format, not runtime.** We adopt the `.prompt` spec (YAML frontmatter
  + Handlebars body) for file compatibility with future tooling, but our executor and
  `LiteLlmForcedToolClient` own execution. Frontmatter fields used: `model` (LiteLLM alias) plus
  an `lrnki` extension block for `toolName` and `toolDescription`. Dependency: evaluate the
  `dotprompt` npm package's standalone parse/render surface first; if it drags runtime features we
  don't use, fall back to `gray-matter` + `handlebars` writing spec-conformant files (~40-line
  loader). Decide in U1, record in the ADR.
- **KTD3 — Frontmatter owns the model alias** (user decision 2026-07-08). Aliases are stable
  indirection — model changes happen in LiteLLM config (rule 5) — so the alias is per-stage
  knowledge, not root policy. The 17 `*_MODEL` consts and their rationale comments migrate into
  frontmatter/file comments. Sampling policy (deterministic `temperature:0, seed:7` vs probe
  `0.7` vs discovery default) **stays at the composition roots**: the root passes the right client
  to each factory exactly as it passes it to each adapter today.
- **KTD4 — Data-first hash, disk-read bytes.** `stageConfigHash(descriptor)` hashes prompt-file
  bytes + partial/helper file bytes + `JSON.stringify(schema(sentinel))` + scalars.
  `operationConfigHash(seed, descriptors, appConfig)` sorts stage hashes by tool name and folds in
  the operation's app-level config. Rendered as `"<seed>-<12 hex>"` so operators can still read
  which operation a hash belongs to. Known, accepted residual gap: the thin typed rim
  (`templateData`, `mapResult`) is code and escapes the hash — the textual scaffolding it used to
  contain now lives in the template, which is hashed; the ADR documents the residue.
- **KTD5 — Helpers near zero.** Handlebars partials yes (they are files, hashed); custom helpers
  only with a named justification (expected: one `add1` for 1-based numbering), and any helper
  registration file's bytes join every hash that can render it.
- **KTD6 — Shared-prompt, dual-attribution stages are two descriptors, one file.** The
  definition-passage-quality judge yields two descriptors referencing the same `.prompt` file with
  different `stageTag`s, so the extraction and enrichment hashes each include the shared file.
- **KTD7 — Input-bounded schemas stay code, with sentinels.** Descriptors expose
  `buildSchema(input)` / `buildValidator(input)` (or static equivalents) plus a documented
  `sentinelInput` (n=2; candidate keys `["sentinel_a","sentinel_b"]`) used for hashing and the
  render smoke test. Zod remains the single schema source (ADR-0006).
- **KTD8 — Golden-first migration.** Before touching an adapter family, capture its current
  rendered messages for fixture inputs as golden snapshots; migrate; assert byte equality (R5).
  The goldens then live on as the descriptor render tests, replacing the adapter-class
  render/validate/passthrough tests one-for-one — the test surface is renamed, not lost.
- **KTD9 — Hash values change once, by design.** Persisted `pipeline_config_hash` /
  `config_hash` values switch format on the first post-refactor run. Greenfield rules 1/8/9 apply:
  no migration, no compatibility shim; old runs keep their old strings as historical facts.
- **KTD10 — File placement.** `packages/infrastructure-litellm/prompts/<stage>.prompt` +
  `prompts/partials/`. Prompt files are code assets (not `fixtures/` — they are not curated
  sources). Loading is `fs.readFileSync` resolved from the package directory, memoized; works
  identically under tsx and the Next server (local greenfield lab, no deploy packaging concern —
  revisit in the ADR if a packaged deploy ever exists).

## High-Level Technical Design

```
packages/infrastructure-litellm/
  prompts/
    concept-discovery.prompt          # frontmatter: model, lrnki.toolName, lrnki.toolDescription
    admission-decisions.prompt        #   body: {{! system }} + {{! user }} Handlebars templates
    core-selection.prompt
    ... (26 files; definition-passage-quality.prompt shared by 2 descriptors)
    partials/concept-context.prompt   # renderConcept, shared by ordering + difficulty
  src/
    promptFile.ts                     # U1: parse frontmatter, compile templates, memoize
    forcedToolStage.ts                # U1: descriptor type + executeForcedToolStage + stageConfigHash
    operationConfigHash.ts            # U1: operationConfigHash(seed, descriptors, appConfig)
    stages/<operation>/*.ts           # descriptors + port factories, replacing *Adapters.ts
```

Descriptor rim (sketch — final shape decided in U1):

```ts
type NeuralStageDescriptor<TInput, TArgs, TResult> = {
  promptPath: string;                       // owns alias/toolName/toolDescription/templates
  stageTag: StageTag;
  schema: JsonSchema | ((input: TInput) => JsonSchema);
  validator: ZodType<TArgs> | ((input: TInput) => ZodType<TArgs>);
  sentinelInput: TInput;                    // hashing + render smoke test (KTD7)
  maxRetries?: number;
  templateData: (input: TInput) => Record<string, unknown>;  // typed input → Handlebars data
  mapResult: (args: TArgs, input: TInput) => TResult;
};
```

Hash flow: composition roots call the exported per-operation derivations
(`extractionConfigHash()`, `enrichmentConfigHash(seed, config)`, `studyItemBankConfigHash()`) and
pass the resulting strings into the unchanged application use-case inputs
(`executeExtractionRun.pipelineConfigHash`, `runGraphEnrichment.enrichmentConfigHash`,
`generateStudyItemBank.configHash`). Application and ports packages see only strings, exactly as
today; the derivation lives beside the descriptors it hashes. The stage→operation grouping reuses
`OPERATION_TIMELINE_CATALOG` (R6 keeps it congruent).

## Implementation Units

### U1. Loader, executor, hash, and test harness

`promptFile.ts` (dependency decision per KTD2), `forcedToolStage.ts` with
`executeForcedToolStage` + `stageConfigHash`, `operationConfigHash.ts`, the golden-snapshot test
helper (KTD8), and one pilot migration proving the whole path end-to-end: the
prerequisite-ordering stage (it exercises the hardest features — schema builder, per-call
`maxRetries`, shared partial). Acceptance: pilot goldens byte-identical; executor unit tests cover
template render, schema-builder pass-through, and `mapResult`; `stageConfigHash` changes when and
only when file bytes/schema/scalars change.

### U2. Extraction stages (7 descriptors)

Discovery, admission decisions, core selection, CEP extraction, assertion entailment,
definition-passage-quality (extraction attribution), admission label judge. Delete
`extractionAdapters.ts` classes/consts as each lands; worker wiring switches to factories.

### U3. Enrichment, dedup, difficulty, grounding (10 descriptors)

Remaining ordering-family stages (rescued-node labeling, rescue durability, minting durability),
definition-passage-quality (rescue attribution — second descriptor over the shared file, KTD6),
node-merge adjudication, missing-prerequisite proposal, intrinsic difficulty ×2, grounding
generation. Delete `enrichmentAdapters.ts`, `dedupAdapters.ts` (forced-tool half),
`missingPrerequisiteProposalAdapters.ts`, `intrinsicDifficultyAdapters.ts`,
`groundingGenerationAdapters.ts`.

### U4. Synthetic + domain inference (3 descriptors)

Concept-set synthesis, knowledge-boundary probe (probe client stays a root choice, KTD3),
declared-domain inference. Delete `syntheticGenerationAdapters.ts`, `domainInferenceAdapters.ts`.

### U5. Study items + lessons (7 descriptors)

Option-select, impostor, matching, blueprint, impostor lie-validity judge, concept-lesson
generation, lesson-redundancy judge. Delete `studyItemGenerationAdapters.ts`,
`conceptLessonGenerationAdapters.ts`, `conceptLessonRedundancyAdapters.ts`.

### U6. Mechanical hashes wired at both roots (R4)

Export the three per-operation hash derivations; both roots consume them;
delete `PIPELINE_CONFIG_HASH`, `STUDY_ITEM_BANK_CONFIG_HASH` (the application re-exports go too —
`learnerGeneration.ts` imports the derivation instead), and the literal `enrichmentConfigHash`
defaults (seeds `"banded-difficulty"` / `"synthetic-topic-generation"` are retained as the
operation identity seeds inside the derivation, KTD4). Acceptance: a cross-root test (or gate
check) shows the tsx worker and the Next server derive identical hashes; editing one `.prompt`
file changes exactly its owning operation's hash (the shared definition-passage-quality file
changes two, by design).

### U7. Congruence assertion + docs (R6, R8)

Test: every descriptor `stageTag` ∈ its operation's catalog LLM stages (beside the Candidate 1
set-equality assertion). New ADR (descriptor + dotprompt + mechanical hash policy, incl. KTD4's
documented residue and the KTD2 dependency decision); `CONTEXT.md` already carries the term.
Update `docs/brainstorms/2026-07-07-architecture-deepening-review.md` Candidate 3 status and the
"noted, no action" item about `EXPECTED_TOPIC_GENERATION_STAGES` if it dissolves naturally
(don't force it).

### U8. Rule-14 real-use gate

With `.env` loaded: one real extraction → build → enrichment through the kg-worker and one real
topic expedition through the Admin Lab supervisor. Assert: both operations' runs persist the new
derived hashes and the two roots' enrichment hashes agree for the shared stages; the Cost &
timings report attributes every stage's spend (no orphaned tags — the U7 assertion's live
counterpart); inspected model output quality unchanged (goldens make regression unlikely, but the
gate inspects real output per ADR-0013, not just the deterministic envelope). Evidence under
`tmp/2026-07-08-neural-stage-descriptors/`.

## Validation

Deterministic envelope: workspace typecheck, lint, all package tests (goldens included) green.
Real-use gate per U8. Completion follows `docs/plans/README.md`: fold durable decisions into the
new ADR, status into `TODO.md`, then delete this plan.

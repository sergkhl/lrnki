---
date: 2026-06-29
type: refactor
title: "refactor: single-source the forced-tool schemas (zod source → generated JSON Schema)"
origin: docs/brainstorms/2026-06-27-architecture-deepening-opportunities.md
depth: deep
---

# refactor: single-source the forced-tool schemas (zod source → generated JSON Schema)

## Summary

Each of the 15 forced tools in `packages/infrastructure-litellm/src/toolSchemas.ts` declares its shape
**twice**: a hand-written JSON Schema `const` (passed as `parameters`) and a parallel hand-synced zod
validator (passed as `validator`). That is two representations of one fact — a standing
[AGENTS rule 18](../../AGENTS.md) violation ("any second representation must be mechanically
generated"), with `blockEvidence` inlined in zod ~8 times on top.

Make the **zod validator the single source** and **mechanically derive the JSON Schema** from it via
zod 4's native `z.toJSONSchema`, normalized for our forced-tool provider's dialect at one small deep
seam (`toForcedToolSchema`). The `xxxSchema` / `xxxValidator` export pairs stay — only their
*definition* inverts — so all 16 adapter import sites are untouched.

[ADR-0006](../adr/0006-use-forced-named-tool-schemas.md) is preserved: the call remains a forced
*named* tool with a `strict: true` JSON Schema validated fail-closed at the boundary. Only the
schema's **source** changes (generated from zod, not hand-written beside it).

This is the [`improve-codebase-architecture`](../../.agents/skills/improve-codebase-architecture/SKILL.md)
review's **Candidate 3** (origin brainstorm). It is scoped strictly to single-sourcing the schema
fact; Candidate 4 (judge port/adapter envelope collapse) is explicitly out (KTD7).

---

## Problem Frame

`toolSchemas.ts` (765 lines) carries, per tool, a JSON Schema and a zod validator that must be kept
identical by hand:

1. **One fact, two stacks (rule 18).** 29 `additionalProperties:false` are mirrored by 39 `.strict()`;
   51 `description:` strings live in the JSON consts with no machine link to the validators; the
   `blockEvidence` `{blockId, evidenceQuote}` shape is re-typed in zod ~8 times. A change to any tool
   requires two correct hand-edits, and nothing fails if they drift.

2. **A live schema/validator asymmetry.** The runtime-bounded builders enforce the candidate-key
   `enum` **generation-side only** — `conceptAdmissionSchemaForCandidateKeys` /
   `conceptCoreSelectionSchemaForCandidateKeys` emit `enum: candidateKeys`, but
   `conceptAdmissionValidator` / `conceptCoreSelectionValidator` validate the same field as a plain
   `z.string().min(1)`. The generation contract and the validation contract already disagree, by hand.

3. **Descriptions are prompt text (rule 17), unguarded at scale.** The per-field `description` strings
   are model-facing and must stay domain-neutral, but only **one** tool
   (`intrinsicDifficultySchema`) has a domain-neutrality test; the other 14 are unguarded.

The deepening: collapse the two hand-synced stacks into **one zod source + one generation seam**, and
add invariants that hold for every current and future tool.

Origin: `docs/brainstorms/2026-06-27-architecture-deepening-opportunities.md` (Candidate 3).

---

## Requirements Traceability

**Single source (rule 18)**

- **R1.** Each tool's `parameters` JSON Schema is generated from its zod validator; the validator is
  the only hand-authored representation of the tool's shape.
- **R6.** No new runtime dependency — use native zod 4 `z.toJSONSchema` (catalog pins `zod@4.4.3`). Do
  **not** add `zod-to-json-schema` (the copy in the tree is transitively pinned to zod 3).
- **R7.** Every per-field `description` is preserved byte-for-byte (moved into `.describe()`); model-
  facing text does not change (rule 17, ADR-0006 intent).
- **R8.** The 3 runtime-bounded builders single-source through the same seam.
- **R12.** `blockEvidence` is one reused zod object, not re-typed per tool.

**Provider-dialect seam**

- **R3.** Every generated schema satisfies the strict-forced-tool contract: `type:"object"` root,
  `additionalProperties:false` on every object, every property listed in `required`.
- **R4.** `toForcedToolSchema` normalizes only **contract-level** dialect concerns: strip the
  `$schema` key; fold scalar-nullable `anyOf:[{T},{null}]` → `type:[T,"null"]`; drop zod's
  `MAX_SAFE_INTEGER` sentinel `maximum` on unbounded `.int()`.

**Durability — symmetric constraints**

- **R5.** Real constraints flow to **both** sides: `minLength` (from `.min(1)`) reaches the generation
  schema, and the runtime `enum` reaches the validator. Schema and validator can no longer disagree.
  Safe by existing discipline: every may-be-empty field already omits `.min(1)`.

**Scope / decisions**

- **R2.** ADR-0006 preserved — forced *named* tool, `strict:true` JSON Schema, fail-closed boundary
  validation. No ADR rewrite.
- **R11.** Out of scope: the judge port/adapter envelope collapse (Candidate 4). The validator
  registry introduced here is test-only and does not touch adapters.

**Guards & validation**

- **R9.** A structural-invariant test and a domain-neutrality test iterate a registry of **all** tool
  validators, so a tool added in future inherits both guarantees.
- **R10.** Migration is gated by an allowed-difference deep-diff of each generated schema against the
  legacy const (the only permitted diffs are the R5 tightenings); the legacy const is deleted within
  the same unit (rule 18).
- **R13.** Real-use validation (rule 13/14) on the production extraction path, focused on the nullable
  `literalValue` fold and `minLength` reaching generation.

---

## Key Technical Decisions

**KTD1 — zod is the single source, because it is the strict superset.** zod expresses what JSON
Schema cannot: the cross-field `.refine()` on prerequisite-ordering edges ("two DIFFERENT concept
numbers", `toolSchemas.ts:366-368`), plus `min`/`max`/`length` bounds. Derivation runs zod → JSON in
the one direction that is lossless for generation; the reverse (JSON-as-source + ajv) could never host
the refine. The team already authors zod everywhere. *Rejected:* JSON-as-source, generated-zod.

**KTD2 — native zod 4 `z.toJSONSchema`, no new dependency.** The catalog pins `zod@4.4.3`, whose
`z.toJSONSchema` round-trips `.strict()` → `additionalProperties:false` + all-props-`required`,
`.nullable()`, `z.enum`, `.int()`, bounded arrays, and silently drops unrepresentable `.refine()`
(verified empirically). The `zod-to-json-schema@3.25.2` already in the tree is bound to a transitive
`zod@3` and must not be used. The brainstorm's "(e.g. `zod-to-json-schema`)" suggestion is superseded.

**KTD3 — runtime derivation, not build-time codegen.** The most durable artifact is *no* artifact: a
schema computed by `z.toFooJSONSchema` at process start cannot drift stale, whereas a committed
generated `.json` can. The 3 bounded builders already generate per-call at runtime, so this is the
established pattern; the cost is microseconds, once. *Rejected:* committed generated `.json`.

**KTD4 — `toForcedToolSchema` is the provider-dialect seam (permanent, not transitional).** No zod
`target` emits the strict-tool canonical form: `draft-2020-12` / `draft-7` emit nullable as `anyOf`,
`openapi-3.0` emits the OpenAPI-only `nullable:true` keyword, and the `MAX_SAFE_INTEGER` sentinel
appears under all three (verified). So a thin normalizer is *always* required; frame and document it
as "adapt zod's JSON Schema to our forced-tool provider's dialect." It folds nullable to
`type:[T,"null"]` — the form accepted across every strict-tool dialect (OpenAI legacy + current,
Gemini, Anthropic, raw draft) — strips `$schema` (not part of the function-parameters contract), and
drops the safe-integer sentinel (a zod artifact carrying no intent). **It does not normalize
*tightness*.** A future provider swap is then a change in one function — but the seam is **not**
pre-parameterized by `target` until a second provider actually exists (YAGNI / low-complexity); its
durability comes from *localization*, not speculative generality.

**KTD5 — symmetric constraints over byte-parity (the durability call).** Letting `minLength` and the
runtime `enum` flow to *both* schema and validator closes the asymmetry (Problem Frame #2) instead of
freezing it. This is the "one fact, one expression" principle applied. It is a **strictly tighter**
generation contract, and it is safe by the codebase's own discipline: every field that may
legitimately be empty (`groundingSpan`, `underlyingNounPhrase`, `subjectSpan`, `entailingSpan`,
`judgedSpan`) already omits `.min(1)`, while every must-be-nonempty field carries it. The migration
gate therefore is **not** byte-identity to the legacy const, but an allowed-difference deep-diff whose
only permitted deltas are these two tightenings (R10), each reviewed once and confirmed by the real
run (R13). *Rejected:* strip-`minLength`/keep-asymmetry parity, which would re-freeze the drift the
refactor exists to remove.

**KTD6 — keep the `xxxSchema` / `xxxValidator` export pairs; invert their definition.** Each tool
becomes `const xValidator = z.object({….describe(…)}).strict(); const xSchema =
toForcedToolSchema(xValidator);`. The 16 adapter import sites and the 4 test files that import these
names are untouched — surgical blast radius. `blockEvidence` collapses to one reused zod object
(R12).

**KTD7 — scope boundary vs Candidate 4.** This plan single-sources the *schema fact* only. The judge
adapter envelope (`messages`/`tags`/model scaffold) and the single-method judge ports are Candidate 4
and stay. The validator registry (U4) exists purely to power the invariant + neutrality tests; it does
not collapse any adapter or port.

**KTD8 — no CONTEXT.md change.** `CONTEXT.md` owns the Learner-Neutral *domain* language; the
provider-dialect seam is architecture vocabulary (the skill's `LANGUAGE.md` territory:
*module/seam/adapter*), not a domain concept. Adding an infra schema-helper term would cross the
documentation-authority boundary (AGENTS doc-authority). The seam is named and documented in code +
this plan, and folded into [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md) on completion.

---

## High-Level Technical Design

```
BEFORE                                  AFTER
toolSchemas.ts                          forcedToolSchema.ts  (deep seam)
  xSchema:   JsonSchema const   ──┐       toForcedToolSchema(zod) -> JsonSchema
  xValidator: zod const         ──┘         · z.toJSONSchema(v, {target:"draft-2020-12"})
  (hand-kept in sync, ×15)                  · strip $schema
  blockEvidenceSchema (JSON)                · anyOf-null  -> type:[T,"null"]
  + blockEvidence shape inlined             · drop MAX_SAFE_INTEGER maximum
    in zod ×8
                                        toolSchemas.ts  (declarative zod sources)
                                          blockEvidence = z.object({…describe}).strict()  (×1)
                                          xValidator = z.object({…describe}).strict()
                                          xSchema    = toForcedToolSchema(xValidator)
                                          buildXSchema(p) = toForcedToolSchema(buildXValidator(p))
                                          toolValidators = [ … ]   (test-only registry)
```

- **The deep module** is `toForcedToolSchema` (new `forcedToolSchema.ts`): small interface (zod in,
  forced-tool JSON out), all provider-dialect quirks absorbed in one place. Deletion test: inline
  `z.toJSONSchema` at 15 sites and the 3 normalizations reappear 15× → it earns its keep.
- **Locality:** "what shape does our forced-tool provider need" lives in one function with one test.
  "What is tool X's shape" lives in one zod object.
- **Leverage:** one seam pays back across 15 tools + every future tool; two registry tests guard them
  all.
- **Tests that survive unchanged:** `intrinsicDifficultyAdapters.test.ts` (`JSON.stringify(
  intrinsicDifficultySchema)` neutrality substring check — still a JSON object, still carries the
  descriptions), `enrichmentAdapters.test.ts`, `studyItemGenerationAdapters.test.ts`,
  `extractionAdapters.test.ts` (all import preserved `xValidator` / `xSchema` names).

---

## Implementation Units

### U1. The `toForcedToolSchema` provider-dialect seam

**Goal:** One deep function that turns any zod schema into a forced-tool JSON Schema in our provider's
dialect, with the three contract normalizations, tested in isolation against golden cases.

**Requirements:** R3, R4, R6.

**Dependencies:** none.

**Files:**

- `packages/infrastructure-litellm/src/forcedToolSchema.ts` (new) — `export function
  toForcedToolSchema(schema: ZodType): JsonSchema`.
- `packages/infrastructure-litellm/src/forcedToolSchema.test.ts` (new).

**Approach:** Call `z.toJSONSchema(schema, { target: "draft-2020-12" })`, then a single recursive
normalizer that: deletes any `$schema` key; rewrites `{ anyOf: [{type:"T"},{type:"null"}] }` (scalar
nullable) to `{ type: ["T","null"] }`, preserving sibling `description`; and deletes a `maximum`
exactly equal to `Number.MAX_SAFE_INTEGER` (9007199254740991) on `integer`/`number` nodes. Return as
`JsonSchema` (`Record<string, unknown>`). No `target` parameter, no provider branching (KTD4). Keep
the file short and declarative; document each normalization with the provider-dialect reason.

**Patterns to follow:** the existing `JsonSchema` type and `deepStripNullBytes` recursive-walk style in
`LiteLlmForcedToolClient.ts`.

**Test scenarios:**

- nullable scalar (`z.string().nullable()`) → `type:["string","null"]`, no `anyOf`, description kept.
- unbounded `.int().min(0)` → `minimum:0`, **no** `maximum`; bounded `.int().min(1).max(n)` → keeps
  `maximum:n`.
- `.strict()` object → `additionalProperties:false`, all props in `required`; no `$schema` key.
- `.refine()` on an array item is silently dropped from the schema (validator keeps it).
- `z.enum([...])` → `{type:"string", enum:[...]}`; `.describe()` survives on enum-bearing properties.

**Verification:** `tsx --test` green; the function imports only `zod` + the `JsonSchema` type.

---

### U2. Convert the 12 static tools to zod-source; collapse `blockEvidence`

**Goal:** Replace each static JSON Schema `const` with `toForcedToolSchema(validator)`, moving every
`description` into `.describe()` on the validator and collapsing `blockEvidence` to one object — then
prove parity-modulo-tightenings and delete the legacy const in the same unit (rule 18).

**Requirements:** R1, R5, R7, R10, R12.

**Dependencies:** U1.

**Files:**

- `packages/infrastructure-litellm/src/toolSchemas.ts` (the 12 non-bounded tools: discovery, CEP,
  generated-grounding, missing-prerequisite, intrinsic-difficulty, definition-entailment,
  definition-passage-quality, admission-label, rescue-durability, minting-durability,
  node-merge, option-select).
- `packages/infrastructure-litellm/src/toolSchemas.migration.test.ts` (new, **transient** scaffold).

**Approach:** Define `const blockEvidence = z.object({ blockId: z.string().min(1).describe(…),
evidenceQuote: z.string().min(1).describe(…) }).strict()` once and reuse it. For each tool, author the
validator with `.describe()` carrying the exact legacy `description` text, then
`export const xSchema = toForcedToolSchema(xValidator)`. The migration test captures each legacy const
(copied into the test as the baseline before deletion) and asserts the generated schema deep-equals it
**modulo an allowed-difference list**: `minLength` present where the validator has `.min(1)`, and any
node ordering. Once green per tool, delete that legacy const. Delete the migration test file at the
end of the unit (it references removed consts; the permanent guards are U4).

**Patterns to follow:** existing zod validators in `toolSchemas.ts` (the `.strict()` + `.min(1)`
conventions); keep the section comments that explain each tool's intent.

**Test scenarios (in the transient migration test):**

- Each generated schema deep-equals its legacy baseline except for the allowed `minLength` deltas.
- The nullable `literalValue` (CEP `optionalTypedAssertionSchema`) generates `type:["string","null"]`.
- `blockEvidence`-bearing schemas (discovery `mentions`, admission `evidence`, CEP
  `definitions`/`mentions`) all carry the two shared descriptions identically.

**Verification:** `tsx --test` green; `grep -c "additionalProperties: false" toolSchemas.ts` → only the
hand-written count that remains is **0** for migrated tools (all generated); `intrinsicDifficulty`
neutrality test still passes; no legacy static JSON const remains for these 12 tools.

---

### U3. Convert the 3 runtime-bounded builders (symmetric enum)

**Goal:** `buildPrerequisiteOrderingSchema`, `conceptAdmissionSchemaForCandidateKeys`,
`conceptCoreSelectionSchemaForCandidateKeys` derive from their zod builders through the seam, and the
candidate-key `enum` now flows to the validator too (R5 — closes Problem Frame #2).

**Requirements:** R5, R8, R10.

**Dependencies:** U1, U2.

**Files:**

- `packages/infrastructure-litellm/src/toolSchemas.ts` (the 3 builders + their validators).

**Approach:** Make each `buildXValidator(params)` the single source and `buildXSchema(params) =
toForcedToolSchema(buildXValidator(params))`. For the candidate-key field use `keys && keys.length ?
z.enum(keys as [string, ...string[]]) : z.string().min(1)` (admission's no-keys path stays a free
string; guard the empty array). The prerequisite-ordering `.refine()` ("two different numbers") stays
on the validator and is correctly dropped from the generated schema by U1. Re-run the U2-style
deep-diff for these three (the candidate-key `enum` now appears on the validator — a deliberate,
reviewed delta), then delete the legacy bounded JSON-schema bodies.

**Patterns to follow:** the current builder signatures (preserve them exactly — `enrichmentAdapters.ts`
and the worker call `buildPrerequisiteOrderingSchema(n)` / `…ForCandidateKeys(...)`).

**Test scenarios:**

- `buildPrerequisiteOrderingValidator(n)` rejects equal endpoints (refine intact) and the schema bounds
  `[1,n]`; out-of-range index still re-prompts then fails closed.
- `conceptAdmissionSchemaForCandidateKeys(["a","b"])` emits `enum:["a","b"]` and the matching validator
  **now rejects** an out-of-set `parentCandidateKey`; the no-args form emits a free string both sides.
- `conceptCoreSelectionSchemaForCandidateKeys([...])` keeps `maxItems: keys.length`.

**Verification:** `tsx --test` green; `enrichmentAdapters.test.ts` (uses
`buildPrerequisiteOrderingValidator`, `mintingDurabilityJudgmentValidator`) still passes unchanged.

---

### U4. Registry + permanent structural-invariant and domain-neutrality tests

**Goal:** Two tests that hold for **every** tool (current and future), driven by one exported registry
of validators.

**Requirements:** R9.

**Dependencies:** U2, U3.

**Files:**

- `packages/infrastructure-litellm/src/toolSchemas.ts` — `export const toolValidators` (an array of
  every validator, with the 3 bounded ones instantiated at representative params, e.g.
  `buildPrerequisiteOrderingValidator(3)`).
- `packages/infrastructure-litellm/src/toolSchemas.test.ts` (new or extended).

**Approach:** For each validator, generate via `toForcedToolSchema` and assert: root `type:"object"`;
recursively, every `type:"object"` node has `additionalProperties:false` and lists every `properties`
key in `required` (the strict-forced-tool invariant — this is the durable guard against the
`.optional()` footgun, which would silently drop a field from `required`); no `$schema`; no scalar
`anyOf`-null. Second test: the serialized generated schema contains none of the fixture terms the
existing intrinsic-difficulty test lists (`ownership`, `rust`, `market`, `economics`, `instructkg`,
`meselson`, `aira`) — generalizing rule-17 coverage from 1 tool to all (KTD7: test-only registry).

**Patterns to follow:** `intrinsicDifficultyAdapters.test.ts:64-71` (the existing neutrality check) —
generalize its fixture-term list across the registry.

**Test scenarios:** all current tools pass both invariants; a deliberately `.optional()`-broken local
fixture fails the structural test (proves the guard bites).

**Verification:** `tsx --test` green; intentional-break spike fails as expected, then is removed.

---

### U5. Real-use validation (rule 13/14)

**Goal:** Confirm the generated schemas behave on the **production** path, with attention to the two
deltas the symmetric contract introduces.

**Requirements:** R2, R11, R13.

**Dependencies:** U1–U4.

**Files:** none (evidence to `tmp/2026-06-29-forced-tool-schema/` and TODO VALIDATION).

**Approach:** Load `DATABASE_URL` (per AGENTS rule 14) and run a real extraction through the production
DeepSeek V4 Flash forced-tool path on a curated source, exercising at least: discovery → admission
(bounded enum) → CEP (the nullable `literalValue`) → enrichment prerequisite-ordering (bounded `[1,n]`
+ refine). Confirm: the `anyOf`→`type:["string","null"]` fold is accepted by the provider; `minLength`
reaching generation does not spuriously abort the must-be-nonempty fields; the now-symmetric
candidate-key `enum` produces no spurious validation failures (no out-of-set retries). Inspect real
output, not just a green suite (ADR-0013).

**Patterns to follow:** prior real-run trails in TODO VALIDATION (e.g. the `tmp/2026-06-26-rescue-seam/`
inspection).

**Verification:** a clean real run with verbatim-verifiable output; on completion, fold the seam into
[ADR-0006](../adr/0006-use-forced-named-tool-schemas.md), record VALIDATION in `TODO.md`, and delete
this plan (plans README lifecycle).

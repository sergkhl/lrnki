---
title: "feat: CEP Definition-Passage quality judge (layer A)"
date: 2026-06-24
type: feat
status: ready
origin: docs/brainstorms/2026-06-24-cep-definition-quality-judge-requirements.md
depth: standard
deepened: 2026-06-24
---

# feat: CEP Definition-Passage quality judge (layer A)

## Summary

Add a measured, drop-only neural **Definition-Passage quality judge** that runs after the deterministic verbatim floor and vetoes definition passages that are verbatim-grounded but convey no meaning — a bare repetition of the concept's name, a heading/title, or a citation/bibliographic snippet. A veto removes the hollow passage; if it removes a core Concept's *last* definition, the Concept flows through the **existing** ungroundable demotion (core→optional, not published, run still succeeds, loud quality issue) and re-enters only via the **existing** rescue path as a derived node. Fail-closed always preserves recall. Each per-passage verdict is recorded — with a structural veto **category** — in the run trace so the demotions are auditable and become the measurement substrate for the layer-B retrieval/chunking investigation (TODO #3).

This is the fourth instance of an established codebase pattern: a forced-tool, cross-family (`kg-independent-judge`) judge with a fail-closed boundary validator, composed as a pure application stage after the deterministic floor — mirroring `applyAssertionEntailmentJudge`, `applyAdmissionLabelJudge`, and the rescue durability judge.

---

## Problem Frame

A CEP must carry at least one verified **Definition Passage**, and an admitted core Concept with no verified Definition Passage cannot be published (`packages/application/src/buildGraphVersion.ts:61`, `:292`). But the required Definition Passage has only **two** gates today:

1. the deterministic **verbatim floor** — the quote must exist in its cited block (`packages/application/src/applyEvidenceProfilePolicy.ts:33`); and
2. the **assertion-entailment judge** (`judgeDefinition`), which fires only for the *optional* `defines` typed assertion's model-authored literal — never for the required Definition Passage itself.

So a passage that is verbatim-grounded but conveys no meaning is accepted as a definition. Real-use inspection (`tmp/2026-06-18-structure-aware-neighborhood/rule-14-evaluation.md`, AIRA-dojo Markdown run) found exactly this: `Graph-based Search Framework` cited from a **heading block**, `Evolutionary Search` cited from a **related-work citation phrase**. The extractor prompt already forbids heading/title passages (`packages/infrastructure-litellm/src/extractionAdapters.ts:297`), but a prompt instruction is not a gate (AGENTS rules 16/19) and the defect persists in real output.

This plan delivers the **disposition layer only** (layer A). Whether such concepts are genuinely undefined or merely have their definition split across a chunk boundary is a separate retrieval/representation question (TODO #3, layer B, research-first per rule 21) and is explicitly out of scope. Layer A's per-passage dispositions and the distinct reason code are the inputs layer B's measurement gate consumes.

---

## Requirements traceability

Carried from the origin requirements doc (`docs/brainstorms/2026-06-24-cep-definition-quality-judge-requirements.md`):

| Origin decision / criterion | Where addressed |
| --- | --- |
| D1 — measured neural Definition-Passage quality judge, drop-only, cross-family, forced tool, domain-neutral rubric | U2 (port), U3 (schema + adapter), U4 (stage) |
| D2 — composed as an application stage **after** the verbatim floor, never bypassing a port | U4 (stage placement), U5 (orchestration wiring) |
| D3 — fail-closed = preserve recall (transport / invalid args / ungrounded span → keep) | U3 (adapter grounding), U4 (stage keep-on-failure) |
| D4 — veto drops the passage; last-passage veto routes into the **existing** demotion | U4 (drop transform + hollow-key signal), U5 (reconcile routing + quality issue) |
| D5 — dropped Concepts re-enter only via the existing rescue path | U6 (rescue-pool verification) |
| D6 — core-shrinking accepted and surfaced via the existing quality issue | U5 (quality issue) |
| D7 — bump the extraction config hash | U5 (`PIPELINE_CONFIG_HASH`) |
| Success: per-passage dispositions inspectable/replayable in the run trace | U1 (disposition type), U5 (threaded onto `ExtractionRunResult` → artifact JSONB) |
| Open question: distinct reason code for quality-demotion | U1 (`CORE_DEMOTED_HOLLOW_DEFINITION_REASON`) — **resolved: yes** (KTD3) |
| Open question: per-passage vs per-Concept batched call | U3 — **resolved: batched per Concept** (KTD4) |
| Open question: ADR placement | U6 — **resolved: extend ADR-0007 in place** (KTD7) |
| Open question: rubric strictness | Calibrated in U5 real-use eval; start permissive (KTD6) |

---

## Key Technical Decisions

**KTD1 — Stage placement: after the verbatim floor, before the assertion-entailment judge.**
The new stage consumes `RunEvidenceProfile[]` produced by `applyEvidenceProfilePolicy` (the verbatim floor) and runs before `applyAssertionEntailmentJudge` in `executeExtractionRun`. The floor guarantees every passage handed to the judge is already verbatim-verified (so the judge never has to re-verify grounding, only meaning), and running before reconciliation means the recomputed `complete` flag flows naturally into the existing `reconcileUngroundableCores` demotion. *Rationale:* this is the same compositional slot the brainstorm specifies (D2) and mirrors how the assertion judge sits after the floor.

**KTD2 — Judge only `core`-tier profiles.**
Only core Concepts gate publication on a complete Definition Passage (`buildGraphVersion.ts:61`); `reconcileUngroundableCores` only demotes keys that were core. Optional profiles' definitions never affect the published core, so judging them spends tokens for no disposition consequence. The stage filters `profile.tier === "core"` and passes optional/other profiles through untouched. *Rationale:* tightest cost and scope consistent with the precision-of-published-core intent.

**KTD3 — Distinct reason code `core_demoted_hollow_definition` (open question → yes).**
A Concept demoted because its only definition was hollow carries a **different** boundary reason code from the existing `core_demoted_ungroundable` ("the extractor never produced a verifiable definition at all"). *Rationale:* beyond operator clarity, this is the measurement hook TODO #3's research-first gate needs — layer B must quantify "genuinely never defined" vs "definition fragmented across a chunk boundary," and the two reason codes are exactly that split. The new constant is exported from `domain-core` so the demotion writer and every reader (quality-issue detector, Admin Lab) share one token (mirrors the existing `CORE_DEMOTED_UNGROUNDABLE_REASON` discipline, rule 18).

**KTD4 — Batched per Concept, one call per profile (open question → batched).**
One judge call per core Concept that judges all of that Concept's Definition Passages together, returning a per-passage verdict. *Rationale:* shared subject context (the same canonical label + aliases + cited blocks) is established once; matches the one-unit-per-profile shape of every other CEP stage; bounded fan-out via the existing `mapWithConcurrency`. Verdict-to-passage mapping is by stable index, validated at the boundary.

**KTD5 — Vetoed passages are dropped entirely, not folded into mentions (call-out → drop).**
Unlike `applyAssertionEntailmentJudge` (which preserves a rejected assertion's passage as a mention because it may still be a legitimate mention), a passage vetoed *here* is a bare name, heading, title, or citation — low value as a mention and noise in the learner-facing layer. The rescue path reads the candidate's **discovery** mentions (`concept_candidate_mentions`), not CEP mentions, so dropping does not impair rescue. *Rationale:* honors D4's literal wording ("removed from the Concept's Definition Passages"), keeps the published evidence clean, and does not touch the rescue substrate.

**KTD6 — Fail-closed = keep, grounded the same way as the assertion/label judges (D3).**
The judge returns, per passage, `establishesMeaning: boolean`, a structural `category`, and a verbatim `judgedSpan` it based the verdict on. A **veto** is honored only when `establishesMeaning` is false **and** `judgedSpan` is a verbatim substring of the passage under `evidenceQuoteMatches`. Transport failure, invalid tool arguments, or an ungrounded span all resolve to **keep** with a recorded `judge_unavailable` (or `ungrounded`) disposition. *Rationale:* a transport blip must never silently shrink the published core (D3); requiring the span to ground proves the judge read the actual passage rather than hallucinating, exactly as `groundedJudgment` / `groundedAdmissionLabelJudgment` already do.

**KTD7 — Veto category surfaced to the judge as context, never as a deterministic gate (rules 16/17).**
The cited block's `blockType` and `headingPath` are passed to the judge as **context** so it can recognize heading/title/citation structure, and the judge returns one of `establishes_meaning | bare_name_repetition | heading_or_title | citation_or_bibliographic`. The application **never** vetoes deterministically on `blockType === "heading"` — that would be a hardcoded symbolic gate (rule 16). Block structure informs a neural judgment; it does not make one. The categories name no fixture concept (rule 17).

**KTD8 — Trace persistence via the run artifact JSONB; no schema migration (call-out → artifact-only).**
Per-passage dispositions are added to `ExtractionRunResult` and therefore captured in the immutable artifact envelope payload (`executeExtractionRun.ts:155`, rule 7 JSONB envelope), which is replayable for rule-14 inspection. No new relational table or column, so the single initial migration is untouched (rule 8). *Rationale:* the success criterion is "inspectable/replayable in the run trace," which the artifact already satisfies; a relational surface can be added later if Admin Lab needs to query dispositions, but it is not required now.

**KTD9 — Extend ADR-0007 in place; no new ADR (open question → extend).**
This is the same architectural pattern ADR-0007 already governs (a measured neural judge after the deterministic floor, fail-closed-preserve), applied to the required Definition Passage. A new ADR would fragment one decision across two documents. *Rationale:* lightest change; layer B (retrieval/chunking) will warrant its own ADR when it lands.

---

## High-Level Technical Design

The new stage slots into the existing `executeExtractionRun` pipeline between the deterministic floor and the assertion judge. Everything downstream of the recomputed `complete` flag already exists.

```
executeExtractionRun (per source)
  Stage 1  discovery
  Stage 2  admission (+ admission-label judge)
  Stage 3  CEP extraction ─▶ applyEvidenceProfilePolicy  [VERBATIM FLOOR]
                                      │  RunEvidenceProfile[]  (definitions all verbatim-verified)
                                      ▼
        ┌──────────── NEW: applyDefinitionPassageQualityJudge ────────────┐
        │  for each profile where tier === "core":                        │
        │    judge all definition passages in ONE batched call            │
        │    keep  ▶ establishesMeaning && judgedSpan grounds             │
        │    veto  ▶ drop passage (KTD5)                                  │
        │    fail  ▶ keep (KTD6)  + disposition(judge_unavailable)        │
        │  recompute complete = definitions.length >= 1                   │
        │  emit: profiles', dispositions[], hollowDefinitionKeys          │
        └────────────────────────────┬───────────────────────────────────┘
                                      ▼
  Stage 4  applyAssertionEntailmentJudge        (unchanged)
                                      ▼
        reconcileUngroundableCores(hollowDefinitionKeys)   ◀── reason-code routing (U5)
          complete=false & hollow  ▶ optional + core_demoted_hollow_definition
          complete=false otherwise ▶ optional + core_demoted_ungroundable   (existing)
                                      ▼
  detectExtractionQualityIssues  ▶ loud hollow-definition quality issue (U5)
  persist runResult (+ dispositions) ▶ artifact JSONB                        (replayable)
                                      ▼
        ── later: buildGraphVersion drops the demoted (now-optional) Concept
        ── later: runGraphEnrichment.mentionedNonCoreCandidates ▶ rescue pool ▶ rescue durability judge
```

Directional guidance, not implementation specification.

---

## Implementation Units

### U1. Domain types, veto category, distinct reason code, disposition record

**Goal:** Add the domain vocabulary the judge, the stage, and persistence all share, with no behavior change.

**Requirements:** D1, D4 (reason code), success (dispositions inspectable). KTD3, KTD8.

**Dependencies:** none.

**Files:**
- `packages/domain-core/src/index.ts` (modify)
- `packages/domain-core/src/index.test.ts` or the nearest existing domain-core test file (add) — type-shape/exhaustiveness only

**Approach:**
- Add `DefinitionPassageVetoCategory = "establishes_meaning" | "bare_name_repetition" | "heading_or_title" | "citation_or_bibliographic"` (domain-neutral structural categories, rule 17).
- Add `DefinitionPassageQualityJudgment = { establishesMeaning: boolean; category: DefinitionPassageVetoCategory; judgedSpan: string; rationale: string }`.
- Add `DefinitionPassageDispositionKind = "kept" | "vetoed" | "kept_judge_unavailable"`.
- Add `DefinitionPassageDisposition = { candidateKey: string; sourceBlockId: string; evidenceQuote: string; disposition: DefinitionPassageDispositionKind; category: DefinitionPassageVetoCategory; rationale: string }` (mirror `RescueDisposition` at `index.ts:850`).
- Add exported constant `CORE_DEMOTED_HOLLOW_DEFINITION_REASON = "core_demoted_hollow_definition"` next to `CORE_DEMOTED_UNGROUNDABLE_REASON` (`index.ts:452`), with a matching comment that one token is shared by the writer and all readers.
- Extend `ExtractionRunResult` (`index.ts:454`) with `definitionQualityDispositions: DefinitionPassageDisposition[]`.

**Patterns to follow:** the existing `RescueDisposition` / `MintingDisposition` shapes (`index.ts:842–874`) and the `CORE_DEMOTED_UNGROUNDABLE_REASON` export comment (`index.ts:446–452`).

**Test scenarios:**
- Type-level exhaustiveness: a `switch` over `DefinitionPassageVetoCategory` compiles with no `default` (catches a future added category). `Test expectation: compile-time` — if domain-core has no runtime behavior to assert here, annotate `none -- type-only additions, exercised by U3/U4 tests`.

---

### U2. `DefinitionPassageQualityJudgmentPort`

**Goal:** Declare the port the application stage depends on, so domain/application never reference an adapter.

**Requirements:** D1, D2 (never bypass a port).

**Dependencies:** U1.

**Files:**
- `packages/ports/src/index.ts` (modify)

**Approach:**
- Add `DefinitionPassageQualityJudgmentPort` with `readonly model: string` and a batched method:
  `judgeDefinitions(input: { declaredDomain: string; subject: { canonicalLabel: string; aliases: string[] }; passages: { sourceBlockId: string; evidenceQuote: string; blockType: string; headingPath: string[] }[] }): Promise<DefinitionPassageQualityJudgment[]>` — one judgment per input passage, index-aligned.
- Document it like `AssertionEntailmentJudgmentPort` (`ports/src/index.ts:83`): bounded, forced-tool, independent model family, drop-only, fail-closed-preserve.

**Patterns to follow:** `AssertionEntailmentJudgmentPort` and `AdmissionLabelJudgmentPort` (`ports/src/index.ts:91`, `:110`).

**Test scenarios:** `Test expectation: none -- interface declaration, no behavior; covered by U3 adapter contract and U4 stage tests.`

---

### U3. Forced-tool schema, boundary validator, LiteLLM adapter, stage tag

**Goal:** A measured, domain-neutral, cross-family adapter that judges a Concept's Definition Passages in one batched call and grounds its verdicts fail-closed at the boundary (rule 6).

**Requirements:** D1, D3, D7-adjacent (stage tag). KTD4, KTD6, KTD7.

**Dependencies:** U1, U2.

**Files:**
- `packages/infrastructure-litellm/src/toolSchemas.ts` (modify) — `definitionPassageQualityJudgmentSchema` + `definitionPassageQualityJudgmentValidator`
- `packages/infrastructure-litellm/src/extractionAdapters.ts` (modify) — `LiteLlmDefinitionPassageQualityJudgmentAdapter`, `DEFINITION_PASSAGE_QUALITY_JUDGE_MODEL = "kg-independent-judge"`
- `packages/infrastructure-litellm/src/stageTags.ts` (modify) — add `definitionPassageQuality: "definition-passage-quality"` to `STAGE_TAGS`
- `packages/infrastructure-litellm/src/index.ts` (modify) — export the adapter
- `packages/infrastructure-litellm/src/toolSchemas.test.ts` (add/modify) — validator boundary tests

**Approach:**
- **Schema:** a single forced tool `submit_definition_passage_quality_judgments` whose argument is `{ judgments: [{ index: integer, establishesMeaning: boolean, category: enum(...4...), judgedSpan: string, rationale: string }] }`, `additionalProperties: false`, all fields required. Mirror the `definitionEntailmentJudgmentSchema` shape (`toolSchemas.ts:477`). The `category` and `establishesMeaning` `description` fields express a **domain-neutral rubric only** (rule 17) — they name no fixture concept; "bare repetition of the concept's own name, a section heading or title, or a citation/bibliographic reference" stated abstractly.
- **Validator:** strict zod object, `judgments` array, each with the five fields; `rationale` `.min(1)`.
- **Adapter `judgeDefinitions`:** build a system prompt stating the meaning-quality rubric (defining properties, distinguishing criteria, mechanism, or contrast = establishes meaning; bare name / heading / title / citation = does not), and a user prompt listing each passage with its `[index]`, verbatim quote, `blockType`, and `headingPath` as **context** (KTD7). Tag the request `STAGE_TAGS.definitionPassageQuality`. After the call, ground each verdict fail-closed: a negative (`establishesMeaning === false`) is honored only when `judgedSpan` matches the passage via `evidenceQuoteMatches`; otherwise coerce to `establishesMeaning: true, category: "establishes_meaning"` (keep) with an annotated rationale — mirroring `groundedAdmissionLabelJudgment` (`extractionAdapters.ts:485`). Index gaps or out-of-range indices coerce to keep.

**Patterns to follow:** `LiteLlmAssertionEntailmentJudgmentAdapter` (`extractionAdapters.ts:358`) for the forced-tool call + grounding; `groundedAdmissionLabelJudgment` (`:485`) for the fail-closed-to-keep coercion; `STAGE_TAGS` append-only discipline (`stageTags.ts`).

**Execution note:** the adapter is exercised by real model calls in U5's rule-14 eval, not by a unit test asserting its verdicts (rule 11). Unit tests here cover only the **validator** (deterministic envelope).

**Test scenarios** (`toolSchemas.test.ts`, deterministic boundary only):
- Valid batched argument with two judgments parses.
- Missing `category` rejected; unknown enum value for `category` rejected; extra property rejected (`additionalProperties: false`); empty `rationale` rejected.
- `Covers` rule 6: the validator fails closed on a malformed forced-tool argument.

---

### U4. Application stage `applyDefinitionPassageQualityJudge` + reconcile reason-code routing

**Goal:** The pure, drop-only transform: judge core profiles' definitions, drop ungrounded-hollow passages, recompute `complete`, emit per-passage dispositions and the set of keys whose **last** definition was vetoed; and teach `reconcileUngroundableCores` to stamp the distinct reason code for those keys.

**Requirements:** D1, D3, D4. KTD1, KTD2, KTD5, KTD6, KTD3.

**Dependencies:** U1, U2.

**Files:**
- `packages/application/src/applyDefinitionPassageQualityJudge.ts` (add)
- `packages/application/src/applyDefinitionPassageQualityJudge.test.ts` (add)
- `packages/application/src/reconcileUngroundableCores.ts` (modify) — accept `hollowDefinitionKeys: Set<string>` and choose the reason code per key
- `packages/application/src/reconcileUngroundableCores.test.ts` (modify)
- `packages/application/src/index.ts` (modify) — export the stage

**Approach:**
- Signature: `applyDefinitionPassageQualityJudge(input: { profiles: RunEvidenceProfile[]; declaredDomain: string; conceptsByKey: Map<string, { canonicalLabel: string; aliases: string[] }>; blockContextById: Map<string, { blockType: string; headingPath: string[] }>; judge: DefinitionPassageQualityJudgmentPort; concurrency?: number }): Promise<{ profiles: RunEvidenceProfile[]; dispositions: DefinitionPassageDisposition[]; hollowDefinitionKeys: Set<string> }>`.
- For each profile: if `tier !== "core"` or `definitions.length === 0`, pass through and record nothing (KTD2). Otherwise call `judge.judgeDefinitions` once with all definition passages; wrap in `try/catch` — a throw means **keep every passage** with `kept_judge_unavailable` dispositions (KTD6). Build the surviving definitions list (kept passages only, original order), recompute `complete = survivors.length >= 1`. If the profile started with ≥1 definition and ends with 0, add its `candidateKey` to `hollowDefinitionKeys`.
- Return new profile objects (immutable, object identity preserved for untouched profiles), like `reconcileUngroundableCores`.
- **`reconcileUngroundableCores`:** add a `hollowDefinitionKeys: Set<string>` parameter; for a demoted key, stamp `CORE_DEMOTED_HOLLOW_DEFINITION_REASON` when the key is in that set, else the existing `CORE_DEMOTED_UNGROUNDABLE_REASON`. Keep the single-writer invariant — the judge stage never mutates `admission.tier`; it only flips `complete` and reports keys.

**Patterns to follow:** `applyAssertionEntailmentJudge` (`applyAssertionEntailmentJudge.ts`) for the per-profile concurrency map + immutable rebuild + canned-judge test fixtures; `reconcileUngroundableCores` (`reconcileUngroundableCores.ts`) for the immutable demotion + reason-code stamping.

**Execution note:** Implement the drop transform test-first against a canned judge port (the canned response is **input** to the deterministic transform, never the asserted output — rule 11).

**Test scenarios** (`applyDefinitionPassageQualityJudge.test.ts`):
- *Happy keep:* judge returns `establishesMeaning: true` for the sole definition → profile unchanged, `complete` stays true, one `kept` disposition.
- *Drop non-last:* a profile with two definitions, judge vetoes one (grounded `judgedSpan`) → surviving definition remains, `complete` stays true, key **not** in `hollowDefinitionKeys`, dispositions `[vetoed, kept]` in order.
- *Drop last → hollow:* sole definition vetoed (grounded) → `definitions` empty, `complete` false, key in `hollowDefinitionKeys`, disposition `category` reflects the judge's structural category.
- *Fail-closed throw:* judge throws → all passages kept, `complete` unchanged, dispositions `kept_judge_unavailable`, key absent from `hollowDefinitionKeys`.
- *Fail-closed ungrounded veto:* canned judge returns `establishesMeaning: false` with a `judgedSpan` absent from the passage → passage **kept** (coercion happens in the adapter; here assert the stage keeps whatever the port returns as `establishesMeaning: true`). *(Note: ungrounded coercion is the adapter's job — U3; this scenario guards the stage trusts the port's grounded verdict.)*
- *Tier filter:* an `optional`-tier profile is returned untouched with no dispositions and is never passed to the judge (assert the canned judge's call count).
- *Index/verdict mapping:* batched judge returns verdicts for a 3-definition profile; assert each verdict maps to the correct passage.

**Test scenarios** (`reconcileUngroundableCores.test.ts`):
- Hollow key (in `hollowDefinitionKeys`, incomplete profile) → demoted with `CORE_DEMOTED_HOLLOW_DEFINITION_REASON`.
- Non-hollow incomplete core (not in the set) → demoted with `CORE_DEMOTED_UNGROUNDABLE_REASON` (regression: existing behavior preserved).
- A key both incomplete-from-extractor and hollow cannot occur (hollow implies it had ≥1 definition); assert the empty-`hollowDefinitionKeys` call equals the pre-change behavior.

---

### U5. Wire the stage into `executeExtractionRun`, thread dispositions, emit the quality issue, wire the worker, bump the config hash

**Goal:** Make the stage live in the real pipeline, persist its dispositions, surface the hollow-definition demotion as a loud quality issue, and mark the new behavior in the config hash.

**Requirements:** D2, D4, D6, D7, success (dispositions persisted). KTD1, KTD8.

**Dependencies:** U3, U4.

**Files:**
- `packages/application/src/executeExtractionRun.ts` (modify)
- `packages/application/src/executeExtractionRun.test.ts` (modify)
- `packages/application/src/detectExtractionQualityIssues.ts` (modify)
- `packages/application/src/detectExtractionQualityIssues.test.ts` (modify)
- `packages/application/src/runExtractionOverSources.ts` (modify) — thread the new port through
- `apps/kg-worker/src/knowledgeGraphWorker.ts` (modify) — instantiate the adapter, pass the port, bump `PIPELINE_CONFIG_HASH`

**Approach:**
- Add `definitionPassageQualityJudge: DefinitionPassageQualityJudgmentPort` to the `executeExtractionRun` input and to `runExtractionOverSources` pass-through.
- Insert the stage between Stage 3 (`applyEvidenceProfilePolicy` results) and Stage 4 (`applyAssertionEntailmentJudge`): build `blockContextById` from `document.blocks` (`{ blockType, headingPath }`), call `applyDefinitionPassageQualityJudge`, then feed its `profiles` into the assertion judge, and pass its `hollowDefinitionKeys` into `reconcileUngroundableCores`.
- Set `runResult.definitionQualityDispositions` from the stage output so it lands in the artifact payload (KTD8). No persistence-layer change (artifact JSONB already stores the full `runResult`; the relational `persist` path in `PostgresStores.ts` is unaffected because the dropped passages simply are not in `profile.definitions`).
- **`detectExtractionQualityIssues`:** add a branch that, for any candidate carrying `CORE_DEMOTED_HOLLOW_DEFINITION_REASON`, emits an `ExtractionQualityIssue` with a distinct `issueType` (e.g. `core_demoted_hollow_definition`), `severity` `critical` when `run.degraded` else `warning`, and a rationale naming "demoted because its only Definition Passage conveyed no meaning (bare name, heading, title, or citation)" — mirroring the existing ungroundable branch (`detectExtractionQualityIssues.ts:20`).
- **Worker:** `definitionPassageQualityJudge: new LiteLlmDefinitionPassageQualityJudgmentAdapter(deterministicClient)` (`knowledgeGraphWorker.ts:132` neighborhood), pass it into the run options (`:240` neighborhood), and bump `PIPELINE_CONFIG_HASH` (`:60`) to a new value (e.g. `definition-quality-judge-v1`).

**Patterns to follow:** how `assertionEntailmentJudge` / `admissionLabelJudge` are threaded (port in input → adapter in worker → stage call in `executeExtractionRun`); the existing ungroundable quality-issue branch.

**Execution note:** This unit is where the real-use quality evaluation (rule 14) runs after wiring — see the Real-use quality evaluation section. Restart `lrnki-litellm` is **not** needed (the `kg-independent-judge` alias is reused unchanged); only a config-hash bump.

**Test scenarios** (`executeExtractionRun.test.ts`, with canned ports):
- *Last-passage veto end-to-end:* canned definition-quality judge vetoes a core Concept's sole definition → that candidate ends `optional` with `CORE_DEMOTED_HOLLOW_DEFINITION_REASON`, its profile `complete: false`, `runResult.definitionQualityDispositions` contains the `vetoed` record, and the run `status` is still `succeeded`.
- *Surviving definition:* veto one of two definitions → candidate stays `core`, `complete: true`.
- *Fail-closed:* judge throws → no demotion, dispositions `kept_judge_unavailable`, run succeeds.
- *Dispositions on the artifact:* assert the persisted artifact payload (or the returned `runResult`) carries `definitionQualityDispositions`.

**Test scenarios** (`detectExtractionQualityIssues.test.ts`):
- A candidate with `CORE_DEMOTED_HOLLOW_DEFINITION_REASON` yields exactly one issue of the new `issueType`, distinct from the ungroundable issue.
- `severity` is `critical` when `degraded` and `warning` otherwise.
- A candidate with the old ungroundable reason still yields the old issue (regression).

---

### U6. Verify the rescue path includes demoted-hollow Concepts; amend ADR-0007

**Goal:** Confirm a demoted-hollow Concept reaches the existing rescue pool (D5), fix the query if it does not, and record the architectural decision.

**Requirements:** D5, KTD9.

**Dependencies:** U5.

**Files:**
- `packages/infrastructure-postgres/src/PostgresStores.test.ts` (modify) — extend the `mentionedNonCoreCandidates` integration test (`:480`)
- `packages/infrastructure-postgres/src/PostgresEnrichmentStores.ts` (modify **only if** the verification fails)
- `docs/adr/0007-extract-concept-evidence-profiles-in-concept-context.md` (modify)

**Approach:**
- The rescue query (`PostgresEnrichmentStores.ts:161`) selects candidates with `tier IN ('optional','reject')` and `NOT EXISTS` a persisted `definition` passage, joined to a `concept_candidate_mention`. A demoted-hollow Concept is `optional` (U5), has **no** persisted definition passage (the judge dropped it, so `persist` writes none — `PostgresStores.ts:169`), and retains its discovery mentions (`concept_candidate_mentions`, written at `:135`). It should therefore already qualify. **Verify this with an integration test before changing any SQL** — the requirement explicitly flags "a small query fix if it does not."
- If verification passes (expected), no SQL change; the unit is the test + the ADR amendment. If it fails, adjust the query minimally and document why.
- **ADR-0007 amendment:** add a section recording the Definition-Passage quality judge as a measured neural stage after the verbatim floor (fail-closed-preserve, drop-only), the distinct `core_demoted_hollow_definition` reason code, and the explicit boundary to layer B (this stage disposes; it does not retrieve). Note that layer B (TODO #3) will warrant its own ADR.

**Patterns to follow:** the existing `mentionedNonCoreCandidates` test (`PostgresStores.test.ts:480`), which already constructs an optional candidate with a mention and no definition.

**Execution note:** the integration test requires `DATABASE_URL`; it is `maybe(...)`-gated like its neighbors and skips cleanly without a database. State this caveat in the report if the DB is unavailable.

**Test scenarios:**
- *Rescue inclusion:* seed a run with a core candidate that was demoted to `optional` with `CORE_DEMOTED_HOLLOW_DEFINITION_REASON`, a discovery mention, and a profile with zero definition passages → `mentionedNonCoreCandidates(graphVersionId)` returns it with its mention. `Covers D5.`
- *Negative control:* a still-`core` candidate with a definition passage does **not** appear in the rescue pool.

---

## Scope Boundaries

**In scope:** the definition-quality judge (port, schema/validator, adapter, application stage), routing a last-passage veto into the existing ungroundable demotion with a distinct reason code, per-passage dispositions on the run trace, rescue-pool verification, the config-hash bump, and the ADR-0007 amendment. Deterministic-envelope tests only.

### Deferred to Follow-Up Work
- A relational surface for definition-quality dispositions (a `run_definition_quality_dispositions` table) and an Admin Lab view of them — only if operators need to **query** dispositions beyond replaying the artifact (KTD8 keeps them in the artifact JSONB for now).

### Out of scope (layer B / TODO #3, research-first per rule 21)
- Any retrieval/representation change: parent-child / hierarchical / overlapping semantic chunking, neighborhood re-pull on veto. Layer A disposes of Concepts the source genuinely does not define here; it does not try to find a *better* passage. Layer A's dispositions and the distinct reason code are the **inputs** to layer B's measurement gate.

### Out of scope (unchanged existing behavior)
- The optional `defines` assertion-entailment judge (shipped).
- Mention Passage quality (this is Definition Passages only).
- Difficulty, observability polish, embeddings, and graph growth.

---

## Risks & Mitigations

- **Over-veto shrinks the core too aggressively.** *Mitigation:* start with a permissive rubric (veto only clear non-definitions — bare names, headings, titles, pure citations) and calibrate strictness on real AIRA-dojo output (KTD6, rule 14). Fail-closed already biases toward keeping.
- **Judge hallucinates about text not in the passage.** *Mitigation:* a veto is honored only when its `judgedSpan` grounds in the passage (KTD6); ungrounded verdicts coerce to keep.
- **A transport blip silently shrinks the published core.** *Mitigation:* fail-closed = keep with a recorded `kept_judge_unavailable` disposition (D3); the end-to-end test asserts a throwing judge causes no demotion.
- **Reason-code drift between writer and readers.** *Mitigation:* one exported constant `CORE_DEMOTED_HOLLOW_DEFINITION_REASON` shared by the demotion writer, the quality-issue detector, and Admin Lab (rule 18, mirroring the ungroundable token).
- **Rubric overfits to the fixture.** *Mitigation:* domain-neutral structural categories naming no fixture concept; spot-check the tool `description` fields (rule 17, success criterion).

---

## Real-use quality evaluation

- **Milestone:** Definition-Passage quality judge live in `executeExtractionRun` (after U5), with the rescue path verified (U6).
- **Fixture and source type:** the AIRA-dojo Markdown run from `tmp/2026-06-18-structure-aware-neighborhood/` (the source where the defect was observed); add one genuine-definition control source to confirm recall is preserved.
- **Real model calls used:** yes (`kg-independent-judge` → gpt-oss-120b).
- **Result:** to be classified PASS / FIX_FIRST / EXPERIMENT_ONLY / BLOCKED after inspection.
- **Useful output to confirm (success criteria):**
  - heading-like `Graph-based Search Framework` and citation-like `Evolutionary Search` Definition Passages are vetoed; where one was the Concept's only definition, the Concept is demoted (not published with a hollow definition) and raises a loud quality issue with the distinct reason code;
  - a genuine adjacent-block definition (e.g. `Generalization Gap`, defined from `block-148`) is **not** vetoed — recall preserved;
  - demoted-but-mentioned Concepts appear as rescue candidates;
  - per-passage dispositions (with veto category) are inspectable in the run trace;
  - no transport failure silently demotes a Concept;
  - the judge rubric / tool `description` names no fixture concept (rule 17 spot-check).
- **Safe to continue downstream:** only after a PASS; a FIX_FIRST on over-veto or recall loss blocks layer B.

---

## Sources & Research (codebase)

- `packages/application/src/applyAssertionEntailmentJudge.ts` — the post-floor drop-only judge stage this mirrors.
- `packages/infrastructure-litellm/src/extractionAdapters.ts` (`LiteLlmAssertionEntailmentJudgmentAdapter`, `groundedAdmissionLabelJudgment`) — forced-tool call + fail-closed grounding pattern.
- `packages/application/src/applyEvidenceProfilePolicy.ts` — the verbatim floor; sets `complete = definitions.length >= 1`.
- `packages/application/src/reconcileUngroundableCores.ts` + `packages/domain-core/src/index.ts:452` — the existing demotion and reason-code token this extends.
- `packages/application/src/buildGraphVersion.ts:61`, `:292` — the core-completeness gate the demotion satisfies.
- `packages/infrastructure-postgres/src/PostgresEnrichmentStores.ts:161` — the rescue-pool query whose inclusion of demoted-hollow Concepts U6 verifies.
- `apps/kg-worker/src/knowledgeGraphWorker.ts:60`, `:132`, `:240` — worker wiring + `PIPELINE_CONFIG_HASH`.
- Origin requirements: `docs/brainstorms/2026-06-24-cep-definition-quality-judge-requirements.md`. Layer-B boundary: `docs/plans/TODO.md` #3.

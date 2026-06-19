---
title: "refactor: Measure the explicit-prerequisite-hint, then remove it if redundant"
type: refactor
date: 2026-06-18
origin: complexity review (2026-06-18, AGENTS rules 11/16 simplicity pass) — finding #2
---

# refactor: Measure the explicit-prerequisite-hint, then remove it if redundant

## Summary

The `explicit-prerequisite-hint` Optional Typed Assertion is one of exactly two CEP assertion types retained when ADR-0016 retired the relation registry. The `defines` literal clearly earns its keep (it carries a definition). The prerequisite hint is the marginal one: it is extracted, verbatim-checked, entailment-judged, published, and then handed to the enrichment prerequisite judge as "labeled evidence the judge MAY weigh." But the enrichment judge *already* reads each node's verbatim mention quotes and judges every same-domain pair exhaustively — and the hint is derived from a mention quote the judge also receives. The hypothesis: the hint duplicates signal the exhaustive judge already has, while carrying an extraction-schema field, an entailment-judge branch, and a publication-merge path.

This plan does **not** delete the hint up front. Following this codebase's norm (gate a mechanism behind a real measurement, as F3 was), it runs a deterministic A/B over inferred enrichment edges and removes the hint **only if** suppressing it does not change the derived prerequisite structure. If the hint *does* move edges, the plan stops at "keep, documented."

---

## Problem Frame

The hint's lifecycle touches five surfaces:

- **Extraction schema** — `packages/infrastructure-litellm/src/toolSchemas.ts:271-298`: the CEP tool exposes `explicit-prerequisite-hint` as an assertion enum value with `objectCandidateKey`.
- **Deterministic policy** — `packages/application/src/applyEvidenceProfilePolicy.ts:48-52`: emits the hint only when its object is a distinct admitted Concept and its evidence clears the verbatim floor.
- **Entailment judge** — `packages/application/src/applyAssertionEntailmentJudge.ts:67-75`: a `judgePrerequisiteHint` neural re-check that can only reject; a rejected hint's passage survives as a Mention.
- **Publication merge** — `packages/application/src/buildGraphVersion.ts:235-301`: unions hint assertions across runs into `PublishedTypedAssertion`s.
- **The only graph-affecting consumer** — `packages/application/src/runGraphEnrichment.ts:344-348`: `contextOf` maps an anchor's published assertions into the prerequisite judge's `assertions` input, resolving the hint object to a canonical label.

Critically, the hint **never** becomes a deterministic edge, numeric prior, or direction override (ADR-0019, `packages/ports/src/index.ts:205`). It is only soft evidence for one judge. And because a rejected or absent hint leaves its passage as a Mention, the enrichment judge sees the same verbatim text regardless. So the entire question reduces to: **does feeding the hint as a labeled assertion change the inferred prerequisite edge set versus feeding the same passages as plain mentions?** That is a deterministic, inspectable diff — exactly the kind of measurement rule 11 allows (we assert over the graph-algorithm output, not over model judgment content).

---

## Requirements

### Measurement (always runs)

- R1. A disposable, config-gated toggle suppresses anchor `assertions` in the enrichment prerequisite-judge context without altering any persisted artifact when off. Off is the default and the production path.
- R2. A real A/B enrichment runs the **same** published graph version twice — hints-fed vs. hints-suppressed — over the existing mixed-domain version (`ba7f5f9b-241c-4dc3-b265-904ac1bbcb7b` or a fresh equivalent), and diffs the inferred `inferred-prerequisite-of` edge sets (count, endpoints, direction, certain/uncertain split).
- R3. The result is recorded as a rule-14 evaluation note with the edge diff and a `REMOVE` / `KEEP` disposition. Evidence lives under disposable `tmp/` (AGENTS rule 10).

### Conditional removal (runs only on a `REMOVE` disposition)

- R4. The `explicit-prerequisite-hint` arm is removed from the CEP extraction tool schema, the deterministic policy, the entailment judge, the run/published assertion types, and the publication merge — leaving `defines` as the sole Optional Typed Assertion.
- R5. The enrichment context builder stops mapping anchor assertions of that type; the suppression toggle from R1 is removed (it has served its purpose).
- R6. CONTEXT.md, ADR-0016, and ADR-0019 are updated to record a single remaining assertion type and the measured basis for the cut. The extraction config hash and `enrichmentConfigHash` are bumped.
- R7. Workspace `typecheck` / `test` / `build` are green with no dangling references to the removed type.

---

## Key Technical Decisions

- KTD1. **Measure before cutting.** This codebase removes mechanisms on measured evidence, not on a plausibility argument (the F3 precedent). The hint might genuinely change edges; the A/B decides. (origin: review finding #2, user "measure-first")
- KTD2. **The metric is the deterministic edge diff, not a neural quality score.** Suppressing the hint changes one judge's *input*; the *output* we compare is the derived edge set, a graph-algorithm artifact. This stays on the allowed side of rule 11 — no test or measurement asserts the model's judgment content.
- KTD3. **Suppress at the enrichment context, not the extraction stage, for the A/B.** The cheapest reversible probe blanks `assertions` in `contextOf` for anchors; it needs no re-extraction and isolates the only graph-affecting consumer. Re-extraction would also remove the published artifact, conflating two effects.
- KTD4. **Keep `defines`.** It carries a definition literal with no equivalent elsewhere in the CEP; it is out of scope for removal regardless of the hint result.
- KTD5. **A null-or-trivial diff ⇒ REMOVE.** Because the underlying passage always survives as a Mention, an unchanged (or trivially changed) edge set means the hint adds cost without graph value. A material, defensible edge change ⇒ KEEP and document; do not partially remove.

---

## High-Level Technical Design

The probe adds one boolean to the enrichment configuration consumed only inside `contextOf`:

```text
runGraphEnrichment(version, { ..., suppressPrerequisiteHints?: boolean })
  contextOf(anchorNode):
    assertions = suppressPrerequisiteHints ? [] : profile.assertions.map(...)
```

Run A (default, `false`) and Run B (`true`) over the identical published version, then diff `layer.edges`. Everything else — node set, mention quotes, generated grounding — is identical between the two runs, so any edge delta is attributable to the hint signal alone.

If the diff is null/trivial, the removal units strip the hint end to end; `defines` and the verbatim floor are untouched.

---

## Scope Boundaries

### In scope
- The `explicit-prerequisite-hint` assertion type across extraction, policy, entailment, publication, and enrichment context.
- The disposable A/B toggle and its evaluation note.

### Deferred / out of scope
- The `defines` assertion — retained.
- Any change to the exhaustive same-domain pair judgment itself (ADR-0019) — the judge is the thing the hint feeds, not the thing under change.
- The published-assertion display surface in Admin Lab beyond removing a now-absent type (no redesign).

### Outside this product's identity
- Reintroducing a richer relation registry — explicitly retired (ADR-0016); this plan can only shrink the set, never grow it.

---

## Implementation Units

### U1. Add the disposable suppression toggle

- Goal: A config-gated probe that blanks anchor assertions in the enrichment prerequisite-judge context, default off.
- Requirements: R1
- Dependencies: none
- Files:
  - `packages/application/src/runGraphEnrichment.ts` — thread an optional `suppressPrerequisiteHints` flag into `contextOf`; when true, anchor `assertions` is `[]`. No persisted field changes; the flag is not part of `enrichmentConfigHash`.
- Approach: Smallest reversible change isolated to the context builder. Mark the flag with a comment as disposable measurement instrumentation to be removed in U4 (or on KEEP).
- Test scenarios (deterministic envelope): with the flag on, `contextOf` returns empty `assertions` for an anchor that has them; with it off, behavior is byte-identical to today. A stub-judge enrichment test confirms the node/edge set is otherwise unchanged between flag states for a fixture with no hints.
- Verification: focused `runGraphEnrichment` test passes; default path unchanged.

### U2. Run the A/B and record the disposition (rule 14)

- Goal: Produce the edge diff and a `REMOVE`/`KEEP` decision.
- Requirements: R2, R3
- Dependencies: U1
- Files: none in-tree; evidence under `tmp/2026-06-18-prerequisite-hint-ab/`.
- Approach: Real enrichment over one mixed-domain published version, twice (flag off, flag on), real LLM calls. Diff `inferred-prerequisite-of` edges: count, endpoint pairs, direction, certain/uncertain. Inspect any delta for whether the hint-fed edge is *better* (defensible) or merely *different*.
- Execution note: This is the rule-14 gate and the decision point. A null or trivial, non-improving diff ⇒ `REMOVE`. A material, defensible improvement ⇒ `KEEP` (stop after this unit; do U5 documentation-only).
- Test scenarios: none — human inspection of real model output; never an automated quality assertion (rule 11).
- Verification: an evaluation note records milestone, version id, both run ids, the edge diff, and the disposition.

### U3. (REMOVE only) Strip the hint from extraction, policy, entailment, and publication

- Goal: Remove the assertion type from every producing/storing surface, keeping `defines`.
- Requirements: R4, R7
- Dependencies: U2 = `REMOVE`
- Files:
  - `packages/infrastructure-litellm/src/toolSchemas.ts:261-298` — drop `explicit-prerequisite-hint` from the assertion enum and remove `objectCandidateKey`; tighten the description to `defines` only.
  - `packages/application/src/applyEvidenceProfilePolicy.ts:42-54` — remove the `else` hint branch; keep the `defines` and ungrounded-drop logic.
  - `packages/application/src/applyAssertionEntailmentJudge.ts:67-75` — remove `judgePrerequisiteHint`; the judge now only re-checks `defines`. Update the `AssertionEntailmentJudgmentPort` in `packages/ports/src/index.ts` accordingly.
  - `packages/domain-core/src/index.ts` — collapse `RunTypedAssertion` / `PublishedTypedAssertion` to the `defines` shape.
  - `packages/application/src/buildGraphVersion.ts:235-301` — remove the hint merge arm.
- Approach: Top-down from the schema so unused symbols surface in typecheck. Every rejected-hint passage already lands as a Mention, so no grounded evidence is lost by removal.
- Test scenarios: `applyEvidenceProfilePolicy` / `applyAssertionEntailmentJudge` / `buildGraphVersion` tests updated to the `defines`-only shape stay green; rule-6 fail-closed validation for `defines` args is unchanged.
- Verification: no `explicit-prerequisite-hint` / `objectCandidateKey` / `judgePrerequisiteHint` symbols remain outside docs.

### U4. (REMOVE only) Drop the hint from the enrichment context and remove the toggle

- Goal: The enrichment judge no longer receives hint assertions; the disposable toggle is gone.
- Requirements: R5, R7
- Dependencies: U3
- Files:
  - `packages/application/src/runGraphEnrichment.ts:344-348` — anchor `assertions` now carries only `defines` details (or empty); remove the `suppressPrerequisiteHints` flag added in U1.
- Approach: With the type gone, the context mapping simplifies; delete the probe.
- Test scenarios: `runGraphEnrichment` stub-judge test passes with the simplified context.
- Verification: workspace `typecheck` / `test` / `build` green (closes R7).

### U5. Documentation (both dispositions)

- Goal: Record the outcome durably.
- Requirements: R6
- Dependencies: U2 (KEEP) or U4 (REMOVE)
- Files:
  - `CONTEXT.md:55-57` — on REMOVE, redefine Optional Typed Assertion as the single `defines` type; on KEEP, add a one-line note that the hint was measured graph-affecting.
  - `docs/adr/0016-retire-relation-registry-keep-two-cep-assertions.md` — on REMOVE, amend to "one retained CEP assertion (`defines`); the prerequisite hint was measured redundant against the exhaustive enrichment judge and removed." On KEEP, record the measurement basis for retention.
  - `docs/adr/0019-graph-enrichment-derived-layer.md:205`-area `explicit-prerequisite-hint` reference — reconcile with the disposition.
  - `docs/plans/TODO.md` — fold the result into the active task list.
- Approach: ADR records the durable decision and its measured basis either way; this is the point of the measure-first approach.
- Verification: docs internally consistent with the chosen disposition.

---

## Open Questions

- **Threshold for "material" edge change** — resolved by inspection in U2, not by a numeric cutoff at plan time. The guiding test: does any hint-attributable edge represent a *correct* prerequisite the judge missed without it? If none do, REMOVE.
- **Cross-domain generality** — one mixed-domain version is the minimum; if the diff is borderline, add a second domain's version before deciding (scope-discipline: expand only if the first result is ambiguous).

---

## Risks & Dependencies

- **N=1 measurement.** A single version might under-represent hint value. Mitigation: the metric is structural and the passage-as-mention fallback bounds the downside; expand to a second version only on an ambiguous result.
- **Display regression.** Removing the published hint loses an Admin Lab artifact. Mitigation: the same passage remains a Mention Passage, so no evidence is lost; the loss is only a redundant typed label.
- **Depends on** the existing mixed-domain published version and the `kg-prerequisite-judgment` judge alias being available for the A/B.

---

## Success Criteria

- Measurement: a real hints-fed vs. hints-suppressed enrichment A/B over one published version, with the inferred-edge diff and a `REMOVE`/`KEEP` disposition recorded (rule 14).
- On REMOVE: `defines` is the sole Optional Typed Assertion; no hint symbol remains in code; verbatim floor and `defines` entailment unchanged; workspace green.
- On KEEP: the retention is recorded with its measured, edge-affecting basis in ADR-0016; no code removed.

---

## Sources & Research

- Hint production: `packages/application/src/applyEvidenceProfilePolicy.ts:42-54`.
- Hint entailment re-check: `packages/application/src/applyAssertionEntailmentJudge.ts:67-75`.
- Hint publication merge: `packages/application/src/buildGraphVersion.ts:235-301`.
- Only graph-affecting consumer: `packages/application/src/runGraphEnrichment.ts:324-348` (`contextOf`).
- Extraction schema: `packages/infrastructure-litellm/src/toolSchemas.ts:261-298`.
- Soft-evidence contract: `packages/ports/src/index.ts:205`; ADR-0019; ADR-0016.
- Definition of the assertion type: `CONTEXT.md:55-57`.

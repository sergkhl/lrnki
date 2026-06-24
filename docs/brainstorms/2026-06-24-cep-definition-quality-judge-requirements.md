# CEP Definition-Passage Quality Judge — Requirements

- **Date:** 2026-06-24
- **Status:** Ready for `/ce-plan`
- **Owner concept:** CEP Definition Passage precision (TODO #2, layer A)
- **Governance:** ADR-0007 / ADR-0016 / ADR-0023, AGENTS rules 6 / 11 / 16 / 17 / 18 / 19 / 21
- **Supersedes nothing; builds on:** the shipped CEP extraction + assertion-entailment judge (`packages/application/src/applyAssertionEntailmentJudge.ts`, `packages/infrastructure-litellm/src/extractionAdapters.ts`)

## Problem

A CEP must carry at least one **Definition Passage**, and an admitted core Concept with no verified Definition Passage cannot be published (`packages/application/src/buildGraphVersion.ts:59`). But the Definition Passage has only **two** gates today: the deterministic **verbatim floor** (the quote must exist in its cited block) and the **assertion-entailment judge** (`judgeDefinition`), which only fires for the *optional* `defines` typed assertion's model-authored literal. The **required Definition Passage itself has no meaning-quality judgment**.

So a passage that is verbatim-grounded but conveys no meaning is accepted as a definition. Real-use inspection (`tmp/2026-06-18-structure-aware-neighborhood/rule-14-evaluation.md`, AIRA-dojo Markdown run) found exactly this: `Graph-based Search Framework` cited from a **heading block**, `Evolutionary Search` cited from a **related-work citation phrase**. The extractor prompt already forbids heading/title passages (`extractionAdapters.ts:297`), but a prompt instruction is not a gate (rules 16/19) and the defect persists in real output.

This is the disposition layer only. Whether such concepts are *genuinely* undefined or merely have their definition **split across a chunk boundary** is a separate retrieval/representation question, routed to TODO (layer B, research-first per rule 21) and explicitly out of scope here.

## Outcome

A Definition Passage published in a CEP actually establishes its Concept's meaning. A core Concept whose only definitional text is a bare name, heading, title, or citation/bibliographic snippet is treated **identically to a Concept the source never defines** — demoted out of the published core with a loud quality issue, never silently published with a hollow definition. It remains available to the learner-facing layer via the existing rescue path if the source develops it elsewhere — re-entering only as a *derived* node, never republished asserted (grounding-origin invariant, ADR-0023).

## Decisions (locked)

1. **Add a measured neural Definition-Passage quality judge.** Drop-only, cross-family `kg-independent-judge`, forced named tool schema with boundary-validated arguments (rule 6), **domain-neutral rubric only** (rule 17 — names no fixture concept). It judges whether a *already-verbatim-verified* Definition Passage **establishes the Concept's meaning** (defining properties, distinguishing criteria, mechanism, or contrast) versus being a bare repetition of the name, a heading/title, or a citation/bibliographic phrase.
2. **Compose it as an application stage AFTER the deterministic verbatim floor**, mirroring the assertion-entailment judge's placement and fail-closed pattern (ADR-0007). It never bypasses a port.
3. **Fail-closed = preserve recall.** On transport failure, invalid tool arguments, or a span that does not match the cited evidence, the passage is **kept** (no veto) with a recorded disposition. A transport blip must never silently shrink the published core. (Mirrors the admission-label judge precedent; rule 6 fail-closed governs schema validity, not semantic acceptance — rule 16.)
4. **Veto consequence = drop the passage; last-passage veto routes to the existing demotion.** A vetoed passage is removed from the Concept's Definition Passages. If ≥1 Definition Passage survives, the Concept stays core. If the veto removes its **last** Definition Passage, the Concept is now ungroundable and follows the **existing** path (`detectExtractionQualityIssues.ts` + the `buildGraphVersion.ts:59` core-completeness check): demoted to optional, not published, run succeeds with a loud quality issue. **No new disposition or promotion machinery.**
5. **Dropped Concepts re-enter only via the existing rescue path.** A demoted-but-still-mentioned Concept flows into the rescue pool (`enrichmentStore.mentionedNonCoreCandidates`, `runGraphEnrichment.ts:212`), where the existing **rescue durability judge** decides whether it becomes a `source_mentioned` *derived* prerequisite node. It is never republished asserted.
6. **Core-shrinking is accepted and surfaced.** On sources whose only definitional text is heading/citation-like, the published core shrinks. That is the precision-first intent, made visible by the existing ungroundable quality issue — not hidden.
7. **Bump the extraction config hash** to mark the new judged behavior.

## Scope

**In scope**
- The definition-quality judge: port (in `ports`), LiteLLM adapter, forced-tool schema + boundary validator, and the composed application stage after the verbatim floor.
- Routing a last-passage veto into the existing ungroundable demotion + loud quality issue (Decision 4).
- Persisting per-passage judge dispositions to the run trace so the rule-14 inspection is replayable and the veto is auditable.
- Verifying `mentionedNonCoreCandidates` includes admitted-then-demoted Concepts so they reach the rescue pool (Decision 5); a small query fix if it does not.
- Deterministic-envelope tests only (rules 11/19): the drop transform, the last-passage→demote routing, the fail-closed-preserve mapping, and tool-argument validation. No test asserts the judge's verdict *content*; a canned judge response is allowed only as input to the deterministic routing.

**Out of scope**
- Any retrieval/representation change — parent-child / hierarchical / overlapping semantic chunking, neighborhood re-pull on veto (TODO layer B, research-first per rule 21). (A) does not try to find a *better* passage; it disposes of Concepts the source genuinely does not define here.
- The optional `defines` assertion-entailment judge (shipped, unchanged).
- Mention Passage quality (this is about Definition Passages only).
- Difficulty, observability polish, embeddings, and graph growth.

## Success criteria

Established by real-use inspection (rule 14), not a green suite:

- On the AIRA-dojo Markdown fixture, the heading-like `Graph-based Search Framework` and citation-like `Evolutionary Search` Definition Passages are vetoed; where one was the Concept's only definition, the Concept is demoted (not published with a hollow definition) and raises a loud quality issue.
- A Concept with a genuine adjacent-block definition (e.g. `Generalization Gap`, defined from `block-148`) is **not** vetoed — recall is preserved.
- Demoted-but-mentioned Concepts appear as rescue candidates; the rescue durability judge owns their derived-node fate.
- Per-passage judge dispositions are inspectable in the run trace.
- No transport failure silently demotes a Concept (fail-closed = preserve).
- Spot check: the judge rubric / tool `description` names no fixture concept (rule 17).

## Open questions (resolve during build/calibration, not before)

- **Per-passage vs per-Concept batched call** — judge each Definition Passage independently, or all of a Concept's definitions in one call for shared context. Likely batched per Concept (cost + context); confirm in build.
- **Distinct quality-issue reason code** — should a Concept demoted for definition *quality* carry a different reason code from the existing `core_demoted_ungroundable` (so operators can tell "never defined" from "defined only by a heading")? Likely yes; low cost.
- **Rubric strictness** — calibrate on real output (rule 14); start permissive (veto only clear non-definitions: bare names, headings, titles, pure citations) to protect recall, tighten only if inspection shows leakage.
- **ADR placement** — whether this extends ADR-0007 in place or warrants a new ADR; decide at plan time.

## Dependencies / assumptions

- Reuses the `kg-independent-judge` alias (`litellm/config.yaml`); alias edits require a `lrnki-litellm` restart.
- Reuses the existing ungroundable demotion (`detectExtractionQualityIssues.ts`, `buildGraphVersion.ts:59`), the rescue pool (`mentionedNonCoreCandidates`), and the rescue durability judge (`runGraphEnrichment.ts`). No new persistence concepts beyond extending the run trace with per-passage dispositions.
- Mirrors the assertion-entailment judge's composition and fail-closed pattern (`applyAssertionEntailmentJudge.ts`, ADR-0007).
- Assumes the verbatim floor and structure-aware neighborhood are unchanged — (A) does not alter retrieval (that is layer B).
- Measurement scaffolding is disposable (rules 11/13).

## Evidence

- `tmp/2026-06-18-structure-aware-neighborhood/rule-14-evaluation.md` — the heading-like / citation-like low-value Definition Passage defect (AIRA-dojo), with explicit note that the verbatim floor + neighborhood are source-faithful and not the gap.
- TODO #2 — the parent CEP Definition-Passage precision item this layer (A) executes.

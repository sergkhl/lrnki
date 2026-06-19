# Requirements: Remove F3 densification & build learner-neutral intrinsic difficulty

- **Date:** 2026-06-18
- **Scope tier:** Deep — feature (two coupled changes against an existing seam)
- **Status:** Ready for planning (`/ce-plan`)

## Outcome

Two moves in one milestone:

1. **Remove the F3 densification experiment** entirely — it failed its own gate twice and is unmeasured speculative complexity.
2. **Replace the `dag-depth-mock` difficulty producer** with a real, learner-neutral **intrinsic difficulty** signal behind the existing `DifficultyPort`: a neural source-grounded judge fused with deterministic structural components.

Both honor the standing constraints — low-complexity durable change behind a stable seam, remove redundant modules, no backward-compat carrying cost.

## Background

- **F3 has failed twice.** v1 (`docs/plans/2026-06-17-002-...-plan.md`) produced 0 bridges: the topology-primary trigger only fires on disconnected/orphan gaps, but the same-domain baseline is already connected. v2 (`docs/plans/2026-06-18-002-...-plan.md`) stopped before any live run: no domain-neutral threshold can surface the F1-documented economics region, because the only measured input (the declined-pair dump) has no rows for those labels, and the only "fix" — hardcoding the known regions — violates AGENTS rule 17. F1 already judged all three learner paths `PASS` **without** densification, so the value densification chases is not present in inspected output.
- **The difficulty seam is already clean.** `DifficultyPort` (`packages/ports/src/index.ts:265`) returns `ConceptDifficulty { score, method, components }` with interpretable components; the mock `dagDepthDifficultyPort` (`packages/application/src/prerequisiteDag.ts:271`) is normalized topological depth + fan-in. The projection consumes only the port, so replacing difficulty is an impl-swap.
- **The Bradley-Terry promise is data-blocked.** Every code comment promises calibrated (Bradley-Terry/IRT/KT) difficulty as the replacement, but that needs learner-response data that does not exist. The honest, buildable-now replacement is a **learner-neutral intrinsic** signal grounded in source evidence; calibrated difficulty stays deferred until a learner-data surface exists.

## Locked decisions

1. Skip and **remove** F3 (not keep-dormant).
2. Build a **learner-neutral intrinsic** difficulty signal (Fork A), not learner-calibrated (Fork B).
3. Approach **A1**: neural intrinsic-difficulty judge **fused with** deterministic structural components, exposed as interpretable `components`. (A2 deterministic-only was rejected: it can't separate same-depth concepts, which is the gap worth filling.)

## Scope — in

### F3 removal
- Revert this branch's `thin_connected` additions in `packages/application/src/sparseRegionDetection.ts`, `packages/application/src/prerequisiteDag.ts`, and their `.test.ts` files, plus the `packages/application/src/index.ts` export.
- Delete the F3 scaffolding: `runDensificationExperiment.ts` (+ test), `sparseRegionDetection.ts` (+ test), `densificationProposalAdapters.ts` (+ test) in `packages/infrastructure-litellm`, the `BridgeConceptProposalPort` (`packages/ports/src/index.ts:248`) and `BridgeConceptProposal` type (`packages/domain-core/src/index.ts:744`), and any `densify`-style command wiring.
- Collapse the `MintingReason` union (`packages/domain-core/src/index.ts:688`) to drop the `"densification"` arm; **keep the live `"assumed_prerequisite"` minting path untouched** (`packages/application/src/enrichmentNodeMinting.ts`, `PostgresEnrichmentStores.ts`).
- No migration change required — F3 had no persistence.

### Intrinsic difficulty (A1)
- A neural intrinsic-difficulty **judgment routed through a port** (forced named tool schema, rule-6 argument validation, fail-closed on schema), with a **domain-neutral rubric** (e.g. abstraction level, technical density, implied background/prerequisite load) carrying **no fixture-derived exemplars** (rule 17).
- A new `DifficultyPort` impl that **fuses** the neural score with deterministic structural terms and returns the existing `ConceptDifficulty` shape with a new `method` id and **non-opaque `components`** (neural subscore + structural terms such as topological depth, transitive-ancestor count, CEP evidence density, fan-in). `dagDepthDifficulty` is retained as a component producer, not deleted.
- Scores **all derived nodes** (anchors + Enrichment Nodes). For `llm_grounded` nodes the judge reads the **Generated Grounding Bundle** (no source quote); this does not touch the verbatim floor.
- Bump the enrichment config hash (the `difficulty_method` changes).
- Rewrite the misleading "Bradley-Terry replaces this" comments in `packages/domain-core/src/index.ts`, `packages/ports/src/index.ts`, `packages/application/src/prerequisiteDag.ts` to state: neural intrinsic now; learner-calibrated (IRT/BT) deferred, data-blocked.

## Scope — out

- Bradley-Terry / IRT / KT or any **learner-calibrated** difficulty (data-blocked; stays deferred).
- Any learner-response capture or telemetry surface; Learner State stays the empty mock (ADR-0014).
- Densification / bridge proposals (removed).
- CEP definition-passage precision cleanup (prior TODO #2) — remains a known caveat, not part of this milestone.
- Changing the learner-path **ordering contract**: prerequisite structure stays primary; intrinsic difficulty remains the secondary signal it is today (see Outstanding Questions).

## Success criteria & rule-14 validation

- Static: workspace `typecheck` / `test` / `build` green after removal + addition; focused tests for the deterministic fusion and rule-6 argument validation of the judge tool args (per AGENTS rule 11, tests cover the deterministic envelope, **not** the model's difficulty judgment content).
- Real-use (rule 14): a real mixed-domain run (Rust, biology, economics, InstructKG) produces difficulty scores; expert inspection judges that **within each domain** foundational concepts score below advanced ones, **same-depth concepts are differentiated**, scores are source-faithful, and `llm_grounded` nodes are scored from their grounding bundle without breaking the verbatim floor. Classify `PASS` / `FIX_FIRST` / `EXPERIMENT_ONLY` / `BLOCKED`.

## Risks & caveats

- **No hard oracle for difficulty.** A difficulty score cannot be verified against ground truth without learner data, so rule-14 validation is *soft plausibility*, not pass/fail verification. State this caveat explicitly in the validation note; treat intrinsic difficulty as `EXPERIMENT_ONLY`-grade trust for ordering until learner data exists.
- **Redundancy risk.** Topological depth is already correlated with prerequisite order; if the neural signal is drowned by structural terms in the fusion, the change adds cost without lift. Inspection must confirm same-depth differentiation actually appears.
- **Generated-node grounding is thin.** `llm_grounded` nodes carry only a generated bundle; their difficulty scores are weaker evidence than anchor scores — note in inspection.

## Outstanding questions (for planning / inspection)

1. **Ordering behavior:** does intrinsic difficulty stay a secondary sort within prerequisite constraints (recommended, matches `CONTEXT.md`), or should it influence path *selection*? Default to secondary-sort; verify in inspection.
2. **Fusion weighting:** fixed deterministic blend vs neural-dominant — resolve empirically during inspection, not by guess.
3. **ADR placement:** propose a **new ADR-0024** ("learner-neutral intrinsic difficulty; learner-calibrated difficulty deferred as data-blocked") rather than overloading ADR-0019/0014. Confirm at planning.

## Doc/ADR impact

- New ADR-0024 (per Q3); amend ADR-0019 to record densification was tried, measured non-valuable on a connected baseline, and removed.
- `docs/plans/TODO.md`: drop F3 (TODO #1) to a removed/COMPLETED note; promote intrinsic difficulty to the active task; CEP precision (#2) and deferred-methods (#3) remain.
- `docs/plans/README.md`: F3 v2 plan moves to archived-with-removal note.

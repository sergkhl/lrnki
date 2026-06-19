# TODO

Roadmap reset 2026-06-16, updated by the 2026-06-18 structure-aware-neighborhood run: the next work is earned
by real mixed-domain pipeline output, not by deferred method-stack preference.

## TODO

Most reset-roadmap items have moved to COMPLETED. The remaining active work is earned by the latest inspected
outputs: the learner recall/adaptive path loop now runs end-to-end over all manifest fixtures at
`EXPERIMENT_ONLY` trust, and prior CEP definition-quality caveats remain visible in the mixed-domain run.

1. **CEP Definition Passage precision cleanup — heading/citation-like definitions.** The structure-aware
   neighborhood pass recovered useful adjacent definitions and reduced InstructKG incomplete CEPs, but inspection
   still found low-value accepted Definition Passages such as heading-only or citation-like snippets in the
   AIRA-dojo Markdown run.
   - Do **not** add a hardcoded symbolic section-role or lexical veto. Any fix must stay domain-neutral and comply
     with AGENTS rules 16/17.
   - Prefer improving the neural CEP extraction/judgment contract or adding a measured, disposable experiment that
     proves a generic definition-quality guard raises precision without dropping valid adjacent definitions.
   - Treat this as a CEP-quality follow-up, not a blocker for the retrieval-layer milestone: the verbatim floor held,
     and the inspected newly included adjacent blocks were genuine explaining passages.

2. **Harden forced-tool transport for long extraction/card runs.** The all-manifest learner-loop evaluation hit one
   malformed JSON forced-tool argument during AIRA-dojo Markdown concept admission; rerunning the single source
   succeeded. Keep fail-closed semantics, but improve retry observability and capture malformed tool-call snippets
   safely enough to diagnose provider/schema drift without logging secrets or full copyrighted source context.

3. **Improve card-bank inspection around citation exactness.** Persisted cards passed the project verifier
   (`evidenceQuoteMatches`) 87/87, but only 68/87 citations were byte-exact substrings of source blocks because the
   verifier intentionally tolerates parser formatting noise (markdown emphasis, curly quotes, line wrapping, HTML
   entities). Admin/inspection surfaces should label this distinction clearly so operators do not confuse normalized
   verifier success with exact copied text.

4. **Make enrichment-only frontier targets teachable.** Adaptive paths can correctly advance to enrichment-only
   prerequisites once anchor prerequisites are mastered, but those nodes currently have no card-backed response item.
   Add an explicit design for generated/source-mentioned prerequisite cards or a UI treatment that explains why the
   next frontier node is not directly recall-tested yet.

5. **Broaden learner-loop target coverage after fixing card gaps.** The educational-technology target produced only
   one graded row and no self-report rows because the selected neighborhood had little card-backed anchor coverage
   and the `Prerequisite Relationships` card was rejected. After card coverage for thin neighborhoods improves, rerun
   the learner-loop evaluation with at least two targets per domain.

6. **Keep standing deferred methods deferred.** Learner-calibrated difficulty and learner state remain data-blocked.
   - Do not reintroduce Bradley-Terry difficulty, IRT/KT, learner simulation, embeddings, clustering, F3
     densification, or non-LLM prerequisite signals from method-stack preference.
   - Reconsider one only when a run-scoped inspection or measured experiment shows it beats the current explicit
     behavior without hiding provenance or identity defects.

## COMPLETED

- **Learner recall/adaptive path all-manifest rule-14 evaluation (2026-06-19).** Reset the dev DB, registered all six
  manifest sources as-is (including raw PDF via Docling), ran real LiteLLM extraction over every source, published
  graph version `6b2b0204-295c-41de-8ff4-a052fd6f4cad`, enriched it as
  `68ab5958-a004-4374-b2d0-4202188aff91`, generated 39 persisted cards with 1 rejected card, seeded five synthetic
  learner states, and computed baseline/adaptive paths. Classification: `EXPERIMENT_ONLY` because synthetic learner
  behavior and the mastery fold are not calibrated, but the response log and adaptive projection are inspectable.
  Evidence under `tmp/2026-06-19-learner-loop-eval/`. During the run, removed the unnecessary Drizzle migration
  runner in favor of direct `psql` application of the single SQL migration, and fixed `compute-learner-path` so the
  advertised concept-id target resolves to the active enrichment anchor node.
- **Prerequisite hint assertion measured and removed (2026-06-19).** Added a disposable enrichment-context
  probe, ran a real LiteLLM A/B over mixed-domain graph version `ba7f5f9b-241c-4dc3-b265-904ac1bbcb7b`, then
  removed `explicit-prerequisite-hint` after the clean run showed an identical edge set: 13 certain edges with
  hints fed vs. 13 certain edges with hints suppressed, no endpoint or uncertainty diff. `defines` is now the
  sole Optional Typed Assertion; prerequisite prose remains ordinary CEP mention evidence consumed by exhaustive
  Graph Enrichment. Evidence under `tmp/2026-06-18-prerequisite-hint-ab/`.
- **Learner-neutral intrinsic difficulty implemented (2026-06-18, branch `feat/intrinsic-difficulty-remove-f3`).**
  Replaced the `dag-depth-mock` port with `intrinsic-fused-v1`: `DifficultyPort.score` now receives per-node
  evidence contexts, `LiteLlmIntrinsicDifficultyJudgmentAdapter` uses a forced named tool schema on
  `kg-independent-judge`, and `createIntrinsicDifficultyPort` fuses the neural subscore with deterministic
  topological depth, transitive ancestors, fan-in, and evidence-density components. The enrichment config hash is
  now `intrinsic-difficulty-v3`; ADR-0024 records that learner-calibrated IRT/BT remains data-blocked. Rule-14
  real-use inspection over enrichment `7ff10930-3236-4ea6-99f8-407e3a960d14` classified the signal
  `EXPERIMENT_ONLY`: useful for plausible secondary ordering, not calibrated learner difficulty.
- **F3 densification removed through U3 (2026-06-18, branch `feat/intrinsic-difficulty-remove-f3`).** Removed the
  failed graph-densification experiment from live code: deleted sparse-region detection, the densification
  experiment runner, the bridge-proposal port/type/schema/adapter/tests, the worker `densify-experiment` command,
  the `shortestPathHops` thin-connected helper, and the `densification` minting reason. ADR-0019 now records F3
  as removed rather than dormant.
- **Structure-aware evidence neighborhood for CEP extraction (2026-06-18).** Added a pure deterministic
  `selectEvidenceNeighborhood` in `domain-core` that widens CEP input from mention/label blocks to a capped,
  priority-ordered, extractable-only neighborhood: mention blocks, adjacent extractable body blocks, same
  `headingPath` siblings, then label/alias blocks. Wired it through `executeExtractionRun` without changing the
  port shape or the verbatim floor; added `prev`/`next` structural rendering with full-document adjacency for
  filtered CEP neighborhoods; bumped the worker config hash to `structure-aware-neighborhood-v37`; and registered
  the datalab Markdown 2507 fixture. Rule-14 mixed-domain re-run: InstructKG incomplete CEPs improved **9 → 3**,
  economics stayed **1 → 1**, and AIRA-dojo Markdown exposed remaining CEP-quality caveats. Evidence under
  `tmp/2026-06-18-structure-aware-neighborhood/`.
- **Enrichment-ordering evaluation gate (F1) and v1 densification experiment (F3) (2026-06-17).** Ran a real
  mixed-domain F1 evaluation of Graph Enrichment prerequisite ordering over biology, economics, and InstructKG:
  all three Learner Paths judged `PASS` (no concept before a prerequisite it requires; every step traces to a CEP
  passage or grounded derived node), and the thin/disconnected regions earning F3 were recorded. Added the
  `mintingReason: "assumed_prerequisite" | "densification"` facet to `llm_grounded` nodes (ADR-0019 amended, not
  superseded; ADR-0012/0016 untouched), pure sparse-region detection + connectivity metrics, the
  `BridgeConceptProposalPort` + forced-tool LiteLLM adapter, `runDensificationExperiment`, and the
  `densify-experiment` worker command. F3 v1 ran `EXPERIMENT_ONLY` and proposed **0 bridges**: its
  topology-primary trigger only addresses disconnected/orphan gaps, and the baseline is already
  same-domain-connected, so densification value remains unmeasured (next task #1). The experiment appended an
  append-only artifact and left the asserted graph identity unchanged. Evidence under
  `tmp/2026-06-17-f1-enrichment-eval/` and `tmp/2026-06-17-f3-densification-experiment/`.
- **Ungroundable core demotion and InstructKG publishability (2026-06-17).** Changed extraction-run completeness
  policy so an incomplete core CEP demotes the candidate to `optional` with boundary reason
  `core_demoted_ungroundable` instead of failing the run; added run-level `degraded`, `critical` quality-issue
  severity, relational persistence, v6 artifact projection, and Admin Lab demotion/degraded surfaces. The real
  InstructKG re-run published successfully; in that run `Pedagogical Roles` was already corrected to optional by
  admission evidence validation, so the demotion path was verified by deterministic envelope tests rather than
  by that live model sample.
- **Evidence-backed node treatment contract — admission + rescue (2026-06-16, U1–U6).** Gave each promotion
  gate an evidence-backed treatment contract: (U1) a fourth core-admission criterion requires verbatim-validated
  definition-bearing source treatment; (U2) that verified evidence is carried into CEP extraction as a hint
  without bypassing the port or weakening the verbatim floor; (U3) a measured, cross-family, drop-only
  rescue-durability judge (fail-open-with-flag) gates `source_mentioned` rescue before a derived node exists;
  (U4) per-pair judge model and rescue dispositions are persisted relationally + in the JSONB trace; (U5) Admin
  Lab exposes per-domain origin counts, dispositions, per-edge judge model, per-step origin badges, and marks
  failed runs not publishable. Validated by the rule-14 native re-run (see VALIDATION): Rust/biology/economics
  succeed with 0 incomplete core CEPs (the String Type / Heap allocation failure mode is gone); the rescue judge
  drops incidental artifacts with grounded rationales while keeping transferable concepts. One blocker recorded
  (InstructKG core completeness for a borderline meta-concept). Domain-neutral throughout (rules 16/17).
- **Evaluation-first roadmap reset (2026-06-16).** Normalized fixture docs so Gate 1 names the manifest-backed
  native batch including the InstructKG Markdown fixture; ran real extraction/publication/enrichment/path
  generation over Rust, biology, economics, and InstructKG; recorded disposable inspection notes under
  `tmp/evaluation-first-roadmap-reset/`; rewrote this roadmap from inspected output. Fixed a real persistence
  defect discovered by the batch: anchor projection `derivedNodeId`s are now per-enrichment deterministic IDs,
  while `conceptId` remains the asserted Concept pointer, so repeated enrichment over the same graph version no
  longer collides on `derived_graph_nodes_pkey`.
- **Derived-layer prerequisite enrichment — node + edge derivation, U1-U9 (branch
  `feat/derived-layer-prerequisite-enrichment`).** Graph Enrichment mints `llm_grounded` prerequisite nodes via
  an explicit anchor-driven proposal port, rescues `source_mentioned` nodes from member runs' non-core mentions,
  judges anchors + enrichment nodes same-domain, routes generated-node pairs to `kg-generated-prerequisite-judgment`,
  and keeps the asserted layer untouched. Prior Rust rule-14 run `0911ecd0-11a1-4f6a-97a1-d4cc7f8cb272` produced
  a useful path to Ownership; current mixed-batch validation is the newer evidence.
- **Domain-neutral extraction prompts + run-scoped quality issues (2026-06-16).** Removed fixture and benchmark
  answer-key calibration from model-facing extraction prompts and forced-tool schema descriptions, added AGENTS
  rule 17, bumped the extraction pipeline config hash to `cep-domain-neutral-prompts-v35`, and added
  `ExtractionQualityIssue[]` to extraction artifacts for Admin Lab inspection.
- **Reset milestone 4 — worker/Admin Lab/export reshape + docs (branch `refactor/cep-core-reset`).** Run
  Inspector reports CEP completeness and quality issues; published Graph Explorer is a zero-edge CEP evidence
  inspector; Enrichment Run views render the Derived Graph Layer independently of learner paths; RDF export emits
  Concept identity/labels/aliases only; ADRs, CONTEXT, README, fixtures notes, and roadmap were rewritten for the
  post-reset architecture.
- **Reset milestones 1-3 — admission precision, CEP extraction, publication, and exhaustive same-domain
  enrichment.** Admission emits atomic proposals and uses neural source-role/domain relevance; standing oracle
  machinery was deleted; CEP extraction replaced claims; Graph-Version Builds explicitly select runs and publish
  Concepts + CEPs with zero asserted edges; Graph Enrichment judges every unordered same-domain CEP pair without
  embeddings or candidate groups.
- **Historical vertical slice and mixed-format ingestion.** Native ingestion, Graph-Version Build, Graph
  Enrichment, Learner Path projection, Admin Lab read-only views, and Gate 2 Docling PDF ingestion exist as
  historical capability. Additional DOCX/PPTX expansion is not active work.

## VALIDATION

Latest validation (2026-06-19) is the **learner recall/adaptive path all-manifest rule-14 evaluation**
(`tmp/2026-06-19-learner-loop-eval/rule-14-evaluation.md`):

- **Static/unit:** direct DB reset/migration succeeded through `scripts/reset-db.sh` using `psql`; the
  `compute-learner-path` CLI concept-id fix was smoke-tested with graph version
  `6b2b0204-295c-41de-8ff4-a052fd6f4cad` and enrichment `68ab5958-a004-4374-b2d0-4202188aff91`.
- **Real-use:** all six manifest fixtures were registered and extracted with real model calls after one transient
  malformed JSON tool-call failure was rerun successfully. Graph publication produced 40 concepts; enrichment
  produced 40 anchors, 16 enrichment nodes, 61 certain edges, and 14 uncertain edges. Card generation produced 39
  persisted cards, one rejected card, and 87/87 citations passing the project verifier.
- **Inspection result:** `EXPERIMENT_ONLY`. The loop is usable for inspectable prototype behavior: response rows are
  append-only, preserve `card_id` and `concept_id`, include both self-report and graded synthetic signals, and
  adaptive paths prune/advance differently from empty baselines. It is not calibrated learner modeling.

Prior latest validation (2026-06-19) was the **prerequisite hint A/B removal gate**
(`docs/plans/2026-06-18-004-refactor-prerequisite-hint-measure-remove-plan.md`):

- **Static/unit:** focused `pnpm --filter @lrnki/application test -- runGraphEnrichment` passed after the
  temporary probe was added and refined to suppress only prerequisite hints while preserving `defines`.
- **Real-use (rule-14 prerequisite hint A/B):** real LiteLLM enrichment over mixed-domain graph version
  `ba7f5f9b-241c-4dc3-b265-904ac1bbcb7b`, using a fixed in-memory enrichment id and serialized pair calls,
  produced identical inferred edge sets with and without the labeled hint signal: 13 certain edges, 0 uncertain
  edges, no endpoint diff.
- **Inspection result:** `PASS`, safe to remove. The prerequisite hint label did not change the derived
  prerequisite structure, so it was removed from extraction schema, policy, entailment, publication, enrichment
  context, and docs. Evidence under `tmp/2026-06-18-prerequisite-hint-ab/`.

Prior latest validation (2026-06-18) was the **intrinsic difficulty implementation and rule-14 inspection**
(`docs/plans/2026-06-18-003-feat-intrinsic-difficulty-f3-removal-plan.md`):

- **Static/unit:** focused and package checks passed: `pnpm --filter @lrnki/infrastructure-litellm test`,
  `pnpm --filter @lrnki/infrastructure-litellm typecheck`, `pnpm --filter @lrnki/ports typecheck`,
  `pnpm --filter @lrnki/domain-core typecheck`, `pnpm --filter @lrnki/application test`,
  `pnpm --filter @lrnki/application typecheck`, and `pnpm --filter @lrnki/kg-worker typecheck`.
- **Real-use (rule-14 intrinsic difficulty):** fresh real enrichment
  `7ff10930-3236-4ea6-99f8-407e3a960d14` over mixed-domain graph version
  `ba7f5f9b-241c-4dc3-b265-904ac1bbcb7b` used real LiteLLM calls and produced
  `enrichmentConfigHash=intrinsic-difficulty-v3`, `difficulty_method=intrinsic-fused-v1`,
  `nodes(anchor/enrichment)=13/14`, `edges(certain/uncertain)=27/3`, and `difficulties=27`.
- **Inspection result:** `EXPERIMENT_ONLY`, safe to continue only with difficulty kept as a secondary,
  non-calibrated signal. Plausible examples: economics progresses from `Propensity to Truck, Barter, and Exchange`
  0.238 to `Universal Opulence from Division of Labour` 0.519; biology replication-model anchors at equal
  `topoDepth=2` are differentiated; generated passages remain `not_applicable_by_grounding` while
  `source_mentioned` passages remain `verified`. Caveats: no learner-data oracle, untuned weights, and some broad
  rescued nodes may be overestimated. Evidence under `tmp/2026-06-18-intrinsic-difficulty/`.

### Prior validations (provenance in archived plans)

- 2026-06-18 F3 removal through U3 — `docs/plans/2026-06-18-003-feat-intrinsic-difficulty-f3-removal-plan.md`
- 2026-06-18 F3 v2 thin-connected-region gate — `docs/plans/2026-06-18-002-feat-densification-thin-region-trigger-plan.md`
- 2026-06-18 structure-aware evidence-neighborhood — `docs/plans/2026-06-18-001-feat-structure-aware-evidence-neighborhood-plan.md`
- 2026-06-17 F1 enrichment-ordering gate + F3 v1 — `docs/plans/2026-06-17-002-feat-enrichment-eval-graph-densification-plan.md`
- 2026-06-17 ungroundable-core demotion — `docs/plans/2026-06-17-001-feat-demote-ungroundable-core-plan.md`
- 2026-06-16 evidence-backed node treatment — `docs/plans/2026-06-16-002-feat-evidence-backed-node-treatment-plan.md`
- 2026-06-16 evaluation-first native batch reset — `docs/plans/2026-06-16-001-feat-evaluation-first-roadmap-reset-plan.md`

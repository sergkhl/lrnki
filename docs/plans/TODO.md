# TODO

Roadmap reset 2026-06-16, updated by the 2026-06-18 structure-aware-neighborhood run: the next work is earned
by real mixed-domain pipeline output, not by deferred method-stack preference.

## TODO

Most reset-roadmap items have moved to COMPLETED. The remaining active work is earned by the latest inspected
outputs: the F1/F3 thin-connected-region trigger mismatch, and a CEP definition-quality caveat exposed by the
2026-06-18 structure-aware-neighborhood run.

1. **Densification F3 v2 — measured thin-connected-region trigger (`EXPERIMENT_ONLY`).** F3 v1 shipped but its
   topology-primary trigger only fires on disconnected components and orphan nodes. The F1 baseline is already
   same-domain-connected, so v1 found 0 candidate gaps and densification value is still **unmeasured** — this is a
   trigger/target mismatch, not a verdict that bridging has no value. Improve the trigger to detect the
   *thin-but-connected* sparsity F1 actually documented.
   - Target the three concrete F1-documented thin regions as the evaluation set: the biology experimental-design
     bridge (isotope labeling ↔ density-gradient ultracentrifugation), the economics market-distribution step
     (specialization → opulence skipping `Market Exchange and Distribution`), and the InstructKG pedagogical-role
     bridge (`Semantic Signals` ↔ `Pedagogical Roles`). See `tmp/2026-06-17-f1-enrichment-eval/rule-14-evaluation.md`.
   - Reuse the existing harness unchanged: `runDensificationExperiment.ts`, `BridgeConceptProposalPort`, the
     generated-grounding bundle, the cross-family generated-node judge, and the DAG disposal helpers. Only
     `detectSparseRegions` (`packages/application/src/sparseRegionDetection.ts`) grows a thin-region path.
   - The thin-region signal must be a **measured, domain-neutral module (AGENTS rule 16)**, not a hardcoded lexical
     or surface heuristic that silently vetoes. Evaluate candidate signals (long same-domain shortest-path between
     declined pairs inside one component; low-degree articulation concepts; source-implied-but-unconnected pairs)
     by measurement against the F1 set before any bridge is proposed; keep the signal only while an oracle shows it
     raises connectivity value without adding noise, then delete the oracle (rule 11).
   - Stay `EXPERIMENT_ONLY` (rule 11, ADR-0019 / plan KTD4): append-only experiment artifact, asserted graph
     byte-for-byte unchanged, no embeddings (ADR-0012 stands), prompts domain-neutral (rule 17).

2. **CEP Definition Passage precision cleanup — heading/citation-like definitions.** The structure-aware
   neighborhood pass recovered useful adjacent definitions and reduced InstructKG incomplete CEPs, but inspection
   still found low-value accepted Definition Passages such as heading-only or citation-like snippets in the
   AIRA-dojo Markdown run.
   - Do **not** add a hardcoded symbolic section-role or lexical veto. Any fix must stay domain-neutral and comply
     with AGENTS rules 16/17.
   - Prefer improving the neural CEP extraction/judgment contract or adding a measured, disposable experiment that
     proves a generic definition-quality guard raises precision without dropping valid adjacent definitions.
   - Treat this as a CEP-quality follow-up, not a blocker for the retrieval-layer milestone: the verbatim floor held,
     and the inspected newly included adjacent blocks were genuine explaining passages.

3. **Keep standing deferred methods deferred.** Difficulty stays the DAG-depth mock and learner state stays the
   empty mock until path quality makes calibration the limiting problem.
   - Do not reintroduce Bradley-Terry difficulty, IRT/KT, learner simulation, embeddings, clustering, or non-LLM
     prerequisite signals from method-stack preference.
   - Reconsider one only when a run-scoped inspection or measured experiment shows it beats the current explicit
     behavior without hiding provenance or identity defects.

## COMPLETED

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

Latest validation (2026-06-18) is the **structure-aware evidence-neighborhood gate**
(`docs/plans/2026-06-18-001-feat-structure-aware-evidence-neighborhood-plan.md`):

- **Static/unit:** `pnpm run test`, `pnpm run typecheck`, `pnpm --filter @lrnki/admin-lab build`, and
  `git diff --check` passed. `pnpm run lint` exited 0 with one pre-existing warning in
  `packages/domain-core/src/index.ts`.
- **Simplify/review pass:** subagent simplify reviewers found and fixes were applied for unique sibling-cap
  accounting, duplicate mention-index scans, duplicate alias computation, and misleading `prev`/`next` metadata
  on filtered CEP neighborhoods. Focused domain-core, application, and litellm tests passed after those fixes.
- **Real-use (rule-14 extraction rerun):** real mixed-domain extraction with config
  `structure-aware-neighborhood-v37`. InstructKG run `1f827f1c-04ba-40aa-8c00-a4b255cdc742` succeeded with
  `CEPs=49(incomplete=3)`, improving from the F1 baseline of 9 incomplete CEPs. Economics run
  `cc1b754d-d656-4830-8e31-8e76c43221c9` succeeded with `CEPs=29(incomplete=1)`, unchanged from baseline.
  AIRA-dojo Markdown run `0eddc4e1-c49e-4f5a-9abb-b2bb52c9cfc6` succeeded with
  `CEPs=42(incomplete=10)`.
- **Spot checks:** recovered definitions from newly surfaced adjacent/same-section blocks were source-faithful for
  examples including InstructKG `Context Clustering`, `Role Classification`, `EDC`, and AIRA-dojo
  `Generalization Gap`; cited passages verified verbatim and were genuine explaining passages.
- **Result:** PASS with caveats. The retrieval-layer defect is materially improved, especially for InstructKG, and
  the verbatim floor still holds. Remaining caveats are definition-quality precision issues, especially
  heading-only or citation-like accepted definitions in AIRA-dojo; that earned TODO #2. Evidence under
  `tmp/2026-06-18-structure-aware-neighborhood/`.

Prior validation (2026-06-17) is the **F1 enrichment-ordering gate + F3 v1 densification experiment**
(`docs/plans/2026-06-17-002-feat-enrichment-eval-graph-densification-plan.md`):

- **Static/unit:** `pnpm run test`, `pnpm run typecheck`, and `pnpm run build` passed; `pnpm run lint` exited 0
  (one pre-existing warning in `packages/domain-core/src/index.ts`); `git diff --check` clean.
- **Real-use (rule-14 F1 gate):** real mixed-domain batch over graph version
  `ba7f5f9b-241c-4dc3-b265-904ac1bbcb7b` / enrichment `30f05d4d-fab8-4409-a7a3-10f1be8bf091`. Biology
  (`Meselson and Stahl experiments`), economics (`Universal Opulence from Division of Labour`), and InstructKG
  (`Student Error Mapping`) Learner Paths were each judged **PASS** for prerequisite ordering with every step
  traced to CEP evidence or a grounded derived node. Sparsity evidence recorded as the gate output for F3.
- **Real-use (rule-14 F3 experiment):** `densify-experiment` over the F1 enrichment produced experiment
  `3f90d1b3-1c5e-4782-99ef-83c8ad9caa33` with **0 bridges** (components 3→3, orphans 0→0, target ancestors
  11→11); asserted snapshot hash `37dca346f1c312ce1610600b375749d5` unchanged, 0 authoritative derived rows.
- **Result:** F1 **PASS**; F3 **EXPERIMENT_ONLY**, not promoted. The v1 topology-primary trigger found no
  same-domain disconnected/orphan gaps on the connected baseline, so densification value is unmeasured. The
  earned next task is a measured thin-connected-region trigger (TODO #1). Evidence under
  `tmp/2026-06-17-f1-enrichment-eval/` and `tmp/2026-06-17-f3-densification-experiment/`.

Prior validation (2026-06-17) is the **ungroundable core demotion** InstructKG re-run
(`docs/plans/2026-06-17-001-feat-demote-ungroundable-core-plan.md`):

- **Static/unit:** `pnpm --filter @lrnki/application test` passed (105 tests); `pnpm --filter
  @lrnki/admin-lab test` passed (14 tests); `pnpm --filter @lrnki/infrastructure-postgres test` was invoked
  without `DATABASE_URL` and skipped its 8 live-DB tests; `pnpm run typecheck` passed across the workspace.
- **Real-use (rule-14 InstructKG):** reset the local PG18 database, registered the manifest fixtures, then ran
  real extraction over InstructKG source `3ccd39d7-5caa-4326-82ab-6071ff784154`. Run
  `9f0f959c-7455-4fe3-a0a6-b6193a3e750a` succeeded: 45 candidates, 6 remaining cores, 39 CEPs, 7 incomplete
  optional profiles, `degraded=false`, v6 candidate/profile projections populated (`45`/`39`). Published graph
  version `ffbeaafa-617e-4aed-a1fc-04c7b8723e44` from that run: 6 Concepts, 46 CEP passages, 5 optional
  assertions, 0 asserted edges. Admin Lab run page rendered the v6 candidate table and `Pedagogical Roles`;
  screenshot: `tmp/admin-lab-instructkg-run.png`.
- **Result:** PASS for the user-facing outcome that the InstructKG source no longer fails publication because of
  the borderline meta-concept. Caveat: this live sample did not exercise `core_demoted_ungroundable`; the
  borderline concept was already model `core` / effective `optional` from admission evidence validation
  (`standalone_learning_objective_missing_verified_evidence`,
  `definition_bearing_treatment_missing_verified_evidence`, `effective_tier_corrected`). The demotion and
  degraded machine-readable paths are covered by deterministic application tests, not by this N=1 live run.

Prior validation (2026-06-16) is the **evidence-backed node treatment** native re-run
(`docs/plans/2026-06-16-002-feat-evidence-backed-node-treatment-plan.md`,
`tmp/2026-06-16-evidence-backed-rerun/rule-14-evaluation.md`):

- **Static/unit:** `pnpm typecheck` clean across all packages; application + litellm + admin-lab suites pass;
  Postgres persistence round-trip (per-pair judge model + rescue dispositions) verified against a fresh PG18 DB.
- **Real-use (rule-14 mixed native batch):** config `cep-definition-bearing-admission-v36` /
  `cep-node-enrichment-rescue-judged-v2`. Extraction over the four native fixtures: Rust
  `69a7de11-0fce-4293-b4dd-e50ba9169a1b`, biology `e7fa2640-775b-4242-a111-3f600d9baf4f`, economics
  `8c9874d6-ee6e-4d16-84e8-b83612aafb47` all **succeeded with 0 incomplete core CEPs**; InstructKG
  `7ed1dbc1-6112-48b0-a263-5432e297f1a2` **failed** on one borderline core meta-concept (`pedagogical roles`,
  recorded in BLOCKERS). Published version `4cf872e0-872b-44e0-8bee-406f4733c1a4` (20 Concepts, 0 asserted
  edges) from the three succeeded runs; enrichment `2842dae3-a2e8-4f17-b656-3d2f1f6d6a50`. Rescue durability
  judge dropped 5/8 candidates with grounded rationales (experiment methods, illustrative example, section
  heading, contrast-only mention) and kept transferable concepts (Deep copy, Shallow copy, RAII). Clean
  expert-correct paths for Rust→Ownership (`1c9c016a`), economics→Division of Labour (`2f6ae016`), and
  biology→DNA replication (`03a2de96`).
- **Result:** the two FIX_FIRST defects from the prior batch are fixed — Rust core admission reliability
  (String Type / Heap allocation now admit core with complete CEPs) and InstructKG-class rescue noise (dropped
  with grounded dispositions, generalizing across domains). One blocker recorded (InstructKG core completeness).
  Deferred method stack stays deferred (G3 held). A FIX_FIRST found mid-run — criterion-evidence over-count
  aborting a run — was fixed generically (cap raised to 4). Disposable evidence under
  `tmp/2026-06-16-evidence-backed-rerun/`.

### Prior validation (2026-06-16, evaluation-first native batch reset):

- **Static/unit:** `pnpm --filter @lrnki/infrastructure-ingestion test -- MarkdownStructuredDocumentParser.test.ts`
  passed; `pnpm --filter @lrnki/application exec tsx --test src/runGraphEnrichment.test.ts` passed after the
  per-enrichment anchor ID fix.
- **Real-use (rule-14 mixed native batch):** registered manifest fixtures, selected successful runs
  `0911ecd0-11a1-4f6a-97a1-d4cc7f8cb272`, `4857473d-858a-4439-905d-81a1d12354be`,
  `d2b617fc-eaa8-4d84-a082-69ce99be4911`, and `d9d68ae1-ae0c-46f0-a7eb-181ed4c653dc`; published graph version
  `53197c1e-e5cf-4e46-b374-2fc812196bea` (25 Concepts / 184 CEP passages / 14 optional assertions / 0 asserted
  edges); enriched run `0f9c0118-5131-4abb-8b1f-5912e398c011` (59 derived nodes, 50 certain edges, 26 uncertain
  edges); generated paths `a5639bc9-47aa-4761-8a8f-e75774791e2b`, `4dea6196-88c3-4470-8964-a0287003423a`,
  `2ae7772b-bf22-4be1-9667-27a6f0084851`, and `c332d379-4b5e-426a-94ff-fd97e9a5ac62`.
- **Result:** Biology and economics paths are useful enough to support roadmap decisions. Rust fresh retries show
  extraction reliability defects. InstructKG shows source-mentioned rescue noise that must be fixed before adding
  downstream methods. Evidence and caveats live under `tmp/evaluation-first-roadmap-reset/`.

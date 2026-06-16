# TODO

Roadmap reset 2026-06-16 (`docs/brainstorms/2026-06-16-evaluation-first-roadmap-reset-requirements.md`,
`tmp/evaluation-first-roadmap-reset/consolidated-findings.md`): the next work is earned by real mixed-domain
pipeline output, not by deferred method-stack preference.

## TODO

Roadmap items 1–4 below were implemented and validated by the 2026-06-16 evidence-backed re-run (see
VALIDATION); they moved to COMPLETED. The next work is earned by that run's one recorded blocker.

1. **Resolve InstructKG core CEP completeness for borderline meta-concepts.** Run
   `7ed1dbc1-6112-48b0-a263-5432e297f1a2` failed closed on one core Concept, `pedagogical roles`: admission's
   definition-bearing criterion passed correctly (block-40 verbatim-verifies and defines the four roles), but
   the CEP verbatim floor could not lock a single verbatim definition passage for the *unified* meta-concept
   whose meaning is distributed across per-role sentences (see `docs/plans/BLOCKERS.md`).
   - Decide generically — a measured neural judgment, not a lexical rule — whether such a distributed-definition
     concept should be admitted `optional` rather than `core`, or whether the CEP floor should accept a bounded
     multi-passage definition for a compositionally-defined concept.
   - Do NOT patch the prompt with InstructKG-specific text or relax the verbatim floor (rule 16/17).
   - Once InstructKG publishes, inspect its rescue path directly (the durability judge currently generalizes on
     Rust/biology/economics artifacts only, because InstructKG did not publish in the 2026-06-16 run).
2. **Keep standing deferred methods deferred.** Difficulty stays the DAG-depth mock and learner state stays the
   empty mock until path quality makes calibration the limiting problem.
   - Do not reintroduce Bradley-Terry difficulty, IRT/KT, learner simulation, embeddings, clustering, or non-LLM
     prerequisite signals from method-stack preference.
   - Reconsider one only when a run-scoped inspection or measured experiment shows it beats the current explicit
     behavior without hiding provenance or identity defects.

## COMPLETED

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

Latest validation (2026-06-16) is the **evidence-backed node treatment** native re-run
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

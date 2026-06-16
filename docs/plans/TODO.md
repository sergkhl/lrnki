# TODO

Roadmap reset 2026-06-16 (`docs/brainstorms/2026-06-16-evaluation-first-roadmap-reset-requirements.md`,
`tmp/evaluation-first-roadmap-reset/consolidated-findings.md`): the next work is earned by real mixed-domain
pipeline output, not by deferred method-stack preference.

## TODO

1. **Tighten core admission against definition-bearing source treatment.** Fresh Rust retries
   `431c4015-56fa-4b2c-9464-9e906381f3a0` and `b2f4f4cb-792a-4b50-9f6d-c40f50032fa4` failed closed because
   String type / Heap allocation were admitted as core while lacking a verified Definition Passage.
   - Fix the generic admission/CEP contract so a core Concept is selected only when source treatment can support
     the Definition-Passage floor.
   - Preserve domain-neutral prompts and forced tool schemas; do not patch Rust-specific expected answers.
   - Keep failed-run quality issues inspectable in Admin Lab while preventing repeated failed publication attempts.
2. **Add a measured source-mentioned rescue admission step.** InstructKG run
   `d9d68ae1-ae0c-46f0-a7eb-181ed4c653dc` produced useful core anchors but the enrichment run
   `0f9c0118-5131-4abb-8b1f-5912e398c011` rescued 16 source-mentioned nodes, including method/evaluation
   artifacts and pedagogical-role labels that polluted the path to Knowledge Gap Diagnosis.
   - Judge whether a source-mentioned candidate is a durable prerequisite scaffold before it enters the Derived
     Graph Layer.
   - Prefer a neural, domain-neutral judgment or explicit inspection workflow; do not add hardcoded lexical deny
     patterns for role labels, ablations, or course names.
   - Keep rescued nodes derived and auditable; do not mutate asserted Concept identity.
3. **Expose enrichment-node provenance pressure in Admin Lab.** The mixed batch showed useful biology/economics
   paths and noisy InstructKG rescue in the same enrichment run.
   - Surface per-domain counts of anchors, `source_mentioned`, and `llm_grounded` nodes on enrichment detail.
   - Make paths visibly distinguish generated prerequisites from rescued source mentions.
   - Keep UI loaders read-only; all graph state still comes from persisted JSONB/relational artifacts.
4. **Re-run the native batch after the two quality fixes.** The next validation should reuse the manifest-backed
   Rust, biology, economics, and InstructKG native fixtures.
   - Require fresh successful extraction runs or explicitly record any failed retry as a blocker.
   - Publish only selected successful runs with complete core CEPs.
   - Inspect each source's anchors, CEPs, enrichment nodes, prerequisite DAG, and Learner Path before adding
     downstream graph methods.
5. **Keep standing deferred methods deferred.** Difficulty stays the DAG-depth mock and learner state stays the
   empty mock until path quality makes calibration the limiting problem.
   - Do not reintroduce Bradley-Terry difficulty, IRT/KT, learner simulation, embeddings, clustering, or non-LLM
     prerequisite signals from method-stack preference.
   - Reconsider one only when a run-scoped inspection or measured experiment shows it beats the current explicit
     behavior without hiding provenance or identity defects.

## COMPLETED

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

Latest validation (2026-06-16) is the evaluation-first native batch reset:

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

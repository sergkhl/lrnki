# TODO

1. **Gate 2 — frozen mixed-format oracle suite (ADR-0013). NOW UNBLOCKED** (the vertical slice
   validated the chain end-to-end on real output — see COMPLETED + VALIDATION).
   - Version-pinned Docling adapter; add PDF/DOCX/PPTX fixtures 4–6; freeze the mixed-format
     oracle suite. Add a non-CS domain fixture for diversity.
   - Oracle independence triangle (DeepSeek extracts, MiniMax M3 authors references via
     `kg-oracle-reference`, Mistral Small audits via `kg-oracle-judge`); quarantine disagreements.
   - Benchmark arms + quantitative metrics; promote only measured improvements.

2. **Measure the embedding tier before trusting it as a hard gate (ADR-0012 tier 2).**
   The slice keeps the Declared-Domain gate primary and exhaustive (`exhaustiveDomainMaxConcepts`),
   with cosine clustering only an additive escape valve for large domains — embeddings are still
   `EXPERIMENT_ONLY`. Re-measure on a larger per-domain graph (>14 concepts) that recall is added
   without precision loss before letting clustering reduce the candidate set.

3. **Slice deepening (replace mocks behind unchanged ports; do not start before Gate 2 signal).**
   - Real difficulty: Bradley-Terry pairwise calibration replaces `dagDepthDifficultyPort`
     (ADR-0014), `DifficultyPort` unchanged.
   - Real learner modeling: IRT/KT `LearnerStatePort` impl replaces `emptyLearnerState`.
   - Improve embedding signal in claim-sparse domains (e.g. include candidate-mention evidence,
     not only published-claim evidence) so contextual text is not label-dominated.

## COMPLETED

- **Vertical slice: Graph Enrichment → Learner Path live end-to-end (2026-06-13).** The third
  operation (ADR-0019) runs over published version `3096ec52` with real LLM calls
  (`kg-concept-embedding` = qwen3-embedding-8b 4096-dim; `kg-prerequisite-judgment` =
  deepseek-v4-flash-no-thinking, forced tool schema), producing an immutable Derived Graph Layer
  (enrichment `4efd5d1d`: 11 certain + 1 uncertain inferred-prerequisite edges after weak-edge
  cut / cycle removal / transitive reduction; mock DAG-depth difficulty). `computeLearnerPath`
  persists a deterministic difficulty-ordered prerequisite chain (path `d94ee025`, biology target,
  6 steps). New LiteLLM aliases; `EmbeddingPort` + `PrerequisiteJudgmentPort` adapters;
  `PostgresDerivedGraphLayerStore` + `PostgresLearnerPathStore`; evidence-packet assembly wired in
  `runGraphEnrichment`; pair gating retuned to domain-primary (ADR-0012 EXPERIMENT_ONLY honored);
  CLI `enrich-graph-version` / `compute-learner-path`; Admin Lab read-only Cytoscape Learner Paths
  view. Six enrichment tables appended to the single migration. Evidence:
  `tmp/vertical-slice-enrichment-quality-evaluation.md`.
- **Vertical-slice symbolic spine + seams (drafted earlier, now consumed).** `domain-core`
  derived-layer/learner-path types; enrichment ports; Postgres schema tables; tested
  `prerequisiteDag` (weak-edge cut, deterministic cycle removal, transitive reduction, DAG-depth
  difficulty, topological order/depth/ancestors) + `projectLearnerPath`.
- **Gate 1 published (graph version `3096ec52`).** Two FIX_FIRST admission/claim precision defects
  closed with deterministic fail-closed boundaries (proposition-shaped label demotion;
  definition-adjacency for `defined-as`). Four fixtures re-run under one unified config and
  inspected; one atomic version (Rust `6fd12447`, Biology `b033e736`, InstructKG `87724c03`,
  Economics `a3dbcca5`): 15 core concepts, 4 evidence-backed claims, 0 quarantines, IRIs minted.
  Evidence: `tmp/gate1-publication-quality-evaluation.md`.
- **Extraction pipeline (discovery → admission → claims).** Forced named tool schemas with zod
  fail-closed validation routed through `kg-concept-discovery` / `kg-concept-admission` /
  `kg-claim-extraction`; two-phase admission with source-level Core Set Selection; per-relation
  claim guidance, direction/nature gates, exact definition validation, causal-relation suppression;
  precision-preserving single retry; determinism lever (temperature 0 + seed) on admission/claims.
- **Application operations split (ADR-0017).** `executeExtractionRun` (run-scoped, never publishes)
  and `buildGraphVersion` (deterministic, LLM-free: domain-scoped merge, homograph quarantine,
  frozen IRI minting, dedupe, quality gates, atomic publish). Explicit-run-ID publication with
  quarantine-blocks-publication gate (AGENTS rule 11).
- **Ingestion + sources.** Native Markdown/HTML/plaintext parsers emit block-level source blocks
  with heading paths and character locators; deterministic region classification types
  non-teachable tail matter out of the LLM path. Three Gate 1 fixtures + `fixtures/manifest.json`.
- **Persistence (PostgreSQL 18, ADR-0003).** Single initial migration with seeded six-relation
  registry, run-scoped extraction tables, deterministic publication tables with frozen IRIs,
  enrichment + learner-path tables, JSONB artifact envelopes, JSON_TABLE inspection views.
  `scripts/reset-db.sh` resets cleanly.
- **Admin Lab read-only views (ADR-0011).** Graph Explorer (published snapshot, Cytoscape), Run
  Inspector (candidates by tier, claims with outcomes/evidence, proposals), Source Explorer, and
  Learner Paths (Cytoscape DAG with the persisted path highlighted). All operations CLI-triggered;
  the UI mutates nothing.

## VALIDATION

Latest validation (2026-06-13, post vertical-slice implementation):
- **Static: full `pnpm check` green** — typecheck across all 11 packages, ESLint clean, **46
  application tests pass** (43 prior + 3 new `runGraphEnrichment` orchestration tests: domain
  gating, evidence-packet assembly, directed-edge mapping), parser tests unchanged, Next.js build
  succeeds (all routes incl. new `/admin/lab/paths` + `/admin/lab/paths/[learnerPathId]`).
- **Real LLM calls, enrichment over published `3096ec52`:** enrichment `4efd5d1d` produced a
  coherent inferred-prerequisite DAG per domain (biology 6-concept chain; Rust scope→ownership→move;
  economics ambiguous edge correctly flagged uncertain). Learner path `d94ee025` returns the full
  biology chain in topological + difficulty order to target `models of DNA replication`.
- **Admin Lab:** `/admin/lab/paths` and detail render HTTP 200 with correct target label, ordered
  steps, and difficulty badges. Result: **PASS** (slice validates the chain).
- Caveats: embedding tier `EXPERIMENT_ONLY` (domain gate primary at this scale); difficulty +
  learner state are mocks behind real ports; Cytoscape screenshot not captured (no chromium binary).
  Evidence: `tmp/vertical-slice-enrichment-quality-evaluation.md`.

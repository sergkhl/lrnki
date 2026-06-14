# TODO

1. **Gate 2 — frozen mixed-format oracle suite (ADR-0013). IN PROGRESS** (the vertical slice
   validated the chain end-to-end on real output — see COMPLETED + VALIDATION).
   - DONE: version-pinned Docling adapter (PDF/DOCX/PPTX → Markdown over the async Docling HTTP API,
     OCR off, table structure off for speed); PDF fixture #4 (`2507.02554v2.pdf`, ML systems)
     ingested and extracted end-to-end (run `9b92bd64`), evidence verbatim-verifiable against stored
     blocks. Evidence: `tmp/gate2-docling-ingestion-quality-evaluation.md`.
   - Add DOCX fixture #5 and PPTX fixture #6 from real curated sources (the adapter already supports
     both MIME types; only the curated files are missing). Prefer a non-CS domain for diversity.
   - Freeze the mixed-format oracle suite once #5–#6 land.
   - Oracle independence triangle (DeepSeek extracts, MiniMax M3 authors references via
     `kg-oracle-reference`, Mistral Small audits via `kg-oracle-judge`); quarantine disagreements.
     Aliases already exist in LiteLLM; wiring does not.
   - Benchmark arms + quantitative metrics; promote only measured improvements.
   - Address pre-existing admission/claim precision noise surfaced again on fixture #4
     (proposition-shaped labels; high claim over-rejection, 1 verified / 37 rejected) — orthogonal
     to ingestion but it will distort oracle scores if left.

2. **Measure the embedding tier before trusting it as a hard gate (ADR-0012 tier 2).**
   The slice keeps the Declared-Domain gate primary and exhaustive (`exhaustiveDomainMaxConcepts`),
   with cosine clustering only an additive escape valve for large domains — embeddings are still
   `EXPERIMENT_ONLY`. Re-measure on a larger per-domain graph (>14 concepts) that recall is added
   without precision loss before letting clustering reduce the candidate set.

3. **Build and measure the embedding-assisted Concept Canonicalization cascade (ADR-0012).**
   - Keep normalized-label match within Declared Domain as the only automatic merge authority.
   - Use contextual embeddings to propose identity candidates and an LLM to verify reversible aliases.
   - Keep the cascade outside publication until curated fixtures show added recall without precision loss.

4. **Slice deepening (replace mocks behind unchanged ports; do not start before Gate 2 signal).**
   - Real difficulty: Bradley-Terry pairwise calibration replaces `dagDepthDifficultyPort`
     (ADR-0014), `DifficultyPort` unchanged.
   - Real learner modeling: IRT/KT `LearnerStatePort` impl replaces `emptyLearnerState`.
   - Improve embedding signal in claim-sparse domains (e.g. include candidate-mention evidence,
     not only published-claim evidence) so contextual text is not label-dominated.

## COMPLETED

- **Canonical architecture consolidation (2026-06-14).** Completed
  the architecture and code-review follow-ups: `CONTEXT.md` is now a domain glossary, ADR ownership
  is explicit, and stale duplicate definitions were removed. Stable Concept identity is separated
  from immutable graph-version presentation; graph reads and Learner Paths select explicit
  version/run IDs; Enrichment Runs are append-only with relational query surfaces plus complete JSONB
  judgment/disposition traces. Enrichment artifact persistence now reuses the canonical envelope
  writer inside the transaction. Cross-domain homographs publish separately with normal trust and an
  inspection flag, while genuine quarantine still blocks. Real-use inspection also added a
  fail-closed evidence gate so enrichment cannot infer from labels alone. Evidence:
  `tmp/canonical-architecture-consolidation-quality-evaluation.md`.
- **Gate 2 mixed-format ingestion: Docling adapter live (2026-06-14).** `DoclingStructuredDocumentParser`
  (PDF/DOCX/PPTX) behind the existing `StructuredDocumentParserPort`; markdown block-walking extracted
  into a shared `extractMarkdownBlocks` so native-markdown and Docling share one region-classification
  contract (incl. a new `<!-- image -->`/`<!-- formula -->` placeholder rule). Async submit→poll→fetch
  flow (the sync endpoint's 120s cap 504'd on a large PDF); conversion simplified to
  `do_table_structure=false` (~45% faster, tables are discarded placeholders anyway). PDF fixture #4
  ingested + extracted end-to-end with real LLM calls; evidence verbatim-verifiable against stored
  blocks. Docling docker service builds and runs healthy. Evidence:
  `tmp/gate2-docling-ingestion-quality-evaluation.md`.
- **Vertical slice: Graph Enrichment → Learner Path live end-to-end (2026-06-13).** The third
  operation (ADR-0019) runs over published version `3096ec52` with real LLM calls
  (`kg-concept-embedding` = qwen3-embedding-8b 4096-dim; `kg-prerequisite-judgment` =
  deepseek-v4-flash-no-thinking, forced tool schema), producing an immutable Derived Graph Layer
  (enrichment `4efd5d1d`: 11 certain + 1 uncertain inferred-prerequisite edges after weak-edge
  cut / cycle removal / transitive reduction; mock DAG-depth difficulty). `computeLearnerPath`
  persists a deterministic difficulty-ordered prerequisite chain (path `d94ee025`, biology target,
  6 steps). New LiteLLM aliases; `EmbeddingPort` + `PrerequisiteJudgmentPort` adapters;
  `PostgresEnrichmentRunStore` + `PostgresLearnerPathStore`; evidence-packet assembly wired in
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
  and `buildGraphVersion` (deterministic, LLM-free: domain-scoped merge, homograph flagging,
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

Latest validation (2026-06-14, post code-review cleanup):
- **Static: full `pnpm check` green** — typecheck across all packages, ESLint clean, **9 ingestion
  tests** (7 prior + 2 new shared-extractor tests: HTML-comment placeholder handling, depth-2 title)
  and **48 application tests** pass, Next.js build succeeds.
- **PostgreSQL 18:** the single initial migration resets cleanly. A real OpenStax extraction run
  (`7f987c33-65c3-4001-a883-23597b20f1ba`) published twice with the same four stable Concept IDs.
  Enrichment Run `84a0f853-0a5d-4405-940d-d4d09bbd24fb` persisted exactly one
  `enrichment_run.v2` artifact through the canonical envelope writer, and Learner Path
  `ba2c4ef0-9fe6-4130-83ca-2a2db7c63b9f` persisted from that explicit run.
- **Real extraction + enrichment:** OpenStax Biology run
  `7f987c33-65c3-4001-a883-23597b20f1ba` produced 20 Candidates, 4 core Concepts, and 0 verified /
  11 rejected Claims. Enrichment over graph version `a9df3ea6-2164-4fa3-9128-dceac5114c7b`
  produced 0 unsupported edges; the resulting target-only Learner Path confirms explicit-run
  projection and persistence. Result: **PASS** for cleanup, transaction-bound persistence, and
  end-to-end wiring.
- Caveat: claim recall remains poor on this fixture (0 verified / 11 rejected), so claim-sparse
  enrichment is intentionally empty and not yet useful for Learner Paths.

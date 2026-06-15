# TODO

Roadmap reset 2026-06-15 (`docs/brainstorms/2026-06-15-kg-core-complexity-reset-requirements.md`):
the product critical path is concept admission → enrichment prerequisite inference → learner path.
Asserted claims moved off that path and are replaced by Concept Evidence Profiles; standing
measurement became disposable scaffolding and is retired.

## EXECUTION STATUS (plan `docs/plans/2026-06-15-001-refactor-concept-evidence-profile-core-plan.md`)

The 7-unit complexity reset is **complete** on branch **`refactor/cep-core-reset`** (off `main`):
U1 atomic admission + neural source-role, U2 oracle/aligner teardown, U3 CEP extraction, U4 append-only
zero-edge CEP publication, U5 exhaustive same-domain CEP-pair enrichment, U6 worker/Admin Lab/export
reshape, U7 ADR + CONTEXT + docs rewrite. Each behavior-changing unit recorded a rule-14 PASS (see
COMPLETED). Only the deferred, port-mocked deepening below remains.

Operational notes:
- LiteLLM proxy serves the judge alias **`kg-independent-judge`** (gpt-oss-120b); any alias change in
  `litellm/config.yaml` requires `docker restart lrnki-litellm`.
- Worker pipeline config hash is at **`...-atomic-admission-source-role-v31`**; bump it whenever
  admission/CEP/judge prompts or schemas change.
- Postgres 18 + Docling + LiteLLM are reachable; 5 fixtures registered (`worker:kg list-sources`).
- The single migration is the CEP-era schema (no claim/relation tables); reset with `scripts/reset-db.sh`.

## REMAINING WORK

1. **Deferred — mocks stay behind ports; do not build until measured need.**
   - Difficulty stays the DAG-depth mock (`DifficultyPort`); learner state stays the empty mock
     (`LearnerStatePort`). No Bradley-Terry, IRT/KT, anomaly detection, or synthetic priors.
   - Cut and kept cut: embedding canonicalization cascade + embedding blocking tier; deterministic
     identity (ADR-0015) stays the sole merge authority. Any future cost-bound pair-selection mechanism
     must be measured against exhaustive same-domain judgment before it can veto pairs.
   - DOCX and PPTX curated-source expansion (Docling adapter already supports them).

## COMPLETED

- **Reset milestone 4 — worker/Admin Lab/export reshape + docs (U6+U7, branch `refactor/cep-core-reset`).**
  U6: Run Inspector + run list now report CEP completeness and definition/mention/assertion counts (no
  claim/proposal reads); the published Graph Explorer is a zero-edge CEP evidence inspector with no graph
  canvas; new read-only Enrichment Run list + detail render the Derived Graph Layer's prerequisite DAG in
  Cytoscape with an equivalent textual view, independent of learner paths; RDF export emits only Concept
  identity/labels/aliases; the orphan admission-variance probe is deleted. rule-14 PASS over the live Rust
  DB rendered via `next start` (published view 0 edges/0 canvases, derived chain Variable scope → Ownership
  → Move semantics → Copy trait); see `tmp/u6-admin-lab-quality-evaluation.md`. U7: rewrote
  ADR-0002/0005/0007/0009/0012/0013/0016/0019/0022, the ADR README, CONTEXT.md vocabulary, README,
  fixtures notes, and this roadmap to describe only the post-reset architecture.
- **Reset milestone 3 — exhaustive same-domain CEP-pair enrichment (U5, `a1e32b5`).** Removed the
  embedding-clustering / candidate-group tier; every unordered same-domain Concept pair is judged from both
  Concepts' published CEPs; `explicit-prerequisite-hint` is labeled evidence, never a deterministic edge;
  bounded concurrency (default 4), deterministic order, atomic failure on retry exhaustion. The judge names
  the prerequisite concept by verbatim label to kill a positional direction bias. rule-14 PASS: real Rust
  DAG expert-correct.
- **Reset milestone 2 — CEP extraction + publication (U3+U4).** U3 (`d612f16`): replaced claim extraction
  with concept-conditioned CEP extraction (`applyEvidenceProfilePolicy` + `applyAssertionEntailmentJudge`),
  retired the broad relation surface, claim-recall retries, conflict pass, and missing-concept escape
  hatch; run-scoped CEP rows + immutable artifact in one transaction. U4 (`72ebde6`): publication unions CEP
  evidence — `GraphSnapshot` carries Concepts + one CEP each and ZERO asserted edges; `buildGraphVersion`
  takes `baseGraphVersionId` + selected runs, resolves identities (ADR-0015), unions and exact-deduplicates
  cumulative source evidence (R3/AE2), remaps/omits `explicit-prerequisite-hint` targets; migration rewritten
  and DB reset. rule-14 PASS; see `tmp/u4-cep-publication-quality-evaluation.md`.
- **Reset milestone 1 — atomic admission precision + oracle teardown (U1+U2).** U1: admission emits
  one-or-many ATOMIC proposals per discovered candidate; Core Set Selection runs over atoms; a neural
  `sourceRole` (AGENTS rule 16) replaced the deterministic illustrative-section regex and closed the
  InstructKG cross-domain CS/SQL leak. rule-14 PASS over Rust/InstructKG/MLE-bench. U2 (`85c083c`): deleted
  the `quality-lab` package, LiteLLM oracle adapters, oracle/aligner types + ports + schemas, and frozen
  artifacts; renamed retained inline judges to `kg-independent-judge`. Durable quality bar = rule-14 +
  inline judges + verbatim-evidence floor.
- **Gate 1 asserted-graph pipeline (historical).** Native ingestion → discovery → two-phase admission →
  (pre-reset) claims → deterministic LLM-free `buildGraphVersion` with frozen IRIs, quality gates, atomic
  publish, quarantine-blocks-publication; explicit run/version IDs (ADR-0017, 0010).
- **Vertical slice: Graph Enrichment → Learner Path (ADR-0019).** Immutable Derived Graph Layer over a
  published version with real LLM forced-tool prerequisite judgment; weak-edge cut / cycle removal /
  transitive reduction; mock DAG-depth difficulty + mock empty learner state behind ports; persisted
  difficulty-ordered Learner Path; Admin Lab read-only Cytoscape views.
- **Canonical architecture consolidation.** Stable Concept identity separated from immutable graph-version
  presentation; reads select explicit version/run IDs; Enrichment Runs append-only with relational query
  surfaces + full JSONB traces; cross-domain homographs publish separately with an inspection flag.
- **Gate 2 mixed-format ingestion (Docling) + retired oracle benchmark.** `DoclingStructuredDocumentParser`
  (PDF/DOCX/PPTX) behind `StructuredDocumentParserPort`; shared `extractMarkdownBlocks`; PDF fixture
  end-to-end with verbatim-verifiable evidence. The Gate 2 oracle benchmark (independence triangle +
  scoring-only label aligner) yielded the admission-precision diagnoses that drove U1, then was deleted with
  the rest of the standing harness in U2 (ADR-0013/0022).

## VALIDATION

Latest validation (2026-06-15) is **after the full U1–U7 reset** on branch `refactor/cep-core-reset`:

- **Static:** all workspace typechecks pass; tests green (application 67, infrastructure-litellm 13,
  infrastructure-ingestion 9, admin-lab 9, infrastructure-rdf-export 2; live-PG integration tests no-op
  without `DATABASE_URL`); ESLint clean; `next build` compiles all routes. Clear `apps/admin-lab/.next`
  and run `next typegen` if stale typed-route errors appear.
- **Real-use (rule-14):** U1–U6 each recorded a PASS over real model/DB runs (see COMPLETED and the
  `tmp/u*-quality-evaluation.md` notes). The published Gate 1 graph identity is preserved (ADR-0015).
- The reset is complete; re-validate only when the deferred mocks (difficulty, learner state) are replaced.

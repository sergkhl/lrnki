# TODO

Roadmap reset 2026-06-15 (`docs/brainstorms/2026-06-15-kg-core-complexity-reset-requirements.md`):
the product critical path is concept admission → enrichment prerequisite inference → learner path.
Asserted claims move off that path and are replaced by Concept Evidence Profiles; measurement becomes
disposable scaffolding.

1. **Fix Concept Admission precision, then retire the oracle harness.**
   Admission decides which Concepts enter the prerequisite DAG, so it is on the critical path. Drive
   these fixes with the existing frozen Gate 2 results — this is their last use, after which the harness
   is deleted (task is complete only when both the fix and the teardown land).
   - Cross-domain optional precision leak: out-of-domain illustrative examples (merge sort, recursion,
     `FOREIGN KEY`, SQL clauses, Dynamic Programming) were admitted `optional` instead of rejected
     (InstructKG admit P=0.16). Tighten the Declared-Domain relevance signal so illustrative
     cross-domain mentions reject.
   - Core-poor under-tiering (rust, InstructKG): apply the Core Set Selection lever that fixed the ML PDF.
   - Split conflated labels (rust `The stack and the heap`) into atomic Concepts.
   - Once these pass rule-14 expert inspection, delete the oracle triangle, label aligner,
     quarantine-of-disagreement, frozen references, and `scoreAdmissionOracle*` in the same change. The
     durable quality bar becomes rule-14 read + inline judges + the verbatim-evidence floor.

2. **Replace asserted claims with Concept Evidence Profiles (the core redefinition).**
   - CEP per admitted Concept: verbatim definition snippet(s) + bounded (salience-capped) mention
     passages + per-source provenance; append-only union across sources.
   - Retire the six-relation registry. Keep only `defines` + `explicit-prerequisite-hint` as guarded
     typed evidence INSIDE CEPs (verbatim + entailment checks); never publish them as authoritative
     relations.
   - Stop publishing asserted claims as a headline artifact: published asserted graph = Concepts + CEPs,
     no asserted edges. Remove claim-recall logic and the broad relation-extraction surface.
   - Update Admin Lab Graph Explorer to show Concepts + evidence; edges appear only in Derived Graph
     Layers.

3. **Feed enrichment prerequisite judgment over CEP pairs (promotes the old enrichment-evidence task).**
   - Prerequisite judgment reasons over pairs of CEPs (definitions + bounded mentions), not over labels
     or published claims. Validate by rule-14 inspection of the inferred DAG and learner path.

4. **Rewrite affected ADRs in place + CONTEXT.md vocabulary.**
   - Rewrite ADR-0002, 0005, 0007, 0013, 0016, 0022 in place (no superseding ADRs).
   - CONTEXT.md: revise `Claim` / `Relation Registry` / `Asserted Relation`; add `Concept Evidence
     Profile` and the two optional-assertion types. ADR-0015 and ADR-0019 are unchanged and preserved.

5. **Deferred — mocks stay behind ports; do not build.**
   - Difficulty stays the DAG-depth mock (`DifficultyPort`); learner state stays the empty mock
     (`LearnerStatePort`). No Bradley-Terry, IRT/KT, anomaly detection, or synthetic priors.
   - Cut: embedding canonicalization cascade + embedding blocking tier; deterministic identity
     (ADR-0015) stays the sole merge authority. Interpretable non-LLM prerequisite signals and
     clustering remain deferred.

## COMPLETED

- **Gate 1 asserted-graph pipeline published (graph version `3096ec52`).** Native curated-source
  ingestion (Markdown/HTML/plaintext block-level parsing with locators + deterministic region
  classification); discovery → two-phase admission (source-level Core Set Selection) → claims with
  forced named tool schemas + zod fail-closed validation; deterministic LLM-free `buildGraphVersion`
  (domain-scoped merge, homograph flagging, frozen IRI minting, quality gates, atomic publish,
  quarantine-blocks-publication); explicit run/version IDs (ADR-0017, 0010). 15 core concepts /
  4 claims / 0 quarantines.
- **Vertical slice: Graph Enrichment → Learner Path live end-to-end (ADR-0019).** Immutable Derived
  Graph Layer over a published version with real LLM calls (qwen3-embedding-8b + deepseek-v4-flash
  forced-tool prerequisite judgment): weak-edge cut / cycle removal / transitive reduction; mock
  DAG-depth difficulty + mock empty learner state behind `DifficultyPort` / `LearnerStatePort`;
  persisted difficulty-ordered Learner Path; Admin Lab read-only Cytoscape views. This is the engine
  the reset preserves and builds on.
- **Canonical architecture consolidation.** Stable Concept identity separated from immutable
  graph-version presentation; reads select explicit version/run IDs; Enrichment Runs append-only with
  relational query surfaces + full JSONB traces; cross-domain homographs publish separately with an
  inspection flag; fail-closed evidence gate so enrichment cannot infer from labels alone.
- **Inline production judges (the durable neuro-symbolic gates, AGENTS rule 16).** Semantic
  claim-entailment judge replaced lexical claim vetoes (`ClaimEntailmentJudgmentPort`, downgrade-only,
  fail-closed span grounding); measured downgrade-only concept-vs-proposition admission judge
  (`AdmissionLabelJudgmentPort`) replaced the deleted `looksLikePropositionLabel` lexical veto. These
  gates and the verbatim-evidence floor are retained as the durable quality bar.
- **Gate 2 mixed-format ingestion (Docling).** `DoclingStructuredDocumentParser` (PDF/DOCX/PPTX) behind
  `StructuredDocumentParserPort`; shared `extractMarkdownBlocks`; async submit→poll→fetch; PDF fixture
  ingested + extracted end-to-end, evidence verbatim-verifiable. (DOCX/PPTX fixtures de-scoped.)
- **Gate 2 oracle benchmark — complete, now superseded as standing infra (ADR-0013, rule 11).** Five
  human-reviewed arms (biology, ML, rust, economics, InstructKG) via independence triangle (Xiaomi MiMo
  author + gpt-oss-120b audit) + scoring-only label aligner (ADR-0022). Its durable value is the
  diagnoses feeding TODO #1 (cross-domain optional precision leak, core-poor under-tiering, conflated
  labels). Per the reset, the harness + frozen references are scheduled for deletion in TODO #1 once the
  admission-precision fix lands; results archived under `tmp/`.
- **Persistence (PostgreSQL 18, ADR-0003).** Single initial migration: seeded relation registry,
  run-scoped extraction tables, deterministic publication tables with frozen IRIs, enrichment +
  learner-path tables, JSONB artifact envelopes, JSON_TABLE inspection views; `scripts/reset-db.sh`.
  (Migration to be rewritten for the CEP model + claim-table removal under TODO #2.)
- **Admin Lab read-only views (ADR-0011).** Graph Explorer, Run Inspector, Source Explorer, Learner
  Paths (Cytoscape). CLI-triggered operations; the UI mutates nothing. (Graph Explorer to be reshaped
  to Concepts + evidence under TODO #2.)

## VALIDATION

Latest validation (2026-06-15) is the **pre-reset baseline** — this brainstorm/roadmap update touched
only planning + `tmp/` artifacts, no source code, so the suite matches the prior baseline:

- **Static:** all source-package typechecks pass; tests green — quality-lab 8, infrastructure-litellm 8,
  infrastructure-ingestion 9, application 59 (84 total, 0 fail); ESLint clean. (The lone typecheck error
  remains the Next.js dev-server-generated `apps/admin-lab/.next/dev/types/validator.ts`, regenerated by
  the production build.)
- **Trust status:** all five Gate 2 admission arms were human-trusted before the reset, with documented
  scoring caveats (`AIDE`, economics `Self-interest`). No new graph version was published.
- Re-validate after TODO #1–#2 land, since both remove code paths (oracle harness, claim/registry).

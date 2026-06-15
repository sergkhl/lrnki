# TODO

Roadmap reset 2026-06-15 (`docs/brainstorms/2026-06-15-kg-core-complexity-reset-requirements.md`):
the product critical path is concept admission → enrichment prerequisite inference → learner path.
Asserted claims move off that path and are replaced by Concept Evidence Profiles; measurement becomes
disposable scaffolding.

## EXECUTION STATUS (plan `docs/plans/2026-06-15-001-refactor-concept-evidence-profile-core-plan.md`)

Executing on branch **`refactor/cep-core-reset`** (off `main`). Plan units map to this TODO:
U1+U2 = item below "Fix admission … retire oracle" (**DONE**, see COMPLETED); U3+U4 = item 1 (CEP +
publication); U5 = item 2 (enrichment over CEP pairs); U6 = Admin Lab reshape (folded into item 1's last
bullet); U7 = item 3 (ADRs/CONTEXT) + finalizing this TODO. Items track product intent; the plan's U-IDs
track execution.

**Next entry point: U3** — replace claim extraction with Concept Evidence Profile extraction (item 1,
first bullet). U3 ends in a mandatory rule-14 gate (inspect real CEPs from Rust/biology/economics) BEFORE
U4's persistence rewrite — same FIX_FIRST discipline that closed the InstructKG leak in U1.

Operational notes for the next agent:
- LiteLLM proxy serves the renamed judge alias **`kg-independent-judge`** (gpt-oss-120b); any alias
  change in `litellm/config.yaml` requires `docker restart lrnki-litellm` to take effect.
- Worker pipeline config hash is at **`...-atomic-admission-source-role-v31`**; bump it whenever
  admission/CEP/judge prompts or schemas change.
- Postgres 18 + Docling + LiteLLM are reachable; 5 fixtures registered (`worker:kg list-sources`).
- The migration is still the claim-era schema; U3/U4 rewrite it and reset the DB.

1. **Replace asserted claims with Concept Evidence Profiles (the core redefinition).**
   - CEP per admitted Concept: verbatim definition snippet(s) + bounded (salience-capped) mention
     passages + per-source provenance; append-only union across sources.
   - Retire the six-relation registry. Keep only `defines` + `explicit-prerequisite-hint` as guarded
     typed evidence INSIDE CEPs (verbatim + entailment checks); never publish them as authoritative
     relations.
   - Stop publishing asserted claims as a headline artifact: published asserted graph = Concepts + CEPs,
     no asserted edges. Remove claim-recall logic and the broad relation-extraction surface.
   - Update Admin Lab Graph Explorer to show Concepts + evidence; edges appear only in Derived Graph
     Layers.

2. **Feed enrichment prerequisite judgment over CEP pairs (promotes the old enrichment-evidence task).**
   - Prerequisite judgment reasons over pairs of CEPs (definitions + bounded mentions), not over labels
     or published claims. Validate by rule-14 inspection of the inferred DAG and learner path.

3. **Rewrite affected ADRs in place + CONTEXT.md vocabulary.**
   - Rewrite ADR-0002, 0005, 0007, 0013, 0016, 0022 in place (no superseding ADRs).
   - CONTEXT.md: revise `Claim` / `Relation Registry` / `Asserted Relation`; add `Concept Evidence
     Profile` and the two optional-assertion types. ADR-0015 and ADR-0019 are unchanged and preserved.

4. **Deferred — mocks stay behind ports; do not build.**
   - Difficulty stays the DAG-depth mock (`DifficultyPort`); learner state stays the empty mock
     (`LearnerStatePort`). No Bradley-Terry, IRT/KT, anomaly detection, or synthetic priors.
   - Cut: embedding canonicalization cascade + embedding blocking tier; deterministic identity
     (ADR-0015) stays the sole merge authority. Interpretable non-LLM prerequisite signals and
     clustering remain deferred.

## COMPLETED

- **Reset milestone 1 — atomic admission precision + oracle teardown (U1+U2, branch `refactor/cep-core-reset`).**
  U1 (`5b2e819`, `9b1bb62`): admission emits one-or-many ATOMIC proposals per discovered candidate
  (`parentCandidateKey` + run-local `atomicKey`); Core Set Selection runs over atoms; the deterministic
  illustrative-section regex is replaced by a neural `sourceRole` (AGENTS rule 16) that rejects
  out-of-domain illustration. rule-14 PASS over real DeepSeek runs of Rust/InstructKG/MLE-bench: atomic
  split fired live ("Stack and Heap" → two parented atoms), established ML concepts stayed core in a
  method paper, and the InstructKG cross-domain CS/SQL leak was closed (`tmp/u1-admission-atomic-source-role-quality-evaluation.md`).
  U2 (`85c083c`): deleted the `quality-lab` package, LiteLLM oracle adapters, oracle/aligner domain types
  + ports + tool schemas, and the frozen oracle/alignment artifacts under `tmp/`; renamed the retained
  inline judges to the `kg-independent-judge` production alias. Durable quality bar is now rule-14 +
  inline judges + the verbatim-evidence floor. Full suite green (typecheck + 81 tests + lint).
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

Latest validation (2026-06-15) is **after reset milestone 1 (U1+U2)** on branch `refactor/cep-core-reset`:

- **Static:** all source-package typechecks pass; tests green — infrastructure-litellm 8,
  infrastructure-ingestion 9, application 64 (81 total, 0 fail; quality-lab's 8 removed with the
  package); ESLint clean. Clear the Next.js dev-generated `apps/admin-lab/.next` before typechecking if a
  stale `validator.ts` error appears.
- **Real-use (rule-14):** U1 PASS over live DeepSeek runs of Rust/InstructKG/MLE-bench (see COMPLETED).
  No new graph version published; the published Gate 1 graph (`3096ec52`) is untouched.
- Re-validate after each remaining unit lands — U3/U4 rewrite the migration and reset the DB, U5 removes
  the embedding path, U6 reshapes the Admin Lab.

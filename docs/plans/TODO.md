# TODO

1. **Gate 2 — frozen mixed-format oracle suite (ADR-0013). NOW UNBLOCKED — highest value.**
   The admission defect that would distort oracle scores is fixed (see COMPLETED), so run this now.
   - DONE: Docling adapter (PDF/DOCX/PPTX → Markdown, async API, OCR/table-structure off); PDF
     fixture #4 (`2507.02554v2.pdf`) ingested + extracted (run `9b92bd64`), evidence verbatim.
   - DOCX/PPTX fixtures are OUT OF SCOPE (de-scoped).
   - Optional research: ingest markdown through Docling too, to share one DoclingDocument structure
     and retire the native markdown parser — only if it earns its keep.
   - Oracle independence triangle (DeepSeek extracts, MiniMax M3 authors references via
     `kg-oracle-reference`, Mistral Small audits via `kg-oracle-judge`); quarantine disagreements.
     Aliases exist in LiteLLM; wiring does not.
   - Benchmark arms + quantitative metrics; promote only measured improvements.

2. **Improve claim extractor RECALL (claim-side lever; the next bottleneck).**
   - Admission no longer starves the claim space (core 6→12/14 on the ML PDF), but concept-to-
     concept extraction is still sparse on some sources (ML PDF: 2 verified) even with more core
     endpoints. Diagnose extractor recall.
   - Address the borderline `is-a` direction case (general is-a specific) from the judge eval via
     extraction direction-prompt tightening.

3. **Measure the embedding tier before trusting it as a hard gate (ADR-0012 tier 2).**
   The slice keeps the Declared-Domain gate primary and exhaustive (`exhaustiveDomainMaxConcepts`),
   with cosine clustering only an additive escape valve for large domains — embeddings are still
   `EXPERIMENT_ONLY`. Re-measure on a larger per-domain graph (>14 concepts) that recall is added
   without precision loss before letting clustering reduce the candidate set.

4. **Build and measure the embedding-assisted Concept Canonicalization cascade (ADR-0012).**
   - Keep normalized-label match within Declared Domain as the only automatic merge authority.
   - Use contextual embeddings to propose identity candidates and an LLM to verify reversible aliases.
   - Keep the cascade outside publication until curated fixtures show added recall without precision loss.

5. **Slice deepening (replace mocks behind unchanged ports; do not start before Gate 2 signal).**
   - Real difficulty: Bradley-Terry pairwise calibration replaces `dagDepthDifficultyPort`
     (ADR-0014), `DifficultyPort` unchanged.
   - Real learner modeling: IRT/KT `LearnerStatePort` impl replaces `emptyLearnerState`.
   - Improve embedding signal in claim-sparse domains (e.g. include candidate-mention evidence,
     not only published-claim evidence) so contextual text is not label-dominated.
   - Possible rule-16 follow-up: fold the `isExplicitlyIllustrative` lexical heuristic
     (`executeExtractionRun.ts`) into the admission judge or a measured module.

## COMPLETED

- **Admission recall + measured concept-vs-proposition judge (2026-06-14, ADR-0021).** Admission
  was the binding recall bottleneck. Two independent axes: (recall) a strengthened Core Set
  Selection prompt that RETAINS established, substantively-taught domain concepts on method/survey
  papers and narrows the illustrative-only demotion; (precision) a measured, downgrade-only neural
  concept-vs-proposition judge (`AdmissionLabelJudgmentPort` + forced-tool
  `LiteLlmAdmissionLabelJudgmentAdapter` on `kg-oracle-judge`, fail-closed grounding =
  preserve-recall) composed as `applyAdmissionLabelJudge` after the deterministic boundary. The
  deterministic `looksLikePropositionLabel` lexical veto and its `PROPOSITION_*` constant sets were
  DELETED (AGENTS rule 16); label source-grounding stays deterministic (a provable substring
  property). Frozen agent-authored oracle (`tmp/admission-oracle/`, needs human review): judge
  precision-first at 8/8 concepts kept (0 false demotions, incl. surface-trap negatives the lexical
  matcher mishandled) and 2/2 propositions recovered. Real v29 re-runs: ML PDF core 6→12/14 (MCTS /
  evolutionary search / overfitting recovered; AutoML legitimately optional via eligibility), no
  proposition core label; concept→concept claims ML 1→2, biology 1→4 (3 genuine contrasts), rust
  core clean. Evidence: `tmp/admission-recall-quality-evaluation.md`.
- **Semantic claim-entailment judge replaces lexical claim gates (2026-06-14, ADR-0020).** Removed
  hardcoded surface-matcher vetoes (`evidence_does_not_name_both_endpoints`,
  `evidence_does_not_lexically_entail_relation`,
  `evidence_does_not_lexically_entail_definition`) from `applyClaimPolicy` under AGENTS rule 16,
  keeping the verbatim floor, nature/direction self-report gates, and aggregate structural gates.
  Added `ClaimEntailmentJudgmentPort` + forced-tool
  `LiteLlmClaimEntailmentJudgmentAdapter` (`kg-oracle-judge` = Mistral Small, fail-closed span
  grounding) + downgrade-only `applyEntailmentJudge` for concept relations and paraphrased
  definitions. Definition judgments separately classify subject identity and meaning support;
  qualified variants and absent subjects fail closed. Retry eligibility now uses the semantic
  verdict. Discovery aliases are non-authoritative, and admission relabels apply only when
  source-grounded, preventing `MLE-bench lite`/`MLE-bench` and narrowed-label conflation.
  Frozen agent-authored oracle (9 concept claims, 1 genuine TRUE; `tmp/claim-oracle/`,
  needs human review) measured the judge at precision 1.00 / recall 1.00 / 0 false positives — it even
  distinguishes the same claim under entailing vs non-entailing evidence. Re-runs: biology 0/11→2/10,
  rust 1/3→2/3 verified, no inspected garbage. Prompt tightened against symmetric over-generation.
  Evidence: `tmp/claim-entailment-judge-quality-evaluation.md`.
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

Latest validation (2026-06-14, admission recall + concept-vs-proposition judge / pipeline v29):
- **Static:** full `pnpm check` green; 59 application, 9 ingestion, and 8 LiteLLM adapter tests pass;
  ESLint and the Next.js production build succeed.
- **Promotion gate (frozen oracle `tmp/admission-oracle/`):** the concept-vs-proposition judge is
  precision-first — 8/8 concepts kept (0 false demotions, incl. surface-trap negatives "Right to Be
  Forgotten" / "Survival of the Fittest" / "Bounded Rationality") and 2/2 propositions recovered
  ("Operator Set as Bottleneck to Performance" → "Operator Set"); precision/recall 1.00.
- **Real extraction:** ML PDF runs `7de8a8fc` (core 12, 2 concept + 2 def verified) and `0e0d7c0b`
  (core 14, 2 concept + 8 def) — established concepts MCTS / evolutionary search / overfitting now
  core (6→12/14), no proposition core label; Rust run `f7727458` → core 3 (clean) / 2 definitions;
  biology run `895c1c5f` → core 6 / 4 verified incl. 3 genuine `contrasts-with`. All verified claims
  inspected and source-supported. Result: **PASS**.
- **Caveat:** selection stability Jaccard ≈0.73 across the two ML runs (established-concept core
  stable, periphery varies; not engineered, KTD6); concept-to-concept claim recall is now the next
  lever (TODO #2); AutoML lost to upstream eligibility; no new graph version was published.

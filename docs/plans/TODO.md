# TODO

1. **Improve claim extractor RECALL + fix admission tiering/precision (recall + precision levers).**
   Gate 2 oracle coverage is complete and human-trusted across all five arms (see COMPLETED); the
   benchmark now points clearly at extraction defects, not scoring artifacts.
   - **Claim recall:** admission no longer starves the claim space on the ML PDF (core 6→12/14), but
     concept-to-concept extraction is still sparse on some sources (ML PDF: 2 verified) even with more
     core endpoints. Diagnose extractor recall.
   - **Core-poor under-tiering (rust + InstructKG):** rust tiered 3 production core vs 8 reference;
     InstructKG tiered `prerequisite relationship`, `compositional relationship`, `concept extraction`
     optional though they are reference-core. Apply the Core Set Selection lever (the one that fixed
     the ML PDF) to both. Rust also emitted a CONFLATED label `The stack and the heap` (one label, two
     concepts) — split conflated labels into atomic concepts.
   - **Cross-domain optional precision leak (InstructKG):** production admitted out-of-domain CS
     illustrative examples (`Merge sort`, `Recursion`, `FOREIGN KEY`, SQL clauses, `Dynamic
     Programming`) as `optional` rather than rejecting them (admit precision 0.16). These are
     illustrative material from another domain, not durable ed-tech concepts. Tighten the
     Declared-Domain relevance signal at admission so illustrative cross-domain mentions are rejected.
   - Address the borderline `is-a` direction case (general is-a specific) from the judge eval via
     extraction direction-prompt tightening.
   - Residual scoring caveats (NOT extractor changes): `AIDE` core-vs-optional and economics
     `Self-interest` core-vs-optional are genuine ambiguous boundaries; the durable fix is a
     reference-rubric note marking established named systems / named principles core-eligible. The
     `Operator`/`operators` and `Pedagogical roles`/`pedagogical role classification` granularity
     tensions are handled conservatively by the aligner.
   - Optional research: ingest markdown through Docling too, to share one DoclingDocument structure
     and retire the native markdown parser — only if it earns its keep.

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
   - Possible rule-16 follow-up: fold the `isExplicitlyIllustrative` lexical heuristic
     (`executeExtractionRun.ts`) into the admission judge or a measured module.

## COMPLETED

- **Gate 2 oracle benchmark COMPLETE + human-reviewed across all five arms (2026-06-14/15, ADR-0013,
  rule 11).** Acting as the human reviewer over the frozen biology + ML + rust + economics +
  InstructKG admission oracles, their alignments, and the admission concept-vs-proposition (10) and
  claim-entailment (9) judge oracles. Economics + InstructKG were freshly re-extracted under the
  current pipeline (econ run `6f85ce74`, InstructKG run `fa6f49a1`), then authored (Xiaomi MiMo) +
  audited (gpt-oss-120b) + aligned + human-reviewed, with an **independent expert extraction of each
  source compared to the pipeline** (rule 11 / user instruction). Re-verified the one provable floor
  independently (`tmp/gate2-oracle/verify-human-review.ts`): **148/150 evidence quotes grounded
  verbatim**; the 2 ungrounded belong to an already-quarantined InstructKG label (floor correctly
  hard-vetoed it), so **all trusted labels are 100% grounded**. Verdicts: biology ACCEPTED clean; ML
  ACCEPTED with caveats (AIRA-dojo quarantine; AIDE core/optional ambiguous boundary); rust ACCEPTED
  with caveats (core-poor + conflated `The stack and the heap`); economics ACCEPTED clean (core
  **P=1.00 R=0.80 F1=0.89**, exact 4/4 match to the independent read, `Pin factory` quarantined,
  `Self-interest` a genuine core/optional boundary); InstructKG ACCEPTED with caveats (aligner 5
  plural merges lifted core F1 0.00→0.46, admit recall→0.91; audit quarantined 11/22 incidental
  tools + pipeline steps). **All 21 alignment merges across the five arms are correct, zero wrong
  merges** (independently confirms ADR-0022). Both judge oracles fully agreed. Real-use production
  findings (NOT reference errors, feed TODO #1): rust/InstructKG core-poor under-tiering; InstructKG
  **cross-domain optional precision leak** — out-of-domain CS illustrative examples (merge sort,
  recursion, foreign key, SQL clauses) admitted optional instead of rejected (admit P=0.16). All
  artifacts annotated in place with a `humanReview` block and `needsHumanReview` flipped to false;
  frozen labels left intact. Evidence: `tmp/gate2-oracle-human-review.md` (bio/ML/rust),
  `tmp/gate2-oracle-econ-instructkg-human-review.md` (econ/InstructKG).
- **Gate 2 measured label-aligner lifts the surface-form scoring confound (2026-06-14, ADR-0022,
  rules 11/16).** Exact `normalizeConceptLabel` scoring double-penalized surface variants (same
  concept counted as both a miss and an extra). A hardcoded plural/hyphen matcher is forbidden, so
  concept identity for SCORING ONLY is now a bounded forced-tool neural aligner
  (`OracleLabelAlignmentPort` + `LiteLlmOracleLabelAlignmentAdapter` on `kg-oracle-judge`), run off
  the publication path; `alignAdmissionLabels` freezes the auditable surface-variant merges and pure
  `scoreAdmissionOracleAligned` reports the exact baseline BESIDE the aligned score (a wrong merge
  inflating agreement stays visible). Graph identity is untouched (publication keeps exact normalized
  identity, ADR-0015); the aligner only ever merges production → reference, never reference →
  reference, so distinct concepts sharing words never collapse. Real runs (temp 0 + seed): ML arm
  **core F1 0.50→0.71, admit recall 0.79→0.90**, biology **admit recall 0.67→1.00** — both with ZERO
  wrong merges and conservative on ambiguous qualified variants (`operators`/`Operator`, `AIRA
  operator set`/`Operator set` left unmerged). Evidence: `tmp/gate2-oracle-label-aligner-quality-evaluation.md`.
- **Gate 2 oracle independence triangle wired + run (2026-06-14, ADR-0013, rule 11).** Durable
  benchmark surface in `@lrnki/quality-lab`, off the publication path: `OracleAdmissionReferencePort`
  (author) + `OracleAdmissionAuditPort` (second judge) with forced-tool adapters on independent
  aliases; `buildAdmissionOracle` (author → verbatim-ground → audit → freeze with model/prompt/
  rubric/source-hash/per-label outcome + `needsHumanReview`) and pure `scoreAdmissionOracle`
  (precision/recall vs the trusted, non-quarantined reference). DeepSeek extracts, **Xiaomi MiMo
  v2.5 Pro** authors (`kg-oracle-reference`; MiniMax M3 dropped — cannot do forced `tool_choice` on
  OpenRouter), **gpt-oss-120b** audits (`kg-oracle-judge`; cheap + cross-family independent, chosen
  over rate-limited Mistral and expensive Nemotron). Client made 429-aware (`LiteLlmHttpError`, exp
  backoff) + harness `auditPacingMs` + determinism (temp 0 + seed) for reproducible frozen refs.
  Real runs: biology core P/R/F1≈0.83 (0 quarantines); ML PDF 30 authored / 1 quarantined
  (`AIRA-dojo`), core P/R=0.50 lower-bounded by surface-form label variance (the next lever,
  TODO #1). Evidence: `tmp/gate2-oracle-quality-evaluation.md`.
- **Admission recall + measured concept-vs-proposition judge (2026-06-14, ADR-0005).** Admission
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
- **Semantic claim-entailment judge replaces lexical claim gates (2026-06-14, ADR-0007).** Removed
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

Latest validation (2026-06-15, Gate 2 economics + InstructKG arms + human review, rule 11):
- **Static:** all source-package typechecks pass; tests green — quality-lab 8, infrastructure-litellm
  8, infrastructure-ingestion 9, application 59 (84 total, 0 fail); ESLint clean (exit 0). (The one
  typecheck error remains `apps/admin-lab/.next/dev/types/validator.ts`, a Next.js
  dev-server-generated file unrelated to this change; the production build regenerates it.) This
  change touched only `tmp/` artifacts — no source code — so the suite matches the prior baseline.
- **Economics arm (NEW, real LLM calls, temp 0 + seed 7):** extraction run `6f85ce74` (23
  candidates / 4 core). Reference authored 11 / trusted 10 / quarantined 1 (`Pin factory` — correct).
  Aligner 0 merges. **core P=1.00 R=0.80 F1=0.89** (exact 4/4 match to independent expert read; lone
  residual `Self-interest` is a genuine core/optional boundary). Result: **PASS**, ACCEPTED clean.
- **InstructKG arm (NEW, real LLM calls, temp 0 + seed 7):** extraction run `fa6f49a1` (71
  candidates / 4 core). Reference authored 22 / trusted 11 / quarantined 11 (incidental tools +
  pipeline steps + 1 ungrounded — correct). Aligner: **5 plural merges, 0 wrong → core F1 0.00→0.46,
  admit F1 0.13→0.27 (admit recall 0.45→0.91)**. Result: **PASS** for the benchmark; surfaced two
  real production defects — core-poor under-tiering and a **cross-domain optional precision leak**
  (CS illustrative examples admitted optional, admit P=0.16). Feeds TODO #1.
- **Human review (deterministic re-verification):** re-ran the verbatim floor over all five Gate 2
  oracles — **148/150 evidence quotes grounded**; the 2 ungrounded are an already-quarantined
  InstructKG label (floor upheld), so all trusted labels are 100% grounded. All 21 alignment merges
  across the five arms resolve to a real reference + real production label with zero wrong merges.
  Frozen artifacts annotated with `humanReview` and `needsHumanReview` flipped to false.
- **Trust status now:** all five Gate 2 arms (biology, ML, rust, economics, InstructKG) are
  human-trusted, with documented scoring caveats (`AIDE`, economics `Self-interest`). Gate 2 oracle
  coverage is complete. No new graph version was published; nothing on the publication path changed.

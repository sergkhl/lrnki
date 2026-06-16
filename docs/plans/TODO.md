# TODO

Roadmap reset 2026-06-15 (`docs/brainstorms/2026-06-15-kg-core-complexity-reset-requirements.md`):
the product critical path is concept admission → enrichment prerequisite inference → learner path.
Asserted claims moved off that path and are replaced by Concept Evidence Profiles; standing
measurement became disposable scaffolding and is retired.

## TODO

The 7-unit complexity reset and the derived-layer node-minting enrichment milestone (U1-U9) are both
complete on `feat/derived-layer-prerequisite-enrichment`; durable architecture lives in the
[ADRs](../adr/README.md) and [CONTEXT](../../CONTEXT.md).

1. **Tune minting/rescue precision against more fixtures (post-rule-14 follow-up).** The Rust rule-14 run
   minted expert-plausible prerequisites but showed mild granularity redundancy (minted "Stack-allocated
   data"/"Heap-allocated data" beside the anchor "The Stack and the Heap"; "Trait (Rust)" beside "Copy
   trait") and rescued a heading-like concept ("Memory and Allocation").
   - Inspect a non-software fixture (biology/economics) before tuning; do not overfit the proposal prompt
     to Rust (AGENTS rule 17).
   - Consider a generic rubric clause that suppresses sub-aspects of an existing anchor, measured against
     an oracle, not a hardcoded denylist (AGENTS rule 16).
2. **Tune the minting bounds beyond defaults (deferred in the plan).** The per-run cap (12) bound exactly
   on the sparse Rust source; a richer source needs evidence-driven per-anchor/per-run caps.
3. **DOCX/PPTX curated-source expansion** remains orthogonal and deferred.
4. **Keep the standing deferred work deferred.** Difficulty stays the DAG-depth mock and learner state
   stays the empty mock until measured need. The embedding canonicalization cascade and embedding blocking
   tier stay removed unless a measured replacement beats exhaustive same-domain judgment.

## COMPLETED

- **Derived-layer prerequisite enrichment — node + edge derivation, U1-U9 (branch
  `feat/derived-layer-prerequisite-enrichment`).** Graph Enrichment now mints `llm_grounded` prerequisite
  nodes via an explicit anchor-driven proposal port (`MissingPrerequisiteProposalPort`, node identity is an
  inspectable operation, never local string construction) and rescues `source_mentioned` nodes from member
  runs' non-core mentions, judges the union of anchors + enrichment nodes same-domain, and routes any
  generated-node pair to a cross-family judge (`kg-generated-prerequisite-judgment` → gpt-oss-120b, ADR-0023)
  so the DeepSeek generator never grades its own output. The verbatim floor applies per passage by
  provenance with a recorded `not_applicable_by_grounding` exemption for generated passages. `DifficultyPort`
  scores derived node IDs; `inferred_prerequisite_edges`/`concept_difficulties`/learner-path endpoints all
  reference `derived_graph_nodes`; Admin Lab + learner-path loaders read the derived node space and surface
  grounding. ADR-0019 generalized, ADR-0023 added. rule-14 PASS on the sparse Rust fixture: 6 anchors → 19
  derived nodes, expert-correct DAG, asserted layer untouched (6 concepts / 0 edges), densified 7-step
  learner path to Ownership; see `tmp/u9-derived-enrichment-quality-evaluation.md`. Operational: LiteLLM
  alias changes need a proxy reload (`docker restart lrnki-litellm`).

- **Domain-neutral extraction prompts + run-scoped quality issues (2026-06-16).** Removed fixture and
  benchmark answer-key calibration from model-facing extraction prompts and forced-tool schema
  descriptions, added AGENTS rule 17, bumped the extraction pipeline config hash to
  `cep-domain-neutral-prompts-v34`, and added `ExtractionQualityIssue[]` to `extraction_run.v6`
  artifacts. Admin Lab run detail now renders read-only quality issues from the artifact payload. Rule-14
  real-use check: Rust run `5889b488-5329-469f-892d-8bd071b16699` succeeded with the baseline key
  concepts preserved, but admitted extra operation/error concepts; see `tmp/dehack-prompt-quality-evaluation.md`.
- **Derived-layer prerequisite enrichment paused after U4 (branch
  `feat/derived-layer-prerequisite-enrichment`).** U1/U2 (`7849c31`): added the grounding-origin,
  role, and layer model; projected asserted Concepts as `document_anchored` anchors; repaired Rust
  admission/core-selection recall without relaxing the Definition-Passage floor. U3 (`387f7fe`):
  rewrote the initial migration for `derived_graph_nodes`, `enrichment_grounding_bundles`, and
  derived-node edge/difficulty endpoints; reset and reinitialized the local DB; live Postgres tests
  passed. U4 (`52fc43e`): added `GroundingGenerationPort`, forced grounding-generation tool schema,
  and LiteLLM adapter. U5-U9 are not complete.
- **Reset milestone 4 — worker/Admin Lab/export reshape + docs (U6+U7, branch `refactor/cep-core-reset`).**
  U6: Run Inspector + run list now report CEP completeness and definition/mention/assertion counts (no
  claim/proposal reads); the published Graph Explorer is a zero-edge CEP evidence inspector with no graph
  canvas; new read-only Enrichment Run list + detail render the Derived Graph Layer's prerequisite DAG in
  Cytoscape with an equivalent textual view, independent of learner paths; RDF export emits only Concept
  identity/labels/aliases; the orphan admission-variance probe is deleted. rule-14 PASS over the live Rust
  DB rendered via `next start` (published view 0 edges/0 canvases, derived chain Variable scope → Ownership
  → Move semantics → Copy trait); see `tmp/u6-admin-lab-quality-evaluation.md`. U7: rewrote
  ADR-0002/0005/0007/0009/0012/0013/0016/0019/0022, the ADR README, CONTEXT.md vocabulary, README,
  fixtures notes, and this roadmap to describe only the post-reset architecture. Operational invariants
  from the reset: the LiteLLM judge alias is `kg-independent-judge` (gpt-oss-120b); bump the worker
  pipeline config hash whenever admission/CEP/judge prompts or schemas change.
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

Latest validation (2026-06-16) is after the derived-layer node-minting enrichment milestone (U1-U9):

- **Static/unit:** full-repo `pnpm -r typecheck` and `pnpm -r test` pass (135 tests; Postgres round-trip
  tests run against the live DB with `DATABASE_URL` set, including the enrichment-node round-trip and the
  member-run rescue read). `pnpm lint` clean.
- **Real-use (rule-14 PASS):** sparse Rust fixture `b0682ea4-e359-4a41-b624-ad0e382a9185` end-to-end with
  real LLM calls — extraction run `0911ecd0` (6 core anchors, 34 complete CEPs), published version
  `bca9f521` (6 concepts / 0 asserted edges), enrichment run `6959c923` (6 anchors + 13 enrichment nodes;
  12 minted `llm_grounded` + 1 rescued `source_mentioned`; per-run mint cap of 12 bound exactly), and
  learner path `57ed5aea` to Ownership (7 steps: Function → Memory and Allocation → Pointer → Scope → The
  Stack and the Heap → Runtime memory model → Ownership). Verbatim dispositions: 12
  `not_applicable_by_grounding` + 1 `verified`. Asserted layer unchanged. See
  `tmp/u9-derived-enrichment-quality-evaluation.md`.
- **Caveats:** generated grounding is the load-bearing bet, validated by inspection not a standing metric;
  single-fixture (Rust) validation; mild granularity redundancy in minted nodes flagged as a follow-up
  tuning item (do not overfit the proposal prompt — AGENTS rule 17). LiteLLM alias changes need a proxy
  reload (`docker restart lrnki-litellm`).

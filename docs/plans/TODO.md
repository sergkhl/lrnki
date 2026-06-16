# TODO

Roadmap reset 2026-06-15 (`docs/brainstorms/2026-06-15-kg-core-complexity-reset-requirements.md`):
the product critical path is concept admission → enrichment prerequisite inference → learner path.
Asserted claims moved off that path and are replaced by Concept Evidence Profiles; standing
measurement became disposable scaffolding and is retired.

## TODO

The 7-unit complexity reset is complete and merged to `main`; durable architecture lives in the
[ADRs](../adr/README.md) and [CONTEXT](../../CONTEXT.md). Active work is now the paused
derived-layer prerequisite enrichment plan:
[`2026-06-16-001-feat-derived-layer-prerequisite-enrichment-plan.md`](./2026-06-16-001-feat-derived-layer-prerequisite-enrichment-plan.md).

1. **Restart U5 from a clean design for missing-prerequisite proposals.** Do not continue by fabricating
   placeholder prerequisite labels locally and testing around that behavior. The `GroundingGenerationPort`
   can generate a CEP-shaped bundle for a chosen label, but another explicit, inspectable operation must
   justify which `llm_grounded` prerequisite nodes should exist.
   - Decide whether this is a new LLM proposal port, a combined proposal+grounding port, or a bounded
     extension of the existing grounding port.
   - Keep the operation anchor-conditioned and capped per anchor/per run.
   - Preserve the asserted graph invariant: enrichment nodes never publish as asserted `Concept`s.
2. **Finish U5 source-mentioned rescue and union pair judging without collapsing node identity.**
   - Add an extraction-run read model for member-run optional/rejected proposals with verbatim mentions
     and no complete definition.
   - Deduplicate rescued nodes by normalized label within declared domain.
   - Judge pairs over anchors plus rescued/minted derived nodes, same-domain only.
   - Keep prerequisite ordering only in `inferred-prerequisite-of` edges, never on node attributes.
3. **Integrate the derived-node schema through downstream readers.** U3 rewrote the initial migration so
   `inferred_prerequisite_edges` and `concept_difficulties` reference derived nodes, but Admin Lab and
   learner-path loaders may still read the old concept endpoint columns.
   - Update Admin Lab enrichment SQL/view models to read `derived_graph_nodes`.
   - Update learner-path projection/persistence to use derived node IDs where appropriate.
   - If difficulty scoring includes enrichment nodes, change `DifficultyPort` to accept derived node IDs
     or derived node descriptors; do not fabricate asserted `Concept` records for generated nodes.
4. **Complete U6-U8 only after U5 has a defensible proposal model.**
   - Add per-grounding-origin verbatim-floor handling and explicit `not_applicable_by_grounding`
     dispositions for generated passages.
   - Add `kg-generated-prerequisite-judgment` and route generated-node pairs to the cross-family judge.
   - Surface node kind, grounding origin, bundle, and recorded floor disposition in Admin Lab and learner
     path inspection.
5. **Run U9 real-use validation before calling the milestone complete.**
   - Re-run the sparse Rust fixture after U5-U8 with real LLM calls.
   - Inspect recovered anchors, rescued nodes, minted nodes, prerequisite DAG, and learner path usefulness.
   - Record the result in `tmp/u9-derived-enrichment-quality-evaluation.md` and refresh ADRs/CONTEXT only
     after the behavior is validated.
6. **Keep the standing deferred work deferred.** DOCX/PPTX curated-source expansion remains orthogonal.
   Difficulty stays the DAG-depth mock and learner state stays the empty mock until measured need. The
   embedding canonicalization cascade and embedding blocking tier stay removed unless a measured
   replacement beats exhaustive same-domain judgment.

## COMPLETED

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

Latest validation (2026-06-16) is after the domain-neutral prompt and quality-issue milestone:

- **Static/unit:** `pnpm --filter @lrnki/domain-core typecheck`,
  `pnpm --filter @lrnki/infrastructure-litellm typecheck`, `pnpm --filter @lrnki/application typecheck`,
  `pnpm --filter @lrnki/application test`, `pnpm --filter @lrnki/admin-lab typecheck`, and
  `pnpm --filter @lrnki/kg-worker typecheck` passed.
- **Manual prompt sweep:** the expanded fixture-term denylist over
  `packages/infrastructure-litellm/src/extractionAdapters.ts` and
  `packages/infrastructure-litellm/src/toolSchemas.ts` returned only the non-model-facing code comment
  containing `dropped`.
- **Real-use:** Rust fixture source `4c5dbe0b-9352-4f28-853b-6b7ffc972c37` was extracted with real LLM
  calls as run `5889b488-5329-469f-892d-8bd071b16699`, `status=succeeded`, `32` candidates, `8` core,
  `29` CEPs, `1` incomplete optional CEP, `32` definitions, `93` mentions, and `10` assertions. Core set:
  `Copy trait`, `Double free error`, `Memory safety`, `Move`, `Ownership`, `Variable Scope`, `clone method`,
  `drop function`. `qualityIssues`: standing `generic_domain_neutral_prompt` note plus
  `possible_out_of_domain_illustration` for `Garbage collector (GC)`.
- **Caveat:** the baseline key Rust concepts survived, but neutralization exposed redundant granularity
  (`clone method`, `drop function`, and possibly error/safety concepts). Do not publish this run without
  inspection; fix root causes generically rather than reintroducing fixture calibration.

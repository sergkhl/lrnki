# Concept-First Implementation Sequence

Revised 2026-06-11 after the architecture grilling session. The buildable boundary is atomic
static-graph publication (ADR-0014 stands); the five-stage north-star chain shapes interfaces only.

## Gate 1 — smallest working pipeline (native parsers, 3 fixtures)

1. Align the single initial migration with session decisions: `declared_domain` on source
   registration (ADR-0015), the seeded six-relation registry (ADR-0016), raw confidence signal
   fields (model confidence, evidence count, validation outcome, trust tier) with no composite
   edge-confidence score. Reset local state freely.
2. Register the three Gate 1 fixtures (see `fixtures/README.md`) with Declared Domain and content
   hashes; parse via native Markdown/plaintext and HTML parsers into structured-document artifacts.
3. Candidate Discovery: one forced-tool LLM call (`submit_concept_candidates` via
   `kg-concept-discovery`), recall-oriented, with structural context (heading paths, block types,
   first-occurrence positions) in the prompt. No deterministic NLP feature pipeline in MVP —
   that is a deferred benchmark arm.
4. Concept Admission: separate precision-first forced-tool call proposes a canonical label, tier,
   and evidence-cited judgments for standalone learning objective, established domain meaning, and
   organizing power. The application boundary verifies criterion evidence and derives the effective
   tier fail-closed; organizing power requires two distinct verified aspects. A compact source-level
   Core Set Selection then keeps a small but explanatorily sufficient set while removing redundant
   facets, incidental supporting mechanisms, illustrative examples, and pseudo-concepts from the
   eligible set. Discovery and admission are never collapsed into one prompt.
5. Concept-conditioned claim extraction: closed six-relation enum in the tool schema; claim shapes
   are concept→relation→concept and concept→`defined-as`→literal only. Scoped empirical claims are
   deferred. Missing-concept proposals are recorded as run artifacts; no automated re-admission loop.
6. Deterministic evidence validation: verbatim quote checks against stored source blocks, schema
   validation, relation domain/range checks; fail closed after the retry budget.
7. Persist all of the above as per-source Extraction Runs (ADR-0017). Runs never publish.
8. Graph-Version Build (deterministic, LLM-free): latest successful run per source → minimal
   Static Graph Refinement (textual variant normalization, conservative alias merge, ADR-0015
   domain-scoped merge/quarantine, duplicate-claim collapse, contradiction recording) → IRI minting
   at first publication (frozen slugs, ADR-0015) → quality gates → atomic publication with run
   memberships (ADR-0010).
9. Admin Lab Gate 1 scope: three read-only views backed by JSON_TABLE projections — Run Inspector
   (candidates, decisions, claims, evidence, validation failures, proposals), Source Explorer
   (sources, hashes, Declared Domain, blocks), Graph Explorer (published version: concept search,
   detail, claims, evidence). All operations are CLI-triggered; the UI mutates nothing.
10. Gate 1 evaluation: the implementation agent applies
    `.agents/skills/real-use-quality-evaluation/SKILL.md` and recommends decisions to the
    human, who makes the final gate call. Pass criteria:
    - Mechanical floor (zero tolerance): all three fixtures publish end-to-end; zero evidence-quote
      verification failures at publication; no schema-invalid tool output silently accepted; cost
      and latency recorded per run.
    - Admission contract (zero tolerance): every effective `core` has all three application-verified
      eligibility judgments, exact evidence for each judgment, at least two distinct verified
      organizing aspects, and a precise evidence-preserving canonical label. Model/effective tier
      corrections are visible and auditable.
    - Agent inspection of every core concept with zero incidental or vocabulary-sized concepts in
      the authoritative graph. A core Concept must be a credible standalone learning objective and
      not merely a role, component, property, API/operation name, example, or source-local composite.
    - Per-fixture trap checks: Rust `Owner`, bare `Clone`, and bare `drop` are not core; an eligible
      move concept is labeled precisely (for example, `Rust move semantics`). Smith's pin factory
      stays evidence rather than a Concept. Biology experiment details remain optional unless the
      source establishes all three eligibility judgments.
    - Claim inspection remains mandatory: every published claim is useful, correctly typed, and
      supported by verbatim evidence. Passing schema and evidence checks alone is insufficient.
    - Every FIX_FIRST defect is fixed or explicitly waived in writing before Gate 2 work starts;
      findings recorded under `tmp/` with run IDs.

## Gate 2 — frozen oracle suite (ADR-0013, unchanged)

11. Version-pinned Docling adapter; add PDF/DOCX/PPTX fixtures 4–6; freeze the mixed-format oracle
    suite. Oracle independence triangle: DeepSeek extracts, MiniMax M3 authors references
    (`kg-oracle-reference`), Mistral Small audits (`kg-oracle-judge`); disagreements quarantined.
12. Benchmark arms and quantitative metrics; promote only measured improvements.

## Deferred (explicit non-goals until a gate or experiment demands them)

- Composite edge-confidence scoring (raw signals only).
- Scoped empirical claims and the `scoped_statement` object kind.
- Automated missing-concept re-admission loop.
- Deterministic discovery feature pipeline (noun phrases, PositionRank) — benchmark arm only.
- Inferred relations (e.g. `inferred-prerequisite-of`), bridging concepts, symbolic inference rules.
- Embeddings, MMR, semantic duplicate proposals (ADR-0012 measured sidecars).
- Publication-diff view, UI-triggered operations, cost dashboards in Admin Lab.
- Learner modeling and projection (ADR-0014).

## Known code divergences to fix during Gate 1 implementation

- `packages/application/src/buildCoreConceptGraph.ts` conflates single-document extraction with
  publication and derives IRIs from labels at build time — restructure per ADR-0017 and ADR-0015.
- `packages/infrastructure-postgres/src/schema.ts` predates Declared Domain, the relation registry
  seed, and raw-signal fields — regenerate the single initial migration.

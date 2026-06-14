# Concept-First Implementation Sequence

Revised 2026-06-13 after a second architecture grilling session. The buildable boundary now extends
past atomic publication to a **thin end-to-end vertical slice**: real extraction + publication, a real
but small Graph Enrichment layer (`inferred-prerequisite-of` DAG, ADR-0019), and a *mocked* difficulty
heuristic + *mocked* learner-state projection that emit a Learner Path. The slice exists to exercise
the whole goal chain once before any stage is deepened; mocks sit behind real ports and are replaced
stage by stage. Gate 2's oracle benchmark is resequenced to run *after* the slice validates the chain.
Real learner modeling (IRT/KT) stays deferred (ADR-0014).

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
8. Graph-Version Build (deterministic, LLM-free): explicitly selected, inspected successful run IDs → minimal
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

## Phase 2 — Vertical slice: enrichment → Learner Path (2026-06-13 reevaluation) — DONE

> **Status (2026-06-13): COMPLETE.** Steps 11–17 implemented and validated end-to-end on real LLM
> calls over published version `3096ec52` (enrichment `4efd5d1d`, learner path `d94ee025`). One
> tuning decision vs. the plan below: the embedding cluster (step 12/13) does **not** hard-gate
> pairs — the Declared-Domain gate is primary and exhaustive at slice scale, and the cosine cluster
> is an additive escape valve for large domains only, keeping tier 2 `EXPERIMENT_ONLY` (ADR-0012)
> until measured to add recall without precision loss. Evidence:
> `tmp/vertical-slice-enrichment-quality-evaluation.md`. Next phase: Gate 2.

The slice runs after the first atomic publication and before Gate 2, exercising the whole goal chain
once with expensive stages mocked behind real ports. Decisions: ADR-0019 (Graph Enrichment),
ADR-0012 (cascading embeddings); CONTEXT terms Graph Enrichment / Derived Graph Layer / Concept
Canonicalization / Learner Path.

11. **Graph Enrichment operation** (ADR-0019): a third decoupled, CLI-triggered operation taking a
    published version + enrichment config → an immutable Derived Graph Layer keyed to that version.
    Never mutates the asserted graph. Replayable as (version + config + captured judgments).
12. **Canonicalization tier 2** (ADR-0012): contextual embeddings (`qwen3-embedding-8b` via a LiteLLM
    embedding port) over concept definition + evidence — blocking/clustering only, propose-only,
    `EXPERIMENT_ONLY` until measured. Tier 1 (ADR-0015 label-match) stays the only auto-merge; LLM
    verifies tier-2 candidates with reversible aliases.
13. **Inferred prerequisite DAG** (InstructKG cluster-first): embed core concepts → cluster → evidence
    packet per cluster → bounded LLM `inferred-prerequisite-of` judgment over GATED pairs (same
    Declared Domain; intra/inter-cluster candidates only) → deterministic cycle removal + transitive
    reduction + weak-edge cut. Uncertain edges are flagged for review, not auto-included. The
    `inferred-prerequisite-of` vocabulary is separate from the closed extraction registry (ADR-0016).
14. **Baseline difficulty (MOCK)**: DAG-depth heuristic (topological depth, optionally fan-in) behind a
    real Difficulty port. Replaced by Bradley-Terry pairwise calibration later — port unchanged.
15. **Learner Path projection**: a real LearnerState port (MVP impl = mock "knows nothing"); a CLI
    operation computes, for a target concept, the difficulty-ordered prerequisite chain from the Derived
    Graph Layer, pruning mastered concepts, and persists it as an artifact.
16. **Admin Lab path view**: read-only Cytoscape rendering of the persisted path artifact highlighted
    over the graph (ADR-0011 read-only; rule 12 no UI mutation). The UI renders; it never computes.
17. **Slice real-use evaluation** (rule 14): inspect one target path per domain. PASS requires a
    topologically valid, difficulty-sensible ordering where every step traces to a published concept
    and (for asserted links) verbatim evidence. Record noise / sparsity / uncertain-edge caveats.

## Phase 3 — Gate 2 frozen oracle suite (ADR-0013) — deferred until the slice validates the chain

18. Version-pinned Docling adapter; add PDF/DOCX/PPTX fixtures 4–6; freeze the mixed-format oracle
    suite. Oracle independence triangle: DeepSeek extracts, MiniMax M3 authors references
    (`kg-oracle-reference`), Mistral Small audits (`kg-oracle-judge`); disagreements quarantined.
19. Benchmark arms and quantitative metrics; promote only measured improvements.

## Deferred (explicit non-goals until a gate or experiment demands them)

- Composite edge-confidence scoring (raw signals only).
- Scoped empirical claims and the `scoped_statement` object kind.
- Automated missing-concept re-admission loop.
- Deterministic discovery feature pipeline (noun phrases, PositionRank) — benchmark arm only.
- Bridging concepts and general symbolic inference rules (the slice builds only
  `inferred-prerequisite-of`; broader inferred relations stay deferred).
- Embedding auto-merge authority and MMR (ADR-0012: embeddings enter the slice as a propose-only
  blocking/clustering tier; auto-merge stays forbidden).
- Publication-diff view, UI-triggered operations, cost dashboards in Admin Lab.
- Real learner modeling (IRT/KT) and Bradley-Terry difficulty calibration (ADR-0014); the slice uses
  a mock LearnerState behind the real port and a DAG-depth difficulty heuristic behind the real
  Difficulty port.

## Known code divergences to fix during Gate 1 implementation

- `packages/application/src/buildCoreConceptGraph.ts` conflates single-document extraction with
  publication and derives IRIs from labels at build time — restructure per ADR-0017 and ADR-0015.
- `packages/infrastructure-postgres/src/schema.ts` predates Declared Domain, the relation registry
  seed, and raw-signal fields — regenerate the single initial migration.

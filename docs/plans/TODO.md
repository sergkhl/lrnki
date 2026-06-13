# TODO

1. **Implement the vertical slice over the drafted boundaries (Graph Enrichment → Learner Path).**
   Seams + the tested symbolic spine are already drafted (see COMPLETED). Gate 1 graph version
   `3096ec52-9e50-41e1-b142-6ef75dbf5078` (15 concepts, 4 claims) is published and is the target
   input for enrichment. Remaining work-slice steps, in dependency order:
   - Regenerate the single migration from the new schema tables and reset the DB (rule 8/9). The
     `drizzle-kit` schema is updated; the SQL migration is NOT yet regenerated.
   - Adapters: `EmbeddingPort` (`qwen3-embedding-8b` via LiteLLM, contextual text only — propose-only,
     `EXPERIMENT_ONLY` until measured), `PrerequisiteJudgmentPort` (forced named tool schema,
     fail-closed), Postgres `DerivedGraphLayerStorePort` / `LearnerPathStorePort` (normalized rows +
     replay envelope).
   - Wire evidence-packet assembly in `runGraphEnrichment` (currently `TODO(work-slice)`): pass each
     gated pair's cited source blocks to the judge so it reasons over text, not labels (InstructKG packets).
   - Tune clustering threshold + pair gating on the published v1 graph; verify the embedding tier adds
     recall without degrading precision before trusting it.
   - kg-worker CLI: `enrich-graph-version <graphVersionId>`, `compute-learner-path <versionId> <targetConceptId>`.
   - Admin Lab: read-only Cytoscape view over the persisted learner-path artifact (UI never computes).
   - If the first DAG is too sparse to walk, add 2–3 more native-format fixtures (no Gate 2 machinery).

2. **Slice real-use evaluation (rule 14) before any deepening.**
   - Inspect one target path per domain: topologically valid, difficulty-sensible, every step
     traceable to a published concept and (for asserted links) verbatim evidence. Record caveats.

3. **Gate 2 — DEFERRED until the slice validates the chain.**
   - Version-pinned Docling adapter; PDF/DOCX/PPTX fixtures 4–6; freeze the mixed-format oracle suite.
   - Oracle independence triangle (DeepSeek extracts, MiniMax authors references, Mistral audits);
     benchmark arms + quantitative metrics. Add a non-CS domain fixture for diversity.

## COMPLETED

- **Gate 1 published (graph version `3096ec52`, 2026-06-13).** Two FIX_FIRST admission/claim precision
  defects closed with deterministic fail-closed boundaries: (1) proposition-shaped canonical labels
  (`looksLikePropositionLabel` in `domain-core` + `proposition_shaped_label` demotion in
  `applyAdmissionPolicy`) keep chapter-claim titles like "Division of Labour Limited by the Extent of
  the Market" out of core; (2) `lexicallyEntailsDefinition` now requires the definitional copula to be
  adjacent to the literal and rejects causal-origin complements, stopping "X seem to have been the
  effects of Y" from verifying as a `defined-as`. Prompts reinforce both. All four fixtures re-run
  under one unified config and inspected; one atomic version published from the named run IDs (Rust
  `6fd12447`, Biology `b033e736`, InstructKG `87724c03`, Economics `a3dbcca5`): 15 core concepts,
  4 evidence-backed claims, 0 quarantines, IRIs minted. Evidence: `tmp/gate1-publication-quality-evaluation.md`.

- **Vertical-slice boundaries drafted (2026-06-13 reevaluation).** ADR-0019 (Graph Enrichment third
  operation) + ADR-0012 reframe (cascading embeddings) recorded; CONTEXT.md terms added. Code seams:
  `domain-core` derived-layer + learner-path types; `ports` (`EmbeddingPort`, `PrerequisiteJudgmentPort`,
  `DifficultyPort`, `LearnerStatePort`, `DerivedGraphLayerStorePort`, `LearnerPathStorePort`); Postgres
  `schema.ts` tables (`graph_enrichments`, `inferred_prerequisite_edges` in a separate inferred namespace —
  intentionally not FK'd to the closed asserted registry, `concept_difficulties`,
  `enrichment_concept_clusters`, `learner_paths`/`learner_path_steps`); operation skeletons
  `runGraphEnrichment` / `computeLearnerPath`; and the **tested** symbolic spine (`prerequisiteDag`:
  weak-edge cut, deterministic cycle removal, transitive reduction, DAG-depth difficulty, topological
  order/depth/ancestors) + `projectLearnerPath`. Migration regeneration deferred to the implementation slice.

- **Single initial migration regenerated** for the session decisions: `declared_domain` on source
  registration, run-scoped extraction tables (candidates → admission → run_claims referencing
  candidates), seeded six-relation registry, raw confidence signal fields, deterministic
  publication tables with frozen concept IRIs, and a JSON_TABLE inspection view (ADR-0015/16/17).
  `scripts/reset-db.sh` drops both `public` and `drizzle` schemas before migrating.
- **Three Gate 1 fixtures added** (Rust ownership Markdown, OpenStax DNA-replication HTML, Wealth of
  Nations plaintext) as pure-content files with `fixtures/manifest.json` holding Declared Domain and
  provenance.
- **Native parsers rewritten** (Markdown, HTML, plaintext) to emit block-level source blocks with
  heading paths and character locators — replacing the single-block HTML scaffold so evidence quotes
  resolve to a specific block.
- **LLM extraction adapters** for discovery, admission, and concept-conditioned claim extraction via
  forced named tool schemas with zod fail-closed validation; routed through the
  `kg-concept-discovery` / `kg-concept-admission` / `kg-claim-extraction` LiteLLM aliases. Client has
  a retry budget; admission prompt tightened for precision.
- **Application layer restructured** into `executeExtractionRun` (run-scoped, never publishes) and
  `buildGraphVersion` (deterministic, LLM-free: domain-scoped merge, homograph quarantine, frozen IRI
  minting, dedupe, quality gates, atomic publish).
- **Postgres stores** for source registration, extraction runs (with build read model), graph-version
  publication, and immutable artifacts; **kg-worker CLI** (`register-from-manifest`, `run-extraction`,
  `build-graph-version`, `list-sources`).
- **Admin Lab read-only views complete** (ADR-0011): Graph Explorer reads the live published
  snapshot; Run Inspector lists runs and, per run, candidates by admission tier with reason codes,
  claims with verified/rejected outcome and verbatim evidence, and missing-concept proposals; Source
  Explorer lists registered sources and renders parsed block structure. Candidate/claim listings read
  the `artifact_run_candidates` / `artifact_run_claims` JSON_TABLE views over `extraction_run.v3`.
- **Relation-typing precision + throughput hardening**: per-relation prompt guidance with examples
  and a "no fitting relation → no claim" rule; forced evidence-nature/direction classification;
  application-boundary rejection of direction mismatches, competing structural predicates,
  reciprocal asymmetric claims, non-explicit endpoints, and non-entailed relation wording; exact
  definition validation; rejected-claim reason codes in Postgres artifacts and Admin Lab;
  bounded-concurrency (4) claim extraction replacing the serial per-concept loop.
- **Causal-relation suppression gate**: claim schema now carries a required `evidenceLinkNature`
  enum; the app boundary drops `causal-or-motivational`-labelled claims fail-closed, keeping
  soft-prose "X gives occasion to Y" statements out of `uses`/`part-of` (ADR-0016 defers `causes`).
- **Admission determinism lever (ADR-0018)**: forced-tool client gained optional
  `temperature`/`seed` (neutral transport; set only by the composition root). Applied
  `temperature: 0` + seed to admission and claims; discovery kept at default sampling.
  A frozen-candidate probe (`apps/kg-worker/src/admissionVarianceProbe.ts`) proved the
  lever collapses admission's per-stage drift; end-to-end variance was found to be
  discovery-driven and irreducible (resolved architecturally by ADR-0017 builds).
- **Two-phase admission (Core Set Selection)**: per-candidate eligibility (batched) + a separate
  source-level `submit_core_selection` call; the app boundary derives the effective tier fail-closed
  (`applyAdmissionPolicy`). Explicitly illustrative blocks now trigger deterministic demotion when
  all organizing evidence is confined to them. Targets the v13/v14 over-admission; ADR-0005 reframed
  accordingly.
- **Document structure extraction (native-markdown parser v1)**: deterministic region pass classifies
  abstract/references/appendix/figure/table/caption and types non-teachable tail matter so discovery,
  admission, and claims see only the body (`extractableBlocks` in domain-core). Tail fenced code
  (appendix prompt templates) is typed by region, not as `code`, so it never reaches an LLM. On the
  InstructKG arXiv fixture this excludes the references/appendix tail — zero tail concepts entered as
  core. Parser unit tests added (incl. stray-`#`- and fenced-code-in-appendix guards).
- **Explicit-run-ID publication + quarantine gate**: removed automatic "latest succeeded" selection;
  `runsForBuildByIds` (fail-closed on unknown/non-succeeded) and `build-graph-version <runId…>`
  require the operator to name inspected runs, so a mechanically-valid but semantically-bad run never
  silently mutates the graph (AGENTS rule 11). The build now also loads `quarantine` decisions and
  refuses to publish (naming the offending run/candidate) when any selected run carries one, matching
  CONTEXT.md's Graph-Version Build rule.
- **Precision-preserving claim retry**: claim extraction receives exact subject/object aliases and
  retries once only when a subject produced no verified claim. Retry prompts include structured
  rejected predicates, evidence, and boundary reasons and prominently surface endpoint-explicit
  evidence blocks. Superseded attempts remain auditable but cannot invalidate corrected retry claims.
  Claims and missing-concept proposals carry `extractionAttempt` through `extraction_run.v4`,
  PostgreSQL, JSON_TABLE inspection, and Admin Lab.

## VALIDATION

Latest validation (2026-06-13, post Gate 1 publication):
- **Static: full `pnpm check` green** — typecheck across all packages, ESLint clean, 43 application
  tests pass (incl. 3 new precision tests: proposition demotion, nominal-label non-demotion,
  causal-origin definition rejection), parser tests unchanged, Next.js build succeeds.
- **Real DeepSeek, all 4 fixtures re-run under one unified config and published as version
  `3096ec52`:**
  - Rust `6fd12447`: PASS — 3 noun-phrase core concepts; exact Ownership and Variable Scope
    `defined-as` claims verify (confirms the definition-adjacency fix preserves valid definitions).
  - InstructKG `87724c03`: PASS — InstructKG + temporal/semantic signal; two correctly-directed
    framework→signal `uses` claims with verbatim evidence.
  - Biology `b033e736`: sparse PASS — 6 substantive replication concepts; 0 claims (descriptive prose).
  - Economics `a3dbcca5`: PASS (was FIX_FIRST) — clean noun-phrase core set; the proposition-shaped
    chapter claim no longer enters core; 0 claims, all `defined-as` rejections were genuine
    causal-origin prose (no over-rejection of valid definitions).
- Admin Lab Graph Explorer renders published v1 (HTTP 200) across all four domains.
- PostgreSQL 18 + LiteLLM healthy. **Gate 1 PASSED and published; Gate 2 remains closed.**
  Evidence: `tmp/gate1-publication-quality-evaluation.md`.

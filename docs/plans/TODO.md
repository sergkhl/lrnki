# TODO

1. **Claim recall remains FIX_FIRST after the relation-precision boundary passed real-use inspection.**
   - Config `…-definition-recall-v20` accepts an exact Rust definition and rejects unsupported
     `part-of` / `uses` claims; config `…-illustrative-boundary-v19` rejects all six loose InstructKG
     claims. Reversed and competing relations no longer pass the application boundary.
   - InstructKG now has zero accepted claims even though the source explicitly states that the
     framework leverages temporal and semantic signals. Improve extraction recall without weakening
     endpoint, direction, or lexical-entailment gates (for example, retry a subject once with rejected
     claim feedback and explicit endpoint aliases).
   - Re-run Rust + InstructKG and require useful accepted claims with zero reversed/unsupported claims.
     Evidence: `tmp/claim-boundary-quality-evaluation.md`.

2. **Complete Gate 1 only after claim recall passes.**
   - Run the final config on Biology and Economics, inspect every core and claim, then select the
     inspected run IDs explicitly for one deterministic graph-version build.
   - Keep publication blocked if any fixture has incidental core concepts, unsupported claims,
     evidence failures, or quarantine decisions.

3. **Gate 2 (only after Gate 1 passes).**
   - Version-pinned Docling adapter; add PDF/DOCX/PPTX fixtures 4–6; freeze the mixed-format oracle suite.
   - Oracle independence triangle (DeepSeek extracts, MiniMax authors references, Mistral audits);
     benchmark arms and quantitative metrics. Add a non-CS domain fixture for diversity (both new
     arXiv fixtures lean CS/ed-tech).

## COMPLETED

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

## VALIDATION

Latest validation (2026-06-13):
- **Static: 26 tests pass** (19 application + 7 parser); full typecheck, ESLint, and Next.js
  production build pass.
- **Real DeepSeek / InstructKG, v19: precision PASS, recall FIX_FIRST.** Core is
  `{Instructor-Aligned Knowledge Graphs, Temporal Signals, Semantic Signals}`. Dynamic Programming,
  Greedy Algorithms, Optimization Problem, and Student Error Mapping are optional. All 6 loose or
  reversed `uses` claims are rejected with visible boundary reasons; 0 claims accepted.
- **Real DeepSeek / Rust, v20: narrow useful output PASS.** Core is
  `{Rust Ownership, Rust move semantics, Memory Safety}`. Exact `Rust Ownership defined-as "a set of
  rules that govern how a Rust program manages memory"` is verified; 2 unsupported structural claims
  are rejected.
- PostgreSQL 18 + LiteLLM healthy; Admin Lab serves on port 3000 and renders both inspected runs.
  **No graph version published.** Evidence: `tmp/claim-boundary-quality-evaluation.md`.

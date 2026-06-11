# TODO

1. **Admission stability check before Gate 1 sign-off.**
   - Core-concept counts swing across re-runs of the unchanged admission stage (Rust
     24→14 between published versions). Quantify the variance over a few repeated runs
     per source and decide whether admission needs a determinism lever (e.g. lower
     temperature, self-consistency vote) before the human makes the Gate 1 call.

2. **Residual economics limiting-relation prose (low priority).**
   - The causal-suppression gate cleared soft-prose `uses` over-application, but a couple
     of "limited by / gives occasion to" sentences still type as `part-of`/`uses` in the
     Wealth of Nations run. Likely needs a measured `limits`/`causes` relation in Gate 2
     rather than more prompt pressure. Evidence is verbatim; not corruption.

3. **Gate 2 (only after Gate 1 passes).**
   - Version-pinned Docling adapter; add PDF/DOCX/PPTX fixtures 4–6; freeze the mixed-format oracle suite.
   - Oracle independence triangle (DeepSeek extracts, MiniMax authors references, Mistral audits);
     benchmark arms and quantitative metrics.

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
  the `artifact_run_candidates` / `artifact_run_claims` JSON_TABLE views over `extraction_run.v1`.
- **Relation-typing precision + throughput hardening**: per-relation prompt guidance with examples
  and a "no fitting relation → no claim" rule; self-referential claim guard in the app boundary;
  bounded-concurrency (4) claim extraction replacing the serial per-concept loop.
- **Causal-relation suppression gate**: claim schema now carries a required `evidenceLinkNature`
  enum; the app boundary drops `causal-or-motivational`-labelled claims fail-closed, keeping
  soft-prose "X gives occasion to Y" statements out of `uses`/`part-of` (ADR-0016 defers `causes`).

## VALIDATION

Latest re-run (2026-06-11) end-to-end with real DeepSeek V4 Flash (thinking disabled) across all
three Gate 1 fixtures under pipeline config `…-v3`; published graph version `bd7c5203-…` =
**26 concepts, 66 claims**. Full note: `tmp/causal-relation-gate-quality-evaluation.md`.
Recommendation: **PASS** (residual narrowed).

- Per-source runs (latest): Rust 26 cand → 14 core, 35/1 verified/rejected; Biology 26 → 8 core,
  29/3; Economics 34 → 4 core, 5/1. Latency ~45–73s/source.
- Causal gate effective: economics verified claims 29→5, soft-prose causal `uses`/`part-of`
  eliminated; Rust/biology relation richness preserved (genuine taxonomy, structural, contrast,
  mechanism). Published distribution: part-of 24, uses 17, contrasts-with 15, is-a 6,
  asserted-prerequisite-of 2, defined-as 2.
- Integrity: **zero self-referential and zero evidence-free** published claims (verified by SQL
  against the published version).
- Remaining caveats: two economics "limited by / gives occasion to" sentences still type
  structurally (TODO 2); admission core-count variance across re-runs (TODO 1). Cost not captured.
- Static checks: `pnpm -r typecheck` clean, `pnpm lint` clean. No package-level unit tests exist;
  this layer is validated by the real-use-quality-evaluation skill, not assertions.

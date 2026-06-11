# TODO

1. **Economics-domain relation precision (follow-up to the relation-typing fix).**
   - Soft-prose causal statements ("X gives occasion to Y") still type as `uses` in the
     Wealth of Nations run despite the sharpened prompt. Rust/biology are clean. Decide
     between a domain-aware prompt arm or treating causal relations as a measured Gate 2
     relation rather than forcing them into the closed set. Evidence is already verbatim.

2. **Gate 2 (only after Gate 1 passes).**
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

## VALIDATION

Latest re-run (2026-06-11) end-to-end with real DeepSeek V4 Flash (thinking disabled) across all
three Gate 1 fixtures; published graph version `3c483ea6-…` = **41 concepts, 138 claims**. Full
note: `tmp/relation-precision-quality-evaluation.md`. Recommendation: **PASS** (one caveat).

- Per-source runs (latest): Rust 33 cand → 24 core, 91/2 verified/rejected; Biology 23 → 10 core,
  24/17; Economics 20 → 7 core, 26/2. Latency dropped to ~40–70s/source under bounded concurrency.
- Relation typing sharpened: published `is-a` 21→10, all now genuine taxonomy; component relations
  moved to `part-of`; **zero self-referential and zero evidence-free** published claims.
- Admin Lab verified against the running server (:3000, DATABASE_URL set): all five routes 200; Run
  Inspector and Source Explorer render live data (tiers, reason codes, evidence quotes, blocks).
- Remaining caveat: economics soft-prose still types some causal statements as `uses` (TODO 1);
  evidence verbatim. Cost not captured (by design).
- Static checks: `pnpm -r typecheck` clean, `pnpm lint` clean, `pnpm build` (Next) succeeds.
- Migration regenerated: stale `artifact_admission_decisions` view replaced by the two
  `extraction_run.v1` JSON_TABLE views; applies on a fresh database.

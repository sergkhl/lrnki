# TODO

1. **Close out Gate 1 quality evaluation.**
   - Build and publish the first graph version from the three runs (`worker:kg build-graph-version`).
   - Inspect every core concept and claim against the real-use-quality rubric; record findings under `tmp/` with run IDs.
   - Fix any `FIX_FIRST` admission-precision or evidence defects before Gate 2 work.

2. **Wire Admin Lab Run Inspector and Source Explorer views.**
   - Graph Explorer already reads the live published snapshot. Add the two remaining read-only views
     (Run Inspector: candidates, decisions, claims, evidence, validation failures, proposals;
     Source Explorer: sources, hashes, Declared Domain, blocks) backed by JSON_TABLE projections.

3. **Tighten claim relation typing.**
   - Verified claims sometimes mis-type relations (`is-a` used where `uses` / `asserted-prerequisite-of`
     is meant). Sharpen the claim-extraction prompt's per-relation guidance and add examples before
     Gate 2 quantitative metrics. Evidence is already verbatim; this is predicate precision only.

4. **Harden claim extraction throughput.**
   - One LLM call per core concept is slow on large sources; batch or cap per-source concept counts,
     and consider concurrency with a bounded pool through the LiteLLM ports.

5. **Gate 2 (only after Gate 1 passes).**
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
- **Admin Lab Graph Explorer** now reads the live published snapshot server-side (demo fallback),
  with dynamic layout and concept search; read-only.

## VALIDATION

Gate 1 ran end-to-end with real DeepSeek V4 Flash (thinking disabled) calls; published graph
version `475bf755-…` = **25 concepts, 101 claims**. Full note: `tmp/gate1-quality-evaluation.md`.
Recommendation to the human gate-keeper: **PASS** (with caveats below).

- Per-source runs (latest): Rust 26 cand → 11 core, 43/4 verified/rejected; Biology 21 → 10 core,
  49/12; Economics 27 → 4 core, 17/1.
- Mechanical floor met: all three fixtures published; **zero published claims without evidence**;
  forced-tool + zod fail-closed validation with retry budget; latency recorded per run.
- Admission precision strong; trap checks pass (Rust section trivia rejected; Smith's pin factory
  kept as example/evidence, not a concept; biology concepts carry verbatim `defined-as` evidence).
- FIX_FIRST applied: evidence verification now tolerates Markdown markup / smart quotes
  (`evidenceQuoteMatches`); Rust recovered from 11/82 → 43/4 without weakening "no quote, no claim".
- Caveats: relation-type precision is loose (some `is-a` misuse — evidence still verbatim); cost not
  captured (by design); Admin Lab live render verified at the data layer, server bind blocked in
  sandbox.
- Static checks: `pnpm -r typecheck` clean, `pnpm lint` clean, `pnpm build` (Next) succeeds.
- Migration applies on a fresh database; six relations seed; Postgres 18 JSON_TABLE view created.

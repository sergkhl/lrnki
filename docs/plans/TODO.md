# TODO

1. **Gate 1 human sign-off.**
   - Determinism investigation is complete (see
     `tmp/admission-determinism-quality-evaluation.md`). Authoritative graph version
     `0137a32b-…` = 26 concepts / 99 claims, single clean version, zero evidence-free and
     zero self-referential claims. Awaiting the human's PASS/FIX_FIRST call. The agent
     recommends PASS.

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
- **Admission determinism lever (ADR-0018)**: forced-tool client gained optional
  `temperature`/`seed` (neutral transport; set only by the composition root). Applied
  `temperature: 0` + seed to admission and claims; discovery kept at default sampling.
  A frozen-candidate probe (`apps/kg-worker/src/admissionVarianceProbe.ts`) proved the
  lever collapses admission's per-stage drift; end-to-end variance was found to be
  discovery-driven and irreducible (resolved architecturally by ADR-0017 builds).

## VALIDATION

Latest re-run (2026-06-11) end-to-end with real DeepSeek V4 Flash (thinking disabled) across all
three Gate 1 fixtures under pipeline config `…-admit-temp0-v5` (admission/claims at temperature 0
+ seed, discovery at default sampling — ADR-0018). Single authoritative published graph version
`0137a32b-f905-474b-8e0b-e28ea7e1b6b5` = **26 concepts, 99 claims**.
Full note: `tmp/admission-determinism-quality-evaluation.md`. Recommendation: **PASS**.

- Per-source runs (v5): Rust 35 cand → 14 core, 65/2 verified/rejected; Biology 23 → 8 core,
  34/0; Economics 30 → 4 core, 9/0. Latency ~40–70s/source.
- Determinism: frozen-candidate probe shows the lever collapses admission drift (Rust spread
  3→1, Biology 4→0, Economics 1→0 across 5 re-runs). End-to-end core count still varies
  run-to-run because discovery output is non-deterministic across processes even at temperature 0
  (DeepSeek MoE); this is handled by run versioning + deterministic builds (ADR-0017), not at the
  extraction layer. Global temperature 0 on discovery was reverted because it inflated recall and
  over-admitted generic primitives (Rust 14 → 23–29 core).
- Integrity: **zero self-referential and zero evidence-free** published claims (verified by SQL
  against the published version); 102 evidence rows for 99 claims. Predicate distribution: uses 39,
  part-of 29, contrasts-with 26, is-a 3, asserted-prerequisite-of 1, defined-as 1.
- Remaining caveats: two economics "limited by / gives occasion to" sentences still type
  structurally (TODO 2); `uses` is the most common predicate (Gate 2 should measure relation
  precision). Cost not captured.
- Static checks: `pnpm -r typecheck` clean, `pnpm lint` clean. No package-level unit tests exist;
  this layer is validated by the real-use-quality-evaluation skill, not assertions.

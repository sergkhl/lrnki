# TODO

## TODO

1. **Validate the CEP in-window mis-pick prompt fix — rule-14 A/B running (unblocked).** Real
   measurement on the AIRA-dojo fixture attributed every `core_demoted_hollow_definition` demotion to
   an *in-window mis-pick* (defining block already in the extractor's window, but it quoted a
   passing-mention / heading / title / citation instead; zero retrieval-window misses, zero genuine
   absence). The domain-neutral definition-passage clause is **implemented and committed** — broadened
   reject list plus a positive tie-break preferring the block that states defining
   properties/criteria/mechanism (rules 16/17). Extraction is fully unblocked: the aliases now route to
   DeepSeek first-party and a real run on 2026-06-25 succeeded (demoted_hollow=1, 4 bare-name vetoes).
   `tmp/2026-06-25-cep-defn-retrieval/ab.sh` (SKIP_SCAN fast variant, baseline-no-clause vs after-clause)
   is being re-run to record the result; escalate to re-pick-on-veto or a stronger extractor only if the
   clause underperforms
   ([ADR-0007](../adr/0007-extract-concept-evidence-profiles-in-concept-context.md)).

2. **Section-scoped parent-child CEP definition retrieval — deferred.** The disposable measure-first
   instrument found zero retrieval-window misses on the AIRA-dojo fixture, so replacing the
   adjacency/sibling-cap heuristics recovers nothing today. Revisit only behind a fresh requirements
   document and plan — the earlier draft will drift as the in-window mis-pick fix above lands, so it
   is intentionally not linked here.

3. **Address broad, evidence-thin intrinsic-difficulty distortion.** Real full-manifest inspection
   found plausible ordering overall but over-weighted some broad or relation-like labels with sparse
   evidence.
   - Prefer a measured neural judge over fixture-specific prompt tuning or deterministic proxies.
   - Keep population calibration deferred until stable real learner-response data exists
     ([ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md)).

4. **Improve operator observability.**
   - Preserve forced-tool fail-closed behavior while making exhausted retries and safely redacted
     malformed argument snippets inspectable.
   - Distinguish byte-exact from formatting-normalized study-item citation matches in Admin Lab.

5. **Keep data-blocked and unearned methods deferred.**
   - Do not fit population difficulty, IRT, KT, or learner models from synthetic or self-assessed
     responses.
   - Do not reintroduce ungrounded graph densification or embedding-derived prerequisite structure.
   - Introduce a formal deterministic semantic check only where a genuine domain oracle exists; it
     may inform a judge but must not become an unearned heuristic veto.

## COMPLETED

- **Source-grounded asserted graph baseline.** Curated mixed-format sources normalize into structured
  blocks; atomic Concept Admission produces a small core; CEPs preserve verified definitions and
  mentions; explicitly selected Extraction Runs build immutable graph versions with zero asserted
  edges. Decisions: [ADR-0004](../adr/0004-normalize-curated-sources.md),
  [ADR-0005](../adr/0005-admit-atomic-concepts-before-evidence-profiles.md),
  [ADR-0007](../adr/0007-extract-concept-evidence-profiles-in-concept-context.md), and
  [ADR-0017](../adr/0017-split-extraction-runs-from-graph-version-builds.md).

- **CEP precision and evidence policy.** The relation registry and redundant prerequisite hint were
  removed; `defines` remains the sole typed CEP evidence. A cross-family Definition-Passage quality
  judge now drops hollow definitions and demotes last-definition losses under
  `core_demoted_hollow_definition`, preserving the rescue path. Real AIRA-dojo inspection passed with
  caveats: a structurally equivalent hollow case was caught, while the original heading/citation
  examples did not recur in that stochastic run. Decision:
  [ADR-0007](../adr/0007-extract-concept-evidence-profiles-in-concept-context.md).

- **Derived graph enrichment.** Graph Enrichment rescues and mints derived nodes, adjudicates
  embedding-proposed near-duplicates separately, applies durability judges, and derives prerequisite
  structure from K-sampled whole-domain ordering. Direction-contested, weak, and cyclic aggregates
  remain inspectable uncertainty; artifact-version suffix and redundant schema-version state were
  removed. Decisions: [ADR-0012](../adr/0012-embeddings-permitted-except-prerequisite-derivation.md),
  [ADR-0019](../adr/0019-graph-enrichment-derived-layer.md), and
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md).

- **Grounding and intrinsic difficulty.** Grounding origin now makes asserted/derived provenance
  structural, records the generated-grounding verbatim exemption, and keeps generated-node judgment
  cross-family. Every derived node receives inspectable learner-neutral intrinsic difficulty; the
  signal remains `EXPERIMENT_ONLY`. Decisions:
  [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md) and
  [ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md).

- **Learner study loop.** Typed study items cover anchors and Enrichment Nodes through
  `derived_node_id`; option-select study is auto-graded; calibration uses mutable binary verdicts;
  graded responses remain append-only; goal-first projection and restoration handling operate over
  the Derived Graph Layer. Admin Lab exposes the study and adapted-graph workflows without mutating
  published graph state. Decisions:
  [ADR-0026](../adr/0026-typed-study-item-bank.md) and
  [ADR-0011](../adr/0011-retain-minimal-admin-lab.md).

- **Inspection architecture and operator tooling.** Source and run inspection use finished read-model
  ports; learner projections are application use-cases; Admin Lab graph views use Cytoscape; the demo
  seed produces one coherent mixed-domain state. Decision:
  [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md).

- **Extraction provider latency fix.** Routing production extraction aliases to DeepSeek first-party
  resolved the >10-minute extraction latency and removed the dedicated OpenRouter-key blocker.
  Measured results remain in the latest validation below.

- **Durable operation observability.** Extraction, graph-version build, enrichment, and study-item
  operations now write shared incremental stage timelines with heartbeats. Admin Lab exposes live
  progress, while the CLI and Admin Lab share one on-demand wall-clock/LiteLLM-cost report. Decision:
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md).

- **Per-journey whole-pipeline cost measurement.** LLM requests carry request-scoped operation tags;
  the shared report now joins operation-stage calls, tokens, and live LiteLLM cost with timeline
  wall-clock for one operation or one Processing Journey. Worker CLI and Admin Lab render the same
  report; the former global cost path was removed. Decision:
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md).

- **Pipeline-cost measurement hardening + ranked targets.** Enrichment now brackets per-stage
  wall-clock on the same fine `STAGE_TAGS` names its LLM calls tag cost with (per-call for the
  sequential rescue/mint loop, per-phase for the concurrent dedup batch), so the cost⋈wall join meets
  on one key — the coarse `rescue-mint`/`dedup` brackets are gone. A tested pure ranking derives the
  ordered (operation, stage) cost and time targets with journey-total shares, exposed through an
  additive `--ranked` report flag. Running `study_items` end-to-end in a journey for the first time
  surfaced and fixed a latent reporter defect: the timeline reporter keyed the parent by
  `operation_id` alone, but `study_items` reuses the enrichmentId, so the two operations collided on
  the `operation_run_stages` primary key — every reporter method now scopes by the full
  `(operation_type, operation_id)` natural key. Decision:
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md).

- **Whole-set ordering label fidelity (grounded-generation hardening).** The ordering edge contract
  switched from free-text canonical-label echo to a 1-based ordinal index — a closed-set menu pick
  over the `Concept 1..N` the prompt already shows. Per-call schema + validator are built from the
  node count so the index bound `[1, N]` is enforced under strict decoding; a transient out-of-range
  draw re-prompts once then fails closed, and the application resolves `number → derivedNodeId` by
  position (the superseded `trim().toLowerCase()` label-matching path was deleted, rule 18). This is
  the rule-21 root-cause fix for the grounded-generation / entity-linking defect where synonym drift
  (`LIFO`→`Stack`) missed an exact label match and aborted whole runs. Real-use evidence in the
  latest validation below.

## VALIDATION

- **Latest consolidated suite, 2026-06-26:** full workspace typecheck and tests (262 application,
  37 live PostgreSQL integration including a new shared-`operation_id` reporter regression), ESLint
  (zero errors; five pre-existing warnings) are green.
- **Pipeline-cost hardening baseline, 2026-06-26 (rule 14).** A fresh end-to-end run of the Rust
  ch.4.1 source (extraction `1a432ca6` → minting `f3191545` → enrichment `174a3a79` → study_items)
  produced a clean complete rollup: four operations, journey total wall=990.8s, 194 calls,
  561,500 tokens, **$0.0607**. Every enrichment LLM stage now joins (wall AND cost on one fine name);
  no `rescue-mint`/`dedup` row remains; `study_items` is non-null (107.5s / $0.0074). Ranked targets:
  top cost = `extraction/admission` 32.3% ($0.0196) and `enrichment/prerequisite-ordering` 25.9%
  ($0.0157); top time = `prerequisite-ordering` 36.0% (357.1s) and `admission` 16.0% (158.2s) — the
  two levers for the deferred rule-21 optimization pass (superseding the earlier provisional
  "admission 43%"). Trail: `tmp/2026-06-26-pipeline-cost-baseline/`.
- **Per-journey cost evidence, 2026-06-25:** a real Rust extraction
  (`c911bbd0-719b-4929-9a95-4240f18168c1`) produced 99 tagged calls, 302,157 tokens, and
  $0.03522072. Every per-stage calls/tokens/cost cell exactly reconciled with a manual
  `LiteLLM_SpendLogs` query. With `LITELLM_DATABASE_URL` absent, the same report retained 330,744 ms
  of stage wall-clock and marked all cost fields unavailable.
- **Whole-set ordering label-fidelity fix + AE1/AE2 unblock, 2026-06-26.** Re-running the exact Rust
  fixture that failed closed twice on June 25 (graph version `ce1f3b85`) now succeeds: enrichment
  `c2e28622` committed 20 certain / 9 uncertain edges, `cycleRouted=0`, no "outside the listed"
  abort. `Heap memory allocation` — one of the June-25 out-of-set misses — now binds by position;
  inspected ordering is sane (`Ownership → {Borrowing, Move, Return Values}`; `The Stack and the
  Heap → Heap memory allocation → Deep copy vs shallow copy → clone method`; `Pointers → References
  → Borrowing`; foundations as roots, `Memory safety` a leaf). With enrichment unblocked, the
  whole-journey `journey-cost-report` now stitches extraction → minting → enrichment end-to-end
  (journey total wall=774.1s, 169 calls, 443,522 tokens, $0.0465; ordering stage 8 calls / $0.0071),
  closing the previously-unverified AE1/AE2. Trail: `tmp/2026-06-26-ordering-number-fix/`.
- **Latest real-use quality evidence:** the June 24 Definition-Passage quality run passed with the
  caveat recorded above; the June 24 K-sampled prerequisite-ordering run passed on real Rust and
  economics sources, surfacing unstable directions as `uncertain` while retaining robust edges.
- **Pending real-use evidence:** the rule-14 A/B for the June 25 CEP in-window mis-pick prompt fix
  (TODO #1) is **running** on the now-unblocked first-party route. A single real run on 2026-06-25
  succeeded (demoted_hollow=1, 4 bare-name vetoes); `tmp/2026-06-25-cep-defn-retrieval/ab.sh`
  (baseline-no-clause vs after-clause) is being re-run to record the A/B comparison.
- **Extraction latency spike (TODO #2), 2026-06-25 — RESOLVED by provider switch.** Real per-stage
  timing from `LiteLLM_SpendLogs` attributed the >10-min run to admission's whole-document re-send per
  batch on the OpenRouter route (admission ~59 s/call, per-host cache ~0.7%). Routing the extraction
  aliases to **DeepSeek first-party** (`litellm/config.yaml`) cut concept-discovery 162 s → 24 s/call
  and admission 59 s → 17 s/call on a real AIRA-dojo run, and lifted per-account caching
  (cep-extraction 21% → 53%). The OpenRouter host-pin path is abandoned (it needed a dedicated key);
  the admission document-prefix cache warming further is a deferred minor optimization. Full trail:
  `tmp/2026-06-25-run-timing-spike/FINDINGS.md`.
- Tests remain deterministic-envelope evidence only under
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md); quality claims above come from
  inspected real model output.

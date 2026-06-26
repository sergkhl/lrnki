# TODO

## TODO

1. **Resolve the CEP definition-passage mis-pick follow-up.** The prompt-side clause is implemented,
   and the unblocked first-party A/B trail now exists at
   `tmp/2026-06-25-cep-defn-retrieval/`. Decide from that evidence whether the clause is sufficient,
   needs a repaired measurement pass, or should escalate to re-pick-on-veto / a stronger extractor
   ([ADR-0007](../adr/0007-extract-concept-evidence-profiles-in-concept-context.md)).

2. **Address broad, evidence-thin intrinsic-difficulty distortion.** Real full-manifest inspection
   found plausible ordering overall but over-weighted some broad or relation-like labels with sparse
   evidence.
   - Prefer a measured neural judge over fixture-specific prompt tuning or deterministic proxies.
   - Keep population calibration deferred until stable real learner-response data exists
     ([ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md)).

3. **Improve operator observability.**
   - Preserve forced-tool fail-closed behavior while making exhausted retries and safely redacted
     malformed argument snippets inspectable.
   - Distinguish byte-exact from formatting-normalized study-item citation matches in Admin Lab.
   Decisions: [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md),
   [ADR-0011](../adr/0011-retain-minimal-admin-lab.md), and
   [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md).

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
  embedding-proposed near-duplicates separately, applies durability judges, derives prerequisite
  structure from K-sampled whole-domain ordering, and records grounding origin structurally.
  Direction-contested, weak, and cyclic aggregates remain inspectable uncertainty; intrinsic
  difficulty remains `EXPERIMENT_ONLY`. Decisions:
  [ADR-0012](../adr/0012-embeddings-permitted-except-prerequisite-derivation.md),
  [ADR-0019](../adr/0019-graph-enrichment-derived-layer.md),
  [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md),
  [ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md), and
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md).

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

- **Durable operation observability and cost measurement.** Extraction, graph-version build,
  enrichment, and study-item operations now write shared incremental stage timelines with
  heartbeats. LLM requests carry request-scoped operation tags, the shared report joins
  operation-stage calls/tokens/cost with timeline wall-clock for one operation or Processing Journey,
  and ranked targets expose the highest cost and time levers. Decision:
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md).

- **Whole-set ordering label fidelity (grounded-generation hardening).** The ordering edge contract
  switched from free-text canonical-label echo to a 1-based ordinal index — a closed-set menu pick
  over the `Concept 1..N` the prompt already shows. Per-call schema + validator are built from the
  node count so the index bound `[1, N]` is enforced under strict decoding; a transient out-of-range
  draw re-prompts once then fails closed, and the application resolves `number → derivedNodeId` by
  position (the superseded `trim().toLowerCase()` label-matching path was deleted, rule 18). This is
  the rule-21 root-cause fix for the grounded-generation / entity-linking defect where synonym drift
  (`LIFO`→`Stack`) missed an exact label match and aborted whole runs.

## VALIDATION

- **Latest consolidated suite, 2026-06-26:** full workspace typecheck and tests (262 application,
  37 live PostgreSQL integration including a new shared-`operation_id` reporter regression), ESLint
  (zero errors; five pre-existing warnings) are green.
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
- **Pipeline-cost hardening baseline, 2026-06-26.** A fresh Rust ch.4.1 journey produced a clean
  complete rollup with enrichment LLM stages joining wall-clock and LiteLLM cost on one fine stage
  name. Ranked targets identify `extraction/admission` and `enrichment/prerequisite-ordering` as the
  top cost levers, and `prerequisite-ordering` / `admission` as the top time levers. Trail:
  `tmp/2026-06-26-pipeline-cost-baseline/`.
- **Latest real-use quality evidence:** the June 24 Definition-Passage quality run passed with the
  caveat recorded above; the June 24 K-sampled prerequisite-ordering run passed on real Rust and
  economics sources, surfacing unstable directions as `uncertain` while retaining robust edges.
- **CEP definition-passage prompt A/B, 2026-06-25:** the first-party trail exists at
  `tmp/2026-06-25-cep-defn-retrieval/`; TODO #1 owns the remaining decision because the evidence
  needs interpretation before it becomes a completed outcome.
- Tests remain deterministic-envelope evidence only under
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md); quality claims above come from
  inspected real model output.

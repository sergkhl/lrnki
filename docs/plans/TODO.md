# TODO

## TODO

1. **Per-journey whole-pipeline cost measurement (chosen next direction, 2026-06-25).** Follow-up to
   the merged run-observability work ([ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md)):
   roll up tokens/calls/cost/wall-clock per stage and operation across one document's journey. The
   load-bearing piece is run-scoped cost attribution — tag every LLM call with its `operation_id` so a
   single journey's spend can be isolated (today's `bottleneckReport` cost half is a global per-stage
   aggregate). Measure-first; the suspected admission-payload optimization is a rule-21 follow-up gated
   on the rollup. Requirements (ready for `/ce-plan`):
   [per-journey pipeline cost](../brainstorms/2026-06-25-per-journey-pipeline-cost-requirements.md).

2. **Validate the CEP in-window mis-pick prompt fix — rule-14 A/B running (unblocked).** Real
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

3. **Section-scoped parent-child CEP definition retrieval — deferred.** The disposable measure-first
   instrument found zero retrieval-window misses on the AIRA-dojo fixture, so replacing the
   adjacency/sibling-cap heuristics recovers nothing today. Revisit only behind a fresh requirements
   document and plan — the earlier draft will drift as the in-window mis-pick fix above lands, so it
   is intentionally not linked here.

4. **Address broad, evidence-thin intrinsic-difficulty distortion.** Real full-manifest inspection
   found plausible ordering overall but over-weighted some broad or relation-like labels with sparse
   evidence.
   - Prefer a measured neural judge over fixture-specific prompt tuning or deterministic proxies.
   - Keep population calibration deferred until stable real learner-response data exists
     ([ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md)).

5. **Improve operator observability.**
   - Preserve forced-tool fail-closed behavior while making exhausted retries and safely redacted
     malformed argument snippets inspectable.
   - Distinguish byte-exact from formatting-normalized study-item citation matches in Admin Lab.

6. **Keep data-blocked and unearned methods deferred.**
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

## VALIDATION

- **Latest consolidated suite:** stale. The last recorded full workspace typecheck and suite run was
  June 21, 2026; later milestones reported their focused deterministic-envelope suites green, but a
  fresh consolidated run has not yet replaced that record.
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

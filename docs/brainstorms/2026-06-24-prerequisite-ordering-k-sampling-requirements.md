# Prerequisite-Ordering K-Sampling — Requirements

- **Date:** 2026-06-24
- **Status:** Ready for `/ce-plan`
- **Owner concept:** whole-set prerequisite ordering (TODO #2)
- **Governance:** ADR-0028, AGENTS rules 11 / 16 / 17 / 19
- **Supersedes nothing; builds on:** the shipped whole-set ordering (`docs/plans/2026-06-24-001`, `packages/application/src/runGraphEnrichment.ts`)

## Problem

The whole-set ordering stage makes **one** neural call per Declared Domain that returns the entire directed prerequisite DAG, and commits that single draw. MoE inference is non-deterministic by architecture (ADR-0028), so a single draw is one sample from a distribution — and the committed edge set inherits that noise instead of measuring it. A disposable K=8 probe (`tmp/2026-06-24-k-sample-ordering-probe/`) over published version `9eb3e44d` confirmed two committed defects:

- **Direction instability** — `saving of time…` ↔ `three circumstances…` (a member-of relation, genuinely contestable direction) is committed as a CERTAIN edge at confidence 0.85, yet flips 7:1 across draws; 1 of 8 draws commits the *reverse* edge equally confidently.
- **Presence instability** — 3 of 15 committed certain edges are presence-unstable; `drop function → memory safety` is committed certain at 0.85 yet appears in only 1 of 8 draws (a lucky-draw over-commit), while robust edges like `heap → pointer` (7/8) risk being missed entirely on a single draw.

A 3-model comparison (`tmp/2026-06-24-ordering-model-comparison/`) further showed single ordering draws are fragile for both edge *presence* (flash emitted 0 then 32 edges on the same input) and *latency* — i.e. this is not a model-choice problem to be solved by swapping models, but an irreducible distribution to be measured (rule 19). The ordering **model is settled as `gpt-oss-120b`** and is out of scope here (see Decisions / Out of scope).

## Outcome

The published Derived Graph Layer commits prerequisite edges that reflect the **judgment distribution** of the ordering call, not one arbitrary draw: genuinely-contested directions are surfaced as `uncertain` (and excluded from learner paths) rather than frozen by a coin flip, and barely-supported edges are not over-committed. Edge confidence becomes a calibrated measure of model agreement rather than the model's uncalibrated self-report.

## Decisions (locked)

1. **K-sample the one ordering call per domain.** Replace the single per-domain ordering call with K draws on the same assembled input. This stays one-call-per-domain × K — not an O(n²) per-pair fan-out.
2. **Tally a per-pair directional vote** across the K draws: forward count `f`, reverse count `r` for each unordered concept pair.
3. **Direction-contested → `uncertain`.** A pair cited in both directions across the K draws (beyond a minority threshold) is routed to `uncertain` — kept, flagged, visible, excluded from learner paths. This is the only genuinely new gate; it measures the flip (rule 19), it does not fabricate a verdict.
4. **Consensus confidence replaces the model's self-report.** A committed edge's confidence is its empirical agreement (`max(f,r) / K`), a calibrated number, not the model's per-draw 0.85.
5. **Presence quorum reuses the existing weak-edge floor.** Consensus confidence flows into the existing `cutWeakEdges` / `minEdgeConfidence` step; sub-floor edges become `weak_cut` dispositions (recorded with provenance, not committed). No new quorum mechanism is introduced.
6. **Presence-below-quorum → `weak_cut`; direction-contested → `uncertain`.** The two failure modes route to the two existing non-certain destinations (a 1/8 edge is *weak*; a 7:1 flip is *contested*). Revisitable in the build's rule-14 if operator visibility argues for routing both to `uncertain`.
7. **Drop the single-draw corrective re-prompt in K-mode.** Acyclicity is enforced on the *aggregated* certain set via the existing cycle-routing-to-`uncertain` mechanism; there is no single "model's cycle" to re-prompt. Per rule 18, the re-prompt branch is deleted, not kept beside the K path.
8. **K and all thresholds are calibrated in the build's own rule-14 pass, never hardcoded** — K, the weak-edge floor, and the direction-minority threshold. The K=8 probe surfaced the phenomena but is too small to set production values.
9. **Backing model: `gpt-oss-120b`** (validated fast/consistent/correct; `tmp/2026-06-24-ordering-model-comparison/rule-14-evaluation.md`).

## Scope

**In scope**
- The K-loop, per-pair vote tally, direction-contested gate, and consensus-confidence aggregation inside the ordering stage.
- Persisting the per-pair vote distribution to the enrichment-run trace so the rule-14 inspection is replayable and committed confidence is auditable.
- Bumping the enrichment config hash to mark the new ordering behavior.
- Deterministic-envelope tests only (rules 11/19): the vote tally, the direction gate, the consensus-to-floor mapping, acyclicity on the aggregate. No test asserts a model verdict; a canned K-draw set is allowed only as input to the deterministic aggregation.

**Out of scope**
- Changing the ordering model (settled: `gpt-oss-120b`).
- Any calibrated-agreement / self-consistency *framework* beyond an integer vote tally — rule 19's "self-consistency sampling" *is* the tally; do not over-build.
- Embeddings, bridge nodes, or any graph growth (rule 20 / TODO #6).
- Re-opening serving/seed determinism (ADR-0028 — irreducible, do not retry).
- O(n²) per-pair or per-node-batched judging (already retired).

## Success criteria

Established by real-use inspection (rule 14), not a green suite:

- On the Rust + economics fixture (version `9eb3e44d`), the direction-contested `saving of time…` ↔ `three circumstances…` pair lands in `uncertain`, not as a committed certain edge.
- The 1/8 `drop function → memory safety` over-commit is no longer a committed certain edge.
- Robust edges (e.g. `heap → pointer`, the stable-directed majority) remain committed.
- Committed certain edges carry consensus-derived confidence; the per-pair vote distribution is inspectable in the trace.
- The aggregated certain edge set is acyclic without a re-prompt.
- Cost stays ≈ K calls/domain; K is justified by the rule-14 calibration, not assumed.

## Open questions (resolve during build/calibration, not before)

- **K, weak-edge floor, direction-minority threshold** — calibrate against real multi-draw output; the K=8 probe's 1/8 flip rate is too small to set them.
- **Larger-K direction sensitivity** — at large K a single stray reverse vote shouldn't route a robust pair to `uncertain`; the minority threshold must scale, not be a binary "any reverse."
- **Presence-below-quorum destination** — `weak_cut` is the default (Decision 6); confirm against operator-visibility needs in rule-14.
- **Presence frequency surfacing** — whether to show a committed edge's `present/K` in Admin Lab alongside confidence (likely yes; low cost).

## Dependencies / assumptions

- Reuses existing pipeline machinery in `packages/application/src/runGraphEnrichment.ts`: the `cutWeakEdges`/`minEdgeConfidence` floor (`packages/application/src/prerequisiteDag.ts`), the `uncertain` route, and the `weak_cut` disposition path. No new persistence concepts beyond extending the enrichment-run trace.
- Assumes the LiteLLM proxy and `gpt-oss-120b` alias as currently configured (`litellm/config.yaml`, `kg-prerequisite-ordering`); alias edits require a `lrnki-litellm` restart.
- Measurement scaffolding is disposable (rules 11/13); the two `tmp/2026-06-24-*ordering*` probe dirs are removed once this lands.

## Evidence

- `tmp/2026-06-24-k-sample-ordering-probe/rule-14-evaluation.md` — direction + presence instability (trigger).
- `tmp/2026-06-24-ordering-model-comparison/rule-14-evaluation.md` — model settled as `gpt-oss-120b`; single-draw fragility across models.

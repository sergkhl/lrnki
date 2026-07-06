# Use learner-neutral intrinsic difficulty before learner-calibrated difficulty

Status: Accepted (amended 2026-07-05: comparative banded prior supersedes the neural+structural
fusion)

## Decision

Graph Enrichment assigns learner-neutral intrinsic difficulty to every derived node. Prerequisite
structure remains the primary learner-path constraint; intrinsic difficulty is a secondary ordering
signal.

Intrinsic difficulty is a **comparative in-set banded prior**:

- One forced-tool call per Declared Domain bands every concept **1–5 relative to that domain's
  concept set**, judging only domain-neutral factors (abstraction, technical density, background
  load, integration burden) from the same provenance-appropriate evidence enrichment ordering uses.
  Pointwise absolute scoring is rejected: without a reference frame, scale-use bias lets an
  abstract-*sounding*, evidence-thin label score high.
- The banding call is K-sampled per [ADR-0028](0028-measure-non-deterministic-quality-with-non-deterministic-methods.md);
  consensus is the modal band (a tie takes the lower band). Dispersion is signal: a **contested**
  band (modal share below the contest threshold) is resolved by at most two "which is harder"
  pairwise comparisons against uncontested same-domain anchor concepts of the extreme candidate
  bands; unresolvable concepts keep the modal band and record it.
- The persisted score is `(band − 1) / 4`; the band, draw count, modal share, contest flag, and
  comparison count persist as the difficulty row's numeric components — the prior's interface for
  the staged calibration lifecycle below.

No deterministic structural terms are fused in. Graph depth, transitive ancestors, and fan-in
re-encode the prerequisite structure that already gates the path; evidence density confounds source
salience with difficulty; and a hand-weighted linear fusion of an unvalidated feature vector is the
deterministic-proxy pattern ADR-0028 rejects. Structural facts stay derivable from the persisted
DAG and are candidates for the future learner-data posterior, not parts of the prior.

Downstream projections may gate trail inclusion only on a **confident floor band**: a node banded
at the floor *and* uncontested may be dropped as a trail stop with its prerequisite edges
contracted, exempting only nodes without a confident band (fail-open). There is no chosen-target
exemption — the trail is layer-wide with a derived summit
([ADR-0032](0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md)), so a confident
floor-band terminal is floored like any other node and simply anchors no section.

The signal's lifecycle is staged: banded LLM prior → pairwise calibration for contested bands
(both implemented) → learner-data posterior via Elo/IRT once real graded responses exist
(**deferred**). Population difficulty models, IRT, KT, and other learner modeling must not be
fitted from synthetic or self-assessed responses. They may be introduced only after stable
per-learner calibration and graded response data exist and real-use evaluation demonstrates an
improvement.

## Context

Pure graph depth cannot distinguish many concepts at the same structural level, but the project does
not yet have data that justifies population-level learner modeling. Intrinsic difficulty provides an
inspectable interim signal without claiming learner calibration. The 2026-07-05 amendment followed a
measured defect: under the pointwise absolute judge, broad or relation-like labels with sparse
evidence out-ranked the concepts their own domains actually develop — the same pointwise→listwise
pivot already made for prerequisite ordering fixes the reference-frame gap.

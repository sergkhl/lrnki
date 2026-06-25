# Use learner-neutral intrinsic difficulty before learner-calibrated difficulty

Status: Accepted

## Decision

Graph Enrichment assigns learner-neutral intrinsic difficulty to every derived node. Prerequisite
structure remains the primary learner-path constraint; intrinsic difficulty is a secondary ordering
signal.

Intrinsic difficulty combines:

- a bounded neural judgment based on domain-neutral factors such as abstraction, technical density,
  background load, and integration burden; and
- inspectable deterministic structural and evidence components.

The neural judge consumes the same provenance-appropriate evidence used by enrichment ordering.
Source evidence remains subject to the verbatim floor; generated grounding remains explicitly
generated under ADR-0023.

Intrinsic difficulty remains `EXPERIMENT_ONLY` until real learner-response data can calibrate it.
Population difficulty models, IRT, KT, and other learner modeling must not be fitted from synthetic or
self-assessed responses. They may be introduced only after stable per-learner calibration and graded
response data exist and real-use evaluation demonstrates an improvement.

## Context

Pure graph depth cannot distinguish many concepts at the same structural level, but the project does
not yet have data that justifies population-level learner modeling. Intrinsic difficulty provides an
inspectable interim signal without claiming learner calibration.

# Use a learner-neutral comparative difficulty prior

Status: Accepted

## Decision

Graph Enrichment assigns every derived node a comparative difficulty band relative to its Declared
Domain's current node set. The judgment uses domain-neutral factors and repeated sampling; contested
bands may be calibrated by pairwise comparison against stable in-domain anchors.

Prerequisite structure remains the primary learner-path constraint. Structural graph features and
evidence density are not fused into the prior because they duplicate prerequisite information or
confound source coverage with difficulty.

A learner projection may remove only an uncontested floor-band node, contracting its edges without
changing trail reachability. Missing or contested difficulty fails open.

Population-level learner models remain deferred until real graded response data and real-use
evaluation justify a new decision; synthetic or self-assessed responses are not substitutes.

## Context

Pointwise absolute scores over-ranked abstract-sounding, evidence-thin labels, while graph depth could
not distinguish many peers. Comparative bands provide an inspectable interim prior without pretending
to be learner calibration.

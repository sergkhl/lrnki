# Configure sampling by extraction stage

Status: Accepted

## Decision

Candidate Discovery uses the production model's default sampling because it is the recall-oriented
stage and greedy decoding was measured to inflate generic Candidates.

Concept Admission and CEP extraction use greedy sampling with a configured seed because, for a fixed
input, that setting reduced avoidable drift in the precision-oriented stages. Sampling settings are
part of pipeline-configuration identity and are chosen by the composition root; the forced-tool
transport remains policy-neutral.

These settings are operating levers, not reproducibility guarantees. ADR-0028 owns judgment
uncertainty and ADR-0017 owns reproducible publication from selected persisted runs.

## Context

Measured trials showed that greedy discovery increased candidate exhaustiveness and downstream
over-admission, while greedy Admission and CEP extraction reduced useful stage-level drift. The
policy keeps those stage-specific benefits without claiming bit-identical model output.

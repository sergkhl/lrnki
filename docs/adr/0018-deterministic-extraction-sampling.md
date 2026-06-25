# Configure sampling by extraction stage

Status: Accepted

## Decision

Candidate Discovery uses the production model's default sampling because it is the recall-oriented
stage and greedy decoding was measured to inflate generic Candidates.

Concept Admission and CEP extraction use greedy sampling with a configured seed because, for a fixed
input, that setting reduced avoidable drift in the precision-oriented stages. Sampling settings are
part of pipeline-configuration identity and are chosen by the composition root; the forced-tool
transport remains policy-neutral.

These settings are operating levers, not reproducibility guarantees. Model inference can remain
non-deterministic even with temperature zero and a seed. Extraction Runs therefore remain immutable
observations, while reproducible publication comes from rebuilding a graph version from explicitly
selected persisted runs under ADR-0017. Judgment uncertainty is measured under ADR-0028 rather than
suppressed by stronger determinism claims.

## Context

Measured trials showed that greedy discovery increased candidate exhaustiveness and downstream
over-admission, while greedy Admission and CEP extraction reduced useful stage-level drift. The
policy keeps those stage-specific benefits without claiming bit-identical model output.

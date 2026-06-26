# Measure non-deterministic quality with non-deterministic methods

Status: Accepted

## Decision

Judgment-based quality—including Concept correctness, identity adjudication, prerequisite existence
and direction, difficulty, and definition quality—must be evaluated with methods that represent
uncertainty:

- representative real-use LLM-as-judge evaluation;
- repeated judgment or self-consistency sampling; and
- calibrated agreement or uncertainty distributions.

Do not replace those judgments with a deterministic proxy that pretends one answer is objectively
known. Do not chase bit-level model-output determinism. Mixture-of-experts routing, hosted backends,
and floating-point execution can vary even with temperature zero and a seed; instability on an
ambiguous input is measurement signal.

ADR-0013 owns the deterministic-test boundary and real-source inspection policy.

Published reproducibility comes from immutable persisted artifacts with full provenance. Re-running a
neural operation creates a fresh observation; replaying the stored artifact reproduces the published
state.

ADR-0013 owns measurement-harness retention.

## Context

Attempts to force reproducible prerequisite judgments showed that variance concentrated on genuinely
ambiguous pairs and persisted under seeded greedy inference. Measuring the judgment distribution
exposed useful uncertainty that deterministic parity checks obscured.

# Measure non-deterministic quality with non-deterministic methods

Status: Accepted

## Decision

Judgment-based quality—Concept correctness, identity, prerequisites, difficulty, and evidence
quality—is evaluated with representative real-use judgment, repeated sampling, and recorded agreement
or uncertainty where the decision needs it.

Do not replace an ambiguous semantic judgment with a deterministic proxy that pretends one answer is
known, and do not chase bit-identical neural output. Variance is measurement signal; deterministic
code may hard-veto only provable guarantees under AGENTS rule 16.

[ADR-0013](0013-verify-quality-by-real-source-inspection.md) owns the test and inspection boundary.
Published reproducibility comes from immutable persisted artifacts with provenance: a re-run is a new
observation, while replaying the artifact reproduces the published state.

## Context

Seeded greedy prerequisite judgments still varied on genuinely ambiguous pairs. Recording their
distribution exposed uncertainty that deterministic parity checks concealed.

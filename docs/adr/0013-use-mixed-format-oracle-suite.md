# Verify quality by real-source inspection, not a standing oracle suite

Status: Accepted (reset 2026-06-15 — retires the standing oracle/aligner harness)

## Decision

Durable quality validation consists of three things: representative real-source inspection on mixed
domains and formats (the rule-14 real-use evaluation loop), the retained inline production judges
(concept-vs-proposition admission and optional-assertion entailment, ADR-0005/0007), and deterministic
verbatim-evidence verification.

The frozen oracle suite — independent oracle authoring, second-judge auditing, disagreement
quarantine, label alignment, scoring code, model aliases, schemas, tests, and frozen reference
artifacts (ADR-0022) — was used **once** to guide the admission precision/atomicity fix, then removed
in the same milestone after expert inspection passed. No standing benchmark harness remains; mixed
curated sources are kept under `fixtures/` and inspected through Extraction Runs and the Admin Lab.

## Context

The benchmark machinery had grown into a large standing surface that the product path never consumed,
and model-authored labels are oracle references, not human gold (rule 11). Encoding the known
fixture-specific defects directly in admission tests and verification preserved the useful diagnoses
without retaining disposable measurement infrastructure.

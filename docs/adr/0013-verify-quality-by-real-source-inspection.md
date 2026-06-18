# Verify quality by real-source inspection, not a standing oracle suite

Status: Accepted (reset 2026-06-15 — retires the standing oracle/aligner harness; amended 2026-06-17 — tests do not validate neural output)

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

## Tests do not validate neural output quality

This section is the rationale record for **AGENTS rule 11**, which is the normative source-of-truth
for what automated tests may and may not assert about neural output. This ADR does not restate that
rule; it records why the rule exists and how it was verified here.

The trigger for this amendment: a plausible, domain-neutral, rule-compliant prompt change was
empirically dead, which only surfaced by driving one pipeline stage in isolation against real model
calls. No test — and no amount of code review or reasoning — would have caught it, because the defect
lived in the neural layer, which no test observes. That is why a green suite is never quality evidence
and quality is established only by the rule-14 real-use loop.

Concretely in this codebase, rule 11's "deterministic envelope" is the verbatim-evidence verification
(rule 16), admission tiering and adapter fusion logic, the per-anchor cap, label→id resolution,
positional-bias-free edge direction, the graph algorithms (cycle removal, transitive reduction,
topological depth), and rule-6 fail-closed argument validation — all tested precisely because they may
veto neural output. The allowed canned-response shape is an input fixture that exercises that envelope
(e.g. a response with `subjectMatch: "different_or_absent"` is fed in to assert the adapter
deterministically returns `entailed: false` regardless of the model's `definitionEntailed` flag); the
forbidden shape asserts the model's judgment *content* rather than the deterministic *transform of it*.

This is a preventive rule, not a cleanup mandate. An audit of all test files at amendment time found
no LLM-standing-in tests: every test is either pure deterministic logic with no model, or a
canned-response adapter test on the allowed side of the line. Nothing was removed.

## Context

The benchmark machinery had grown into a large standing surface that the product path never consumed,
and model-authored labels are oracle references, not human gold (rule 11). Encoding the known
fixture-specific defects directly in admission tests and verification preserved the useful diagnoses
without retaining disposable measurement infrastructure.

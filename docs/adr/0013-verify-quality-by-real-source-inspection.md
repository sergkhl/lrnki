# Verify quality by real-source inspection, not a standing oracle suite

Status: Accepted

## Decision

Neural-output quality is established by inspecting representative real Curated Sources across mixed
domains and formats. Automated tests cover the deterministic envelope—schema validation, provenance,
policy transforms, and graph algorithms—but do not declare a canned model judgment semantically
correct.

Durable evaluation code and versioned human judgments are permitted when they name the consumer and
Model Assignment they evaluate. They support repeated measurement and diagnosis but must not become
a canned semantic oracle that allows deterministic suite success to declare neural output correct.
Stable source fixtures remain in `fixtures/`; generated evaluation artifacts remain in gitignored
`tmp/`.

Quality evidence is scoped to the [Model Assignment](../../CONTEXT.md#model-operations) and consumer
that produced it. Reassigning an alias therefore requires the affected consumers to be re-gated or
explicitly marked unqualified. A Provider Route change alone does not retire evidence when every
reachable route has the same Model Assignment; provider contract and reachability still require
operational qualification. The enforcement details live in
[AGENTS.md](../../AGENTS.md#validation-authority) and rule 14.

## Context

A frozen oracle and model-authored label aligner helped diagnose earlier defects but were not human
gold. Named, reviewable evaluation material can preserve useful judgments without creating a second
quality authority or letting deterministic tests substitute for real model behavior.

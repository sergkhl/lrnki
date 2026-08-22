# Verify quality by real-source inspection, not a standing oracle suite

Status: Accepted

## Decision

Neural-output quality is established by inspecting representative real Curated Sources across mixed
domains and formats. Automated tests cover the deterministic envelope—schema validation, provenance,
policy transforms, and graph algorithms—but do not declare a canned model judgment semantically
correct.

Benchmarks and labeled harnesses may diagnose one live decision, then are removed when they no longer
change it. Stable source fixtures remain in fixtures; generated evaluation artifacts remain
gitignored.

Quality evidence is scoped to the [Model Assignment](../../CONTEXT.md#model-operations) and consumer
that produced it. Reassigning an alias therefore requires the affected consumers to be re-gated or
explicitly marked unqualified. A Provider Route change alone does not retire evidence when every
reachable route has the same Model Assignment; provider contract and reachability still require
operational qualification. The enforcement details live in
[AGENTS.md](../../AGENTS.md#validation-authority) and rule 14.

## Context

A frozen oracle and model-authored label aligner helped diagnose earlier defects but were not human
gold. Retaining them would create a second quality system and invite deterministic tests to substitute
for real model behavior.

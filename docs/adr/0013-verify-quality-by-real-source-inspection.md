# Verify quality by real-source inspection, not a standing oracle suite

Status: Accepted

## Decision

Neural-output quality is established through representative real-source inspection across mixed
domains and formats, supported by retained production judges and deterministic provenance checks.

Automated tests cover only the deterministic envelope: tool-argument validation, evidence matching,
policy and fusion transforms, graph algorithms, and other provable guarantees. A canned model
response may be input to those transforms, but a test must not assert that its semantic judgment is
correct.

Benchmarks, oracles, label aligners, and model-authored reference sets are disposable measurement
scaffolding for a specific defect. Keep one only while it changes a live decision, then delete its
schemas, aliases, code, tests, and generated artifacts. No standing benchmark harness belongs in the
core.

Stable curated sources remain under `fixtures/`; generated evaluation artifacts remain under `tmp/`.

Every zero-row quality assertion carries a **positive control in the same query**. "No learner copy
carries graph vocabulary" and "the query is broken" produce the identical empty result, and psql
prints an error above an empty table where it reads as a clean pass — which is how a scan that had
errored on a column-type mismatch once got recorded as a passing vocabulary gate. Counting a
common-word control over the same rows in the same statement proves the scan reads text at all, so
the zero means what it says. This is measurement hygiene for the inspection above, not a gate: the
control is never a veto.

## Context

An earlier frozen oracle and scoring-only label aligner helped diagnose admission precision and
atomicity, but neither was human gold or part of the production path. Retaining that machinery would
create a second quality system and encourage deterministic tests to stand in for model behavior.

# Retire the asserted relation registry; keep two guarded CEP assertion types

Status: Accepted (reset 2026-06-15 — supersedes the closed six-relation registry)

## Decision

There is no asserted relation registry. The published asserted layer carries **no asserted edges**;
the only typed assertions are the two guarded Concept Evidence Profile evidence types `defines`
(concept-to-literal) and `explicit-prerequisite-hint` (concept-to-admitted-Concept), both validated
by verbatim grounding plus the assertion-entailment judge (ADR-0007). Neither becomes an authoritative
graph relation, a numeric prior, or a deterministic direction override.

The inferred-relation vocabulary stays separate and is owned solely by Graph Enrichment: a Derived
Graph Layer uses `inferred-prerequisite-of` (ADR-0019), which must never be confusable with the
`explicit-prerequisite-hint` CEP evidence. An `explicit-prerequisite-hint` is labeled evidence the
prerequisite judge may weigh, never a source-asserted edge.

## Context

The previous architecture published six asserted relation types (`is-a`, `part-of`,
`asserted-prerequisite-of`, `contrasts-with`, `uses`, `defined-as`) that the learner path never
consumed, while most relationship signal arrived as ordinary prose better preserved as untyped CEP
mention passages. Removing the registry collapses a large surface of schema, validation, and
publication complexity and makes the asserted/derived split unambiguous: sources contribute evidence,
Graph Enrichment contributes the only edges.

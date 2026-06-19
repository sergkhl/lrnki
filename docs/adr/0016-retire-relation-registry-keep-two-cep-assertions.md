# Retire the asserted relation registry; keep one guarded CEP assertion type

Status: Accepted (reset 2026-06-15 — supersedes the closed six-relation registry; amended 2026-06-19 — measured prerequisite hint redundant and removed)

## Decision

There is no asserted relation registry. The published asserted layer carries **no asserted edges**;
the only typed assertion is the guarded Concept Evidence Profile evidence type `defines`
(concept-to-literal), validated by verbatim grounding plus the assertion-entailment judge
(ADR-0007). It never becomes an authoritative graph relation, a numeric prior, or a deterministic
direction override.

The inferred-relation vocabulary stays separate and is owned solely by Graph Enrichment: a Derived
Graph Layer uses `inferred-prerequisite-of` (ADR-0019). Source prerequisite prose remains untyped CEP
mention evidence that the exhaustive enrichment judge reads.

On 2026-06-19, a real A/B over mixed-domain graph version
`ba7f5f9b-241c-4dc3-b265-904ac1bbcb7b` removed only the labeled prerequisite-hint signal while
preserving `defines`, using the same in-memory enrichment id and serialized pair calls. The inferred
edge set was unchanged: 13 certain edges with hints fed versus 13 certain edges with hints
suppressed, with no endpoint or uncertainty diff. Evidence is recorded under
`tmp/2026-06-18-prerequisite-hint-ab/`. Therefore the hint label did not earn its schema, entailment,
publication, or enrichment-context cost and was removed.

## Context

The previous architecture published six asserted relation types (`is-a`, `part-of`,
`asserted-prerequisite-of`, `contrasts-with`, `uses`, `defined-as`) that the learner path never
consumed, while most relationship signal arrived as ordinary prose better preserved as untyped CEP
mention passages. Removing the registry collapses a large surface of schema, validation, and
publication complexity and makes the asserted/derived split unambiguous: sources contribute evidence,
Graph Enrichment contributes the only edges.

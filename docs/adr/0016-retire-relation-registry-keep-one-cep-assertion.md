# Keep one guarded CEP typed assertion and no asserted relation registry

Status: Accepted

## Decision

The published asserted graph has no asserted edges and no general relation registry.

The only typed CEP evidence is `defines`, whose object is a literal definition. It requires verbatim
grounding and the assertion-entailment judgment from ADR-0007. It remains evidence inside a CEP and
never becomes an authoritative graph relation, numeric prior, or prerequisite-direction override.

All learner-neutral graph edges belong to Graph Enrichment. The Derived Graph Layer uses only
`inferred-prerequisite-of` under ADR-0019. Source prose that states relationships remains untyped CEP
Mention Passage evidence available to that judgment.

## Context

The former asserted relation vocabulary added schema and publication complexity without serving the
learner path. A measured prerequisite-hint type also produced no useful change in derived edges.
Keeping source prose as evidence and assigning all inferred edges to Graph Enrichment makes ownership
explicit.

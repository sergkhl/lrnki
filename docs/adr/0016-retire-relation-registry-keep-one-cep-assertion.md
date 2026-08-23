# Keep one guarded CEP typed assertion and no asserted relation registry

Status: Accepted

## Decision

There is no general asserted relation registry.

The only current typed CEP evidence is `defines`, whose object is a literal definition. It requires
verbatim grounding and the assertion-entailment judgment from ADR-0007. It remains evidence inside a
CEP and never becomes an authoritative graph relation, numeric prior, or prerequisite-direction
override.

A new typed evidence form triggers architectural review only after it has a real consumer, an
explicit grounding contract, and measured value on representative Curated Sources. The trigger does
not admit the type by itself.

ADR-0019 owns learner-neutral graph edges and their predicate. Source prose that states
relationships remains untyped CEP Mention Passage evidence available to Graph Enrichment.

## Context

The former asserted relation vocabulary added schema and publication complexity without serving the
learner path. A measured prerequisite-hint type also produced no useful change in derived edges.
Keeping source prose as evidence and assigning all inferred edges to Graph Enrichment makes ownership
explicit.

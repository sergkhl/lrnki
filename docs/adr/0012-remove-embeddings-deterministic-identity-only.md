# Remove embeddings from the core; deterministic identity is the sole merge authority

Status: Accepted (reset 2026-06-15 — supersedes the embedding candidate-selection framing)

## Decision

Embeddings are not used anywhere in the authoritative pipeline. Deterministic, domain-scoped
normalized-label identity (ADR-0015) is the sole Concept merge authority. There is no embedding
canonicalization cascade and no embedding-based prerequisite blocking: Graph Enrichment judges every
same-domain Concept-Evidence-Profile pair exhaustively (ADR-0019), so the small intentionally-kept
core needs no candidate-selection tier.

Any future embedding mechanism — a measured identity cascade, or a cost-bound pair-selection tier —
is deferred follow-up work. It may enter only as an explicit measured module evaluated against the
current exhaustive/deterministic behavior, and it may never, on its own, create or merge a Concept,
alias, or edge.

## Context

An earlier bare-label cosine experiment performed poorly because one mechanism both proposed and
decided merges, and the later embedding-clustering enrichment tier never earned a hard-gating role.
With the core kept intentionally small, exhaustive same-domain pair judgment is the simplest correct
behavior and removes the embedding adapter, alias, cosine clustering, candidate groups, and embedding
configuration entirely.

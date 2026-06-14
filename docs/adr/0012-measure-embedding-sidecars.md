# Use embeddings only as propose-only candidate selection

Status: Accepted (supersedes the prior "measured sidecar" framing)

## Decision

Embeddings may propose candidates but never decide Concept identity or create graph facts.

- Authoritative Concept Canonicalization remains deterministic under ADR-0015.
- A future measured identity cascade may use contextual embeddings to propose merge candidates and an LLM to verify reversible aliases. It remains outside the authoritative merge path until implemented and evaluated.
- Graph Enrichment may use contextual embeddings for Prerequisite Candidate Selection (ADR-0019). That responsibility is distinct from Concept Canonicalization.

An embedding may never, on its own, create or merge a Concept, alias, or edge.

## Context

An earlier bare-label cosine experiment performed poorly because one mechanism both proposed and decided merges. Candidate generation and authoritative decisions must remain separate. Any identity cascade must be measured on contextual evidence before entering publication.

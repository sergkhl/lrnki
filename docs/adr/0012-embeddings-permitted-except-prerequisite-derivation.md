# Permit embeddings except for prerequisite derivation

Status: Accepted

## Decision

Embeddings may support similarity, retrieval, and candidate generation. For identity they may only
propose near-duplicates; an explicit deterministic rule or measured semantic adjudicator makes and
records the merge decision. Raw similarity never creates or merges a Concept or derived node.

Embeddings must not propose, gate, order, or derive prerequisite edges. Those directional judgments
operate over the whole derived node set under
[ADR-0019](0019-graph-enrichment-derived-layer.md).

Any embedding use is an explicit measured module whose failure cannot silently change authoritative
identity or graph structure.

## Context

The former raw-similarity merge path performed poorly. Keeping embeddings as a recall signal preserves
their useful leverage without granting them authority over identity or prerequisite semantics.

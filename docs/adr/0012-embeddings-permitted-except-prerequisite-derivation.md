# Permit embeddings except for prerequisite derivation

Status: Accepted

## Decision

Embeddings may support:

- Concept identity and deduplication candidate generation;
- similarity; and
- recall or retrieval.

For identity, embeddings only **propose** near-duplicate candidates. A separate measured LLM
adjudicator or recorded deterministic identity rule makes the merge decision, and every merge is
recorded. Raw cosine similarity never creates or merges a Concept, alias, or derived node.

Embeddings must not propose, gate, order, or derive prerequisite edges. Prerequisite existence and
direction remain LLM-judged over the domain's derived node set under ADR-0019.

Any embedding mechanism is an explicit measured module evaluated against current behavior. Failure
must not silently change authoritative identity or graph structure.

## Context

An earlier raw-cosine path coupled candidate proposal and merge authority and performed poorly.
Removing embeddings entirely discarded useful recall and candidate-generation capability. Separating
proposal from adjudication retains that capability without repeating the identity failure or applying
similarity to directional prerequisite judgment.

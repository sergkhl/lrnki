# Embeddings are permitted (identity, similarity, recall) except for prerequisite derivation

Status: Accepted (2026-06-23 — withdraws the 2026-06-15 blanket no-embeddings ban)

## Decision

Embeddings are permitted in the pipeline. They may be used for **concept identity and
deduplication, similarity, and recall/retrieval**. The earlier blanket prohibition ("embeddings are
not used anywhere in the authoritative pipeline") is **withdrawn** — it over-corrected from one bad
experiment and was being cited as a reason to avoid embeddings reflexively.

Two guardrails survive, because they encode the actual lesson rather than the over-correction:

1. **Propose, don't decide.** An embedding signal may only *propose* candidates (e.g. near-duplicate
   concept pairs for merge). The merge/identity *decision* is made by a separate adjudicator — a
   measured LLM judge or a recorded deterministic rule — never by raw cosine similarity, and never by
   the same mechanism that proposed it. The original failure was one mechanism both proposing and
   deciding merges; that is what stays banned. Deterministic normalized-label exact match (ADR-0015)
   remains a valid baseline merge path; semantic dedup augments it, and every merge is recorded.

2. **Never for prerequisites.** Embeddings must NOT derive prerequisite structure. The
   `inferred-prerequisite-of` direction and existence stay LLM-judged (ADR-0019). There is no
   embedding-based prerequisite candidate-selection tier, blocking gate, or ordering signal. The
   deliberately-small core keeps exhaustive/whole-set LLM judgment affordable, so prerequisites gain
   nothing from an embedding shortcut and would lose provenance and direction fidelity.

Any embedding mechanism enters as an explicit measured module evaluated against current behavior
(rule 16 / ADR-0013), and it may never silently create or merge a Concept, alias, or edge on its own.

## Context

The earlier bare-label cosine experiment performed poorly because one mechanism both proposed and
decided merges, and a later embedding-clustering enrichment tier never earned a hard-gating role.
The fix at the time was to delete embeddings wholesale. That removed a real capability for the wrong
reason: real multi-source enrichment now shows exact-label canonicalization leaving obvious
synonyms unmerged — e.g. an admitted "Propensity to Truck, Barter, and Exchange" coexisting with a
rescued "Barter and Exchange", or "Owner" beside "Ownership (Rust)" — which fragments the graph and
confuses a learner who sees the same idea as two nodes ordered inconsistently. Industry KG-construction
practice resolves entities with semantic (embedding or LLM) candidate generation plus a separate
resolution step. Restoring embeddings as a *proposal* signal, with adjudication kept separate and
prerequisites kept LLM-only, attacks the fragmentation defect without reintroducing the
propose-and-decide failure.

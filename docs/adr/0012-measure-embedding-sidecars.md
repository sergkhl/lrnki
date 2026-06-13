# Use embeddings as a cascading-matcher blocking tier, never as merge authority

Status: Accepted (supersedes the prior "measured sidecar" framing)

## Decision

Concept canonicalization is a cascading matcher, not a single mechanism, and the same
propose-only rule governs every embedding use in the system.

- **Tier 1 — deterministic rules (ADR-0015).** Normalized-label match within a Declared
  Domain. This is the only tier that may auto-merge.
- **Tier 2 — contextual embeddings.** Computed over a concept's definition and evidence,
  never its bare label. Used purely for *blocking and clustering*: it proposes candidate
  merges and narrows which concept pairs later stages consider (including prerequisite
  candidate clustering in Graph Enrichment, ADR-0019). It never decides.
- **Tier 3 — LLM verification with reversible alias mapping.** Disposes tier-2 candidates.

An embedding may never, on its own, create or merge a concept, an alias, or an edge.
Embedding-proposed merges remain `EXPERIMENT_ONLY` — outside the authoritative merge
path — until a real-use evaluation measures that tier 2 adds recall without degrading
precision on curated fixtures.

## Context

The prior decision banned embeddings as an identity/merge authority after a pre-rebuild
experiment found neural name-embedding merge losing to deterministic merge. That
experiment tested the weakest possible technique — cosine merge over *bare labels*, with
the blocker acting as the decider — and its result was over-generalized into keeping
embeddings out of the pipeline entirely. 2026 entity-resolution practice separates
blocking/recall (where contextual embeddings excel) from matching/precision (where
deterministic rules and LLM verification decide), and warns that pure transitive closure
over-merges. This ADR keeps the real guardrail (no embedding authority) while admitting
embeddings to the recall tier, and requires the experiment to be re-run correctly — on
contextual embeddings, blocker-not-authority — before tier 2 is trusted.

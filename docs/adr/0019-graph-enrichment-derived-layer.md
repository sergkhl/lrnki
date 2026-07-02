# Keep inferred graph facts in Derived Graph Layers

Status: Accepted

## Decision

Learner-neutral graph facts not asserted by a source belong only in **Derived Graph Layers**. A
derived-layer operation never mutates the asserted graph or `graph_versions`.

Two derived-layer producers exist:

- **Graph Enrichment** consumes one explicit published graph version and one enrichment configuration
  and produces a separate Derived Graph Layer.
- **Synthetic Topic Generation** consumes a `topic` plus a Declared Domain and produces a
  free-standing, anchor-less Derived Graph Layer of `synthetic_primary` `llm_grounded` nodes
  (ADR-0023). It reads no published graph version and writes nothing asserted; its layer stores a
  NULL `graphVersionId` and reuses prerequisite ordering, intrinsic difficulty, and the same
  persistence boundary. A Processing Journey is either source-grounded or synthetic.

The Derived Graph Layer contains:

- anchor projections of published Concepts;
- `source_mentioned` Enrichment Nodes rescued from source evidence;
- `llm_grounded` Enrichment Nodes minted for assumed prerequisites;
- `inferred-prerequisite-of` edges; and
- learner-neutral intrinsic difficulty from ADR-0024.

Rescue and minting are bounded, measured operations. Their durability judges are drop-only and
inspectable. Generated grounding follows ADR-0023 and never enters the asserted graph.

Before prerequisite ordering, same-domain near-duplicate derived nodes may be proposed by embeddings
and decided by a separate adjudicator under ADR-0012. A merge never changes published Concept
identity and every decision is recorded.

Prerequisite structure is judged over each Declared Domain's whole derived node set. The ordering
call is sampled multiple times and aggregated as a judgment distribution under ADR-0028. Directional
contests and aggregate cycles route to inspectable `uncertain` edges; insufficient-agreement edges
are recorded as `weak_cut` dispositions. Neither enters trusted learner paths. The application
validates endpoint identity and graph structure deterministically; embeddings never derive
prerequisite candidates or direction.

An Enrichment Run retains model and configuration provenance, ordering traces, judgment
distributions, exclusions, judge dispositions, and deterministic graph transforms. Re-running the
same inputs creates a new observation and may produce a different layer. Reproducibility means
retaining and replaying the immutable artifact, not re-deriving identical model output.

Derived-layer operations never mutate the asserted graph. The only derived edge predicate is
`inferred-prerequisite-of`; source relationship prose remains CEP evidence under ADR-0007.

## Context

Prerequisite structure requires graph-global judgment and does not belong in a per-source Extraction
Run or the deterministic Graph-Version Build. A separate immutable layer keeps inferred structure
replaceable, provenance-visible, and downstream from the authoritative source-grounded graph.

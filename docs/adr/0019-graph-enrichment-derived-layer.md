# Add Graph Enrichment as a third decoupled operation producing a derived layer

Status: Accepted

## Decision

Orchestration has three decoupled operations, not two. Extraction Run and Graph-Version
Build (ADR-0017, ADR-0010) are unchanged. **Graph Enrichment** is a third operation: it
takes one published graph version plus an enrichment configuration and produces a
**Derived Graph Layer** keyed to that version.

It computes graph-global structure that no single source asserted — initially the
`inferred-prerequisite-of` DAG, later baseline node difficulty — using bounded LLM
judgment constrained by deterministic symbolic machinery (cycle removal, transitive
reduction, weak-edge cutting, contradiction detection). It:

- never mutates the authoritative asserted graph;
- never reuses an asserted relation name (CONTEXT: *Asserted vs inferred relations*), and
  the `inferred-prerequisite-of` vocabulary is separate from the closed extraction relation
  registry (ADR-0016), which governs only what a model may assert during extraction;
- is immutable and replayable as `(published version + enrichment config + captured LLM
  judgments)`, mirroring the Graph-Version Build's replay guarantee one level up.

## Context

Two of the project's learner-neutral graph goals — an inferred prerequisite DAG and
baseline node difficulty — are LLM-heavy and reason across concepts merged from many
sources. They fit neither existing operation: not the deterministic LLM-free build, and
not a per-source run. Folding inference into the build would forfeit ADR-0017's replay
guarantee; making it a per-source run cannot see cross-source structure. A third operation
keeps the asserted core provenance-pure and auditable while derived structure accumulates
as inspectable, replayable, clearly-labelled layers. Personalized stages (IRT/KT,
projection) remain deferred (ADR-0014); the enrichment layer is the learner-neutral
structure they will later consume. Difficulty is mocked (DAG-depth heuristic) in the first
vertical slice and replaced by Bradley-Terry calibration later.

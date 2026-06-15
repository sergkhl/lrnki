# Give Graph Enrichment exclusive ownership of inferred graph facts

Status: Accepted (reset 2026-06-15 — exhaustive same-domain CEP-pair judgment)

## Decision

Graph Enrichment is the only operation that creates learner-neutral graph facts not asserted by a source. Each execution is an immutable **Enrichment Run** over one explicit published graph version and one enrichment configuration. It produces one **Derived Graph Layer** stored separately from the asserted graph.

Enrichment judges **every unordered same-domain Concept pair exhaustively**, feeding the prerequisite judge both Concepts' published Concept Evidence Profiles — definition passages, salience-bounded mention passages, and labeled optional typed assertions. An `explicit-prerequisite-hint` is labeled evidence the judge may weigh, never a deterministic edge, numeric prior, or direction override. Pair calls use configurable bounded concurrency (default four) and preserve deterministic pair/result order; if any pair exhausts the forced-tool retry budget the run fails without persisting a partial layer. An Enrichment Run records its model identities, pair judgments, and deterministic dispositions (weak-edge cutting, cycle removal, transitive reduction). The relational Derived Graph Layer is the query surface; one immutable JSONB artifact retains the complete trace. Repeated executions with the same version and configuration remain distinct runs.

Graph Enrichment never mutates the asserted graph and never reuses an asserted relation name; its only predicate is `inferred-prerequisite-of` (ADR-0016). There is no embedding candidate-selection tier (ADR-0012); any future cost-bound pair-selection mechanism is deferred follow-up work that must be measured against exhaustive judgment before it can veto pairs.

## Context

Inferred prerequisite structure requires graph-global judgment and does not belong in a per-source Extraction Run or the deterministic asserted Graph-Version Build. With the core kept intentionally small, exhaustive same-domain pair judgment is the simplest correct behavior and removes the embedding-clustering blocking tier, whose hard-gating role was never earned. Separate Enrichment Runs keep publication provenance-pure while making inferred structure inspectable and independently replaceable by later methods.

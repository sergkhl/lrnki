# Define grounding origin and cross-family judgment for generated nodes

Status: Accepted

## Decision

Every graph node carries one grounding origin:

- `document_anchored` for a published asserted Concept;
- `source_mentioned` for a rescued node grounded in source mentions;
- `llm_grounded` for a minted node with generated grounding; or
- reserved `web_grounded`.

Layer is derived from grounding origin, never independently assigned:
`document_anchored` is asserted; every other origin is derived. Asserted Concepts are anchors.
Rescued and minted nodes are Enrichment Nodes and never enter the asserted graph. A node's
`prerequisite` role explains why it was introduced; ordering exists only in
`inferred-prerequisite-of` edges.

The verbatim evidence floor applies according to provenance. Source-quoted anchor and rescued
passages must match their cited blocks. Generated passages cannot claim source-verbatim provenance,
so their exemption is recorded explicitly as `not_applicable_by_grounding`.

Judgment over generated nodes must use a model family independent from the extraction and grounding
generator. ADR-0019 owns prerequisite-ordering aggregation and ADR-0028 owns judgment uncertainty.

## Context

Graph Enrichment needs to represent prerequisites absent from a source without weakening the asserted
graph's evidence contract. Grounding origin makes the trust boundary structural and inspectable, while
cross-family judgment avoids self-evaluation of generated grounding.

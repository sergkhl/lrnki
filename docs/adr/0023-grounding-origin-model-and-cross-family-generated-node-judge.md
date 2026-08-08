# Define grounding origin and cross-family judgment for generated nodes

Status: Accepted

## Decision

Every graph node carries one grounding origin:

- `document_anchored` for a published asserted Concept;
- `source_mentioned` for a rescued node grounded in source mentions;
- `llm_grounded` for a minted prerequisite or a synthesized topic concept, each with generated
  grounding; or
- reserved `web_grounded`.

Layer is derived from grounding origin, never independently assigned:
`document_anchored` is asserted; every other origin is derived. Asserted Concepts are anchors.
Rescued and minted nodes are Enrichment Nodes and never enter the asserted graph. A node's
role explains why it was introduced — `prerequisite` for a rescued or minted gap-filler,
`synthetic_primary` for a topic concept produced by synthetic generation over an anchor-less layer
(all nodes `llm_grounded`, no `document_anchored` anchors); ordering exists only in
`inferred-prerequisite-of` edges.

The verbatim evidence floor applies according to provenance. Source-quoted anchor and rescued
passages must match their cited blocks. Generated passages cannot claim source-verbatim provenance,
so their exemption is recorded explicitly as `not_applicable_by_grounding`.

Judgment over generated nodes must use a model family independent from the extraction and grounding
generator. Independence is a property of the pair, not of either alias alone: moving the extractor
into the judge's family breaks it exactly as moving the judge into the extractor's family does, so
whichever moves second must move in the same change, never afterwards. ADR-0019 owns
prerequisite-ordering aggregation and ADR-0028 owns judgment uncertainty.

## Context

Graph Enrichment needs to represent prerequisites absent from a source without weakening the asserted
graph's evidence contract. Grounding origin makes the trust boundary structural and inspectable, while
cross-family judgment avoids self-evaluation of generated grounding.

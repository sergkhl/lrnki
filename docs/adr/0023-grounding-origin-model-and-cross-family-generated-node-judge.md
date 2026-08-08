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

The pair is defined by the aliases the two roles actually resolve through, not by the stage names —
the grounding generator is whichever alias serves `grounding-generation`, and moving that alias moves
the generator whatever else rides on it.

The judge alias resolves to exactly one deployment, with no fallback. Stage records store the alias
and not the deployment that answered, so a mixed-model judge cannot be attributed from our own
records and every gate that ranges over judge verdicts
([ADR-0013](./0013-verify-quality-by-real-source-inspection.md),
[ADR-0028](./0028-measure-non-deterministic-quality-with-non-deterministic-methods.md)) becomes
unreadable. Widening for availability is a last resort, admissible only across deployments of the
same model at the same quantization: a quantization change drifts verdicts and destroys
reproducibility as surely as a model change. Which model holds the alias, and the measurement behind
it, are owned by `litellm/config.yaml` (AGENTS rule 5).

## Context

Graph Enrichment needs to represent prerequisites absent from a source without weakening the asserted
graph's evidence contract. Grounding origin makes the trust boundary structural and inspectable, while
cross-family judgment avoids self-evaluation of generated grounding.

# ADR-0025: Card Bank Over the Derived Graph Layer

## Status

Accepted.

## Context

The learner loop projects paths through the Derived Graph Layer, whose nodes include anchor projections, `source_mentioned` enrichment nodes, and `llm_grounded` enrichment nodes. The previous Card Bank and Response Log were keyed to asserted `concept_id`, so only anchors could be recall-tested. An adaptive frontier could therefore advance to a valid enrichment node with no card-backed response item.

Generated grounding also has a different citation contract from source grounding. It must not be represented as a source quote.

## Decision

The Card Bank and Response Log are keyed to `derived_node_id`.

Cards carry `groundingProvenance`:

- `source_cep` for anchor cards grounded in the published Concept Evidence Profile.
- `source_mentioned` for rescued enrichment-node cards grounded in verified source mentions.
- `generated` for minted enrichment-node cards grounded in the Generated Grounding Bundle.

Answer-key citations are a provenance-tagged union:

- Source citations carry `sourceResourceId`, `sourceBlockId`, and `evidenceQuote`.
- Generated citations carry `derivedNodeId` and generated `passageText`, with no source ids.

Generated cards verify against generated grounding passages and are labeled as generated grounding. They never claim source-verbatim provenance.

## Consequences

The learner loop now has one subject identity: `derived_node_id`. The old concept-to-node resolver is deleted from response-log folding and path recomputation.

Anchor `concept_id` remains recoverable by joining `derived_graph_nodes.concept_id` when later learner-modeling work needs stable asserted Concept identity.

Card regeneration is scoped to one enrichment layer. Re-enrichment mints new enrichment-node identities, so response history for enrichment-only nodes remains enrichment-scoped until stable learner-facing node identity is designed.

A derived node the generator cannot make recall-testable is recorded as a durable no-card fact carrying the rejection reason, persisted in the same transaction as that enrichment's cards. The frontier still advances by prerequisite structure and difficulty, but when it lands on a node with no card the projection surfaces the persisted reason ("not directly recall-tested yet") rather than presenting a card it does not have. A node is therefore in exactly one of {carded, recorded no-card} per enrichment.

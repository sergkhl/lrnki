# ADR-0025: Card Bank Over the Derived Graph Layer

## Status

Accepted. Amended 2026-06-20 to sharpen the recall-loop identity model and record the
derived-node naming decision (no decision reversed). **Superseded by
[ADR-0026](./0026-typed-study-item-bank.md) for item identity (2026-06-21):** the single
`Card` keyed by `card_id` became a typed `StudyItem` discriminated union keyed by
`study_item_id`, and the `card_bank.v3` artifact became `study_item_bank.v4`. The
derived-node **subject** identity (`derived_node_id`), the single-outcome-per-node
invariant, the append-only Response Log, and the source/generated grounding-provenance
contract recorded below are unchanged — read them as applying to typed study items.

## Context

The learner loop projects paths through the Derived Graph Layer, whose nodes include anchor projections, `source_mentioned` enrichment nodes, and `llm_grounded` enrichment nodes. The previous Card Bank and Response Log were keyed to asserted `concept_id`, so only anchors could be recall-tested. An adaptive frontier could therefore advance to a valid enrichment node with no card-backed response item.

Generated grounding also has a different citation contract from source grounding. It must not be represented as a source quote.

## Decision

The learner recall loop uses two identifiers, and the Response Log keeps both:

- `derived_node_id` is the learner-recall **subject** identity — the skill/learning subject, scoped to one Derived Graph Layer. Mastery folds by `derived_node_id`.
- `card_id` is the recall **item** identity — the per-item key a later IRT fit consumes.

The Card Bank and Response Log are keyed to `derived_node_id`. At most one primary recall card exists per derived node; future multi-card generation may add cards per node without changing the learner-state subject identity.

`derived_node_id` is the single learner-loop subject name end to end. No learner-loop, path, difficulty, or derived-edge code path names a derived node `conceptId`. The asserted `concept_id` remains a distinct identity, recoverable for an anchor by joining `derived_graph_nodes.concept_id` when stable asserted-Concept identity is later needed.

Cards carry `groundingProvenance`:

- `source_cep` for anchor cards grounded in the published Concept Evidence Profile.
- `source_mentioned` for rescued enrichment-node cards grounded in verified source mentions.
- `generated` for minted enrichment-node cards grounded in the Generated Grounding Bundle.

Answer-key citations are a provenance-tagged union:

- Source citations carry `sourceResourceId`, `sourceBlockId`, and `evidenceQuote`.
- Generated citations carry `derivedNodeId` and generated `passageText`, with no source ids.

A recall card cites the grounding passage it derives from by `passageId`, not by `sourceBlockId`: a generated card's grounding passage is not a source block, and a generated passage id must never be persisted as one. Generated cards verify against generated grounding passages and are labeled as generated grounding. They never claim source-verbatim provenance.

## Consequences

The learner loop now has one subject identity: `derived_node_id`. The old concept-to-node resolver is deleted from response-log folding and path recomputation. A worker CLI may still accept an anchor `concept_id` as an operator-friendly target reference, but it resolves to the anchor's `derived_node_id` before any path or card identity is formed.

The Response Log is append-only: it has no update or delete path. Corrected grading or invalidation appends a new row; current mastery stays a projection (fold) over the log. This is a structural property of the store port, not a convention.

Each derived node is in exactly one of {carded, recorded no-card} per enrichment. A derived node the generator cannot make recall-testable is recorded as a durable no-card fact carrying the rejection reason, persisted in the same transaction as that enrichment's cards. The frontier still advances by prerequisite structure and difficulty, but when it lands on a node with no card the projection surfaces the persisted reason ("not directly recall-tested yet") rather than presenting a card it does not have. This single-outcome-per-node invariant is enforced by writing cards and rejections atomically plus a per-node uniqueness key on each outcome table; no separate unified outcome table is introduced.

Learner history is scoped to one enrichment / Derived Graph Layer. No stable cross-enrichment `learning_subject_id` exists yet: re-enrichment mints new enrichment-node identities, so response history for enrichment-only nodes remains enrichment-scoped until stable learner-facing node identity is designed. That identity reconciliation is deferred until real usage justifies it.

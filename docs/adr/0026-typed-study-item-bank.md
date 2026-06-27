# Define the typed Study Item Bank and learner-response identity

Status: Accepted

## Decision

The learner loop uses `derived_node_id` as its subject identity. Mastery, calibration, learner paths,
and study-item coverage key to the node in one Derived Graph Layer, whether that node is an anchor or
an Enrichment Node. Asserted `concept_id` remains a separate identity available only for anchors.

The learner-neutral **Study Item Bank** is a typed discriminated union keyed by `itemType`.
`option_select` is the only implemented study-item payload. Reserved discriminants remain in source
types for future mechanics, but the initial migration persists option-select rows only. A node's
supported item types are derived from persisted generated items, never from a separately maintained
capability map.

Study items preserve grounding provenance:

- `source_cep` for anchor evidence;
- `source_mentioned` for rescued evidence; and
- `generated` for Generated Grounding Bundle passages.

Source citations retain source identifiers and verbatim evidence. Generated citations identify
generated grounding and never masquerade as source quotes.

Option-select study is auto-graded from the server-side keyed correct option and appends a graded
Response Log entry. Its deterministic guard enforces only structural and provenance guarantees;
distractor semantic quality is evaluated through real-use inspection.

Calibration is a separate self-report surface keyed directly to derived nodes, not a study-item
card. A learner records a mutable binary calibration verdict for a derived node. The application
composes those verdicts with the graded Response Log and surfaces disagreement rather than hiding it
behind a precedence rule.

The Response Log port is append-only and graded-only. Corrections append another graded observation;
an explicit operator reset is a separate administrative operation. Learner history remains scoped to
one Derived Graph Layer until stable cross-enrichment learner-facing identity is designed.

## Context

A concept-only item identity excluded rescued and minted nodes from recall, while a single untyped
card could not support multiple study mechanics. Separating derived-node subject identity, typed item
identity, calibration verdicts, and graded observations keeps learner state downstream and makes
grounding provenance explicit.

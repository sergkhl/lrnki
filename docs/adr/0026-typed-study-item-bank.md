# Define the typed Study Item Bank and learner-response identity

Status: Accepted

## Decision

The learner loop uses `derived_node_id` as its subject identity. Mastery, calibration, learner paths,
and study-item coverage key to the node in one Derived Graph Layer, whether that node is an anchor or
an Enrichment Node. Asserted `concept_id` remains a separate identity available only for anchors.

The learner-neutral **Study Item Bank** is a typed discriminated union keyed by `itemType`.
`option_select` and `impostor` are the implemented study-item payloads — both auto-graded
keyed-selection types: option-select keys the one correct option, impostor keys the one planted lie
among three grounded truths. A node's supported item types are derived from persisted generated items,
never from a separately maintained capability map.

The impostor item shape single-sources the planted lie. Generation returns three cited truths plus
one lie payload; the application inserts that lie into the four statement positions, and persistence
stores `reveal`, `lie_source`, and `sibling_label` on the keyed lie statement row. The item itself
does not duplicate lie metadata. This keeps the learner-facing reveal, grading key, and persisted
statement identity bound to the same lie object.

Study items preserve grounding provenance:

- `source_cep` for anchor evidence;
- `source_mentioned` for rescued evidence; and
- `generated` for Generated Grounding Bundle passages.

Source citations retain source identifiers and verbatim evidence. Generated citations identify
generated grounding and never masquerade as source quotes.

Keyed-selection study (option-select and impostor) is auto-graded from the server-side keyed
selection — the correct option for option-select, the planted impostor for impostor — and appends a
graded Response Log entry through one grading-neutral path; a node's mastery folds across all its
graded observations at one threshold regardless of item type. Each type's deterministic guard enforces
only structural and provenance guarantees: option-select keys exactly one correct option; impostor
keys exactly one lie, verifies each of the three truths verbatim against its cited grounding, and
makes a source-cited impostor unrepresentable. A cross-family lie-validity judge then checks whether
the keyed lie is actually false for the target node. A rejected lie gets one judge-informed retry; if
the retry still does not produce a false lie, or if the judge is unavailable, the impostor is dropped
with an operator-visible rejected-row reason. This judge is intentionally fail-closed because a true
"lie" teaches a falsehood, while a missing impostor item is the designed safe state. Distractor
plausibility and broader teaching quality remain real-use inspection responsibilities.

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

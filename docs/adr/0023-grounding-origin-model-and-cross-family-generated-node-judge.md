# Define grounding origin and independent judgment for generated nodes

Status: Accepted

## Decision

Every graph node records one Grounding Origin: document_anchored, source_mentioned, llm_grounded, or
the reserved web_grounded. The origin determines the trust layer: only document-anchored Concepts are
asserted; all other nodes are derived.

Source-grounded passages must match their cited source. Model-grounded passages are explicitly
generated and can never claim verbatim provenance. The role of a derived node explains why it was
introduced; prerequisite order exists only in inferred edges.

Judgment over generated nodes uses a model family independent from the extractor and grounding
generator. Independence is a property of the pair, so moving either side must preserve it in the
same change. The judge alias resolves to one attributable deployment; the current alias-to-deployment
mapping belongs to litellm/config.yaml.

Web-grounded content remains reserved rather than implemented. Retrieval sources, acceptance,
provenance, and learner-surface policy require a separate decision before that origin may be used.

## Context

Graph Enrichment must represent knowledge absent from a source without presenting generated text as
asserted evidence or allowing a generator to judge its own output.

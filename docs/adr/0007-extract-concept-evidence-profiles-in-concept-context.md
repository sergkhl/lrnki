# Extract Concept Evidence Profiles in admitted-Concept context

Status: Accepted

## Decision

Every admitted Concept receives one provenance-preserving CEP containing verified Definition
Passages, selected Mention Passages, and only the typed evidence permitted by
[ADR-0016](0016-retire-relation-registry-keep-one-cep-assertion.md). Source quotations retain their
source location and must match their cited block, allowing only normalization that preserves the
quoted text's meaning.

Semantic judges may remove hollow definitions or unentailed typed evidence, but deterministic
surface heuristics may not stand in for those judgments. A negative judgment must be grounded;
transport or schema failure preserves otherwise valid evidence rather than manufacturing a semantic
rejection.

A core proposal left without a meaning-bearing verified definition is not published, although its
successful evidence remains inspectable and may support the derived rescue path in
[ADR-0019](0019-graph-enrichment-derived-layer.md). Any rescued definition that reaches a learner is
subject to the same definition-quality judgment before use.

## Context

The asserted graph needs compact source context, not a broad claim graph. Verbatim verification gives
a provable provenance floor while semantic judgment decides whether the evidence actually explains
the Concept.

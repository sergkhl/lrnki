# Gate synthesized content on probed model knowledge with a web-grounding fallback

Status: Proposed

## Decision

Before a model synthesizes world-knowledge content for a concept it cannot cite to a curated
source, probe whether the concept is core model knowledge. A dedicated low-parameter LiteLLM alias,
separate from the synthesizing model, runs the probe cheaply.

- When the probe shows the concept is core knowledge, synthesize from parametric knowledge as today.
- When the probe shows the concept at or beyond the model's knowledge boundary, do not synthesize
  from an unreliable base. Retrieve external sources and ground the content in them, recorded as the
  reserved `web_grounded` Grounding Origin owned by
  [ADR-0023](0023-grounding-origin-model-and-cross-family-generated-node-judge.md).

The probe prefers a consistency-based signal — sample agreement at low temperature — over verbalized
self-confidence, because verbalized confidence is weakly calibrated. It reuses the non-deterministic
measurement stance of
[ADR-0028](0028-measure-non-deterministic-quality-with-non-deterministic-methods.md). A low-parameter
model is a deliberate choice: factual recall tracks concept popularity, so a small model cheaply
reveals whether a concept is popular/core or long-tail.

Scope is every synthesis locus that asserts factual content with no curated-source citation:

- Generated Grounding Bundles for `llm_grounded` minted Enrichment Nodes
  ([ADR-0019](0019-graph-enrichment-derived-layer.md)) — highest priority, since these are concepts
  the source never teaches.
- The synthesized Concept Lesson sections that carry `generated` provenance — gist, intuition,
  analogies, and graph-neighbor applications.

Out of scope: option-select distractors, which must be plausibly wrong rather than factually
grounded; and any section already cited verbatim to source, which is grounded by construction and is
never probed.

Web-grounded content keeps the generated-content honesty contract: it is labeled `web_grounded`,
cites its retrieved sources, never masquerades as curated-source evidence, stays a downstream
projection, and never enters the asserted graph
([ADR-0002](0002-define-learner-neutral-core-concept-graph.md)). The probe prompt is domain-neutral
and never tuned with expected concepts. The probe and the fallback are validated by real-source
inspection ([ADR-0013](0013-verify-quality-by-real-source-inspection.md)), not deterministic proxies.

## Context

Synthesizing long-tail concepts from parametric knowledge invites confident hallucination — the
established failure mode of open-ended generation past a model's knowledge boundary. The recognized
mitigation is selective, adaptive retrieval: retrieve only when the model is uncertain, rather than
always retrieving (cost, latency) or never retrieving (hallucination). Knowledge-boundary detection
through a cheap popularity-correlated probe is the conventional signal for that branch. The
grounding-origin model already reserved `web_grounded` for this path, so activating it extends an
anticipated seam rather than adding a layer.

This decision is Proposed and not yet implemented, so `web_grounded` stays reserved in
[ADR-0023](0023-grounding-origin-model-and-cross-family-generated-node-judge.md) and the synthesized
Concept Lesson sections are generated unconditionally until this work lands.

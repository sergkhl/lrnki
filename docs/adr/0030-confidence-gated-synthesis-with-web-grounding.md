# Gate source-less synthesis with a Knowledge-Boundary Probe

Status: Accepted

## Decision

Before a model synthesizes world-knowledge content for a concept it cannot cite to a curated
source, probe whether the concept is core model knowledge. A dedicated small-parameter LiteLLM alias,
separate from the synthesizing model and cross-family from it, runs the probe cheaply.

- When the probe shows the concept is core knowledge, synthesize from parametric knowledge as today.
- When the probe shows the concept at or beyond the model's knowledge boundary, do not synthesize
  from an unreliable base. Retain an inspectable `boundary` disposition, route it to `uncertain`, and
  exclude it from trusted learner surfaces.

The probe prefers a consistency-based signal — semantic agreement across K sampled draws — over
verbalized self-confidence, because verbalized confidence is weakly calibrated. Agreement is measured
with the existing embedding port (ADR-0012 similarity use), not lexical overlap and not a new judge.
Sampling is at **moderate** temperature, not low: low temperature masks confident hallucination
behind a repeated wrong answer, whereas self-consistency needs sampling diversity to expose a
knowledge boundary as answer dispersion. It reuses the non-deterministic measurement stance of
[ADR-0028](0028-measure-non-deterministic-quality-with-non-deterministic-methods.md). A small-parameter
model is a deliberate choice: factual recall tracks concept popularity, so a small model cheaply
reveals whether a concept is popular/core or long-tail.

Synthetic Topic Generation probes every synthesized concept and routes `core_knowledge` to a
`synthetic_primary` `llm_grounded` node and `boundary` to an `uncertain` disposition. `web_grounded`
remains a reserved Grounding Origin in
[ADR-0023](0023-grounding-origin-model-and-cross-family-generated-node-judge.md); retrieval source
selection, grounding acceptance rules, persistence shape, and learner-surface policy for
`web_grounded` content are unresolved and must be planned before implementation.

Current accepted scope is source-less concept synthesis:

- Generated Grounding Bundles for `llm_grounded` minted Enrichment Nodes
  ([ADR-0019](0019-graph-enrichment-derived-layer.md)) — highest priority, since these are concepts
  the source never teaches.
- Synthetic Topic Generation topic concepts, which have no curated source by construction.

Out of scope: option-select distractors, which must be plausibly wrong rather than factually grounded;
any section already cited verbatim to source, which is grounded by construction and is never probed;
and source-less Concept Lesson section gating, which is not current policy until the unresolved
retrieval branch is designed.

The probe prompt is domain-neutral and never tuned with expected concepts. Probe quality is validated
by real-source inspection ([ADR-0013](0013-verify-quality-by-real-source-inspection.md)), not
deterministic proxies.

## Context

Synthesizing long-tail concepts from parametric knowledge invites confident hallucination — the
established failure mode of open-ended generation past a model's knowledge boundary. The recognized
mitigation is selective, adaptive retrieval: retrieve only when the model is uncertain, rather than
always retrieving (cost, latency) or never retrieving (hallucination). Knowledge-boundary detection
through a cheap popularity-correlated probe is the conventional signal for that branch. The
grounding-origin model already reserved `web_grounded` for this path, but reservation is not an
implementation contract. Until retrieval is designed, the safe current behavior is to hold boundary
concepts out of trusted learner surfaces.

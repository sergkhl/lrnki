# Use learner-neutral intrinsic difficulty before learner-calibrated difficulty

Status: Accepted (2026-06-18)

## Decision

Graph Enrichment produces concept difficulty with a learner-neutral **intrinsic difficulty** method. The method scores every derived node in the Derived Graph Layer: anchors, rescued `source_mentioned` nodes, and minted `llm_grounded` nodes. It keeps the existing `ConceptDifficulty` output shape (`score`, `method`, `components`) so learner-path projection continues to treat prerequisite structure as primary and difficulty as a secondary ordering signal.

Intrinsic difficulty is a fused signal:

- a bounded neural judge, routed through LiteLLM and a forced named tool schema, estimates a per-node intrinsic subscore from domain-neutral factors such as abstraction level, technical density, implied background load, and integration burden;
- deterministic structural components record topological depth, transitive prerequisite ancestors, fan-in, and evidence density;
- the returned `components` expose the neural and deterministic terms rather than hiding an opaque scalar.

The neural judge reads the same per-node evidence assembled for enrichment ordering. Anchors use their published CEP evidence; rescued nodes use verified mention passages; `llm_grounded` nodes use their generated grounding bundle. This does not change the verbatim floor: source-quoted evidence still must verify verbatim, and generated grounding remains explicitly non-verbatim as recorded in ADR-0023.

Learner-calibrated difficulty remains deferred. Bradley-Terry, IRT, KT, and related learner-response models require learner interaction data the product does not yet collect. They may replace or augment intrinsic difficulty only after that data surface exists and real-use inspection shows the calibrated method improves the learner path without hiding provenance.

Intrinsic difficulty is carried at `EXPERIMENT_ONLY` trust for ordering until real learner data exists. Rule-14 inspection can establish source-faithful plausibility, not a hard oracle for difficulty quality.

## Context

The previous `dag-depth-mock` difficulty producer was honest but too coarse: it could not distinguish concepts at the same topological depth. At the same time, jumping directly to learner-calibrated difficulty would invent precision unsupported by available data. A learner-neutral intrinsic judge fills the current gap while keeping the calibrated method explicitly data-blocked.

F3 graph densification was removed at the same milestone. The enrichment layer already passed inspected prerequisite-ordering gates without densification, and the densification experiments did not earn their cost. Difficulty therefore improves the secondary ordering signal rather than adding another graph-growth pass.

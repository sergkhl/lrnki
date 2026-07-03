# Architecture Decision Records

ADRs are the canonical source for current durable architectural decisions and rationale.

- Keep one decision per ADR.
- State current policy, boundaries, and consequences; omit implementation walkthroughs, rollout
  progress, plan-unit references, branch names, and validation transcripts.
- Link to another ADR instead of restating its decision.
- Delete a fully superseded ADR and repair inbound references. ADR numbers are never reused.
- Source types and the initial migration remain authoritative for exact interfaces and data shapes.

## Current decisions

- [0001 — Greenfield deep-module architecture](./0001-adopt-greenfield-deep-module-architecture.md)
- [0002 — Learner-Neutral Core Concept Graph](./0002-define-learner-neutral-core-concept-graph.md)
- [0003 — PostgreSQL artifact store](./0003-use-postgres-json-table-artifact-store.md)
- [0004 — Structured curated sources](./0004-normalize-curated-sources.md)
- [0005 — Atomic Concept Admission](./0005-admit-atomic-concepts-before-evidence-profiles.md)
- [0006 — Forced named LLM tool schemas](./0006-use-forced-named-tool-schemas.md)
- [0007 — Concept Evidence Profile extraction](./0007-extract-concept-evidence-profiles-in-concept-context.md)
- [0008 — RDF-compatible boundary](./0008-use-rdf-compatible-boundary.md)
- [0009 — Static Graph Refinement](./0009-apply-conservative-refinement.md)
- [0010 — Atomic graph-version publication](./0010-publish-static-graph-versions-atomically.md)
- [0011 — Minimal Admin Lab](./0011-retain-minimal-admin-lab.md)
- [0012 — Embedding boundaries](./0012-embeddings-permitted-except-prerequisite-derivation.md)
- [0013 — Real-source quality validation](./0013-verify-quality-by-real-source-inspection.md)
- [0015 — Cross-source Concept identity](./0015-deterministic-cross-source-identity.md)
- [0016 — CEP typed evidence vocabulary](./0016-retire-relation-registry-keep-one-cep-assertion.md)
- [0017 — Extraction Runs and Graph-Version Builds](./0017-split-extraction-runs-from-graph-version-builds.md)
- [0018 — Extraction-stage sampling policy](./0018-deterministic-extraction-sampling.md)
- [0019 — Derived Graph Layer ownership](./0019-graph-enrichment-derived-layer.md)
- [0023 — Grounding-origin model](./0023-grounding-origin-model-and-cross-family-generated-node-judge.md)
- [0024 — Learner-neutral intrinsic difficulty](./0024-learner-neutral-intrinsic-difficulty.md)
- [0026 — Typed Study Item Bank and learner-response identity](./0026-typed-study-item-bank.md)
- [0027 — Inspection and learner-projection read boundaries](./0027-serve-inspection-through-read-model-ports.md)
- [0028 — Non-deterministic quality measurement](./0028-measure-non-deterministic-quality-with-non-deterministic-methods.md)
- [0029 — Shared operation-stage timelines](./0029-persist-shared-operation-stage-timelines.md)
- [0030 — Knowledge-boundary synthesis gate](./0030-confidence-gated-synthesis-with-web-grounding.md)
- [0031 — Concept Lesson teaching substrate](./0031-concept-lesson-teaching-substrate.md)
- [0032 — Mastery-aligned Game UX for the Learner App](./0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md)

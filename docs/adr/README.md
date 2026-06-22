# Architecture Decision Records

- [0001-adopt-greenfield-deep-module-architecture](./0001-adopt-greenfield-deep-module-architecture.md)
- [0002-define-learner-neutral-core-concept-graph](./0002-define-learner-neutral-core-concept-graph.md)
- [0003-use-postgres-json-table-artifact-store](./0003-use-postgres-json-table-artifact-store.md)
- [0004-normalize-curated-sources](./0004-normalize-curated-sources.md)
- [0005-admit-atomic-concepts-before-evidence-profiles](./0005-admit-atomic-concepts-before-evidence-profiles.md)
- [0006-use-forced-named-tool-schemas](./0006-use-forced-named-tool-schemas.md)
- [0007-extract-concept-evidence-profiles-in-concept-context](./0007-extract-concept-evidence-profiles-in-concept-context.md)
- [0008-use-rdf-compatible-boundary](./0008-use-rdf-compatible-boundary.md)
- [0009-apply-conservative-refinement](./0009-apply-conservative-refinement.md)
- [0010-publish-static-graph-versions-atomically](./0010-publish-static-graph-versions-atomically.md)
- [0011-retain-minimal-admin-lab](./0011-retain-minimal-admin-lab.md)
- [0012-remove-embeddings-deterministic-identity-only](./0012-remove-embeddings-deterministic-identity-only.md)
- [0013-verify-quality-by-real-source-inspection](./0013-verify-quality-by-real-source-inspection.md)
- [0014-defer-learner-modeling](./0014-defer-learner-modeling.md)
- [0015-deterministic-cross-source-identity](./0015-deterministic-cross-source-identity.md)
- [0016-retire-relation-registry-keep-two-cep-assertions](./0016-retire-relation-registry-keep-two-cep-assertions.md)
- [0017-split-extraction-runs-from-graph-version-builds](./0017-split-extraction-runs-from-graph-version-builds.md)
- [0018-deterministic-extraction-sampling](./0018-deterministic-extraction-sampling.md)
- [0019-graph-enrichment-derived-layer](./0019-graph-enrichment-derived-layer.md)
- [0022-retire-measured-label-aligner](./0022-measured-label-aligner-for-oracle-scoring.md) — one-time Gate 2 scoring aid, retired with the oracle harness; never changed graph identity (0015)
- [0023-grounding-origin-model-and-cross-family-generated-node-judge](./0023-grounding-origin-model-and-cross-family-generated-node-judge.md) — grounding_origin/role/layer invariant, per-provenance verbatim floor with recorded exemption, cross-family generated-node judge
- [0024-learner-neutral-intrinsic-difficulty](./0024-learner-neutral-intrinsic-difficulty.md) — intrinsic difficulty now; learner-calibrated difficulty remains data-blocked
- [0025-card-bank-over-derived-graph-layer](./0025-card-bank-over-derived-graph-layer.md) — Card Bank and Response Log keyed to derived nodes, with source/generated grounding provenance; superseded by 0026 for item identity
- [0026-typed-study-item-bank](./0026-typed-study-item-bank.md) — Card → typed StudyItem discriminated union (`itemType`); auto-graded option-select studying, self-assessment retreats to calibration; supported types are `SELECT DISTINCT item_type`, never a stored map; sibling-conditioned generated distractors + deterministic structural guard
- [0027-serve-inspection-through-read-model-ports](./0027-serve-inspection-through-read-model-ports.md) — Admin Lab inspection reads go through finished read-model ports (adapter owns the SQL); learner projection reads go through `application` use-cases; inspection types live in `ports` (bounded), real DB errors propagate. First slice: Run + Source inspection

> Numbers 0020–0021 were never issued: the 2026-06-15 complexity reset folded those decisions into in-place rewrites of existing ADRs (0002/0005/0007/0009/0012/0013/0016/0019/0022) rather than new records.

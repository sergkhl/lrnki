# Concept-First Roadmap

Durable architecture is defined in [ADRs](../adr/README.md), domain language in [CONTEXT](../../CONTEXT.md), and current tasks and validation in [TODO](./TODO.md).

The product critical path is **concept admission → enrichment prerequisite inference → learner path**. The asserted layer records what sources say *exists* (Concepts + Concept Evidence Profiles); the derived enrichment layer owns all inferred *structure* (the prerequisite DAG). See the [complexity-reset requirements](../brainstorms/2026-06-15-kg-core-complexity-reset-requirements.md).

## Milestones

1. **Gate 1: asserted graph pipeline — complete**
   - Native curated-source ingestion.
   - Extraction Runs for discovery, admission, and (post-reset) Concept Evidence Profile extraction with verbatim-evidence verification.
   - Deterministic Graph-Version Builds and atomic asserted publication.
   - Read-only Admin Lab inspection.
2. **Vertical slice: Graph Enrichment to Learner Path — complete**
   - Inferred prerequisite Derived Graph Layer.
   - Baseline difficulty and mock Learner State behind explicit ports.
   - Persisted Learner Path rendered read-only.
3. **Canonical architecture consolidation — complete**
   - Remove competing definitions.
   - Make graph-version snapshots immutable.
   - Make Enrichment Runs append-only, explicit, and auditable.
4. **Gate 2: mixed-format oracle benchmark — complete (now disposable)**
   - PDF curated fixtures (DOCX and PPTX de-scoped).
   - Five human-reviewed admission arms via independence triangle + second-judge audit.
   - Its durable output is the admission-precision diagnoses; the harness is retired in milestone 5.
5. **Complexity reset — complete**
   - Fixed Concept Admission precision (cross-domain optional leak, core-poor under-tiering, conflated labels via atomic admission), then deleted the oracle triangle + label aligner + frozen references.
   - Replaced asserted claims with Concept Evidence Profiles; retired the relation registry (keeping only `defines` + `explicit-prerequisite-hint` as guarded CEP evidence); the published asserted graph carries no edges.
   - Enrichment prerequisite judgment now reads exhaustive same-domain CEP pairs; the embedding blocking tier is removed.
   - Admin Lab, RDF export, and the worker reshaped around the asserted/derived split.
   - Rewrote ADR-0002/0005/0007/0009/0012/0013/0016/0019/0022 and the CONTEXT vocabulary in place.
6. **Measured deepening — deferred (mocked behind ports)**
   - Bradley-Terry difficulty replaces the DAG-depth mock; IRT/KT Learner State replaces the empty mock.
   - Cut from the roadmap: embedding canonicalization cascade, embedding blocking tier, interpretable non-LLM prerequisite signals, clustering, anomaly detection, synthetic priors.

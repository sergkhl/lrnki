# Concept-First Roadmap

Durable architecture is defined in [ADRs](../adr/README.md), domain language in [CONTEXT](../../CONTEXT.md), and current tasks and validation in [TODO](./TODO.md).

The product critical path is **concept admission → enrichment prerequisite inference → learner path**. The asserted layer records what sources say *exists* (Concepts + Concept Evidence Profiles); the derived enrichment layer owns all inferred *structure* (the prerequisite DAG). See the [complexity-reset requirements](../brainstorms/2026-06-15-kg-core-complexity-reset-requirements.md).

## Milestones

1. **Gate 1: asserted graph pipeline — complete**
   - Native curated-source ingestion.
   - Extraction Runs for discovery, admission, claims, and evidence validation.
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
5. **Complexity reset — next**
   - Fix Concept Admission precision (cross-domain optional leak, core-poor under-tiering, conflated labels), then delete the oracle triangle + label aligner + frozen references.
   - Replace asserted claims with Concept Evidence Profiles; retire the broad relation registry (keep only `defines` + `explicit-prerequisite-hint` as guarded CEP evidence); published asserted graph carries no edges.
   - Feed enrichment prerequisite judgment over CEP pairs.
   - Rewrite ADR-0002/0005/0007/0013/0016/0022 and the CONTEXT vocabulary in place.
6. **Measured deepening — deferred (mocked behind ports)**
   - Bradley-Terry difficulty replaces the DAG-depth mock; IRT/KT Learner State replaces the empty mock.
   - Cut from the roadmap: embedding canonicalization cascade, embedding blocking tier, interpretable non-LLM prerequisite signals, clustering, anomaly detection, synthetic priors.

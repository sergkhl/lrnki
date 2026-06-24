# Lrnki Greenfield Context

Lrnki converts curated learning resources into one authoritative, learner-neutral graph of durable domain Concepts, each carrying a source-grounded Concept Evidence Profile. The published asserted layer has no asserted edges; all prerequisite structure is derived separately. Learner-specific structures consume that graph without changing it.

## Language

**Learner-Neutral Core Concept Graph**:
The authoritative published graph of durable **Concepts**, each with one source-grounded **Concept Evidence Profile**, independent of learner goals and mastery. The asserted layer exposes no asserted edges.
_Avoid_: neutral KG, fact graph, knowledge base

**Concept**:
A durable unit of domain knowledge admitted from source evidence and assigned a stable identity.
_Avoid_: node, entity, term, topic

**Candidate**:
A run-scoped possible Concept surfaced from one source. It is not part of a published graph.
_Avoid_: concept before admission, keyword

**Candidate Discovery**:
The recall-oriented stage that surfaces Candidates from a Structured Document.
_Avoid_: Concept Admission, keyword extraction

**Core Concept Eligibility**:
The evidence-backed judgment that an atomic Candidate is a standalone learning objective with established meaning in its Declared Domain and substantive organizing power.
_Avoid_: concept importance, prominence, mention frequency

**Atomic Admission Proposal**:
One atomic admission decision derived from a discovered Candidate. A single Candidate may yield several atomic proposals, each with a stable run-local key, a shared parent-candidate key, and its own source-grounded label and evidence.
_Avoid_: conflated label, multi-concept candidate

**Core Set Selection**:
The source-level choice of a small, non-redundant set of eligible atomic proposals that preserves the source's principal learning structure.
_Avoid_: top-k selection, fixed concept-count target

**Concept Admission**:
The precision-first stage that applies Core Concept Eligibility and Core Set Selection to classify an atomic proposal as `core`, `optional`, `reject`, or `quarantine`, including a neural source-role and Declared-Domain relevance judgment that rejects out-of-domain illustrative material.
_Avoid_: filtering, ranking, scoring, lexical illustrative-section veto

**Canonical Concept Label**:
The precise, evidence-preserving, domain-qualified label assigned to an admitted Concept while retaining source labels as aliases.
_Avoid_: display-name cleanup, free rewrite

**Concept Evidence Profile (CEP)**:
The published context for one Concept: at least one verified **Definition Passage**, up to a configured number of salience-ordered **Mention Passages** per source, and optional guarded **Optional Typed Assertions**. Every element carries the curated source, source block, verbatim quote, heading path, and locator. The CEP is the published Concept context; there is no sibling asserted-edge collection.
_Avoid_: claim, fact, triple, edge

**Definition Passage**:
A verbatim source passage that establishes a Concept's meaning. It need not use a lexical "X is Y" form but must be meaning-bearing. An admitted Concept with no verified Definition Passage cannot enter a successful run.
_Avoid_: copula whitelist, connective list

**Mention Passage**:
A verbatim source passage that substantively mentions a Concept, kept in neural salience order up to the configured per-source bound (default six). General relationships a source states in prose survive here as untyped evidence.
_Avoid_: claim, asserted relation

**Optional Typed Assertion**:
The single guarded CEP evidence type, `defines`, whose object is a literal definition. It requires verbatim evidence and assertion entailment, and remains evidence inside a CEP, never an authoritative edge or a numeric prior. The former prerequisite hint assertion was measured redundant against exhaustive enrichment and removed.
_Avoid_: relation registry, asserted relation, edge

**Declared Domain**:
A human-assigned domain attached to a curated source and used to scope deterministic Concept identity.
_Avoid_: topic, category, subject area

**Concept IRI**:
The stable readable identifier minted for a Concept at first publication and retained across graph versions.
_Avoid_: recomputable label-derived ID

**Extraction Run**:
One source processed by one pipeline configuration into run-scoped Candidates, admission decisions, and one Concept Evidence Profile per admitted Concept. It never publishes.
_Avoid_: build, publication, claim extraction

**Graph-Version Build**:
The deterministic assembly and atomic publication of an asserted graph version from an explicit base version plus explicitly selected Extraction Runs, unioning their CEP evidence.
_Avoid_: extraction, enrichment

**Static Graph Refinement**:
The Graph-Version Build activity that conservatively resolves identity and unions CEP evidence across the base version and selected runs without creating inferred graph facts or asserted edges.
_Avoid_: Graph Enrichment, inference

**Concept Canonicalization**:
The domain-scoped process that decides whether Candidates from different sources represent one Concept. Normalized-label exact match is the deterministic baseline; an adjudicated semantic-deduplication decision may also merge near-duplicates (ADR-0012/0015). Embeddings may only *propose* near-duplicate candidates — a separate adjudicator (measured LLM judge or recorded deterministic rule) decides, and every merge is recorded; raw cosine never auto-merges.
_Avoid_: raw-cosine auto-merge, propose-and-decide in one mechanism, embedding-derived prerequisites

**Graph Enrichment**:
The operation that derives learner-neutral graph facts not asserted by a source from one published graph version: it rescues and mints **Enrichment Nodes** beyond the published anchors and takes **K whole-set ordering draws per Declared Domain** over anchors and those nodes, aggregating a per-pair directional vote into `inferred-prerequisite-of` edges — direction-contested pairs route to `uncertain`, committed confidence is the empirical agreement `max(f,r)/K`, the existing weak-edge floor doubles as a presence quorum, and any aggregate cycle routes to `uncertain` (no re-prompt). (Decision: ADR-0019, K-sampled per ADR-0028.)
_Avoid_: graph mutation, Static Graph Refinement, embedding blocking

**Enrichment Run**:
One execution of Graph Enrichment against one published graph version and one enrichment configuration, retaining its per-domain ordering traces (K and the per-pair vote distribution `pairVotes`, cycle-routed edges) and edge dispositions. A replay draws fresh samples and may commit a different edge set (ADR-0028); the persisted artifact is the immutable record, never re-derivation.
_Avoid_: Derived Graph Layer

**Derived Graph Layer**:
The immutable inferred prerequisite DAG generated by one Enrichment Run and stored separately from the asserted graph version. Its only predicate is `inferred-prerequisite-of`. Its nodes are the union of anchor projections and Enrichment Nodes.
_Avoid_: asserted graph mutation, embedding sidecar, asserted edge

**Grounding Origin**:
The provenance axis carried by every graph node: `document_anchored` (an asserted anchor), `source_mentioned` (mentioned in a source but never defined), or `llm_grounded` (a minted node whose grounding is generated). A node's `layer` is an invariant of its grounding origin — only `document_anchored` is `asserted`. (`web_grounded` is reserved.)
_Avoid_: trust score, confidence, separate layer flag

**Enrichment Node**:
A `source_mentioned` (rescued) or `llm_grounded` (minted) node introduced by Graph Enrichment into the Derived Graph Layer. It is always `derived`, never published asserted, and its `role` is `prerequisite` (a minting reason, not an ordering — ordering stays the `inferred-prerequisite-of` edge).
_Avoid_: published concept, asserted node, anchor

**Generated Grounding Bundle**:
The CEP-shaped, source-quoteless grounding a minting operation generates for one `llm_grounded` Enrichment Node: definition and mention-like passages plus the generating model's rationale, conditioned on the anchors it scaffolds. Exempt from the verbatim floor with a recorded `not_applicable_by_grounding` disposition; structured so a later retrieval upgrade replaces passages in place without changing node identity.
_Avoid_: verbatim evidence, source quote, Concept Evidence Profile

**Learner Path**:
A projection of one Derived Graph Layer for one target derived node (`derived_node_id`, anchor or Enrichment Node) and Learner State, ordered by prerequisite structure and difficulty. The recall-loop subject identity is the derived node throughout, never an asserted `concept_id` (ADR-0025).
_Avoid_: course, personalized graph, concept-keyed learner state

**Learner State**:
A learner-specific account of mastery consumed by projection and never stored in the learner-neutral graph.

**Study Item Bank**:
A learner-neutral recall asset generated alongside one Derived Graph Layer. Study items are keyed to `derived_node_id`, so anchors and Enrichment Nodes share one response identity, and form a typed discriminated union keyed on `itemType` (ADR-0025/0026). Each study item declares grounding provenance: `source_cep`, `source_mentioned`, or `generated`.
_Avoid_: Card, Card Bank, recall card, concept-only items, asserted graph mutation

**Grounding Provenance**:
The Study Item Bank citation contract for a study item. Source-grounded study items cite verbatim source evidence; generated study items cite generated grounding bundle passages and are labeled as generated, never as source quotes.
_Avoid_: fake source citation, unlabeled generated quote

**Inspection Read Model**:
A read-only projection of persisted Extraction Run, Source, or Derived Graph Layer state, assembled for Admin Lab inspection and returned finished by a read-model port. The storage adapter owns the queries and the verbatim row-stitching; the UI embeds no SQL. Distinct from a learner-facing **projection**, which fuses reads with adaptation compute behind an application use-case rather than a port.
_Avoid_: raw UI query, JSON_TABLE in the app, learner projection

## Flagged Ambiguities

- "Refinement" is ambiguous. Use **Static Graph Refinement** for asserted graph assembly and CEP-evidence union, and **Graph Enrichment** for inferred prerequisite facts.
- "Prerequisite" belongs to the Derived Graph Layer. An `inferred-prerequisite-of` edge is a derived fact owned only by Graph Enrichment; source prose that implies prerequisites remains CEP mention evidence.
- "Quarantine" means an unresolved identity or meaning conflict that blocks publication. A cross-domain homograph is flagged, not quarantined.

## Example Dialogue

> **Dev:** Discovery found "PageRank." Is it already a Concept?
> **Expert:** No. It is a Candidate until Concept Admission establishes eligibility and selects it into the core set.
>
> **Dev:** The source says "ranking builds on eigenvector centrality." Is that a published prerequisite edge?
> **Expert:** No. That prose is a Mention Passage in PageRank's Concept Evidence Profile. The asserted layer has no edges. A separate Enrichment Run may infer an `inferred-prerequisite-of` edge in a Derived Graph Layer.
>
> **Dev:** Two domains contain a Concept labeled "Mercury." Must publication stop?
> **Expert:** No. Declared Domain keeps their identities separate. Flag the homograph for inspection; quarantine only an unresolved identity or meaning conflict.

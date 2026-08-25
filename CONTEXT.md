# Lrnki Context

Lrnki turns curated learning resources into an authoritative learner-neutral graph, derives
prerequisite structure and study assets, and presents them as playable expeditions.

This file is the project glossary. Architectural behavior belongs in ADRs; exact interfaces and
persisted shapes belong in source.

## Model operations

**Model Assignment**:
The quality-relevant identity of an exact upstream model revision, its mechanically established
quantization, and its non-routing inference behavior.

**Provider Route**:
The hosting-provider selection, ordering, and failover topology through which a Model Assignment is
served; it is operational provenance rather than model-quality identity.

## Curated knowledge

**Curated Source**:
A learning resource intentionally registered for processing in a Declared Domain.
_Avoid_: corpus item, arbitrary document

**Structured Document**:
The normalized, source-located blocks produced from a Curated Source before extraction.
_Avoid_: raw file, prompt text

**Learner-Neutral Core Concept Graph**:
The authoritative published graph of durable Concepts and their source-grounded evidence, independent
of learner goals, mastery, and inferred prerequisites.
_Avoid_: neutral KG, fact graph, knowledge base

**Concept**:
A durable unit of domain knowledge admitted from source evidence and assigned a stable identity.
_Avoid_: node, entity, term, topic

**Candidate**:
A run-scoped possible Concept surfaced from one Curated Source; it is not published knowledge.
_Avoid_: Concept before admission, keyword

**Candidate Discovery**:
The recall-oriented stage that surfaces Candidates from a Structured Document.
_Avoid_: Concept Admission, keyword extraction

**Core Concept Eligibility**:
The evidence-backed judgment that an atomic Candidate is a standalone learning objective with
established meaning and substantive organizing power in its Declared Domain.
_Avoid_: concept importance, prominence, mention frequency

**Atomic Admission Proposal**:
One atomic admission decision derived from a Candidate; a Candidate may yield several proposals.
_Avoid_: conflated label, multi-concept candidate

**Core Set Selection**:
The source-level choice of a small, non-redundant set of eligible proposals that preserves the
source's principal learning structure.
_Avoid_: top-k selection, fixed concept-count target

**Concept Admission**:
The precision-oriented stage that applies Core Concept Eligibility and Core Set Selection to atomic
proposals before evidence-profile extraction.
_Avoid_: filtering, ranking, scoring

**Canonical Concept Label**:
The precise, evidence-preserving, domain-qualified label assigned to an admitted Concept while source
labels remain aliases.
_Avoid_: display-name cleanup, free rewrite

**Concept Evidence Profile (CEP)**:
The published, provenance-preserving source context for one Concept, composed from verified Definition
Passages, selected Mention Passages, and the one permitted Optional Typed Assertion.
_Avoid_: claim, fact, triple, edge

**Definition Passage**:
A verbatim source passage that establishes a Concept's meaning.
_Avoid_: copula whitelist, connective list

**Mention Passage**:
A verbatim source passage that substantively mentions a Concept without turning its prose into an
authoritative relation.
_Avoid_: claim, asserted relation

**Optional Typed Assertion**:
The guarded `defines` evidence inside a CEP; it never becomes an authoritative graph edge.
_Avoid_: relation registry, asserted relation

**Declared Domain**:
The human-assigned identity scope of a Curated Source.
_Avoid_: topic, category, subject area

**Concept IRI**:
The stable readable identifier minted for a Concept at first publication and retained across graph
versions.
_Avoid_: recomputable label-derived ID

**Quarantine**:
An unresolved identity or meaning conflict within one identity scope that blocks publication; a
cross-domain homograph is only flagged for inspection.
_Avoid_: every duplicate label, cross-domain homograph

## Publication and derivation

**Extraction Run**:
One Curated Source processed by one pipeline configuration into run-scoped Candidates, admission
decisions, and CEPs; it never publishes.
_Avoid_: build, publication, claim extraction

**Graph-Version Build**:
The deterministic assembly and atomic publication of an asserted graph version from an explicit base
version, selected Extraction Runs, and the explicitly selected immutable Concept Canonicalization
artifact.
_Avoid_: extraction, enrichment

**Static Graph Refinement**:
The Graph-Version Build activity that applies selected Concept identity decisions and unions CEP
evidence without creating inferred graph facts.
_Avoid_: Graph Enrichment, inference

**Concept Canonicalization**:
The domain-scoped operation that decides whether source Candidates represent one Concept and records
the selected inputs, captured published identities, and outcomes in an immutable artifact.
_Avoid_: raw-cosine auto-merge, prerequisite derivation

**Graph Enrichment**:
The operation that derives learner-neutral nodes, inferred prerequisite edges, and supporting
projections from a published graph version.
_Avoid_: asserted graph mutation, Static Graph Refinement

**Enrichment Run**:
One immutable execution of Graph Enrichment against one published graph version and configuration.
_Avoid_: Derived Graph Layer

**Derived Graph Layer**:
An immutable inferred prerequisite graph produced downstream of asserted knowledge and stored
separately from the published graph.
_Avoid_: asserted graph mutation, asserted edge

**Grounding Origin**:
The provenance category explaining whether grounding is anchored in a document, mentioned by a
source, generated by a model, or grounded through a future retrieval path.
_Avoid_: trust score, confidence score

**Enrichment Node**:
A source-mentioned or model-grounded node introduced by Graph Enrichment and never published as
asserted knowledge.
_Avoid_: published Concept, anchor

**Generated Grounding Bundle**:
Source-quoteless grounding generated for a model-grounded Enrichment Node or an immutable generated
Support Step and labeled as generated.
_Avoid_: verbatim evidence, source quote, CEP

**Source-less Grounding Admission**:
The shared admission discipline for Generated Grounding Bundles before they may support trusted
learner surfaces; an attempt settles as admitted, held out at the knowledge boundary, or rejected.
_Avoid_: Grounding Generation, source verification, confidence gate

**Synthetic Topic Generation**:
The source-less operation that creates an anchor-less Derived Graph Layer for a requested topic in a
Declared Domain.
_Avoid_: asserted synthetic graph, curated-source extraction

**Synthetic Concept**:
A model-grounded primary node created by Synthetic Topic Generation.
_Avoid_: asserted Concept, source-mentioned node

**Knowledge-Boundary Probe**:
The selective-synthesis check that distinguishes concepts suitable for parametric generation from
concepts that must remain outside trusted learner surfaces.
_Avoid_: verbalized confidence, lexical overlap

**Processing Journey**:
A read-only inspection scope joining one Enrichment Run to its contributing extraction,
canonicalization, publication, enrichment, and study-asset operations; it is not an orchestration
identity.
_Avoid_: pipeline run, workflow instance, journey entity

## Learner experience

**Topic Expedition**:
A learner-owned expedition created from a requested topic and backed, when ready, by a Synthetic Topic
Generation layer and its study assets.
_Avoid_: source-grounded expedition, synthetic pipeline

**Source Expedition**:
A learner-owned expedition adopted from a learner-ready source-derived Graph Enrichment layer whose
knowledge and current study assets are backed by registered Curated Sources.
_Avoid_: Topic Expedition, raw enrichment, client-approved source layer

**Learner App**:
The learner-facing application that turns Derived Graph Layers and Learner State into playable study
experiences.
_Avoid_: Admin Lab study screen, neutral asset generator

**Learner State**:
Learner-specific calibration, graded outcomes, and progress kept outside learner-neutral graph and
study assets.
_Avoid_: graph confidence, neutral metadata

**Study Session**:
The learner-stateful projection of one whole Derived Graph Layer into a playable trail of gated
lessons and activities.
_Avoid_: study screen, quiz session, item picker

**Expedition Section**:
A milestone-anchored contiguous part of an expedition trail used to pace progress and scope a Leg
Recall Challenge.
_Avoid_: chapter, persisted section

**Expedition Journal**:
The Learner App's entry projection over available and learner-owned expeditions, their progress, and
generation state.
_Avoid_: route-stitched payload, raw persistence rows

**Study Item Bank**:
A learner-neutral set of typed graded activities generated for the nodes of one Derived Graph Layer.
_Avoid_: Card Bank, asserted graph mutation, self-report prompt

**Answer-Key Verification**:
The key-hidden cross-family judgment that classifies every candidate answer so a deterministic rule
can reject a false or non-unique key in a Study Item or generated Support Step.
_Avoid_: grading, keyed-answer-only check, Source-less Grounding Admission

**Concept Lesson**:
A learner-neutral teaching artifact for one derived node that explains the concept before its Study
Item Bank activities test it.
_Avoid_: course, quiz, personalized hint

**Recall Challenge**:
A durable retrieval challenge over one Expedition Section or whole Topic Expedition whose evidence
and rewards remain separate from acquisition mastery.
_Avoid_: mastery-affecting challenge, correctness timer

## Learner-scoped support

**Learner-Scoped Scaffold**:
Generated support for one learner that restores flow without becoming neutral graph or Study Item
Bank content.
_Avoid_: generated prerequisite, personalized Concept Lesson

**Scaffold Detour**:
A durable optional support branch owned by one learner beneath a parent derived node.
_Avoid_: sub-expedition, second trail

**Support Step**:
One ordered element of a Scaffold Detour, either referencing existing neutral study assets or carrying
generated learner-scoped teaching content.
_Avoid_: cloned Concept, neutral Study Item

**Explorable Term**:
A specialized phrase in learner-facing study text that can open a Scaffold Detour.
_Avoid_: Candidate, extraction keyword

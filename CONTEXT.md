# Lrnki Greenfield Context

Lrnki converts curated learning resources into one authoritative, learner-neutral graph of durable
domain Concepts. Each published Concept carries source-grounded evidence. Prerequisite structure and
learner-specific state remain outside the published asserted graph.

This file owns project language. Architectural behavior belongs in the linked ADRs.

## Language

**Learner-Neutral Core Concept Graph**:
The authoritative published graph of durable **Concepts**, independent of learner goals and mastery.
Its asserted layer has no asserted edges.
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
The evidence-backed judgment that an atomic Candidate is a standalone learning objective with
established meaning in its Declared Domain and substantive organizing power.
_Avoid_: concept importance, prominence, mention frequency

**Atomic Admission Proposal**:
One atomic admission decision derived from a discovered Candidate. A Candidate may yield several
proposals, each with its own source-grounded label and evidence.
_Avoid_: conflated label, multi-concept candidate

**Core Set Selection**:
The source-level choice of a small, non-redundant set of eligible atomic proposals that preserves the
source's principal learning structure.
_Avoid_: top-k selection, fixed concept-count target

**Concept Admission**:
The precision-first stage that applies Core Concept Eligibility and Core Set Selection and classifies
an atomic proposal as `core`, `optional`, `reject`, or `quarantine`.
_Avoid_: filtering, ranking, scoring

**Canonical Concept Label**:
The precise, evidence-preserving, domain-qualified label assigned to an admitted Concept while
retaining source labels as aliases.
_Avoid_: display-name cleanup, free rewrite

**Concept Evidence Profile (CEP)**:
The published source context for one Concept: verified Definition Passages, salience-ordered Mention
Passages, and optional guarded typed evidence. Every element retains source provenance. Its
composition is defined by [ADR-0007](docs/adr/0007-extract-concept-evidence-profiles-in-concept-context.md).
_Avoid_: claim, fact, triple, edge

**Definition Passage**:
A verbatim source passage that establishes a Concept's meaning. It need not use an “X is Y” form.
_Avoid_: copula whitelist, connective list

**Mention Passage**:
A verbatim source passage that substantively mentions a Concept. General relationships stated in
prose remain untyped evidence.
_Avoid_: claim, asserted relation

**Optional Typed Assertion**:
The guarded CEP evidence type `defines`, whose object is a literal definition. It remains evidence
inside a CEP and never becomes an authoritative edge.
_Avoid_: relation registry, asserted relation, edge

**Declared Domain**:
A human-assigned domain attached to a curated source and used to scope Concept identity.
_Avoid_: topic, category, subject area

**Concept IRI**:
The stable readable identifier minted for a Concept at first publication and retained across graph
versions.
_Avoid_: recomputable label-derived ID

**Extraction Run**:
One source processed by one pipeline configuration into run-scoped Candidates, admission decisions,
and CEPs. It never publishes.
_Avoid_: build, publication, claim extraction

**Graph-Version Build**:
The deterministic assembly and atomic publication of an asserted graph version from an explicit base
version and explicitly selected Extraction Runs.
_Avoid_: extraction, enrichment

**Static Graph Refinement**:
The Graph-Version Build activity that resolves Concept identity and unions CEP evidence without
creating inferred graph facts.
_Avoid_: Graph Enrichment, inference

**Concept Canonicalization**:
The domain-scoped process that decides whether source Candidates represent one Concept.
_Avoid_: raw-cosine auto-merge, embedding-derived prerequisites

**Graph Enrichment**:
The operation that derives learner-neutral nodes, prerequisite edges, and supporting projections from
one published graph version. Its ownership and lifecycle are defined by
[ADR-0019](docs/adr/0019-graph-enrichment-derived-layer.md).
_Avoid_: graph mutation, Static Graph Refinement

**Enrichment Run**:
One immutable execution of Graph Enrichment against one published graph version and configuration.
_Avoid_: Derived Graph Layer

**Processing Journey**:
A read-only lineage scope anchored on one Enrichment Run: its direct member Extraction Runs, the
Graph-Version Build, Graph Enrichment, and Study Item Bank generation. It is an inspection scope, not
a durable pipeline identity or orchestration boundary.
_Avoid_: pipeline run, workflow instance, journey entity

**Derived Graph Layer**:
The immutable inferred prerequisite graph generated by an Enrichment Run and stored separately from
the asserted graph version.
_Avoid_: asserted graph mutation, embedding sidecar, asserted edge

**Grounding Origin**:
The provenance category carried by every graph node: `document_anchored`, `source_mentioned`, or
`llm_grounded`; `web_grounded` is reserved.
_Avoid_: trust score, confidence, separate layer flag

**Enrichment Node**:
A `source_mentioned` or `llm_grounded` node introduced by Graph Enrichment. It is always derived and
never published asserted.
_Avoid_: published concept, asserted node, anchor

**Generated Grounding Bundle**:
The CEP-shaped, source-quoteless grounding generated for an `llm_grounded` Enrichment Node.
_Avoid_: verbatim evidence, source quote, Concept Evidence Profile

**Synthetic Topic Generation**:
The second derived-fact-producing operation. From a `topic` plus a Declared Domain it generates a
free-standing, **anchor-less** Derived Graph Layer of `synthetic_primary` nodes, gated per concept
by the Knowledge-Boundary Probe. Its lifecycle and asserted-graph boundaries are owned by
[ADR-0019](docs/adr/0019-graph-enrichment-derived-layer.md).
_Avoid_: synthetic Grounding Origin, asserted synthetic concept, curated-source treatment of generated text

**Synthetic Concept**:
A `synthetic_primary` `llm_grounded` Enrichment Node — a first-class topic concept produced by
Synthetic Topic Generation and grounded by a Generated Grounding Bundle that cites no source. Its
provenance is owned by [ADR-0023](docs/adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md).
_Avoid_: minted prerequisite, `source_mentioned`, published concept

**Knowledge-Boundary Probe**:
The per-concept gate for source-less synthesis that classifies a concept as `core_knowledge`
(synthesize) or `boundary` (an `uncertain` disposition, retained and inspectable but held out of
trusted learner surfaces). Probe mechanism and rationale are owned by
[ADR-0030](docs/adr/0030-confidence-gated-synthesis-with-web-grounding.md).
_Avoid_: verbalized confidence, lexical overlap, new judge

**Learner Path**:
A projection of one Derived Graph Layer for a target `derived_node_id` and Learner State.
_Avoid_: course, personalized graph, concept-keyed learner state

**Study Session**:
A learner-stateful, goal-scoped projection over one Derived Graph Layer that gates each in-scope
derived node into locked / frontier / mastered and carries its study payload. It advances the learner
toward a target `derived_node_id` and is composed behind an application use-case, not the UI. A
node's study surface is an ordered linear segment sequence — its **Concept Lesson** (theory),
then each study item type in canonical order (option-select, then impostor) — each segment
independently answerable and folding into the node's single mastery number.
_Avoid_: study screen, quiz session, item picker

**Learner App**:
The downstream learner-facing application that turns Derived Graph Layers and Learner State into
playable study experiences. Its game UX policy is defined by
[ADR-0032](docs/adr/0032-keep-learner-app-in-flow-through-mastery-aligned-game-ux.md).
_Avoid_: Learner Application, Admin Lab study screen, neutral asset generator

**Flow Channel**:
A learner-specific band of clear, just-hard-enough challenges paced through tension and release.
_Avoid_: static difficulty target, engagement score

**Learner State**:
A learner-specific account of calibration and graded outcomes consumed by projection and never stored
in the learner-neutral graph. Calibration is a mutable per-derived-node verdict set; graded outcomes
come from keyed-selection study responses (option-select and impostor).

**Study Item Bank**:
A learner-neutral study-asset set generated alongside one Derived Graph Layer and keyed to
`derived_node_id`. Item typing and learner-response identity are defined by
[ADR-0026](docs/adr/0026-typed-study-item-bank.md).
_Avoid_: Card, Card Bank, concept-only items, asserted graph mutation, self-report prompt

**Concept Lesson**:
A learner-neutral teaching substrate keyed to `derived_node_id` and generated alongside the Study
Item Bank. It teaches a concept before it is tested; structure and grounding are defined by
[ADR-0031](docs/adr/0031-concept-lesson-teaching-substrate.md). Reading it is non-graded.
_Avoid_: course, study screen, quiz, graded card, asserted graph mutation

**Learner-Scoped Scaffold**:
Learner/session-scoped generated support content that restores a Learner App's Flow Channel without
becoming neutral graph or Study Item Bank content.
_Avoid_: generated prerequisite, personalized Concept Lesson, Study Item Bank item

**Grounding Provenance**:
The citation/provenance language shared by learner-facing study assets. Source-grounded content cites
source evidence; generated content is labeled generated. Its study-asset contracts are owned by
[ADR-0026](docs/adr/0026-typed-study-item-bank.md) and
[ADR-0031](docs/adr/0031-concept-lesson-teaching-substrate.md).
_Avoid_: fake source citation, unlabeled generated quote

**Inspection Read Model**:
A finished read-only projection of persisted state returned by an inspection port. It is distinct
from a learner-facing projection, which combines reads with adaptation compute behind an application
use-case.
_Avoid_: raw UI query, JSON_TABLE in the app, learner projection

## Flagged Ambiguities

- Use **Static Graph Refinement** for asserted graph assembly and **Graph Enrichment** for inferred
  structure.
- “Prerequisite” belongs to the Derived Graph Layer. Source prerequisite prose remains CEP evidence.
- “Quarantine” is an unresolved identity or meaning conflict that blocks publication. A cross-domain
  homograph is flagged, not quarantined.
- A **Processing Journey** groups existing operations for inspection; it does not merge their
  ownership or lifecycle.

## Example Dialogue

> **Dev:** Discovery found “PageRank.” Is it already a Concept?
> **Expert:** No. It is a Candidate until Concept Admission selects it.
>
> **Dev:** The source says ranking builds on eigenvector centrality. Is that a published edge?
> **Expert:** No. It remains CEP evidence. Graph Enrichment may derive a prerequisite edge separately.
>
> **Dev:** Two domains contain a Concept labeled “Mercury.” Must publication stop?
> **Expert:** No. Declared Domain keeps their identities separate; flag the homograph for inspection.
>
> **Dev:** Can the Learner App generate a personalized hint and add it to the Study Item Bank?
> **Expert:** No. That is a Learner-Scoped Scaffold: useful for one learner's Flow Channel, but not
> a neutral study asset.

# Extract Concept Evidence Profiles in admitted-concept context

Status: Accepted (reset 2026-06-15 — replaces asserted-claim extraction)

## Decision

For every admitted atomic Concept, extract one **Concept Evidence Profile (CEP)** in that Concept's
context through a single forced named tool schema. A CEP contains at least one verified
meaning-bearing **definition passage**, up to a configured number of salience-ordered **mention
passages** per source (default six, recorded in the extraction configuration hash), and optional
**typed assertions**. Every CEP element carries the curated source, source block, verbatim quote,
heading path, and locator. There is no broad claim extraction, no relation-recall retry, no
missing-concept proposal, and no claim conflict gate; a relationship the model wants to express that
is not the guarded assertion type survives only as an untyped mention passage.

The only typed assertion is `defines` (object is a literal). It remains **evidence inside the CEP**
and never becomes an authoritative graph edge or numeric prior (ADR-0016). Every passage and
assertion quote must exist verbatim in its cited source block; an admitted Concept left without a
verified definition passage makes the run unsuccessful.

Optional-assertion entailment is decided by a bounded LLM **assertion-entailment judge** using a
forced named tool schema and the independent `kg-independent-judge` model alias, run as a composed
application stage after deterministic verbatim verification. It may only reject a typed assertion;
rejection drops the type label but preserves the underlying verified passage as untyped CEP evidence.
The judge fails closed on transport failure, invalid tool arguments, or spans that do not match the
cited evidence under the same formatting-noise normalization as the deterministic evidence floor.

Quality is verified by representative real-source inspection (rule 14), the retained inline
production judge, and deterministic verbatim-evidence verification — not by a standing oracle harness
(ADR-0013).

## Amendment 2026-06-24 — Definition-Passage quality judge (layer A)

The verbatim floor proves a definition passage *exists in the source*, not that it *conveys meaning*.
Real-use inspection (`tmp/2026-06-18-structure-aware-neighborhood/`, AIRA-dojo Markdown) found
verbatim-grounded definition passages that were hollow: a bare repetition of the concept's name, a
section heading/title, or a citation/bibliographic snippet. The extractor prompt forbids these, but a
prompt instruction is not a gate (rules 16/19) and the defect persisted.

A measured neural **Definition-Passage quality judge** now runs as a composed application stage
**after** the deterministic verbatim floor and **before** the assertion-entailment judge, on the same
independent `kg-independent-judge` family and forced-tool, fail-closed-preserve pattern as the
assertion judge above. It judges, per already-verbatim-verified definition passage of a `core`-tier
Concept, whether the passage **establishes the Concept's meaning** (defining properties,
distinguishing criteria, mechanism, or contrast) versus being hollow. The cited block's `blockType`
and `headingPath` are passed only as **context** for the neural judgment; the application never vetoes
deterministically on block structure (rule 16). The rubric and tool `description` fields are
domain-neutral and name no fixture concept (rule 17).

The judge is **drop-only**: a veto removes the hollow passage entirely (unlike a rejected assertion,
which is preserved as a mention — a hollow passage is low-value as a mention and noise downstream). It
fails closed to **keep**: a veto is honored only when its `judgedSpan` grounds verbatim in the
passage; transport failure, invalid tool arguments, or an ungrounded span all keep the passage with a
recorded `kept_judge_unavailable` disposition, so a transport blip never shrinks the published core.

When a veto removes a `core` Concept's **last** definition passage, the Concept is now ungroundable and
flows through the **existing** demotion (`reconcileUngroundableCores` → demote to optional, not
published, run still succeeds, loud quality issue), carrying the **distinct** boundary reason code
`core_demoted_hollow_definition` — separate from `core_demoted_ungroundable` ("the extractor never
produced a verifiable definition at all"). The two codes split "genuinely never defined" from "defined
only by a hollow passage." A demoted Concept re-enters only via the existing rescue path as a derived
node; it is never republished asserted (ADR-0023). Per-passage dispositions are persisted on the
immutable run artifact JSONB (rule 7), so the demotions are auditable and replayable for rule-14
inspection without a relational migration.

**Boundary to layer B:** this stage **disposes** of Concepts the source does not define here; it does
**not** retrieve a better passage. Whether a hollow-definition Concept is genuinely undefined or merely
has its definition split across a chunk boundary is a separate retrieval/representation question
(research-first per rule 21) that will warrant its own ADR; the distinct reason code is the
measurement input that layer B's gate consumes.

## Context

The previous architecture spent most of its complexity on broad asserted claims, a six-relation
registry, relation-recall retries, and a missing-concept escape hatch that the learner path never
consumed. The reset makes the product path explicit: admission decides the small Concept set, the CEP
preserves what curated sources teach about each Concept, and Graph Enrichment owns all prerequisite
structure. Verbatim grounding stays a provable deterministic guarantee; semantic acceptance of the
sole optional `defines` assertion belongs to a measured neural judge (ADR-0016).

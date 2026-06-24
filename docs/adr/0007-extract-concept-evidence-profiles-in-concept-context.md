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

## Context

The previous architecture spent most of its complexity on broad asserted claims, a six-relation
registry, relation-recall retries, and a missing-concept escape hatch that the learner path never
consumed. The reset makes the product path explicit: admission decides the small Concept set, the CEP
preserves what curated sources teach about each Concept, and Graph Enrichment owns all prerequisite
structure. Verbatim grounding stays a provable deterministic guarantee; semantic acceptance of the
sole optional `defines` assertion belongs to a measured neural judge (ADR-0016).

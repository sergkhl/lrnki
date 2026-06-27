# Extract Concept Evidence Profiles in admitted-Concept context

Status: Accepted

## Decision

For every admitted atomic Concept, extract one **Concept Evidence Profile (CEP)** through the CEP
extraction port and a forced named tool schema. A CEP contains:

- verified meaning-bearing Definition Passages;
- a bounded, salience-ordered set of Mention Passages per source; and
- the optional typed evidence permitted by ADR-0016.

Every passage retains its curated source, source block, verbatim quote, heading path, and locator.
Relationship prose that is not the guarded typed evidence remains an untyped Mention Passage.

The application applies these boundaries in order:

1. Verify every cited quote against its source block.
2. Apply the measured Definition-Passage quality judge to already-verbatim core definitions, and to
   rescued `optional` definitions where Graph Enrichment carries them to learners (see below).
3. Apply the measured assertion-entailment judge to optional typed evidence.
4. Reconcile any core profile left without a verified, meaning-bearing Definition Passage.

Both neural judges use forced tool schemas through explicit ports and fail closed to preserving
recall: transport failure, invalid arguments, or an ungrounded negative judgment does not remove
evidence. Their rubrics are domain-neutral, and deterministic block or lexical heuristics do not
replace their semantic judgments.

A core profile left incomplete by extraction is demoted to `optional` with
`core_demoted_ungroundable`. If the Definition-Passage quality judge removes its last definition, it
is demoted with `core_demoted_hollow_definition`. Either demotion prevents asserted publication,
raises an extraction quality issue, and may still make the source-mentioned Candidate available to
Graph Enrichment's rescue path. The Extraction Run may succeed; incomplete core evidence does not
fail the whole run.

`optional` definitions are exempt from step 2 at extraction time because they are not published and
do not reach learners — judging them there spends tokens for no disposition consequence. When the
rescue seam (ADR-0019, ADR-0023) carries a definition-bearing `optional` Candidate to learners as a
`source_mentioned` study item, that exemption no longer holds, so the same measured
Definition-Passage quality judge runs over the rescued definition passages at the rescue seam before
they become study-item grounding. It stays drop-only, fail-closed to preserving recall, and
domain-neutral; mention passages are never altered. No learner-facing Definition Passage reaches a
study item unjudged.

Judge dispositions are retained in the immutable Extraction Run artifact. This ADR owns evidence
acceptance and disposition; retrieval-window construction is a separate concern.

Quality is established through real-source inspection under ADR-0013, not automated assertions about
neural judgment content.

## Context

The asserted graph needs compact, source-grounded context for each admitted Concept, not a broad
claim graph or asserted relation registry. Verbatim verification provides a deterministic provenance
guarantee, while meaning and entailment remain measured semantic judgments. Demotion preserves the
successful evidence from a source without publishing a Concept whose definition is absent or hollow.

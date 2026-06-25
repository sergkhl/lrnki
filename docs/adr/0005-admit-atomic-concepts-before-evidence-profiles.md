# Establish atomic core-concept eligibility before evidence-profile extraction

Status: Accepted

## Decision

Candidate Discovery is recall-oriented. A separate precision-first **Concept Admission** stage turns
each discovered Candidate into one or more atomic admission proposals with source-grounded labels and
evidence.

An atomic proposal is eligible for `core` only when source evidence supports all of these judgments:

- it is a non-reducible standalone learning objective;
- it has established meaning in the Declared Domain;
- it organizes substantive explanatory material; and
- the source gives it definition-bearing treatment.

Those are semantic judgments expressed through a forced named tool schema. The application validates
their evidence grounding but does not replace them with lexical or section-pattern vetoes.

**Core Set Selection** chooses a small, non-redundant set of eligible proposals representing the
source's principal learning structure. Admission may assign `core`, `optional`, `reject`, or
`quarantine`; only selected `core` proposals proceed to CEP extraction under ADR-0007. There is no
fixed Concept count.

The admission contract also judges source role and Declared-Domain relevance so illustrative
out-of-domain material can be rejected semantically. A separate cross-family, downgrade-only
concept-vs-proposition judge may demote a proposition-shaped `core` label. It never promotes a
non-core proposal and fails closed to preserving the Core Set Selection result when its response is
invalid or ungrounded.

Canonical labels must remain precise, evidence-preserving, and source-grounded. Admission does not
merge Candidates; Concept identity belongs to ADR-0015.

## Context

Discovery alone produced both conflated Candidates and plausible-looking labels that were not durable
Concepts. Atomic proposals and a separate precision gate prevent those errors from being baked into
CEP extraction while keeping discovery free to optimize recall.

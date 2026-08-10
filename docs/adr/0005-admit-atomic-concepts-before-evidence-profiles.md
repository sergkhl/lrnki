# Establish atomic core-concept eligibility before evidence-profile extraction

Status: Accepted

## Decision

Candidate Discovery optimizes for recall. A separate precision-oriented Concept Admission stage
decomposes each Candidate into atomic proposals and judges whether each is a standalone learning
objective with established meaning, substantive organizing power, and definition-bearing treatment
in its Declared Domain.

Core Set Selection chooses a small, non-redundant set that preserves the source's principal learning
structure; there is no fixed Concept count. These are semantic judgments made through
[ADR-0006](0006-use-forced-named-tool-schemas.md); deterministic code verifies grounding and shape
but does not replace them with lexical vetoes.

Only selected core proposals proceed to CEP extraction under
[ADR-0007](0007-extract-concept-evidence-profiles-in-concept-context.md). Admission assigns labels but
does not merge identities, which belongs to
[ADR-0015](0015-deterministic-cross-source-identity.md).

## Context

Discovery alone produced conflated and proposition-shaped Candidates. Separating recall, atomicity,
and precision prevents those errors from becoming published Concepts.

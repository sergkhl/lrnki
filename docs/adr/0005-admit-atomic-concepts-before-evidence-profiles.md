# Establish atomic core-concept eligibility before evidence-profile extraction

Status: Accepted (reset 2026-06-15 — admission feeds CEP extraction, not claim extraction)

## Decision

Use document-level discovery followed by a separate precision-first admission proposal. Admission is a
**one-to-many atomic decision**: one discovered Candidate may yield multiple atomic admission
proposals, each with a stable run-local key, a shared parent-candidate key, and its own
source-grounded label and positive-criterion evidence. The application boundary derives each
proposal's effective tier fail-closed: `core` requires verified source evidence that the atom is a
non-reducible standalone learning objective, has established meaning in its Declared Domain,
organizes at least two distinct substantive explanatory aspects or relationships, **and receives
definition-bearing treatment** — a passage that establishes the concept's meaning, distinct from a
bare mention (2026-06-16 refinement, KTD1). This fourth criterion is the model's judgment, validated
only for verbatim grounding like the other three; it is **not** a lexical copula or "X is Y" matcher
(rule 16), since meaning can be established by description, mechanism, or contrast. A `core` decision
is unreachable without a verified definition-bearing passage, closing the gap where `core` was
selected on mention-like evidence the CEP stage (ADR-0007) then could not turn into a verified
Definition Passage; the verified evidence is carried forward into CEP extraction as conditioning
context without bypassing the CEP port or its independent verbatim verification. A compact
source-level Core Set Selection over the atomic proposals keeps a small, non-redundant set
representing the source's principal durable learning structure. Admission may propose a more precise
evidence-preserving canonical label, applied only when the label itself is source-grounded; it may not
merge Candidates. `optional` remains run-scoped supporting knowledge; only selected eligible `core`
atoms proceed to Concept Evidence Profile extraction (ADR-0007) and publication. There is no fixed
concept-count target.

Admission also carries a neural **source-role and Declared-Domain relevance** judgment in the forced
admission contract, so out-of-domain illustrative material (e.g. algorithm or SQL examples used only
to illustrate an education-technology source) is rejected as `out_of_domain_illustration` rather than
retained as optional. There is **no** heading/text regex for illustrative sections: that was a
heuristic semantic veto prohibited by project rule 16.

Whether an admitted-`core` label names a Concept or asserts a proposition about one is decided by a
bounded LLM **concept-vs-proposition admission judge**, using a forced named tool schema and the
independent `kg-independent-judge` model alias, rather than a hardcoded lexical matcher. The judge
runs as a composed application stage after the deterministic admission-policy boundary and may only
downgrade a Candidate selected as `core`; it never resurrects an `optional`, `reject`, or
`quarantine` Candidate. A `proposition_or_claim` verdict demotes the Candidate to `optional` with
reason `proposition_label_judged` and records the noun phrase to which the label reduces. It demotes
only on a confident verdict whose predication span and underlying noun phrase are source-grounded;
on transport failure, invalid schema, or an ungrounded verdict the Candidate retains the Core Set
Selection decision, so nominal concepts such as "Right to Be Forgotten" stay core.

Admission quality is verified by representative real-source inspection (rule 14), not a standing
oracle reference (ADR-0013).

## Context

Admission is the precision gate and the binding lever for the whole pipeline: Core Set Selection had
both over-demoted established domain Concepts and admitted proposition-shaped pseudo-concepts and
out-of-domain examples, and discovered Candidates sometimes conflated several atomic concepts in one
label. Atomic admission, a neural source-role judgment, and the downgrade-only concept-vs-proposition
judge are the measured precision levers; none uses a hardcoded lexical veto, because
concept-versus-proposition and domain relevance are semantic judgments, not provable surface
properties.

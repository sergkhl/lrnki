# Establish core concept eligibility before extracting claims

Status: Accepted

## Decision

Use document-level discovery followed by a separate precision-first admission proposal. The
application boundary derives the effective tier fail-closed: `core` requires verified source
evidence that the Candidate is a non-reducible standalone learning objective, has established
meaning in its Declared Domain, and organizes at least two distinct substantive explanatory aspects
or relationships. Passing those tests makes a Candidate eligible, not automatically core: a compact
source-level Core Set Selection keeps a small but sufficient non-redundant set representing the source's
principal durable learning structure while retaining enough mechanisms, models, and evidence
concepts to preserve its explanatory structure. Admission may propose a more precise evidence-preserving
canonical label, but the application applies it only when the label itself is source-grounded;
otherwise the discovered label remains canonical. Admission may not merge Candidates. `optional`
remains run-scoped supporting knowledge; only selected eligible `core` Candidates proceed to claim
extraction and publication. There is no fixed concept-count target.

Whether an admitted-`core` label names a Concept or asserts a proposition about one is decided by a
bounded LLM **concept-vs-proposition admission judge**, using a forced named tool schema and the
independent `kg-oracle-judge` model alias, rather than by a hardcoded lexical matcher. The judge runs
as a composed application stage after the deterministic admission-policy boundary and may only
downgrade a Candidate selected as `core`; it never resurrects an `optional`, `reject`, or
`quarantine` Candidate. A `proposition_or_claim` verdict demotes the Candidate to `optional` with
reason `proposition_label_judged` and records the noun phrase to which the label reduces.

The judge preserves recall on uncertainty: it demotes only on a confident verdict whose predication
span and underlying noun phrase are source-grounded under the same formatting-noise normalization
used by the deterministic evidence floor. On transport failure, an invalid schema response, or an
ungrounded verdict, the Candidate retains the Core Set Selection decision. Label source-grounding
remains deterministic because it is a provable substring property.

The judge enters the authoritative core only after measurement against a frozen oracle reference
shows it is precision-first, with no false demotions of true Concepts while recovering known
proposition-shaped labels.

## Context

Admission was the binding recall bottleneck on method and survey papers: Core Set Selection
over-demoted established domain Concepts while admitting a proposition-shaped pseudo-concept. The
selection prompt is the recall lever; the measured judge is the independent precision lever.

The former deterministic `looksLikePropositionLabel` veto used closed copula, finite-verb, and
participle lists. It both missed propositions outside those lists and risked demoting legitimate
Concept names such as "Right to Be Forgotten" or "Bounded Rationality." Concept-versus-proposition
is a semantic judgment, not a provable surface property, so a lexical veto violates the rule that
heuristic symbolic gates must earn their veto.

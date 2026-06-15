# Extract typed claims in admitted-concept context

Status: Accepted

## Decision

Extract typed claims only in the context of admitted Concepts. A Concept needed during claim
extraction but absent from the admitted set is persisted as a Missing-Concept Proposal for
inspection. It does not automatically re-enter admission; any later admission is an explicit
separate operation.

Every published claim must carry a quote that exists verbatim in a cited source block. Deterministic
validation also enforces predicate/link-nature and predicate/direction self-report consistency, plus
the aggregate structural gates `competing_structural_predicates` and
`reciprocal_asymmetric_relation`, which require a global multi-claim view.

Claim entailment is decided by a bounded LLM **claim-entailment judge**, using a forced named tool
schema and the independent `kg-oracle-judge` model alias, rather than by hardcoded lexical pattern
matching. The judge runs as a composed application stage after deterministic validation and may only
downgrade a surviving claim; it can never resurrect a rejected one. Separate methods judge
Concept-to-Concept claims for the typed relation in its stated direction and `defined-as` literals
for definition entailment. Definition judgments classify both subject identity and definition
support because extracted definitions may paraphrase their evidence.

The judge fails closed on transport failure, invalid tool arguments, missing endpoint labels, or
when its subject or entailment spans do not match the cited evidence under the same formatting-noise
normalization as the deterministic evidence floor. Qualified variants and absent or different
definition subjects fail closed.

The judge enters the authoritative core only after measurement against a frozen oracle reference
shows precision-first behavior: it must recover genuine entailments without accepting false or noise
claims.

## Context

The former deterministic vetoes `evidence_does_not_name_both_endpoints`,
`evidence_does_not_lexically_entail_relation`, and
`evidence_does_not_lexically_entail_definition` were surface matchers. They produced false negatives
on ordinary prose including lists, apposition, pronouns, synonym verbs, and paraphrased or reversed
definitions. Their removal leaves deterministic validation responsible only for provable guarantees
and self-report consistency while semantic acceptance belongs to a measured neural judge.

# Extract typed claims in admitted-concept context

Status: Accepted. The lexical-entailment portion of the deterministic claim
validation is superseded by [ADR-0020](./0020-semantic-claim-entailment-judge.md);
the verbatim-evidence floor below remains in force.

## Decision

Every published claim requires deterministic evidence validation. A concept needed during claim extraction but absent from the admitted set is persisted as a Missing-Concept Proposal for inspection. It does not automatically re-enter admission; any later admission is an explicit separate operation.

# Replace the lexical proposition-label veto with a measured admission judge

Status: Accepted

## Decision

Whether an admitted-`core` label NAMES a Concept or ASSERTS a proposition/claim about one is decided by a bounded LLM **concept-vs-proposition admission judge** (forced named tool schema, independent model alias `kg-oracle-judge`), not by a hardcoded lexical matcher. The judge runs as a composed application stage after the deterministic `applyAdmissionPolicy` boundary and may only **downgrade** a candidate the neural Core Set Selection placed `core`; it never resurrects an `optional`, `reject`, or `quarantine` candidate. On a `proposition_or_claim` verdict it demotes the candidate to `optional` (reason `proposition_label_judged`) and records the underlying noun phrase the label reduces to.

The judge fails closed to **preserve recall**: it demotes only on a confident verdict whose predication span and underlying noun phrase are both source-grounded under the same formatting-noise normalization the deterministic evidence floor uses. On transport failure, a schema-invalid response, or an ungrounded verdict, the candidate keeps the selection's `core` decision, so the judge can never demote a concept on text absent from its cited evidence.

The deterministic `looksLikePropositionLabel` veto is removed. Its closed copula / finite-verb / participle-`by` list both **missed** real propositions with no listed verb (for example "Operator Set as Bottleneck to Performance") and would **wrongly demote** legitimate concepts whose surface contains a copula or participle (for example "Right to Be Forgotten", "Survival of the Fittest", "Bounded Rationality"). Concept-vs-proposition is a semantic judgment, not a provable property, so a lexical matcher is the wrong mechanism for it. Label source-grounding stays deterministic in `applyAdmissionPolicy` because it *is* a provable substring property — a rule-16-permitted veto.

The judge enters the authoritative core only after measurement against a frozen agent-authored oracle reference showed it is precision-first: zero false demotions of true concepts (including the surface-trap negatives the old matcher mishandled) while recovering the known propositions.

## Context

Admission was the binding recall bottleneck: on method/survey papers the Core Set Selection prompt over-demoted established domain concepts the source teaches, while a proposition-shaped pseudo-concept was selected `core`, starving the concept-to-concept claim space. This decision pairs a strengthened selection prompt (the recall lever) with the measured judge (the precision lever) on independent axes. It realizes AGENTS rule 16 (a heuristic symbolic gate that produces false negatives is replaced by a measured neural judge, not expanded to chase coverage) while honoring rule 3 (neural modules enter the core only when measured) and rule 6 (forced tool schema, fail-closed argument validation). It supersedes the proposition-label portion of ADR-0005's deterministic boundary; ADR-0005's evidence-grounded eligibility and source-grounded canonical label requirements are unchanged. It mirrors the ADR-0020 claim-entailment judge pattern (downgrade-only, independent alias, fail-closed grounding).

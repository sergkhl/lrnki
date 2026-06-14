# Replace the lexical claim-entailment gate with a measured semantic judge

Status: Accepted

## Decision

Concept-to-concept claim entailment is decided by a bounded LLM **claim-entailment judge** (forced named tool schema, independent model alias `kg-oracle-judge`), not by hardcoded lexical pattern matching. The judge runs as a composed application stage after the deterministic pass and may only **downgrade** a claim that already survived the deterministic guarantees; it can never resurrect a rejected one.

The deterministic layer keeps only provable or self-report-consistency guarantees: the verbatim evidence-quote floor (a quote must exist in a cited source block), the predicate/link-nature and predicate/direction self-report gates, the `defined-as` literal-definition check, and the aggregate structural gates (`competing_structural_predicates`, `reciprocal_asymmetric_relation`) that require a global multi-claim view a per-claim judge cannot see.

The two former surface-matcher vetoes — `evidence_does_not_name_both_endpoints` (contiguous normalized-label substring) and `evidence_does_not_lexically_entail_relation` (an English-phrase, surface-order whitelist) — are removed. Both produced false negatives on ordinary prose (lists, apposition, pronouns, synonym verbs) and discarded genuinely-supported claims, violating the principle that a heuristic symbolic gate must not silently veto otherwise-valid LLM output.

The judge enters the authoritative core only after measurement against a frozen hand-labeled oracle reference shows it is precision-first (recovers genuine entailments without entailing false or noise claims). The judge fails closed: a non-substring `entailingSpan`, a transport failure, or missing endpoint labels yields not-entailed, so it can never promote a claim on text absent from the cited evidence.

## Context

This supersedes the lexical-entailment portion of the deterministic validation in ADR-0007; ADR-0007's requirement that every published claim carry verbatim-verifiable evidence is unchanged — that floor stays deterministic. Realizes AGENTS rule 16 (symbolic gates must earn their veto; replace false-negative heuristic gates with a measured neural judge) while honoring rule 3 (neural modules enter the core only when measured) and rule 6 (forced tool schema, fail-closed argument validation).

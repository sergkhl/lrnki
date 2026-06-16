# Retire the measured label-aligner with the standing oracle harness

Status: Accepted (reset 2026-06-15 — aligner removed after one-time use)

## Context

During Gate 2, admission agreement was scored against a frozen, second-judge-audited reference
(ADR-0013, pre-reset). Exact `normalizeConceptLabel` equality under-counted agreement because a
reference `Monte Carlo Tree Search` and a production `Monte Carlo Tree Search (MCTS)` are the same
concept in different surface forms. A bounded, measured neural **label-aligner**, run off the
publication path, resolved that scoring-only confound by merging production labels into the reference
concept they were surface variants of (production → reference only), always reported beside the
exact-match baseline so a wrong merge stayed visible, and never relabelled, merged, or mutated a
graph.

## Decision

The label-aligner was a one-time scoring aid for the frozen admission benchmark. With the standing
oracle/aligner harness retired in the complexity reset (ADR-0013), the aligner — its model alias,
schemas, scoring code, and frozen alignment artifacts — is **removed**. Quality is now verified by
real-source inspection (rule 14) and the retained inline production judges, so no off-path scoring
identity exists.

Graph identity is and always was unchanged: publication keeps exact, deterministic, domain-scoped
normalized identity (ADR-0015). This record is retained to document why the aligner existed and why it
no longer does.

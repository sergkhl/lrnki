# Score admission agreement by a measured neural label-aligner, not exact-label matching

Status: Accepted

## Context

Gate 2 scores a production Extraction Run against a frozen, second-judge-audited
admission reference (ADR-0013). Agreement was counted by exact `normalizeConceptLabel`
equality — the same deterministic identity key publication uses (ADR-0015). As a
*scorer* that key under-counts agreement: a reference `Monte Carlo Tree Search` and a
production `Monte Carlo Tree Search (MCTS)` are the same concept in different surface
forms, yet exact matching scores each as both a miss and an extra, halving precision and
recall on identity the run actually has. A hardcoded plural/hyphen/acronym matcher is
forbidden (AGENTS rule 16) and would also wrongly merge genuinely distinct concepts that
share surface words (`Operator` vs `Operator set` vs `Operator policy`).

## Decision

Concept identity for Gate 2 **scoring** is decided by a bounded, measured neural
label-aligner, run off the publication path. It only ever merges a production label into
the reference concept it is a surface variant of (production → reference edges only;
reference concepts never merge with each other), and the exact-match baseline is always
reported beside the aligned score so a wrong merge that inflates agreement stays visible.
The frozen alignment is model-authored and carries `needsHumanReview` (rule 11).

Graph identity is unchanged: publication keeps exact normalized identity (ADR-0015). The
aligner never relabels, merges, or mutates a graph; it only lets the benchmark count
agreement a run already has. It is kept only while it raises measured recall without
merging distinct concepts.

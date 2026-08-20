# Gate source-less synthesis with a Knowledge-Boundary Probe

Status: Accepted

## Decision

Before generating learner-facing world knowledge without a Curated Source, a separate cross-family
Knowledge-Boundary Probe decides whether the concept is suitable for parametric synthesis. A boundary
result remains inspectable but outside trusted learner surfaces; it never becomes an invitation to
guess.

Passing the probe is necessary but not sufficient. Generated grounding is checked by an independent
claim-targeted verification sequence: plan atomic questions from the draft, answer them without the
draft, then compare the answers to the original passages. The correction boundary is monotonic and
drop-only—verification may reject grounded problematic passages or the draft, but may not author
replacement learner text. Grounding generation is one-pass: if verification leaves no Definition
Passage, factual rejection ends admission and never re-enters generation. Each consumer retains its
own fail-closed outcome policy for that rejection.

This policy covers model-grounded prerequisite nodes, Synthetic Topic Generation, and generated
Support Steps. Source-cited content uses its source-verification contract instead. Web-grounded
retrieval remains deferred under
[ADR-0023](0023-grounding-origin-model-and-cross-family-generated-node-judge.md); no retrieval content
is admitted until its source, acceptance, provenance, and learner-surface policy are decided.

The mechanism follows established generate-then-verify work—atomic factual evaluation in
[FActScore](https://aclanthology.org/2023.emnlp-main.741/) and draft-blind question answering in
[Chain-of-Verification](https://arxiv.org/abs/2309.11495)—while retaining abstention because an
intrinsic verifier is not a trustworthy replacement author.

## Context

Long-tail source-less synthesis can be confidently wrong, and the generator cannot validate itself.
Selective abstention plus independent claim verification limits that risk without presenting generated
content as source evidence. An intrinsic verifier or self-audit cannot reliably conserve the rejected
draft's predicates while authoring a replacement, so finite one-pass admission trades recall for a
clear safety boundary.

# Gate source-less synthesis with a Knowledge-Boundary Probe

Status: Accepted

## Decision

Before generating learner-facing world knowledge without a Curated Source, a separate cross-family
Knowledge-Boundary Probe decides whether the concept is suitable for parametric synthesis. A boundary
result remains inspectable but outside trusted learner surfaces; it never becomes an invitation to
guess.

Passing the probe is necessary but not sufficient. Generated grounding is checked by an independent
factual verifier before admission. The verifier may reject material or abstain, but it may not author
replacement learner text or make generated text masquerade as source evidence. Source policy owns
the current claim projection, sampling, quorum, attempt budget, passage settlement, retry, and
consumer failure outcome.

A future bounded retry is compatible with this decision only when it generates a fresh, complete
Generated Grounding Bundle and sends that new draft through Source-less Grounding Admission from the
start. A verifier may never patch rejected predicates into a replacement draft.

This policy covers model-grounded prerequisite nodes, Synthetic Topic Generation, and generated
Support Steps. Source-cited content uses its source-verification contract instead. Retrieval-backed
grounding remains deferred under
[ADR-0023](0023-grounding-origin-model-and-cross-family-generated-node-judge.md); no retrieval content
is admitted until its source, acceptance, provenance, and learner-surface policy are decided.

The mechanism follows established generate-then-verify work—atomic factual evaluation in
[FActScore](https://aclanthology.org/2023.emnlp-main.741/) and draft-blind question answering in
[Chain-of-Verification](https://arxiv.org/abs/2309.11495)—while retaining abstention because an
intrinsic verifier is not a trustworthy replacement author.

## Context

Long-tail source-less synthesis can be confidently wrong, and the generator cannot validate itself.
Selective abstention plus independent factual verification limits that risk without presenting
generated content as source evidence. Requiring any new draft to restart admission keeps the
verification boundary inspectable without making a verifier the replacement author.

# Measure non-deterministic quality with non-deterministic methods; do not chase output determinism

Status: Accepted (2026-06-23)

## Decision

Quality that is inherently judgment-based and non-deterministic — concept correctness, prerequisite
direction and existence, edge coherence, concept-deduplication correctness, difficulty ordering,
definition quality — must be measured with **non-deterministic, best-practice methods**: LLM-as-judge
evaluation, self-consistency / judgment-distribution sampling, and calibrated agreement or uncertainty
estimates. It must NOT be validated by a deterministic check that pretends a single right answer
exists, nor by chasing bit-level determinism of model output.

Concretely:

- **Do not chase serving determinism.** Mixture-of-experts inference is non-deterministic by
  architecture (batch-dependent expert routing, non-associative float accumulation across kernels);
  temperature 0 and per-request seeds do not fix it, and on a hosted multi-backend aggregator the
  serving stack cannot be pinned. A flipping result on a genuinely ambiguous input is *signal*, not a
  bug to suppress: it is epistemic uncertainty. The correct response is to **measure** that uncertainty
  — e.g. sample a judge K times and route direction-unstable prerequisite pairs to `uncertain`
  (already excluded from learner paths) — not to freeze one arbitrary draw.

- **Remove deterministic proxies for ambiguous quality.** A deterministic test or gate that stands in
  for a non-deterministic quality judgment (asserting one "correct" edge set, one canonical ordering,
  one expected label) is to be removed, not maintained. Reproducibility of a *published* artifact is
  achieved by storing it immutably with provenance and replaying it (ADR-0017/0019), never by
  re-deriving identical model output.

- **Keep deterministic checks for the deterministic envelope only.** Schema and tool-argument validity
  (rule 6), verbatim-evidence verification, graph algorithms, and policy/fusion transforms stay
  deterministically tested precisely because they may veto neural output (rules 11, 16). A canned model
  response is allowed only as an input fixture exercising that envelope, never as the asserted output.

LLM/measured evaluators built for this purpose remain disposable scaffolding (rule 11 / ADR-0013)
unless they continue to earn standing; no permanent benchmark harness enters the core.

## Context

The enrichment certain-edge "reproducibility" investigation (TODO #6) spent effort trying to make an
MoE prerequisite judge reproducible, then proved by direct measurement that the variance is
intra-backend MoE non-determinism, confined to genuinely-ambiguous pairs, and unfixable with seed or
provider pinning. The lesson generalizes: deterministic parity gates over non-deterministic judgments
create false alarms and waste effort, while the real quality defects (concept fragmentation,
incoherent edge direction) go unmeasured. This ADR redirects measurement energy from
determinism-chasing to calibrated, non-deterministic quality evaluation, consistent with rules 11 and
16 and with current LLM-as-judge best practice (self-consistency, judgment distribution, position-bias
mitigation, intransitivity-aware ordering).

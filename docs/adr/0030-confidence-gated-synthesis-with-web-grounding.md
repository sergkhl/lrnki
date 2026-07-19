# Gate source-less synthesis with a Knowledge-Boundary Probe

Status: Accepted

## Decision

Before a model synthesizes world-knowledge content for a concept it cannot cite to a curated
source, probe whether the concept is core model knowledge. A dedicated small-parameter LiteLLM alias,
separate from the synthesizing model and cross-family from it, runs the probe cheaply. Because the
probe uses forced tool_choice, its alias must route only to providers that honor forced function
calling: providers that reject it (e.g. Google Vertex) are deny-listed, and the alias carries an
ordered fallback to a second small cross-family deployment so a sustained rate-limit on the primary
provider degrades gracefully instead of stalling generation.

- When the probe shows the concept is core knowledge, synthesize from parametric knowledge as today.
- When the probe shows the concept at or beyond the model's knowledge boundary, do not synthesize
  from an unreliable base. Retain an inspectable `boundary` disposition, route it to `uncertain`, and
  exclude it from trusted learner surfaces.

The probe prefers a consistency-based signal — semantic agreement across K sampled draws — over
verbalized self-confidence, because verbalized confidence is weakly calibrated. Agreement is measured
with the existing embedding port (ADR-0012 similarity use), not lexical overlap and not a new judge.
Sampling is at **moderate** temperature, not low: low temperature masks confident hallucination
behind a repeated wrong answer, whereas self-consistency needs sampling diversity to expose a
knowledge boundary as answer dispersion. It reuses the non-deterministic measurement stance of
[ADR-0028](0028-measure-non-deterministic-quality-with-non-deterministic-methods.md). A small-parameter
model is a deliberate choice: factual recall tracks concept popularity, so a small model cheaply
reveals whether a concept is popular/core or long-tail.

Synthetic Topic Generation probes every synthesized concept and routes `core_knowledge` to a
`synthetic_primary` `llm_grounded` node and `boundary` to an `uncertain` disposition. `web_grounded`
remains a reserved Grounding Origin in
[ADR-0023](0023-grounding-origin-model-and-cross-family-generated-node-judge.md); retrieval source
selection, grounding acceptance rules, persistence shape, and learner-surface policy for
`web_grounded` content are unresolved and must be planned before implementation.

For Synthetic Topic Generation, `core_knowledge` is necessary but not sufficient for bundle
admission. The Knowledge-Boundary Probe's K factual answers are sampled before the grounding draft
exists. After Grounding Generation, one deterministic `kg-independent-judge` pass atomizes each
passage's claims and checks them against recurring content in those pre-draft answers plus the
judge's established domain knowledge. The correction boundary is monotonic and drop-only: a false
verdict must copy an exact problematic span from the passage, the adapter may remove that complete
passage, and no verifier-authored learner-facing fact may enter the bundle. An ungrounded veto
preserves the passage; rejecting every definition fails the operation without partial persistence.
Only the surviving original passages enter the Derived Graph Layer, still `llm_grounded`.
Parametric cross-family checking does not create source evidence or `web_grounded` provenance.

Current accepted scope is source-less concept synthesis:

- Generated Grounding Bundles for `llm_grounded` minted Enrichment Nodes
  ([ADR-0019](0019-graph-enrichment-derived-layer.md)) — highest priority, since these are concepts
  the source never teaches.
- Synthetic Topic Generation topic concepts, which have no curated source by construction.
- Generated learner-scoped Support Steps in a Scaffold Detour
  ([ADR-0037](0037-persist-learner-scoped-scaffold-detours.md)). Every non-reference step is a
  source-less child concept, so it is probed before receiving its own Generated Grounding Bundle.
  Verified parent definitions may provide scaffolding context to grounding generation but never
  substitute as evidence for the child.

Out of scope: option-select distractors, which must be plausibly wrong rather than factually grounded;
any section already cited verbatim to source, which is grounded by construction and is never probed;
and source-less Concept Lesson section gating, which is not current policy until the unresolved
retrieval branch is designed.

The probe prompt is domain-neutral and never tuned with expected concepts. Probe quality is validated
by real-source inspection ([ADR-0013](0013-verify-quality-by-real-source-inspection.md)), not
deterministic proxies.

The factuality correction follows established post-generation verification practice. FActScore
shows why whole-passage plausibility is insufficient and evaluates long-form generations as atomic
facts; Chain-of-Verification finds that independently answering verification questions before
revision reduces copying the original hallucination; RARR researches then minimally revises
unsupported content. See [FActScore](https://aclanthology.org/2023.emnlp-main.741/),
[Chain-of-Verification](https://arxiv.org/abs/2309.11495), and
[RARR](https://aclanthology.org/2023.acl-long.910/). The implemented pass adapts that conventional
shape to the existing source-less contract by reusing independently sampled probe answers. A first
real-use attempt allowed the verifier to rewrite the bundle and reproduced the established warning
that intrinsic correction can degrade a correct response: it replaced a correct quantitative claim
with an outdated one. See [Large Language Models Cannot Self-Correct Reasoning
Yet](https://deepmind.google/research/publications/48252/) and
[CRITIC](https://proceedings.iclr.cc/paper_files/paper/2024/hash/fef126561bbf9d4467dbb8d27334b8fe-Abstract-Conference.html).
Therefore the source-less fallback can only abstain by removing an exact-span-grounded problematic
passage, never author a correction. It does not adopt RARR/CRITIC's external-tool branch because
retrieval acceptance, provenance, and learner-surface policy remain deliberately unresolved for
`web_grounded`.

A second real-use attempt established that the Knowledge-Boundary Probe's generic concept
characterizations are not substitutes for Chain-of-Verification's claim-targeted questions. Ten
highly consistent checks repeated the same shallow misconception as the grounding draft, and the
reviewer preserved the false passage. The monotonic boundary remains required, but the active plan
must add question planning followed by a separate answer call that does not receive the draft before
the reviewer may apply an exact-span veto. Model-family separation without claim-targeted context
separation is insufficient quality evidence.

The accepted calibration from the 2026-07-07 measurement pass is K=10, probe temperature 0.7, and
mean-pairwise embedding agreement threshold 0.89. The calibration harness is the `kg-worker`
`calibrate-boundary-probe` command, which runs the production probe adapter and embedding port over a
labeled ladder and writes reports under `tmp/`. Measurement showed the embedding-agreement signal
does not completely reject consistent hallucinations, but the final production-path gate routes the
fabricated `Caldrin-Voss continuity theorem` to `boundary` while a textbook Photosynthesis control
keeps all synthesized concepts `core_knowledge`.

## Context

Synthesizing long-tail concepts from parametric knowledge invites confident hallucination — the
established failure mode of open-ended generation past a model's knowledge boundary. The recognized
mitigation is selective, adaptive retrieval: retrieve only when the model is uncertain, rather than
always retrieving (cost, latency) or never retrieving (hallucination). Knowledge-boundary detection
through a cheap popularity-correlated probe is the conventional signal for that branch. The
grounding-origin model already reserved `web_grounded` for this path, but reservation is not an
implementation contract. Until retrieval is designed, the safe current behavior is to hold boundary
concepts out of trusted learner surfaces.

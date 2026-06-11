# Lrnki Greenfield Context

Lrnki converts curated learning resources into one authoritative, learner-neutral graph of durable domain concepts and evidence-backed claims. Everything learner-specific is a deferred downstream consumer of that graph.

## Language

**Learner-Neutral Core Concept Graph**:
The single authoritative static graph of durable concepts and typed, evidence-backed claims. "Learner-neutral" means independent of learner goals and mastery state — it does **not** mean storing every extractable fact; admission is precision-first.
_Avoid_: neutral KG, fact graph, knowledge base

**Concept**:
A durable unit of domain knowledge that is independently meaningful, independently teachable, reusable beyond a single source, and supported by traceable evidence.
_Avoid_: node, entity, term, topic

**Claim**:
A typed, evidence-backed assertion from an admitted concept to another concept or a literal. Claims are extracted only in the context of an admitted subject concept and never redefine concept importance.
_Avoid_: fact, triple, edge (when meaning the assertion itself)

**Candidate**:
A possibly-important concept surfaced by discovery from one document. A Candidate is a run-scoped artifact, never a graph node, until admission promotes it.
_Avoid_: concept (before admission), keyword, extraction

**Candidate Discovery**:
The recall-oriented stage that produces Candidates from a structured document. Deliberately permissive — its instruction is "don't miss anything plausibly important." Always a separate stage from Concept Admission.
_Avoid_: concept extraction, keyword extraction

**Concept Admission**:
The precision-first stage that classifies each Candidate as `core`, `optional`, `reject`, or `quarantine`. This is the gate that fixes the previous system's noise failure; only `core` decisions create Concepts.
_Avoid_: filtering, ranking, scoring

**Relation Registry**:
The closed set of claim relation types exposed to the model as a tool-schema enum: `is-a`, `part-of`, `asserted-prerequisite-of`, `contrasts-with`, `uses`, `defined-as`. Models choose from it; only humans extend it (ADR-0016).
_Avoid_: open relation vocabulary, `related-to`

**Asserted vs inferred relations**:
`asserted-*` relations record what a source explicitly stated, with verbatim evidence. `inferred-*` relations (future, e.g. `inferred-prerequisite-of`) are derived by refinement or projection layers and must never share a name with asserted ones.

**Declared Domain**:
A human-assigned domain tag (e.g., "molecular biology") attached to every curated source at registration. The deterministic signal for cross-source identity: same normalized label + same Declared Domain → merge candidates; same label across different Declared Domains → automatic homograph quarantine.
_Avoid_: topic, category, subject area

**Concept IRI**:
A readable slug identifier minted once at a Concept's first publication and never re-derived. Label changes after minting do not change the IRI; slug collisions get a numeric suffix.
_Avoid_: label-derived ID, slug (as if recomputable)

**Extraction Run**:
One registered source processed by one pipeline configuration: discovery, admission, claim extraction, evidence validation. LLM-heavy, run-scoped, never publishes. Re-running one source never touches another's runs.
_Avoid_: pipeline run (ambiguous), build

**Graph-Version Build**:
The deterministic, LLM-free assembly of a publishable graph version from selected Extraction Runs: refinement, IRI minting, quality gates, atomic publication with recorded run memberships. A pure function of (runs + rules) — replayable without model calls.
_Avoid_: extraction (this stage never extracts), rebuild-with-recrawl

**Missing-Concept Proposal**:
A claim extractor's escape hatch: a concept it needed that admission didn't promote, recorded with evidence as a run artifact for inspection. In MVP, proposals are inspected in Admin Lab only — there is no automated re-admission loop until real proposals prove worth re-admitting.
_Avoid_: auto-admission, feedback loop (as if built)

**Static Graph Refinement**:
The conservative post-extraction stage that reorganizes and scores what sources already said — alias normalization, homograph quarantine, duplicate-claim collapse, contradiction recording. In MVP it never adds edges that lack source evidence. Only elements transferable to a future inference-capable stage are built; non-transferable refinement is skipped entirely.
_Avoid_: neuro-symbolic refinement (as a module name), graph enrichment

**Neuro-symbolic pattern**:
A descriptive term for the system-wide split where a neural model proposes (candidates, admissions, claims) and deterministic symbolic machinery validates and constrains (evidence checks, schema validation, relation constraints, fail-closed gates). It names a pattern, not a module; symbolic *inference* that derives new edges is a deferred measured experiment.

**Gate 1**:
The first real-use quality run: three native-format fixtures across three Declared Domains, flowing end-to-end into one published graph version. Judged by the implementation agent applying the real-use-quality-evaluation skill; the agent recommends PASS / FIX_FIRST decisions with evidence, and the human makes the final gate call.
_Avoid_: smoke test, demo run

**Gate 2**:
The frozen mixed-format oracle suite of ADR-0013: ≥5 fixtures including Docling formats (PDF, DOCX, PPTX), independent oracle and judge models, benchmark arms, and quantitative metrics. Opens only after Gate 1 passes.
_Avoid_: "the benchmark" (before it is frozen)

**North-star chain**:
The long-term vision `Core Concept Graph → Graph Refinement → Learner Model (IRT/KT) → Projection Engine → Personalized Course Graph`. Only the first stage (through atomic publication, with minimal refinement) is in build scope; later stages shape interfaces but are not built (ADR-0014).
_Avoid_: roadmap stages described as current scope

## Flagged ambiguities

- "Refinement" alone is ambiguous between the conservative MVP stage and aspirational symbolic inference. Use **Static Graph Refinement** for the MVP stage; call the aspirational capability **inference experiments**.

## Example dialogue

> **Dev:** The model found "PageRank" mentioned in the references section — should I add it to the graph?
> **Expert:** It's a candidate, not a Concept. If admission classifies it as bibliographic, it's rejected. A Concept must be teachable from this source's evidence, not just name-dropped.
> **Dev:** And if a claim extractor says "PageRank is-a graph algorithm" with no quote?
> **Expert:** Then it never becomes a Claim. No verbatim evidence, no claim — that's the symbolic half of the neuro-symbolic pattern doing its job.
> **Dev:** Can refinement link "PageRank" to "eigenvector centrality" because they're obviously related?
> **Expert:** Not in MVP. Static Graph Refinement only reorganizes what sources said. Deriving new edges is an inference experiment, later, measured.

# Lrnki Greenfield Context

Lrnki converts curated learning resources into one authoritative, learner-neutral graph of durable domain concepts and evidence-backed claims. Everything learner-specific is a deferred downstream consumer of that graph.

## Language

**Learner-Neutral Core Concept Graph**:
The single authoritative static graph of durable concepts and typed, evidence-backed claims. "Learner-neutral" means independent of learner goals and mastery state — it does **not** mean storing every extractable fact; admission is precision-first.
_Avoid_: neutral KG, fact graph, knowledge base

**Concept**:
A durable unit of domain knowledge that passes Core Concept Eligibility and is supported by traceable evidence.
_Avoid_: node, entity, term, topic

**Core Concept Eligibility**:
The mandatory, run-scoped admission test with three independent, evidence-cited judgments: the Candidate can serve as a standalone learning objective that is not reducible to a role, component, or vocabulary item within a broader concept; it has an established meaning in its Declared Domain; and the source demonstrates its organizing power through at least two distinct substantive explanatory aspects or relationships. Organizing power is judged from source evidence during admission, never inferred from later claim degree. Each passing judgment must cite source evidence; one authoritative source can establish eligibility, while cross-source recurrence may strengthen trust later but is not required. There are no evidence exceptions for concise sources or apparently foundational concepts: a Candidate remains `optional` in that run until a source demonstrates all three judgments. Eligibility is semantic rather than grammatical: a mechanism or operation may be `core` when all three judgments pass, while a narrow supporting operation remains `optional`.
_Avoid_: concept importance, interestingness, prominence, mention frequency

**Claim**:
A typed, evidence-backed assertion from an admitted concept to another concept or a literal. Claims are extracted only in the context of an admitted subject concept and never redefine Core Concept Eligibility.
_Avoid_: fact, triple, edge (when meaning the assertion itself)

**Candidate**:
A possibly-important concept surfaced by discovery from one document. A Candidate is a run-scoped artifact, never a graph node, until admission promotes it.
_Avoid_: concept (before admission), keyword, extraction

**Candidate Discovery**:
The recall-oriented stage that produces Candidates from a structured document. Deliberately permissive — its instruction is "don't miss anything plausibly important." Always a separate stage from Concept Admission.
_Avoid_: concept extraction, keyword extraction

**Concept Admission**:
The precision-first stage that records the three Core Concept Eligibility judgments, may propose a precise Canonical Concept Label, and applies Core Set Selection before classifying each Candidate as `core`, `optional`, `reject`, or `quarantine`. It judges and relabels each Candidate independently and never merges Candidates; merging belongs to deterministic Static Graph Refinement using explicit identity evidence. Admission fails closed: only eligible Candidates selected into the source-level core set may be `core` and create Concepts. `optional` is real, evidence-supported domain knowledge useful for explaining a core Concept but not independently eligible or not selected; it remains a run-scoped inspection artifact rather than a published graph layer. `reject` is not a valid durable domain-knowledge Candidate, such as a heading, example, malformed composite, or source-local detail.
_Avoid_: filtering, ranking, scoring

**Core Set Selection**:
The source-level admission judgment that chooses a small but explanatorily sufficient, non-redundant set of eligible Candidates representing the source's principal durable learning structure. Passing Core Concept Eligibility is necessary but not sufficient; broader concepts may coexist with key mechanisms, models, or evidence concepts when they answer distinct learner questions. Narrow facets, incidental supporting mechanisms, illustrative examples, pseudo-concepts, and genuinely duplicated Candidates remain `optional`.
_Avoid_: top-k selection, concept-count target, importance ranking

**Canonical Concept Label**:
The precise, domain-qualified name proposed during Concept Admission for an eligible Candidate, such as "Rust move semantics" rather than "Move." It must preserve the meaning supported by the Candidate's evidence; the discovered surface label remains an alias, and admission must not broaden, combine, or invent a different concept. Graph-Version Builds reconcile differing proposals only when normalized labels or recorded aliases deterministically establish equivalence; otherwise the identity conflict is quarantined rather than resolved by another model call.
_Avoid_: display-name cleanup, free rewrite, label expansion

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
The deterministic, LLM-free assembly of a publishable graph version from selected Extraction Runs: refinement, IRI minting, quality gates, atomic publication with recorded run memberships. When selected runs identify the same Candidate in the same Declared Domain, one evidence-supported `core` decision establishes eligibility even if other runs classify it as `optional` or `reject`; those decisions do not veto the establishing evidence. A `quarantine` decision blocks publication until its identity or meaning conflict is resolved. All run decisions remain auditable, and publication retains the establishing source's criterion evidence. A pure function of (runs + rules) — replayable without model calls.
_Avoid_: extraction (this stage never extracts), rebuild-with-recrawl

**Graph Enrichment**:
The third decoupled orchestration operation, alongside Extraction Run and Graph-Version Build. It takes one published graph version plus an enrichment configuration and produces a Derived Graph Layer keyed to that version: graph-global structure that no single source asserted — currently the `inferred-prerequisite-of` DAG and baseline node difficulty — proposed by bounded LLM judgment and constrained by deterministic symbolic machinery (cycle checks, transitive reduction, contradiction detection). It never mutates the authoritative asserted graph and never reuses an asserted relation name. Replayable as (published version + enrichment config + captured judgments), mirroring the Graph-Version Build's replay guarantee one layer up.
_Avoid_: enrichment as graph mutation, inference folded into the build, neuro-symbolic refinement (as a module name)

**Derived Graph Layer**:
The immutable output of Graph Enrichment: inferred edges and node scores attached to — but stored separately from — a published asserted graph version. Downstream stages (projection, learner path) read it as graph structure, while the asserted core remains provenance-pure and independently queryable. Distinct from an embedding sidecar (ADR-0012), which is inspection-only and never traversed as graph structure.
_Avoid_: mixing inferred edges into the asserted version, sidecar (when the layer is traversable)

**Missing-Concept Proposal**:
A claim extractor's escape hatch: a concept it needed that admission didn't promote, recorded with evidence as a run artifact for inspection. In MVP, proposals are inspected in Admin Lab only — there is no automated re-admission loop until real proposals prove worth re-admitting.
_Avoid_: auto-admission, feedback loop (as if built)

**Static Graph Refinement**:
The conservative post-extraction stage that reorganizes and scores what sources already said — alias normalization, homograph quarantine, duplicate-claim collapse, contradiction recording. In MVP it never adds edges that lack source evidence. Only elements transferable to a future inference-capable stage are built; non-transferable refinement is skipped entirely.
_Avoid_: neuro-symbolic refinement (as a module name); do not conflate with **Graph Enrichment**, the separate LLM-heavy third operation (ADR-0019) — Static Graph Refinement is the LLM-free reorganization *inside* the build

**Concept Canonicalization**:
The cascading matcher that decides cross-source concept identity (ADR-0012, ADR-0015). Tier 1 deterministic normalized-label match within a Declared Domain is the only auto-merge authority; tier 2 contextual embeddings (over definition and evidence, never bare labels) propose and cluster merge candidates for recall only; tier 3 LLM verification with reversible aliases disposes them. No embedding ever merges on its own; embedding-proposed merges stay `EXPERIMENT_ONLY` until measured.
_Avoid_: embedding merge, neural dedup, similarity-threshold merge

**Neuro-symbolic pattern**:
A descriptive term for the system-wide split where a neural model proposes (candidates, admissions, claims) and deterministic symbolic machinery validates and constrains (evidence checks, schema validation, relation constraints, fail-closed gates). It names a pattern, not a module; symbolic *inference* that derives new edges is a deferred measured experiment.

**Gate 1**:
The first real-use quality run: three native-format fixtures across three Declared Domains, flowing end-to-end into one published graph version. Judged by the implementation agent applying the real-use-quality-evaluation skill; the agent recommends PASS / FIX_FIRST decisions with evidence, and the human makes the final gate call.
_Avoid_: smoke test, demo run

**Gate 2**:
The frozen mixed-format oracle suite of ADR-0013: ≥5 fixtures including Docling formats (PDF, DOCX, PPTX), independent oracle and judge models, benchmark arms, and quantitative metrics. Opens only after Gate 1 passes.
_Avoid_: "the benchmark" (before it is frozen)

**Learner Path**:
The vertical slice's projection output: for one target Concept and a LearnerState, the difficulty-ordered chain of prerequisite Concepts — drawn from the Derived Graph Layer's `inferred-prerequisite-of` DAG — needed to reach the target, with Concepts the LearnerState reports as mastered pruned out. The LearnerState is a real port whose only MVP implementation is a mock ("knows nothing"); real IRT/KT later replaces the implementation without changing the port. Computed by a CLI operation and rendered read-only (Cytoscape) in Admin Lab — never computed in the UI.
_Avoid_: course (when meaning one learner's path), personalized graph (reserved for the post-MVP stage)

**North-star chain**:
The long-term vision `Core Concept Graph → Graph Refinement → Learner Model (IRT/KT) → Projection Engine → Personalized Course Graph`. Build scope is a thin end-to-end vertical slice: real extraction and atomic publication, a real but small Graph Enrichment layer (`inferred-prerequisite-of` DAG), and a *mocked* difficulty heuristic and *mocked* learner-state projection that emit a minimal learner path. The mocks exist to exercise the whole chain before any stage is deepened; real learner modeling (IRT/KT) and real difficulty calibration (Bradley-Terry) remain deferred (ADR-0014) and replace mocks stage by stage.
_Avoid_: roadmap stages described as current scope

## Flagged ambiguities

- "Refinement" alone is ambiguous between the conservative MVP stage and aspirational symbolic inference. Use **Static Graph Refinement** for the MVP stage; call the aspirational capability **inference experiments**.
- "Concept importance" is ambiguous between prominence in a source and usefulness as a durable learning unit. Use **Core Concept Eligibility** for the admission decision; source prominence alone never makes a Candidate `core`.

## Example dialogue

> **Dev:** The model found "PageRank" mentioned in the references section — should I add it to the graph?
> **Expert:** It's a candidate, not a Concept. If admission classifies it as bibliographic, it's rejected. A Concept must be teachable from this source's evidence, not just name-dropped.
> **Dev:** The source repeatedly uses an operation named "clone." Is repetition enough to make it a Concept?
> **Expert:** No. It remains optional supporting vocabulary unless it can serve as a standalone learning objective with an established domain meaning and substantive relationships of its own.
> **Dev:** What if "Move" is eligible but too vague as a published label?
> **Expert:** Admission may propose "Rust move semantics" while retaining "Move" as an alias, but only when the source evidence supports that exact meaning.
> **Dev:** And if a claim extractor says "PageRank is-a graph algorithm" with no quote?
> **Expert:** Then it never becomes a Claim. No verbatim evidence, no claim — that's the symbolic half of the neuro-symbolic pattern doing its job.
> **Dev:** Can refinement link "PageRank" to "eigenvector centrality" because they're obviously related?
> **Expert:** Not in MVP. Static Graph Refinement only reorganizes what sources said. Deriving new edges is an inference experiment, later, measured.

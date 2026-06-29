# TODO

## TODO

1. **Address broad, evidence-thin intrinsic-difficulty distortion.** Real full-manifest inspection
   found plausible ordering overall but over-weighted some broad or relation-like labels with sparse
   evidence.
   - Prefer a measured neural judge over fixture-specific prompt tuning or deterministic proxies.
   - Keep population calibration deferred until stable real learner-response data exists
     ([ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md)).

2. **Improve operator observability.**
   - Preserve forced-tool fail-closed behavior while making exhausted retries and safely redacted
     malformed argument snippets inspectable.
   - Distinguish byte-exact from formatting-normalized study-item citation matches in Admin Lab.
   Decisions: [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md),
   [ADR-0011](../adr/0011-retain-minimal-admin-lab.md), and
   [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md).

3. **Harden Response Log attempt sequencing.** Concurrent same-learner answer submissions still
   compute `attempt_seq` with `MAX(attempt_seq) + 1` before append, so cross-tab or multi-client
   submissions can race the unique `(learner_state_ref, attempt_seq)` constraint. Prefer an atomic
   per-learner sequence assignment in the persistence boundary rather than UI-only prevention.
   Decision: [ADR-0026](../adr/0026-typed-study-item-bank.md).

4. **Align the calibration shell to the study use-case shape (optional fast-follow).** The
   learner-facing reads now follow the ADR-0027 split (see COMPLETED), but
   `composeCalibrationSession` / `calibrationSession.ts` still use the older pure-compose +
   shell-wiring shape. Bring it onto the same injected-ports use-case shape as `getStudySession` so
   both learner projections share one boundary before the Learner Application is built — worth doing
   once that app's calibration needs are concrete. Behavior-preserving; no new ADR.
   Decision: [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md).

## COMPLETED

- **Forced-tool schemas single-sourced from zod.** The hand-written JSON Schema bodies in
  `toolSchemas.ts` were deleted: each forced-tool schema is now generated from its zod validator
  through the `toForcedToolSchema` provider-dialect seam, and `blockEvidence` is one reused zod object.
  Runtime-bounded admission/core-selection/prerequisite-ordering tools derive schema and validator
  from the same bounded source, closing the candidate-key enum asymmetry. Permanent registry tests
  enforce strict object shape and domain-neutral schema descriptions for every current tool.
  Decision: [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md).

- **Learner-facing reads on the ADR-0027 read-model split.** The study projection, Learner Path
  reads, and Learner Loop reads moved off raw SQL and out-of-place adaptation compute in the Admin
  Lab onto the read-model-port split. Learner projections are now `application` use-cases that read
  through injected ports and add compute over a pure core: `getStudySession` over
  `composeStudySession`, and the learner-loop use-cases (`getLearnerLoopDetail` / `listLearnerStates`
  / `getLearnerAdaptedGraphs`) over the relocated conflict/mastery/summary folds. The pure persisted
  reads are inspection read ports whose Postgres adapters own every query and row-stitch
  (`LearnerPathInspectionReadPort`, `LearnerLoopReadPort`). The re-inlined frontier ranking is gone:
  one exported `rankFrontier` plus a goal-scoped selector serve both the projected path and the
  adapted-graph overlay (AGENTS rule 18). The Admin Lab study/paths/learner-loop modules collapsed to
  thin shells that inject adapters; no learner-surface UI module embeds SQL or adaptation compute, and
  no learner projection imports a graph or Derived-Graph-Layer write port. One boundary now serves the
  Admin Lab and the forthcoming Learner Application. `Study Session` is defined in CONTEXT.md.
  Decision: [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md).

- **Published-Concept semantic identity resolution.** A standalone propose-decide operation runs
  before the deterministic Graph-Version Build: embeddings propose within-domain near-duplicate
  published Concepts by cosine, a cross-family adjudicator decides each pair, and union-find clusters
  are classified by their already-published count into recorded `merge` / `distinct` / `quarantine`
  decisions. The build consumes only those decisions and makes no model call — case A/C merges
  canonicalize automatically (the survivor keeps or mints one IRI and absorbs the other surface label
  as an alias while its CEP evidence unions on), and a two-already-published collision is quarantined,
  refusing the build rather than retiring a minted IRI. Decisions persist into `refinement_decisions`
  and surface in a minimal Admin Lab table; `BUILD_DISABLE_IDENTITY_RESOLUTION` reproduces the
  exact-label baseline. Decisions: [ADR-0015](../adr/0015-deterministic-cross-source-identity.md),
  [ADR-0012](../adr/0012-embeddings-permitted-except-prerequisite-derivation.md), and
  [ADR-0017](../adr/0017-split-extraction-runs-from-graph-version-builds.md).

- **CEP definition-passage mis-pick, learner-facing close-out.** Measure-first resolution of the
  definition mis-pick follow-up. A disposable self-consistency instrument over the population that
  actually reaches learners — surviving `core` CEP definitions plus rescued `source_mentioned`
  definition passages — measured a 7% definitional false-negative rate (4/57), dominated by
  in-window mis-picks (3 recoverable in-window, 1 non-adjacent window-miss, 0 genuine-absence). The
  shipped rescue-seam coverage judge (`applyRescuedDefinitionQualityJudge`) already neutralizes the
  learner-facing harm: every hollow rescued definition is dropped and the concept falls back to a
  safe, grounded mention-only state, fail-closed = preserve. Bounded re-pick-on-veto was evaluated
  and **deferred** as an upside-only recall lever: its faithful locus is extraction-time over the
  full optional population (the declined in-window block is absent from the rescue seam's data), too
  heavy for the 3-concept recovery, and the stronger-extractor branch is not triggered (zero
  genuine-absence keeps DeepSeek V4 Flash the default per rule 5). The deferred section-scoped
  retrieval lever is retired: the single window-miss has non-adjacent defining blocks, so even
  parent-child retrieval would not recover it. Decision:
  [ADR-0007](../adr/0007-extract-concept-evidence-profiles-in-concept-context.md).

- **Source-grounded asserted graph baseline.** Curated mixed-format sources normalize into structured
  blocks; atomic Concept Admission produces a small core; CEPs preserve verified definitions and
  mentions; explicitly selected Extraction Runs build immutable graph versions with zero asserted
  edges. Decisions: [ADR-0004](../adr/0004-normalize-curated-sources.md),
  [ADR-0005](../adr/0005-admit-atomic-concepts-before-evidence-profiles.md),
  [ADR-0007](../adr/0007-extract-concept-evidence-profiles-in-concept-context.md), and
  [ADR-0017](../adr/0017-split-extraction-runs-from-graph-version-builds.md).

- **CEP precision and evidence policy.** The relation registry and redundant prerequisite hint were
  removed; `defines` remains the sole typed CEP evidence. A cross-family Definition-Passage quality
  judge now drops hollow definitions and demotes last-definition losses under
  `core_demoted_hollow_definition`, preserving the rescue path. Real AIRA-dojo inspection passed with
  caveats: a structurally equivalent hollow case was caught, while the original heading/citation
  examples did not recur in that stochastic run. Decision:
  [ADR-0007](../adr/0007-extract-concept-evidence-profiles-in-concept-context.md).

- **Derived graph enrichment.** Graph Enrichment rescues and mints derived nodes, adjudicates
  embedding-proposed near-duplicates separately, applies durability judges, derives prerequisite
  structure from K-sampled whole-domain ordering, and records grounding origin structurally.
  Direction-contested, weak, and cyclic aggregates remain inspectable uncertainty; intrinsic
  difficulty remains `EXPERIMENT_ONLY`. Decisions:
  [ADR-0012](../adr/0012-embeddings-permitted-except-prerequisite-derivation.md),
  [ADR-0019](../adr/0019-graph-enrichment-derived-layer.md),
  [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md),
  [ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md), and
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md).

- **Rescue-seam derived grounding (reuse over re-mint).** The publication→enrichment seam no longer
  discards source-grounded `optional` evidence: definition-bearing `optional` candidates are rescued
  into the Derived Graph Layer as `source_mentioned` Enrichment Nodes carrying their verbatim
  definition and mention passages (the inverted "no definition" rescue predicate was flipped,
  `reject`-tier stays mention-only), the verbatim floor hard-gates rescued definitions, study items
  inherit `source_mentioned` provenance, and the Study surfaces expose `studyItemCount` and guard
  empty sessions. Minting now falls to a genuine source-absent residue instead of re-extracting
  optional CEPs at the lowest trust tier. Decisions:
  [ADR-0019](../adr/0019-graph-enrichment-derived-layer.md) and
  [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md).

- **Learner study loop.** Typed study items cover anchors and Enrichment Nodes through
  `derived_node_id`; option-select study is auto-graded; calibration uses mutable binary verdicts;
  graded responses remain append-only; goal-first projection and restoration handling operate over
  the Derived Graph Layer. Admin Lab exposes the study and adapted-graph workflows without mutating
  published graph state. Decisions:
  [ADR-0026](../adr/0026-typed-study-item-bank.md) and
  [ADR-0011](../adr/0011-retain-minimal-admin-lab.md).

- **Calibration pre-study flow.** Calibration is now an optional, separate pre-study projection over
  a goal's trusted prerequisite cone: rows are ordered hardest-first, show neutral grounded
  descriptors rather than questions or answers, and known marks prune implied-known ancestors from
  the list. Study no longer renders reveal/self-assessment cards; learners can skip a study item as
  known without seeing an answer. The study graph now keeps Neutral as the full Derived Graph Layer
  and applies known-closure hiding only as the Adapted render projection. The Study Item Bank is
  option-select only; the retired free-form grading/simulation and `self_assessment` paths were
  deleted. Decisions:
  [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md), and
  [ADR-0011](../adr/0011-retain-minimal-admin-lab.md).

- **Inspection architecture and operator tooling.** Source and run inspection use finished read-model
  ports; learner projections are application use-cases; Admin Lab graph views use Cytoscape; the demo
  seed produces one coherent mixed-domain state. Decision:
  [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md).

- **Extraction provider latency fix.** Routing production extraction aliases to DeepSeek first-party
  resolved the >10-minute extraction latency and removed the dedicated OpenRouter-key blocker.

- **Durable operation observability and cost measurement.** Extraction, graph-version build,
  enrichment, and study-item operations now write shared incremental stage timelines with
  heartbeats. LLM requests carry request-scoped operation tags, the shared report joins
  operation-stage calls/tokens/cost with timeline wall-clock for one operation or Processing Journey,
  and ranked targets expose the highest cost and time levers. Decision:
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md).

- **Operation Timeline stage ownership catalog.** Operation-stage ownership, LLM/non-LLM/unknown
  classification, and the LiteLLM spend-stage list now live behind one application-facing catalog.
  Bottleneck reports use that catalog for operation-scoped spend joins, unknown timeline stages stay
  visible as timeline-only rows, and Admin Lab renders the report-provided stage kind. Decision:
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md).

- **Whole-set ordering label fidelity (grounded-generation hardening).** The ordering edge contract
  switched from free-text canonical-label echo to a 1-based ordinal index — a closed-set menu pick
  over the `Concept 1..N` the prompt already shows. Per-call schema + validator are built from the
  node count so the index bound `[1, N]` is enforced under strict decoding; a transient out-of-range
  draw re-prompts once then fails closed, and the application resolves `number → derivedNodeId` by
  position (the superseded `trim().toLowerCase()` label-matching path was deleted, rule 18). This is
  the rule-21 root-cause fix for the grounded-generation / entity-linking defect where synonym drift
  (`LIFO`→`Stack`) missed an exact label match and aborted whole runs.

## VALIDATION

- **Forced-tool schema single-source refactor, 2026-06-29 (branch
  `refactor/single-source-forced-tool-schemas`).** Full workspace typecheck passed; the
  infrastructure-litellm suite passed with new `toForcedToolSchema` golden tests, bounded enum
  symmetry tests, and all-tool structural/domain-neutrality invariants. Real model validation used
  the Rust curated source through the production worker path: extraction run
  `02d72916-2ce1-46e6-873f-5bc931e2e3ef` succeeded (`candidates=20`, `core=5`, `CEPs=19`,
  `incomplete=0`, `assertions=7`), graph version `daad805b-40a5-40d1-afa0-1d0f8c9b1deb` published,
  and enrichment `10ee38bf-ada2-4d57-90f9-69811c309720` committed 19 prerequisite edges with
  `contested=0`, `weakCut=0`, and `cycleRouted=0`. Production verifier inspection confirmed all 123
  persisted CEP passages and all 7 assertion evidence quotes still verify; nullable `literalValue`,
  tightened `minLength`, bounded candidate-key enums, and prerequisite-ordering bounds were accepted
  by real forced-tool calls. Result: PASS. Trail: `tmp/2026-06-29-forced-tool-schema/`.

- **Learner study/path/loop use-case refactor U1–U6, 2026-06-29 (branch
  `refactor/learner-study-use-case`).** Full workspace typecheck green; recursive tests green
  (application 335 incl. the new pure `composeStudySession` projection suite, the `getStudySession`
  port-fake suite, and the relocated learner-loop fold suite; infra-postgres adds live read-adapter
  tests for the Learner Path + Learner Loop ports, skipped without `DATABASE_URL`); admin-lab
  production build passes; ESLint 0 errors / 2 pre-existing warnings. Grep proofs: no `sql<` in the
  `studySession` / `learnerLoop` / `learnerPaths` shells; the `selectScopedFrontier` UI clone and the
  re-inlined frontier sort are gone; exactly one exported `rankFrontier`. Behavior-preserving refactor
  (AGENTS rule 14 applies lightly): the remaining manual rule-14 check is real-use parity — the study,
  paths, and learner-loop surfaces rendering identically against a seeded enrichment/learner —
  deferred to a DB-backed run (no `DATABASE_URL` in this environment).

- **Published-Concept identity resolution U1–U5, 2026-06-26 (branch
  `fix/cep-definition-mispick-learner-surface`).** Full workspace typecheck and recursive suite green
  (new: 11 `resolveConceptIdentity` cases, 7 build-consumption cases incl. AE1/AE2/AE3, 4 worker
  mapping cases, 2 inspection-read-stitch cases). Real-model calibration (rule 13/14,
  `tmp/2026-06-26-identity-calibration/`): on real `qwen3-embedding-8b` the 0a7ed566-class
  fragmentation pairs score 0.77–0.87 while distinct same-domain pairs score 0.45–0.52, so the
  inherited 0.70 floor sits in a 0.25 gap (no code change). Driven through the production embedding +
  `gpt-oss-120b` adjudicator, `Barter`/`Bartering` merged (cos 0.870) while `Owner`/`Ownership` was
  proposed (cos 0.767) but kept **distinct** by the precision-first adjudicator (no wrong merge); a
  real worker build over the Rust source ran resolution end-to-end with zero merges over
  genuinely-distinct concepts, and `BUILD_DISABLE_IDENTITY_RESOLUTION` reproduced the exact-label
  baseline. Case-B build refusal is unit-guarded (AE3).

- **Operation Timeline ownership refactor, 2026-06-26:** full workspace typecheck and recursive test
  suite pass; focused application coverage for bottleneck reports, catalog classification, ranking,
  reporter instrumentation, extraction, graph-version build, enrichment, study-item generation, node
  minting, and deduplication passes (130 tests); LiteLLM spend adapter tests pass; ESLint has zero
  errors and five pre-existing warnings; Admin Lab production build passes.
- **Rescue-seam fix U1–U5, 2026-06-26 (branch `fix/rescue-seam-derived-grounding`):** full workspace
  typecheck, the recursive test suite (271 application incl. new definition-bearing rescue/floor/study
  cases, 38 live-PostgreSQL incl. a new R1/R2 rescue-read case proving optional definitions are reused
  while reject definitions stay excluded, 86 admin-lab), ESLint (0 errors; 5 pre-existing warnings), and
  the admin-lab build are green.
- **Rescue-seam fix U6/U7 real-source inspection, 2026-06-26 (rule 13/14).** Hard reset + a clean
  markdown-only full-manifest seed (3 domains; graph version `41543df0`, enrichment `c6c558eb`)
  confirmed the grounding upgrade on inspected real model output. Rust domain vs the pre-fix baseline
  `c2e28622`: `source_mentioned` rescued nodes **1 → 10**, `llm_grounded` minted nodes **12 → 4**;
  all-domain source-grounded share 39/51 (76%). Rescued nodes carry verbatim definition + mention
  passages (floor `disposition=verified`; manually re-confirmed verbatim across markdown blockquote,
  emphasis, and LaTeX cases — the only non-matches were checker-side normalization artifacts). The
  Rust minted residue (4 nodes) is disjoint from the 25-concept rescue-eligible optional pool, so
  minting fell to a genuine source-absent residue (R3). Study-item provenance tracks node grounding
  (`document_anchored`→`source_cep` 30 / `source_mentioned`→`source_mentioned` 38 with verbatim
  citations / `llm_grounded`→`generated` 23; R5). The learner loop runs end-to-end: synthetic
  responses auto-graded with a realistic objective spread, mastery folded from graded scores at
  threshold 0.7, and a correctly-answered node crossing into mastered — the apparent "frontier did
  not advance" is correct conservative behavior (graded 0.5 < 0.7 keeps the next target), and
  `compute-adaptive-path` is untouched by this branch. Trail: `tmp/2026-06-26-rescue-seam/`.
- **Latest consolidated suite, 2026-06-26:** full workspace typecheck and tests (262 application,
  37 live PostgreSQL integration including a new shared-`operation_id` reporter regression), ESLint
  (zero errors; five pre-existing warnings) are green.
- **Whole-set ordering label-fidelity fix + AE1/AE2 unblock, 2026-06-26.** Re-running the exact Rust
  fixture that failed closed twice on June 25 (graph version `ce1f3b85`) now succeeds: enrichment
  `c2e28622` committed 20 certain / 9 uncertain edges, `cycleRouted=0`, no "outside the listed"
  abort. `Heap memory allocation` — one of the June-25 out-of-set misses — now binds by position;
  inspected ordering is sane (`Ownership → {Borrowing, Move, Return Values}`; `The Stack and the
  Heap → Heap memory allocation → Deep copy vs shallow copy → clone method`; `Pointers → References
  → Borrowing`; foundations as roots, `Memory safety` a leaf). With enrichment unblocked, the
  whole-journey `journey-cost-report` now stitches extraction → minting → enrichment end-to-end
  (journey total wall=774.1s, 169 calls, 443,522 tokens, $0.0465; ordering stage 8 calls / $0.0071),
  closing the previously-unverified AE1/AE2. Trail: `tmp/2026-06-26-ordering-number-fix/`.
- **Pipeline-cost hardening baseline, 2026-06-26.** A fresh Rust ch.4.1 journey produced a clean
  complete rollup with enrichment LLM stages joining wall-clock and LiteLLM cost on one fine stage
  name. Ranked targets identify `extraction/admission` and `enrichment/prerequisite-ordering` as the
  top cost levers, and `prerequisite-ordering` / `admission` as the top time levers. Trail:
  `tmp/2026-06-26-pipeline-cost-baseline/`.
- **Latest real-use quality evidence:** the June 24 Definition-Passage quality run passed with the
  caveat recorded above; the June 24 K-sampled prerequisite-ordering run passed on real Rust and
  economics sources, surfacing unstable directions as `uncertain` while retaining robust edges.
- **CEP definition-passage learner-facing false-negative measurement, 2026-06-26 (rule 13/14).** A
  disposable self-consistency instrument (`tmp/2026-06-26-cep-defn-falseneg/`) re-judged the union
  of learner-facing definitions — surviving `core` CEP definitions plus rescued `source_mentioned`
  passages — on the clean seed (enrichment `c6c558eb`, graph version `41543df0`) with K=7
  self-consistency. Result: 4/57 false negatives (7.0%; core 1/21, rescued optional 3/36), with 3
  in-window mis-picks, 1 non-adjacent window-miss, and 0 genuine-absence; a K=1 pass agreed on the
  aggregate. The shipped rescue-seam coverage judge already drops all four to mention-only, so no
  hollow definition reaches a learner. This resolved the prior A/B trail
  (`tmp/2026-06-25-cep-defn-retrieval/`, within base-rate noise) and closed the mis-pick follow-up
  above; bounded re-pick was deferred on cost/benefit.
- Tests remain deterministic-envelope evidence only under
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md); quality claims above come from
  inspected real model output.
- **Calibration pre-study flow, 2026-06-29 (branch `feat/calibration-pre-study-flow`).** Full
  workspace typecheck passes; full recursive tests pass; production build passes; ESLint has zero
  errors and two pre-existing warnings. Focused coverage exercises the pure calibration list/session
  projection, option-select-only generation, study side-sheet gating, adapted-graph known-closure
  hiding, synthetic verdict seeding, and Postgres store type boundaries. Code review found and fixed
  skip-as-known auto-advance, pending-write navigation races, option-vs-skip mutual exclusion, stale
  calibration verdict wording, application-projection ownership, option-select persistence
  invariants, calibration DB error swallowing, and non-transactional learner reset. Follow-up
  validation on 2026-06-29 confirmed `DATABASE_URL` is available and exercised the seeded curated
  enrichment `c6c558eb` in browser. For learner `demo-seeded-2` studying non-foundational target
  "AI research agent", Adapted renders 38 concepts / 40 inferred edges while Neutral restores the
  full 51 concepts / 76 inferred edges; the known concept "valid artifact" is absent from the
  Adapted textual node list and present again in Neutral. Zero-verdict learner `demo-empty-1` renders
  the same 51 concepts / 76 inferred edges in both modes. Screenshots:
  `tmp/neutral-adapted-fix-adapted.png`, `tmp/neutral-adapted-fix-neutral.png`.

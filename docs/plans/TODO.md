# TODO

## TODO

1. **Address broad, evidence-thin intrinsic-difficulty distortion.** Real full-manifest inspection
   found plausible ordering overall but over-weighted some broad or relation-like labels with sparse
   evidence.
   - Prefer a measured neural judge over fixture-specific prompt tuning or deterministic proxies.
   - Keep population calibration deferred until stable real learner-response data exists
     ([ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md)).

2. **Align the calibration shell to the study use-case shape (optional fast-follow).** The
   learner-facing reads now follow the ADR-0027 split (see COMPLETED), but
   `composeCalibrationSession` / `calibrationSession.ts` still use the older pure-compose +
   shell-wiring shape. Bring it onto the same injected-ports use-case shape as `getStudySession` so
   both learner projections share one boundary before the Learner App is built. This is
   behavior-preserving and does not require a new ADR.
   Decision: [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md).

## COMPLETED

- **Operator observability — inspectable forced-tool exhaustion and citation match fidelity.**
  Two fail-closed behaviors that were previously opaque are now inspectable, with no change to any
  fail-closed decision. (1) When a forced-tool call exhausts its retries, the litellm transport
  captures a redacted per-attempt failure trail at the model-output boundary (the same rule-6 seam
  that strips NUL bytes): each attempt records its deviation `kind`
  (`http`/`no_tool_call`/`no_arguments`/`invalid_json`/`schema_invalid`/`other`), the HTTP status,
  the violated schema PATHS only (never the offending values), and a bounded, control-stripped,
  truncated arguments snippet. It throws a `ForcedToolExhaustionError` that carries the ports-defined
  `stageErrorDetail`; the single `bracketStage` catch point duck-types that carrier and persists it
  to a new `operation_run_stages.error_detail jsonb` on the failing close (a plain throw reduces to a
  bounded `other` message), and the Admin Lab operations timeline renders the reason under the failed
  stage. `bracketStage` still rethrows unchanged. (2) Source citations now record `matchKind`
  (`exact` vs `normalized`) via one new `classifyEvidenceMatch` in domain-core, of which
  `evidenceQuoteMatches` is the boolean projection (rule 18); the shared `StudyItemCitation` source
  arm carries it so both option-select and Concept Lesson section citations persist a `match_kind`
  column (folded into each citation table's per-provenance CHECK), and the Concept Lesson card shows
  `source · exact` vs `source · normalized`. Decisions:
  [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md),
  [ADR-0007](../adr/0007-extract-concept-evidence-profiles-in-concept-context.md),
  [ADR-0011](../adr/0011-retain-minimal-admin-lab.md),
  [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md), and
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md).

- **Source-grounded asserted graph baseline.** Curated mixed-format sources normalize into structured
  blocks; atomic Concept Admission selects core Concepts; CEP extraction preserves verified
  definitions, mentions, and the single permitted typed assertion; explicitly selected Extraction
  Runs build immutable graph versions with zero asserted edges. Decisions:
  [ADR-0004](../adr/0004-normalize-curated-sources.md),
  [ADR-0005](../adr/0005-admit-atomic-concepts-before-evidence-profiles.md),
  [ADR-0007](../adr/0007-extract-concept-evidence-profiles-in-concept-context.md),
  [ADR-0016](../adr/0016-retire-relation-registry-keep-one-cep-assertion.md), and
  [ADR-0017](../adr/0017-split-extraction-runs-from-graph-version-builds.md).

- **Quality gates and forced-tool reliability.** Forced-tool schemas are single-sourced from zod, and
  neural judge gates share one fail-safe boundary for bounded concurrency, index-aligned results, and
  fail-closed pass-through behavior. Decisions:
  [ADR-0006](../adr/0006-use-forced-named-tool-schemas.md),
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md), and
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md).

- **Published Concept identity and static refinement.** Same-domain near-duplicates are proposed by
  embeddings and decided separately; Graph-Version Builds consume recorded identity decisions while
  preserving deterministic, LLM-free publication. Decisions:
  [ADR-0012](../adr/0012-embeddings-permitted-except-prerequisite-derivation.md),
  [ADR-0015](../adr/0015-deterministic-cross-source-identity.md), and
  [ADR-0017](../adr/0017-split-extraction-runs-from-graph-version-builds.md).

- **Derived Graph Enrichment.** Enrichment rescues source-mentioned nodes, mints generated nodes only
  for source-absent prerequisites, records grounding origin structurally, derives prerequisite
  structure through sampled whole-domain ordering, and keeps uncertainty inspectable. Decisions:
  [ADR-0019](../adr/0019-graph-enrichment-derived-layer.md),
  [ADR-0023](../adr/0023-grounding-origin-model-and-cross-family-generated-node-judge.md),
  [ADR-0024](../adr/0024-learner-neutral-intrinsic-difficulty.md), and
  [ADR-0028](../adr/0028-measure-non-deterministic-quality-with-non-deterministic-methods.md).

- **Learner study loop and Concept Lesson substrate.** Study assets key to `derived_node_id`,
  option-select items are auto-graded into the append-only Response Log, calibration remains separate,
  and the Concept Lesson is the learner-neutral teaching substrate that grounds downstream study
  items. Decisions: [ADR-0026](../adr/0026-typed-study-item-bank.md),
  [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md), and
  [ADR-0031](../adr/0031-concept-lesson-teaching-substrate.md).

- **Inspection and learner-projection boundaries.** Inspection surfaces use read-model ports, while
  learner-facing projections compose reads with adaptation compute behind application use-cases; Admin
  Lab remains a thin operator surface. Decisions:
  [ADR-0011](../adr/0011-retain-minimal-admin-lab.md) and
  [ADR-0027](../adr/0027-serve-inspection-through-read-model-ports.md).

- **Operation observability and cost reporting.** Extraction, graph-version build, enrichment, and
  study-item operations report shared durable stage timelines; LiteLLM spend is joined on
  request-scoped operation tags for one operation or a
  [Processing Journey](../../CONTEXT.md). Decision:
  [ADR-0029](../adr/0029-persist-shared-operation-stage-timelines.md).

- **Extraction provider latency fix.** Routing production extraction aliases to DeepSeek first-party
  resolved the prior extraction latency blocker and removed the dedicated OpenRouter-key blocker.

## VALIDATION

- **Operator observability (forced-tool exhaustion + citation match fidelity), 2026-06-30.** Full
  workspace typecheck green; full recursive suite green (domain-core 35 incl. the new
  `classifyEvidenceMatch`/`evidenceQuoteMatches`-parity suite; application 368 incl. the new
  `bracketStage`/`toStageErrorDetail` routing cases and the `matchKind` exact/normalized cases in
  `assembleConceptLesson` and `optionSelectGuard`; infra-litellm 92 incl. the exhaustion cases —
  schema-invalid records `kind:schema_invalid` + violated PATH only + bounded redacted snippet, HTTP
  records `kind:http`+status, invalid-JSON truncates the snippet, all still fail closed; admin-lab 77;
  kg-worker 4). ESLint 0 errors / 2 pre-existing warnings (`domain-core/src/index.ts`,
  `infrastructure-litellm/src/extractionAdapters.ts`, both outside this diff). Admin Lab production
  build passes. DB-backed (DATABASE_URL from `.env`, schema reset + re-migrated): the live
  `PostgresRunProgressReporter` suite (9) includes a new round-trip proving a failing `completeStage`
  persists `error_detail jsonb` that reads back verbatim through `PostgresOperationTimelineRead`
  (paths + redacted snippet preserved) and that an ok close stores NULL; the
  `PostgresLearnerLoopStores` citation suite (17) round-trips `match_kind` under the tightened
  per-provenance CHECK. **Real-use gate (rule 14):** a clean single-Rust journey on a freshly reset DB
  ran end to end on real model calls — extraction `d5e1373a` (`core=10 CEPs=30 defs=38 mentions=138
  assertions=11`), graph version `c000ce32` (9 concepts), enrichment `6bf1b68b` (9 anchors / 17
  enrichment nodes), study items `lessons=26 absent=0 items=25 rejected=1`. The successful run
  recorded **0 of 50 stages with a non-null `error_detail`** (0 failed). Citations carry a realistic
  fidelity mix: lesson sections **26 source·exact / 3 source·normalized / 26 generated(null)**,
  option-select **14 source·exact / 11 generated(null)**, with **0** CHECK-invariant violations
  (every source row has a `match_kind`, every generated row NULL). Forcing a real failure (extraction
  with `LITELLM_BASE_URL` pointed at a 404 route) persisted on the failed `concept-discovery` stage:
  `{kind:forced_tool_exhaustion, model:kg-concept-discovery, toolName:submit_concept_candidates,
  attempts:[3× {kind:http, status:404}], message:"…failed after 3 attempt(s): LiteLLM request failed
  with 404."}` and the worker exited non-zero — fail-closed preserved, reason now inspectable. Result:
  PASS. Trail: `tmp/2026-06-30-operator-observability/`.

- **Latest deterministic suite, 2026-06-30.** Full workspace typecheck and recursive tests are green
  (domain-core, application, infrastructure-postgres DB-skipped cases, infrastructure-litellm,
  kg-worker, and admin-lab). ESLint reports zero errors and two pre-existing warnings outside the
  latest docs/behavior diff.

- **Latest real-use gate, 2026-06-30.** With `DATABASE_URL` loaded from `.env`, the live
  `PostgresLearnerLoopStores` suite passed all DB-backed cases, including the regression that fans 16
  concurrent same-learner Response Log appends and proves distinct, gapless `attempt_seq` assignment.
  A clean real Rust journey also exercised all six measured judge gates end to end with production
  LLM calls and no unavailable pass-throughs. Detailed historical validation trails live in git
  history and generated artifacts under `tmp/`.

- Tests remain deterministic-envelope evidence only under
  [ADR-0013](../adr/0013-verify-quality-by-real-source-inspection.md); quality claims come from
  inspected real model output.

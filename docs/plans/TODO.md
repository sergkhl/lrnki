# TODO

The learner-facing study loop is now merged to `main` (PR #9): a typed Study Item Bank with auto-graded
option-select studying, the learner-calibrated study route and calibration sweep, the adapted-graph
comparison view, persisted neural difficulty rationales, a repeatable demo seed, and the FFX sphere-grid
graph layout.

**In-flight branch `feat/graph-dissolved-calibration` (2026-06-22):** the weighted self-report calibration
sweep from PR #9 is *retired and replaced* by graph-dissolved calibration — the learner picks a goal first,
then self-assesses cone nodes with a reveal-then-binary "I knew it" / "I forgot" verdict that hard-prunes the
trusted prerequisite down-closure. Calibration is now a mutable verdict per `(learner, node)` stored apart
from the now-graded-only Response Log; all evidence weights are removed. Implementation units U1–U8 are done:
U1–U7 are typecheck/test-clean and committed (two commits: backend `feat(calibration)…` + UI
`feat(admin-lab)…`), and U8 real-use evaluation passed on the live two-source enrichment (see COMPLETED).
Session report: `tmp/2026-06-22-calibration-implementation-report.md`.

**In-flight branch `feat/enrichment-perf-batched-judging` (2026-06-23):** enrichment speed + token
reduction via per-node batched prerequisite judging (see COMPLETED). **All units U1–U7 are
shipped, typecheck/test-clean, committed** (U1 stage tags, U2 worker stage-timing, U4 batched
schema/adapter, U5 runGraphEnrichment reshape, U6 shared `mapWithConcurrency` + parallel-ready
extraction/study-item seams). The measurement instrument works: per-stage `stage_timing` lines, and
`/spend/tags` attributes token/cost per stage with no app-computed cost (AE3 PASS). **U7 parity gate
resolved (option 1 + sign-off):** the batched judge's subject/candidate asymmetry was neutralized to
the per-pair judge's symmetric Concept A / Concept B framing inside one batched tool call
(`fix(enrichment): symmetric A/B framing…`). Re-measurement showed the per-pair judge is itself
non-deterministic now (~6/12 run-to-run, intermittently 12/12) due to OpenRouter/DeepSeek serving
drift, so symmetric-batched is within per-pair's noise envelope (cross 5.6 ≈ within 6.3) and a clean
12/12 parity is no longer measurable for any method. **User signed off: accept batched + keep the
1.4–2× speed win;** enrichment reproducibility is now tracked as its own issue (TODO #6). Evidence:
`tmp/2026-06-23-enrichment-parity-fix/rule-14-evaluation.md`, `tmp/2026-06-22-enrichment-rule14.md`,
`tmp/2026-06-22-enrichment-baseline/`, `tmp/2026-06-22-enrichment-after/`.

The current branch resolves the former minting-precision TODO with a minting-durability judge
(`feat: Minting-durability judge for assumed-prerequisite enrichment nodes`). Rule-14 evaluation on
2026-06-23 classified it **PASS with caveats**: the enabled Rust + economics run minted four reasonable
software prerequisites (`Compiler (software tool)`, `Dynamic memory allocation`, `Memory address`,
`Static analysis (programming)`), persisted four accepted minting dispositions, produced no RAII node or
drop-function edges, and rescue dropped `Resource Acquisition Is Initialization (RAII)`. The disabled
baseline still produced `drop function (Rust)` rescue output and edges, but the RAII minting path did not
reproduce in this draw, so the evaluation records that no real `not_durable` minting drop was observed.
Evidence: `tmp/2026-06-23-minting-durability-rule14/rule-14-evaluation.md`.

The remaining active work is earned by inspected real-use outputs, not by deferred method-stack
preference: the learner recall/adaptive path loop runs end-to-end over all manifest fixtures at
`EXPERIMENT_ONLY` trust, and prior CEP definition-quality and intrinsic-difficulty caveats remain visible in
the mixed-domain run.

## TODO

1. **Replace exhaustive O(n²) pairwise prerequisite judging with a whole-set global ordering (measured
   experiment).** Pairwise LLM judgment is intransitive by nature (A→B→C→A), which is *why* the certain
   edge set is noisy and ordering costs O(n²). Ask the judge for a global prerequisite DAG / topological
   ordering over the small per-domain concept set in one or few calls — cheaper than the current fan-out
   and globally self-consistent by construction (no post-hoc cycle removal of intransitive loops).
   **Direction confirmed (2026-06-23 brainstorm), pending its own dedicated brainstorm/plan; sequenced
   after the dedup + durability cleanup so the DAG ranges over a cleaner derived node set.** Findings
   parked here:
   - Keep it LLM-judged; embeddings stay out of prerequisite derivation (rule 20, ADR-0019).
   - **Supersede or remove the per-node batched judge** (just merged on `feat/enrichment-perf-batched-judging`):
     it is a speed optimization of the O(n²) approach, made redundant by whole-set ordering (rule 18). Only
     the measurement instrument (per-stage `stage_timing`, `/spend/tags`) carries forward.
   - **This is the governance-compliant form of self-validation.** A whole-set DAG introduces a *structural*
     correctness notion — **acyclicity** — that lives in the provable deterministic envelope (rules 11/19),
     unlike pairwise edges whose only correctness is semantic (rule-16 no-gate territory). The provable check
     informs, never silently vetoes meaning.
   - **Validation handling = verify-and-route, plus at most one bounded corrective re-prompt** (not an agentic
     tool-call loop). The model returns the DAG + per-edge confidence in one forced-tool call; the application
     boundary verifies acyclicity and that edges cite real concepts; a cycle triggers one corrective re-prompt
     showing the specific violation, and a still-cyclic result routes the offending edges to `uncertain`. The
     open agentic loop (model self-electing to call checkers, looping) is an explicit **non-goal** — speculative
     complexity, non-deterministic call timing, hard to measure.
   - Measured run-scoped experiment compared against the current ADR-0019 exhaustive same-domain baseline
     by real-use inspection (rules 13/14); promote only if edges get more learner-sensible and cheaper.

2. **Prerequisite-direction uncertainty via self-consistency (supersedes determinism-chasing).** Per
   ADR-0028 / rule 19, the MoE judge's run-to-run flips on ambiguous pairs are epistemic-uncertainty
   signal, not a bug to make deterministic. Sample the judge K times per pair (or per global ordering) and
   route **direction-unstable** pairs to `uncertain` — already excluded from learner paths — instead of
   committing one arbitrary draw. This both calibrates edge confidence and dissolves the TODO-#6 "noise".
   - Costs K× judge calls; sequence it *after* task 2 so K× applies to the cheaper global-ordering call,
     not the O(n²) fan-out. **Gate on observed instability:** ship task 2 single-sample first, inspect it
     (rule 14), and add K-sampling only if the real defect is direction-instability — do not pre-build K×
     before the instability it measures is observed. Measured, domain-neutral, disposable (rules 11/16/17).
   - This closes the former enrichment-reproducibility item: root cause is intra-backend MoE
     non-determinism (probe `tmp/2026-06-23-enrichment-determinism-probe/findings.md`), unfixable with
     seed/provider-pinning; `litellm/config.yaml` was correctly left unchanged. Do **not** re-open a
     serving-determinism investigation (ADR-0028).
   - **Deferred sibling finding (2026-06-23 brainstorm) — LLM-invoked "world-law/science" deterministic
     checks.** Defer to a future run-scoped experiment, admissible **only in a sub-domain with a genuine
     formal oracle** (dimensional/unit analysis, a type system, arithmetic/temporal logic), and even there
     the check *informs* the judge, never silently vetoes (rule 16). Rationale: self-correction reliably
     helps only when grounded in an external verifier (Huang et al. 2023 — intrinsic self-correction without
     an external signal does not reliably improve and can degrade); domain-general prerequisite derivation
     has no such oracle, so a "world-law" validator collapses into either another LLM judge (already covered
     by self-consistency above) or a hardcoded rule set (the forbidden rule-16 symbolic gate). Not now.

3. **Intrinsic-difficulty broad/thin follow-up.** The full-manifest read of `intrinsic-fused-v1` found
   broadly plausible ordering but a concentrated broad/evidence-thin distortion, especially relation-like
   or framework-level labels with sparse evidence. Evidence:
   `tmp/2026-06-20-intrinsic-difficulty-full-manifest/rule-14-evaluation.md`. Persisted neural rationales
   make this inspectable per node.
   - Prefer a measured neural judge that explicitly assesses whether a broad, evidence-thin node should be
     down-weighted; do not patch prompts with fixture-specific answers (rules 16/17). Keep any
     oracle/benchmark disposable.
   - Population calibration stays deferred until real learner-response data exists (task 7 / ADR-0024).

4. **CEP Definition Passage precision cleanup — heading/citation-like definitions.** The structure-aware
   neighborhood pass recovered useful adjacent definitions and reduced InstructKG incomplete CEPs, but
   inspection still found low-value accepted Definition Passages such as heading-only or citation-like
   snippets in the AIRA-dojo Markdown run.
   - Prefer improving the neural CEP extraction/judgment contract or a measured disposable experiment that
     proves a generic definition-quality guard raises precision without dropping valid adjacent
     definitions; no hardcoded symbolic section-role or lexical veto (rules 16/17).
   - CEP-quality follow-up, not a retrieval-layer blocker: the verbatim floor held and inspected adjacent
     blocks were genuine explaining passages.

5. **Inspection/observability polish.** Two small operator-facing items:
   - **Harden forced-tool transport** for long runs: the all-manifest learner-loop hit one malformed JSON
     forced-tool argument during AIRA-dojo admission (rerun succeeded). Keep fail-closed (rule 6), but
     improve retry observability and capture malformed tool-call snippets safely (no secrets, no full
     copyrighted source context) to diagnose provider/schema drift.
   - **Label study-item citation exactness:** persisted items pass `evidenceQuoteMatches`, but a known
     fraction are not byte-exact substrings because the verifier tolerates parser formatting noise
     (markdown emphasis, curly quotes, wrapping, HTML entities). Admin surfaces should label normalized-
     vs-exact so operators don't conflate them.

6. **Keep standing deferred methods deferred.** Learner-calibrated difficulty and learner state remain
   data-blocked.
   - Population difficulty calibration (Bradley-Terry, IRT/KT), learner simulation, and any fitting of a
     difficulty or learner model on synthetic or self-assessed responses stay deferred until per-learner
     calibration over real study-loop responses is stable (ADR-0024).
   - **Graph-growth guard (narrowed).** Do not reintroduce F3-style densification: no ungrounded
     bridge-node/bridge-edge pass and no method-stack-driven graph growth. **Embeddings are now permitted
     for concept identity/dedup and similarity (task 1, ADR-0012) but never to derive prerequisites or
     gate/grow the graph** (rule 20). Performance-driven graph growth may be reconsidered only as a
     measured, run-scoped experiment. Learner responses may propose candidate missing prerequisites or
     edge audits but must not directly mutate the asserted graph or silently modify a Derived Graph Layer;
     any accepted mechanism must be versioned, provenance-visible, and compared against the ADR-0019
     baseline.

## COMPLETED

- **Enrichment semantic dedup + rescue precision (2026-06-23, branch `feat/enrichment-dedup-rescue-precision`,
  stacked on `feat/enrichment-perf-batched-judging`).** Plan
  `docs/plans/2026-06-23-002-feat-enrichment-dedup-rescue-precision-plan.md`; rule-14 report
  `tmp/2026-06-23-dedup-rescue-rule14-evaluation.md`. All units U1–U7 shipped, typecheck/test-clean,
  committed.
  - **Semantic-deduplication sub-stage (U1–U5):** a measured derived-layer pass that collapses
    same-domain near-duplicate nodes before per-node judging, strictly separating PROPOSE from DECIDE
    (rule 20). Embeddings (`kg-node-embedding` / qwen3-embedding-8b) propose within-domain candidate
    pairs by cosine; a cross-family adjudicator (`kg-independent-judge` / gpt-oss-120b) decides each
    `merge`/`keep_distinct`; raw cosine never decides. Deterministic canonical selection (anchor always
    wins → never absorbs a published Concept; then evidence count, then stable id), union-find for
    transitive clusters, absorbed evidence threaded into the canonical's judge context, full provenance
    persisted to `derived_node_merges` and shown in Admin Lab "Semantic merges". Fail-closed everywhere
    (embedding failure skips a domain; adjudicator failure → keep_distinct), opt-in, `enrichmentConfigHash`
    → `dedup-v1`. New deterministic-envelope tests only (rules 11/19); no test asserts a merge verdict.
  - **Rescue durability sharpened (U6):** added a domain-neutral develops-vs-named-in-passing axis to the
    drop-only rescue judge. **U7 verified the RAII rescue-path defect is fixed** — RAII dropped as "only
    mentioned once as a C++ comparison and not explained or built upon"; ~40 other passing asides dropped
    with the same reasoning; only source-developed concepts accepted.
  - **Threshold calibration (U7):** `DEFAULT_DEDUP_CONFIG.similarityThreshold` 0.8 → 0.7 (recall-generous
    per R2; model-scale calibration to qwen3-embedding cosine, not fixture-fitting — genuine duplicates
    ≥0.72, distinct ≤0.66). A real-model probe (`tmp/u7-dedup-probe.ts`) merged a genuine anchor↔variant
    duplicate (Ownership ← Ownership (Rust), 0.87, anchor canonical) and kept a borderline pair
    (move/Move semantics, 0.72) distinct — confirming the adjudicator owns precision.
  - **Residual (now TODO #1):** the same RAII gate can still arise via the **minting** path (baseline
    minted RAII → `drop` at 0.85); U6 fixed only the rescue path. Minting-precision durability is queued.

- **Enrichment batched judging + determinism governance pivot (2026-06-23, branch `feat/enrichment-perf-batched-judging`).**
  - **Per-node batched judging shipped (U1–U7):** replaced per-pair prerequisite judging with one batched
    `submit_prerequisite_judgments` call per node (U1 stage tags, U2 worker stage-timing, U4 batched
    schema/adapter, U5 reshape, U6 shared `mapWithConcurrency`), using the per-pair judge's symmetric
    Concept A / Concept B framing inside the batched call (`fix(enrichment): symmetric A/B framing…`,
    domain-neutral per rule 17; deterministic mapping + 47/47 envelope tests unchanged; typecheck clean).
    Per-stage `stage_timing` + `/spend/tags` instrument token/cost with no app-computed cost (AE3 PASS).
    Symmetric re-measurement (graph version `ad675576…`, 14 anchors, cap=1) scored 10/12 vs the per-pair
    baseline, up from asymmetric's 6/12. **User signed off: accept the batched reshape + U5 deletion for
    the 1.4–2× speed win** (judging ~2.1×, total enrichment 1.39×). Evidence:
    `tmp/2026-06-23-enrichment-parity-fix/`, `tmp/2026-06-22-enrichment-after/`,
    `tmp/2026-06-22-enrichment-rule14.md`.
  - **Determinism root-caused → governance pivot:** a disposable through-proxy probe
    (`tmp/2026-06-23-enrichment-determinism-probe/`) proved certain-edge run-to-run variance is
    **intra-backend MoE non-determinism** on genuinely-ambiguous pairs (clear pairs decision-stable 8/8;
    ambiguous flip even with a pinned backend + honored `seed: 7` + `temperature: 0`). `deepseek-v4-flash`
    has 19 OpenRouter backends, so the prior 12/12 was a lucky draw; no serving/config lever fixes it and
    `litellm/config.yaml` was left unchanged, so clean 12/12 parity is unmeasurable for any method and
    reproducibility moved to its own active item (TODO #3/#6). **Governance updated:** new ADR-0028 + rule
    19 (measure non-deterministic quality with LLM/self-consistency, not determinism-chasing); ADR-0012
    rewritten + rule 20 (blanket no-embeddings ban withdrawn — embeddings permitted for
    identity/dedup/similarity, propose-only with separate adjudication, never for prerequisites);
    ADR-0015/CONTEXT reconciled. Inspecting real enrichment `0a7ed566` surfaced the larger learner-facing
    defect — concept fragmentation (barter×2, owner≈ownership, move×2) + permissive rescue (RAII→drop
    @0.95) — now TODO #1.
- **Graph-dissolved calibration & goal-first study loop (2026-06-22, branch
  `feat/graph-dissolved-calibration`, committed not merged).** Retired the
  weighted self-report calibration sweep and replaced it with explicit calibration dissolved into the study
  graph:
  - **Persistence + domain reshape (U1/U2):** new mutable `calibration_verdicts` table +
    `CalibrationVerdictStorePort` + `PostgresCalibrationVerdictStore`; `response_log` collapsed to graded-only
    (dropped `evidence_weight`, `self_report_rating`, the `self_report` signal type, and its coherence branch).
    Deleted `calibration.ts` (`buildCalibrationSet`/`propagateSelfReport`/`appendSelfReportBatch`, the
    `0.3`/`0.15` + GRADED weights), `ratingToMastery`, and the self-report fold branch (rule 18). The synthetic
    simulator now seeds verdicts deterministically from difficulty (`verdictByDifficulty`). Per-learner reset
    nukes verdicts via the store + graded rows via a direct operator DELETE (the log keeps no store-port delete,
    so its append-only guarantee stays structural).
  - **Pure deterministic core (U3):** `calibrationClosure.ts` — `pruneClosure` (trusted-edge down-closure),
    `composeMastery` (calibration `known` masters its closure; coexistence with graded is *surfaced*, not
    silently resolved — the old "graded always outranks" precedence is gone), `struggledNodes` (latest graded
    incorrect), `suggestRestorations`. `prerequisiteAncestors` generalized to a minimal edge shape so the loader
    and a future Learner app share one ancestor definition.
  - **Goal-first entry (U4):** alias-aware goal search, journey-size (cone-count) ordering, "foundational —
    studied directly" tag for DAG-root goals; enrichment demoted to a secondary switcher defaulting to latest.
  - **Calibration UI (U5/U6/U7):** reveal-then-binary "I knew it"/"I forgot" card (verdict shown + clearable,
    R7); `setVerdict`/`clearVerdict`/`resetLearner` actions; loader derives the prune closure, composes mastery,
    and flags a foundational root so it opens a single-node screen instead of a premature "Goal reached" (AE1);
    Calibrate toggle + `CalibrationSweep.tsx` removed; `detectConflicts` re-homed onto verdict-vs-graded; a
    restoration nudge surfaces directly-known skipped prerequisites on a graded miss and restores via
    `clearVerdict`.
  - **Verification + real-use eval (U8):** repo typecheck clean; 349 unit tests pass, 0 fail (21 Postgres
    integration tests skip without `DATABASE_URL`); grep-clean of all retired symbols. U8 PASS on a live
    two-source enrichment with real model calls (economics `wealth-of-nations-bk1-ch1-3` run `b57760ba…`,
    Rust `rust-book-ch04-01` run `ba630d89…`, graph version `ad675576…`, enrichment `0a7ed566…`): 24 nodes,
    27 edges (23 trusted / 4 uncertain), 24 difficulty rows, 48 study items, 0 rejected. Headless inspection
    verified AE1–AE5 (foundational root single-node calibration screen; Rust cone pruning mastered 15/15
    trusted-closure nodes and reversed cleanly; calibration/graded coexistence surfaced; restoration
    suggested the skipped prerequisite; per-learner reset cleared verdicts + graded rows). PASS for
    calibration mechanics; learner model + intrinsic difficulty remain `EXPERIMENT_ONLY`. Evidence:
    `tmp/2026-06-22-calibration-implementation-report.md`, `tmp/2026-06-22-u8-eval/`.
- **Learner study loop UI (2026-06-21, PR #9).** Shipped the full learner-facing study surface in Admin Lab,
  built as transfer-ready prop-driven modules over the existing recall/adaptive-path core:
  - **Typed Study Item Bank** (ADR-0026): `Card` → typed `StudyItem` discriminated union; auto-graded
    option-select studying with a deterministic structural distractor guard and sibling-conditioned generated
    distractors; self-assessment retreats to calibration only. Supported types come from `SELECT DISTINCT
    item_type`. The `Card → StudyItem` rename (rule 18) is fully complete: `selfAssessment.ts` deleted,
    `optionSelectOutcome.ts` added, no `cardId`/old `Card` remnants; full workspace typecheck green. Rule-14 PASS
    (`tmp/2026-06-21-typed-study-items/`).
  - **Learner-calibrated study loop + adapted-graph view:** a Study route where a learner picks a goal node,
    optionally calibrates via a card sweep, and studies only the unmet gap while one pinned neutral↔adapted graph
    re-shapes (mastered/frontier/locked) per response — proving real skip-ahead divergence vs. an empty-mastery
    learner. Calibration is optional (separate button, never gating). Self-report propagates only along trusted
    (certain) edges.
  - **FFX sphere-grid graph layout:** replaced the spiral placement with an in-house, pure, synchronous
    per-domain serpentine grid layout with Cytoscape-native `taxi` edges and a provable zero-crossing invariant
    (deterministic crossing counter asserted `=== 0` on real seeded data; fail-loud flag if a loop is
    non-embeddable). Rejected re-adding ELK/dagre (async, ~1.5 MB, only *minimizes* crossings). The spiral module
    and its test were deleted in the same change. Rule-14 PASS (`tmp/2026-06-21-ffx-sphere-grid/`).
  - **Repeatable demo seed + difficulty-rationale persistence:** `scripts/seed-demo.sh` resets to one coherent
    full-manifest state with named demo learners and adaptive paths; the neural difficulty rationale the judge
    already returns is now persisted to `concept_difficulties` and surfaced on adapted nodes (labeled generated,
    no scoring-formula change).
- **Adapted-graph comparison view + full-manifest difficulty evaluation (2026-06-20).** One neutral/adapted
  `DerivedGraphExplorer` pair per distinct learner-path enrichment, badged by synthetic/human response source,
  scaling nodes by intrinsic difficulty and flagging cardless nodes. The full-manifest run classified
  `intrinsic-fused-v1` as `EXPERIMENT_ONLY` (useful for operator inspection, not calibrated learner difficulty).
  Evidence: `tmp/2026-06-20-intrinsic-difficulty-full-manifest/`.
- **Learner recall loop, adaptive path, and no-card fallback (2026-06-19 to 2026-06-20).** Built the
  learner-neutral Card/Study-Item Bank, append-only Response Log, `EXPERIMENT_ONLY` mastery fold, synthetic
  learner seeding, Admin Lab inspection path, and adaptive projection over the full Derived Graph Layer
  (`source_mentioned` and `llm_grounded` nodes are recall-testable). A derived node the generator cannot
  recall-test is persisted to `rejected_cards` in the same transaction and surfaced with its reason; the
  fallback was triggered live. Derived-node identity was renamed off the misleading `conceptId` to
  `derivedNodeId` across all layers (ADR-0025 two-identity amendment). Evidence:
  `tmp/2026-06-20-multitarget-loop/`, `tmp/2026-06-20-rejected-card-persistence/`,
  `tmp/2026-06-20-teachable-cards-rerun/`.
- **Learner-neutral intrinsic difficulty and F3 removal (2026-06-18).** Replaced the `dag-depth-mock` port with
  `intrinsic-fused-v1` (ADR-0024) and removed the failed F3 densification experiment from live code and ADR-0019.
  Evidence: `tmp/2026-06-18-intrinsic-difficulty/`, `tmp/2026-06-17-f1-enrichment-eval/`.
- **CEP simplification and structure-aware evidence retrieval (2026-06-18 to 2026-06-19).** Measured
  `explicit-prerequisite-hint` redundant against exhaustive enrichment and removed it, leaving `defines` as the
  sole Optional Typed Assertion. Added deterministic capped structural neighborhoods for CEP extraction
  (mention/adjacent/sibling/label blocks); the verbatim floor stayed unchanged and InstructKG incomplete CEPs
  improved 9 → 3. Evidence: `tmp/2026-06-18-prerequisite-hint-ab/`, `tmp/2026-06-18-structure-aware-neighborhood/`.
- **Evidence-backed admission, rescue, and ungroundable-core policy (2026-06-16 to 2026-06-17).** Added
  definition-bearing treatment to core admission, carried verified evidence into CEP extraction without bypassing
  the port, gated `source_mentioned` rescue with a drop-only measured durability judge, surfaced provenance
  pressure in Admin Lab, and changed incomplete-core handling from run failure to optional demotion with loud
  quality issues.
- **Post-reset graph architecture baseline (2026-06-15 to 2026-06-16).** Rebuilt the roadmap from real
  mixed-domain runs instead of method-stack preference. The reset architecture admits atomic Concepts, publishes
  source-grounded CEPs with zero asserted edges, builds graph versions explicitly from selected runs, derives
  prerequisite structure only in Graph Enrichment, keeps learner state downstream, and exposes the current
  surfaces through Admin Lab, RDF export, native ingestion, and Gate 2 Docling PDF ingestion.

## VALIDATION

Latest merged change (2026-06-21, PR #9) is the **learner study loop UI** (typed Study Item Bank + sphere-grid
layout + learner-calibrated study route + adapted-graph view + demo seed):

- **Static/unit:** full workspace typecheck green (`pnpm -r typecheck`, exit 0) — the earlier mid-rename compile
  caveat is resolved. `pnpm --filter @lrnki/admin-lab test` 74/0, including the sphere-grid zero-crossing
  invariant on real-shape data, serpentine/region-packing geometry, determinism, and the deterministic
  option-select structural guard. `packages/application` and `packages/infrastructure-postgres` suites green,
  including the neural-rationale round-trip on every difficulty row and append-only option-select outcome folds.
  No test asserts model output quality (rule 11).
- **Real-use:** rule-14 PASS on both final milestones. Sphere grid: `countEdgeCrossings === 0` on the seeded
  mixed-domain enrichment, right-angle taxi edges, visually separated per-domain regions, difficulty-size and
  learner-state overlays preserved, frontier advance recenters without relayout
  (`tmp/2026-06-21-ffx-sphere-grid/rule-14-evaluation.md`). Typed study items: clicking the correct option wrote
  one `graded(auto)` row and advanced the frontier with no got-it/missed-it controls; distractors were plausible
  and honestly labeled; the deterministic guard's rejections were genuine
  (`tmp/2026-06-21-typed-study-items/rule-14-evaluation.md`). Caveat: this seed produced no natural
  self-assessment-only (cardless-for-studying) frontier because every node yielded a valid option-select item —
  worth re-confirming as generation scales. The loop overall remains `EXPERIMENT_ONLY` (uncalibrated learner
  model); intrinsic difficulty remains `EXPERIMENT_ONLY` with the broad/thin distortion noted in TODO #1.

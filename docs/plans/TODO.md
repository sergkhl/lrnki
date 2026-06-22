# TODO

The learner-facing study loop is now merged to `main` (PR #9): a typed Study Item Bank with auto-graded
option-select studying, the learner-calibrated study route and calibration sweep, the adapted-graph
comparison view, persisted neural difficulty rationales, a repeatable demo seed, and the FFX sphere-grid
graph layout. The remaining active work is earned by the latest inspected real-use outputs, not by deferred
method-stack preference: the learner recall/adaptive path loop runs end-to-end over all manifest fixtures at
`EXPERIMENT_ONLY` trust, and prior CEP definition-quality and intrinsic-difficulty caveats remain visible in
the mixed-domain run.

## TODO

1. **Intrinsic-difficulty broad/thin follow-up.** The full-manifest read of `intrinsic-fused-v1` found broadly
   plausible ordering but confirmed a concentrated broad/evidence-thin distortion, especially relation-like or
   framework-level labels with sparse evidence. Evidence:
   `tmp/2026-06-20-intrinsic-difficulty-full-manifest/rule-14-evaluation.md`. Persisted neural rationales
   (demo-seed work) now make this inspectable per node.
   - Do **not** patch prompts with fixture-specific expected answers or named concepts. Any fix must remain
     domain-neutral and comply with AGENTS rules 16/17.
   - Prefer a measured neural judge that can explicitly assess whether a broad, evidence-thin node should be
     down-weighted. Keep any oracle/benchmark disposable unless it continues to earn its keep.
   - Population calibration remains deferred until real learner-response data exists; this follow-up is about
     operator-facing intrinsic ordering, not IRT/KT/Bradley-Terry.

2. **CEP Definition Passage precision cleanup — heading/citation-like definitions.** The structure-aware
   neighborhood pass recovered useful adjacent definitions and reduced InstructKG incomplete CEPs, but inspection
   still found low-value accepted Definition Passages such as heading-only or citation-like snippets in the
   AIRA-dojo Markdown run.
   - Do **not** add a hardcoded symbolic section-role or lexical veto. Any fix must stay domain-neutral and comply
     with AGENTS rules 16/17.
   - Prefer improving the neural CEP extraction/judgment contract or adding a measured, disposable experiment that
     proves a generic definition-quality guard raises precision without dropping valid adjacent definitions.
   - Treat this as a CEP-quality follow-up, not a blocker for the retrieval-layer milestone: the verbatim floor held,
     and the inspected newly included adjacent blocks were genuine explaining passages.

3. **Harden forced-tool transport for long extraction/card runs.** The all-manifest learner-loop evaluation hit one
   malformed JSON forced-tool argument during AIRA-dojo Markdown concept admission; rerunning the single source
   succeeded. Keep fail-closed semantics, but improve retry observability and capture malformed tool-call snippets
   safely enough to diagnose provider/schema drift without logging secrets or full copyrighted source context.

4. **Improve study-item inspection around citation exactness.** Persisted items passed the project verifier
   (`evidenceQuoteMatches`), but a known fraction of citations are not byte-exact substrings of source blocks
   because the verifier intentionally tolerates parser formatting noise (markdown emphasis, curly quotes, line
   wrapping, HTML entities). Admin/inspection surfaces should label this distinction clearly so operators do not
   confuse normalized verifier success with exact copied text.

5. **Keep standing deferred methods deferred.** Learner-calibrated difficulty and learner state remain data-blocked.
   - Population difficulty calibration (Bradley-Terry, IRT/KT), learner simulation, and any fitting of a difficulty or
     learner model on synthetic or self-assessed responses stay deferred until per-learner calibration over real
     study-loop responses is stable (task 1 / ADR-0024). Do not reintroduce embeddings, clustering, or non-LLM
     prerequisite signals from method-stack preference.
   - **Graph-growth guard (narrowed).** Do not reintroduce F3-style densification: no ungrounded bridge-node/bridge-edge
     pass, no embedding/clustering gate, and no method-stack-driven graph growth. Performance-driven graph growth may be
     reconsidered only as a measured, run-scoped experiment. Learner responses may propose candidate missing
     prerequisites or candidate edge audits, but they must not directly mutate the asserted graph or silently modify an
     existing Derived Graph Layer. Any accepted mechanism must be versioned, provenance-visible, validated against
     held-out learner data or inspected real-use runs, and compared against the current ADR-0019 exhaustive same-domain
     judgment baseline.

## COMPLETED

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

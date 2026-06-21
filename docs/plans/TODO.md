# TODO

Roadmap reset 2026-06-16, updated by the 2026-06-18 structure-aware-neighborhood run: the next work is earned
by real mixed-domain pipeline output, not by deferred method-stack preference.

## TODO

Most reset-roadmap items have moved to COMPLETED. The remaining active work is earned by the latest inspected
outputs: the learner recall/adaptive path loop now runs end-to-end over all manifest fixtures at
`EXPERIMENT_ONLY` trust, and prior CEP definition-quality caveats remain visible in the mixed-domain run.

1. **Intrinsic-difficulty broad/thin follow-up.** The full-manifest read of `intrinsic-fused-v1` found broadly
   plausible ordering but confirmed a concentrated broad/evidence-thin distortion, especially relation-like or
   framework-level labels with sparse evidence. Evidence:
   `tmp/2026-06-20-intrinsic-difficulty-full-manifest/rule-14-evaluation.md`.
   - Do **not** patch prompts with fixture-specific expected answers or named concepts. Any fix must remain
     domain-neutral and comply with AGENTS rules 16/17.
   - Prefer persisting difficulty rationales and/or a measured neural judge that can explicitly assess whether a
     broad, evidence-thin node should be down-weighted. Keep any oracle/benchmark disposable unless it continues to
     earn its keep.
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

4. **Improve card-bank inspection around citation exactness.** Persisted cards passed the project verifier
   (`evidenceQuoteMatches`) 87/87, but only 68/87 citations were byte-exact substrings of source blocks because the
   verifier intentionally tolerates parser formatting noise (markdown emphasis, curly quotes, line wrapping, HTML
   entities). Admin/inspection surfaces should label this distinction clearly so operators do not confuse normalized
   verifier success with exact copied text.

5. **Keep standing deferred methods deferred.** Learner-calibrated difficulty and learner state remain data-blocked.
   - Population difficulty calibration (Bradley-Terry, IRT/KT), learner simulation, and any fitting of a difficulty or
     learner model on synthetic or self-assessed responses stay deferred until the study Game UI exists and per-learner
     calibration is stable (task 1 / ADR-0024). Do not reintroduce embeddings, clustering, or non-LLM prerequisite
     signals from method-stack preference.
   - **Graph-growth guard (narrowed).** Do not reintroduce F3-style densification: no ungrounded bridge-node/bridge-edge
     pass, no embedding/clustering gate, and no method-stack-driven graph growth. Performance-driven graph growth may be
     reconsidered only as a measured, run-scoped experiment. Learner responses may propose candidate missing
     prerequisites or candidate edge audits, but they must not directly mutate the asserted graph or silently modify an
     existing Derived Graph Layer. Any accepted mechanism must be versioned, provenance-visible, validated against
     held-out learner data or inspected real-use runs, and compared against the current ADR-0019 exhaustive same-domain
     judgment baseline.

## COMPLETED

- **Adapted-graph comparison view + full-manifest difficulty-ordering evaluation (2026-06-20).** Completed
  `docs/plans/2026-06-20-001-feat-adapted-graph-view-difficulty-eval-plan.md` U1–U6. Admin Lab now renders one
  neutral/adapted `DerivedGraphExplorer` pair per distinct learner-path enrichment, badged by synthetic/human
  response source; the adapted panel colors mastered/frontier/locked nodes, rings the selected frontier target,
  scales nodes by intrinsic difficulty, and flags cardless nodes while leaving the neutral enrichment view intact.
  The rule-14 evaluation published/enriched full-manifest graph version `c40fe70d-17ff-451c-995f-ff28d40660c6` /
  `223cfb32-47a2-4488-a61a-561f6673f717` with real LiteLLM calls and classified `intrinsic-fused-v1` as
  `EXPERIMENT_ONLY`, useful for operator inspection but not calibrated learner difficulty. Evidence:
  `tmp/2026-06-20-intrinsic-difficulty-full-manifest/`.
- **Derived-node identity naming cleanup + ADR-0025 amendment (2026-06-20).** Renamed every
  learner-loop / path / difficulty / derived-edge field that carried a `derived_node_id` under the
  misleading name `conceptId` / `targetConceptId` / `prerequisite|dependentConceptId` to its
  `derivedNodeId` form across domain-core, ports, application, litellm, Postgres stores, the worker
  CLI, and Admin Lab; dropped the `derived_node_id AS concept_id` read-layer query aliases; and
  renamed the card-draft citation key `sourceBlockId → passageId` (including the model-facing
  forced-tool schema) because a generated card's grounding passage is not a source block. Legitimate
  asserted `concept_id` fields (Concept, CEP, anchor projection, scaffolded anchors) were left intact.
  Amended ADR-0025 with the two-identity model (`derived_node_id` = recall subject, `card_id` = item),
  the append-only log, the one-outcome-per-node invariant (kept as atomic write + per-node unique key,
  no new outcome table), and the deferred cross-enrichment learner identity. Pure identifier change:
  the single DB migration was already on `derived_node_id`, so no schema change. Declined the review's
  suggestions to add a `card_generation_outcomes` table and to remove the synthetic learner simulator
  (already behind a port and already deferred per "keep deferred methods deferred").
- **Learner recall loop and adaptive path (2026-06-19 to 2026-06-20).** Built the learner-neutral Card Bank,
  append-only Response Log, `EXPERIMENT_ONLY` mastery fold, synthetic learner seeding, Admin Lab inspection path,
  and adaptive projection. Extended cards and response rows to the full Derived Graph Layer so `source_mentioned`
  and `llm_grounded` Enrichment Nodes can be recall-tested. Latest real-use evidence:
  `tmp/2026-06-20-multitarget-loop/`.
- **No-card frontier fallback persisted and exercised live (2026-06-20).** Made a derived node the card generator
  cannot recall-test a durable fact: new `rejected_cards` table written in the same transaction as an enrichment's
  cards (delete-then-insert replacement; runs even at 0 surviving cards), `RejectedCard` moved to `domain-core`,
  `CardBankStorePort.persist` reshaped to `{ graphVersionId, enrichmentId, configHash, cards, rejected }`, and the
  card-bank artifact bumped `card_bank.v2 → v3` with the JSON_TABLE view following. The Admin Lab path-coverage view
  now reads the persisted rejection reason instead of guessing from grounding origin. Triggered the fallback live:
  live `generate-cards` over a real `source_mentioned` node whose grounding was set to the genuine verbatim-floor
  `failed` state rejected it ("no usable grounding passages"), the adaptive frontier advanced straight to that
  cardless node, and the real coverage SQL surfaced the persisted reason beside carded `generated`/`source_cep`
  steps. Closes the previously 3×-deferred no-card live-trigger gap. Evidence:
  `tmp/2026-06-20-rejected-card-persistence/`.
- **Card provenance and learner-loop validation hardening (2026-06-20).** Reran the teachable-cards validation
  with a real LiteLLM key, reset the DB, extracted all six manifest sources, published/enriched graph version
  `4e6c56a6-...` / `41b80e67-...`, generated 50/50 cards with honest source/generated provenance, and confirmed
  adaptive pruning over enrichment-node response rows. Evidence: `tmp/2026-06-20-teachable-cards-rerun/`.
- **Optional Typed Assertion simplification (2026-06-19).** Measured `explicit-prerequisite-hint` with a disposable
  real LiteLLM A/B and removed it after the edge set stayed identical. `defines` is now the sole Optional Typed
  Assertion; prerequisite prose remains ordinary CEP mention evidence consumed by exhaustive Graph Enrichment.
  Evidence: `tmp/2026-06-18-prerequisite-hint-ab/`.
- **Learner-neutral intrinsic difficulty and F3 removal (2026-06-18).** Replaced the `dag-depth-mock` port with
  `intrinsic-fused-v1`, recorded the learner-calibrated difficulty deferral in ADR-0024, and removed the failed
  F3 densification experiment from live code and ADR-0019. F1 prerequisite ordering had already passed over
  biology, economics, and InstructKG; F3 v1 proposed 0 bridges and v2 had no domain-neutral trigger worth keeping.
  Evidence: `tmp/2026-06-18-intrinsic-difficulty/`, `tmp/2026-06-17-f1-enrichment-eval/`.
- **Structure-aware CEP evidence retrieval (2026-06-18).** Added deterministic, capped structural neighborhoods
  for CEP extraction: mention blocks, adjacent extractable body blocks, same-`headingPath` siblings, then
  label/alias blocks. The verbatim floor stayed unchanged. InstructKG incomplete CEPs improved 9 to 3; remaining
  low-value heading/citation-like definitions are now TODO #1. Evidence:
  `tmp/2026-06-18-structure-aware-neighborhood/`.
- **Evidence-backed admission, rescue, and ungroundable-core policy (2026-06-16 to 2026-06-17).** Added
  definition-bearing treatment to core admission, carried verified evidence into CEP extraction without bypassing
  the port, gated `source_mentioned` rescue with a drop-only measured durability judge, surfaced provenance pressure
  in Admin Lab, and changed incomplete-core handling from run failure to optional demotion with loud quality issues.
- **Evaluation-first roadmap reset and domain-neutral extraction cleanup (2026-06-16).** Rebuilt the roadmap from
  real mixed-domain runs instead of method-stack preference, normalized the manifest-backed fixture batch, fixed the
  enrichment anchor projection persistence collision, removed fixture-derived model-facing prompt calibration, and
  added run-scoped quality issues for inspection.
- **Post-reset graph architecture baseline.** The reset architecture now admits atomic Concepts, publishes
  source-grounded CEPs with zero asserted edges, builds graph versions explicitly from selected runs, derives
  prerequisite structure only in Graph Enrichment, keeps learner state downstream, and exposes the current surfaces
  through Admin Lab, RDF export, native ingestion, and Gate 2 Docling PDF ingestion.

## VALIDATION

Latest change (2026-06-20) is the **adapted-graph comparison view + full-manifest difficulty evaluation**:

- **Static/unit:** `packages/application` 151/0 for the current suite, including `classifyAdaptedNodes` coverage
  for AE1/AE2 classification, threshold boundary, uncertain-edge exclusion, shared-helper frontier parity with
  `selectFrontierTarget`, empty frontier, and mastered-over-ready precedence. `apps/admin-lab` 30/0, including U2
  pure-helper coverage (`dedupeEnrichmentScopes`, `summarizeResponseSources`, `buildMasteryMap`) and U3
  overlay view-model coverage (neutral unchanged, adapted tagging + single frontier mark, cardless in both
  representations, null-difficulty preserved, R5 node-set equivalence). `apps/admin-lab` typecheck clean after U5
  page wiring. Page composition remains un-unit-tested by local convention; U5 uses the DB-bound loader and was
  verified by the same real-use path as U6.
- **Real-use:** full-manifest graph version `c40fe70d-17ff-451c-995f-ff28d40660c6` and enrichment
  `223cfb32-47a2-4488-a61a-561f6673f717` were produced with real LiteLLM calls. The run persisted 50/50
  `intrinsic-fused-v1` difficulties across all five manifest domains. Inspection result:
  `EXPERIMENT_ONLY` for intrinsic ordering — broadly plausible chains in every domain, but concentrated broad/thin
  distortions remain and learner-calibrated difficulty is still data-blocked. Evidence:
  `tmp/2026-06-20-intrinsic-difficulty-full-manifest/rule-14-evaluation.md`.

Prior change (2026-06-20) is the **derived-node identity naming cleanup** — a deterministic identifier
refactor (no behavior change), so it is verified statically, not by a new rule-14 real-use run:

- **Static/unit:** full workspace typecheck green (exit 0); unit suites green where DB-free — domain-core,
  application 144/0, litellm, rdf-export, ingestion, admin-lab 19/0; eslint 0 errors (2 pre-existing
  unrelated warnings). Postgres integration suite re-run against a live DB (2026-06-20): 19/19 pass, 0 fail,
  0 skipped — covering both `PostgresLearnerLoopStores` (cards, append-only `response_log`, `rejected_cards`
  replacement) and `PostgresStores` (transactional CEP run persistence, zero-edge snapshot, enrichment
  round-trips). The identity rename was pure TS field changes over unchanged SQL columns, and the live
  round-trip confirms the write and `JSON_TABLE` read paths still match the on-disk schema.
- **Real-use:** unchanged. The loop's last real-use quality status remains the 2026-06-20 `PASS` /
  `EXPERIMENT_ONLY` evaluation below; a rename does not alter model output.

Prior real-use validation (2026-06-20) is the **no-card frontier fallback persistence + live-trigger rule-14 evaluation**
(`tmp/2026-06-20-rejected-card-persistence/rule-14-evaluation.md`):

- **Static/unit:** full workspace suite green — domain-core 16/0, ingestion 9/0, litellm 35/0, rdf-export 2/0,
  Postgres integration 19/0 (incl. the new rejected-card persistence + replacement test on live Postgres),
  application 144/0, admin-lab 19/0; eslint clean on changed files (one pre-existing unrelated warning). Real LLM
  access via `kg-*` LiteLLM aliases (the `.env` key).
- **Real-use:** live `generate-cards` over four clean 3-node enrichments produced 15/15 cards, 0 natural rejections
  (confirming the generator cards ~100%). A faithful verbatim-floor failure on a real `source_mentioned` node
  (`Borrowing`, enrichment `65aca80d-…`) then produced a real rejection ("no usable grounding passages") persisted
  to `rejected_cards`; the adaptive frontier advanced to that cardless node, and the actual coverage SQL returned the
  no-card step with the persisted reason beside carded `generated`/`source_cep` steps.
- **Inspection result:** `PASS` for the durable closure (rejections are now persisted and honestly surfaced instead
  of vanishing to console) and the live read-path demonstration. The loop overall stays `EXPERIMENT_ONLY`
  (uncalibrated learner model). No `FIX_FIRST` defect. Caveat: a *spontaneous* model-driven rejection remains rare
  and was triggered here via a faithful construction of the real failure mode.

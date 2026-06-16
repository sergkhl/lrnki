# 2026-06-16-002 — Domain-neutral extraction prompts + AGENTS guardrail + run-scoped quality-issue records

## Context

The production extraction prompts have been quietly **overfit to specific fixtures/benchmarks**.
Model-facing text — both system prompts in `extractionAdapters.ts` and the forced-tool-schema
`description` fields in `toolSchemas.ts` — encodes the *expected answers* for the Rust Book ownership
fixture, the MLE-bench method paper, a Wealth-of-Nations economics chapter, an ed-tech KG paper, and a
DNA-replication source. This inflates those benchmarks' scores while violating the project's core
contract — a **learner-neutral, domain-general** concept graph (AGENTS rule 3, CONTEXT.md) — and it
hides the real recall/precision defects instead of fixing their root cause.

A full sweep (verified against the live tree, not just the uploaded zip) found the hacks are denser
than the first pass caught. They fall into two functionally different kinds that need different fixes:

- **Calibration / answer-key text** — encodes the expected *outcome* for a known fixture. Pure
  overfitting. Delete, or keep the abstract rule and strip the fixture exemplar.
- **Structural-mechanic examples** — teach the model *how to perform an operation* (split a conflated
  candidate, domain-qualify a vague label, recognise a long-but-valid concept label). These have real
  instructional value; replace the fixture exemplar with an **abstract domain-neutral placeholder**
  rather than deleting (decision below).

Goal: (1) restore domain-neutral prompts, (2) add an AGENTS rule forbidding this class of hack and
requiring root-cause surfacing instead, (3) add **run-scoped quality-issue records** so the degradation
we accept now is captured as inspectable evidence.

### Decisions taken with the user
- **Immediate scope** = neutralize prompts + AGENTS rule + `ExtractionQualityIssue` records. **No
  targeted-repair tool yet** (roadmap) — avoids rebuilding benchmark-fitting through a new path before
  issues are understood.
- **Structural-mechanic examples** = **swap for abstract placeholders** (e.g. `'A and B' -> a_and_b__a`),
  not delete and not another real domain.
- **Grep guard** = **one-time manual sweep this PR**; a permanent guard, if ever wanted, must be limited
  to project-fixture proper nouns only (never generic words like `stack`/`sql`/`drop`), to avoid a
  brittle lexical veto (AGENTS rule 16).
- **Validation** = measure degradation with one real Rust extraction run (rules 13/14); ship with an
  explicit caveat.

### Accepted trade-off
Neutralization will most visibly degrade the **Rust fixture** — the same fixture the paused
`feat/derived-layer-prerequisite-enrichment` branch validates U5 against. That degradation is the
point: it surfaces where the prompt was doing the model's job. Expect that branch to need its own
root-cause recall fix afterward rather than relying on the calibrated prompt.

---

## Part A — Neutralize model-facing prompts

Two files only. Everything else flagged across the repo (`domain-core/index.ts:71` comment,
`trustTier` enum, tests, fixtures, ADRs) is non-model-facing and stays. `extractionAdapters.ts:165` is
a code comment ("dropped fail-closed") — leave it.

### A1 — DELETE (calibration the generic rules already cover) — `extractionAdapters.ts`
- **L123** — `'Ownership' may be core; 'Owner' … 'Clone' and 'drop' …` role/operation calibration.
  The generic L116/L117 ("a mechanism or operation is not automatically optional…", "use 'optional'
  for real evidence-supported knowledge…") already carry this.
- **L124** — "Rust ownership calibration" sentence (Copy trait / Stack / Heap / String / Drop / clone).
- **L208** — "Calibration examples:" (ownership/move + DNA replication/isotopes/band positions).
- **L209** — "Sparse-source calibration: in a Rust ownership lesson…".
- **L210** — "Redundancy calibration for that same lesson…" (Stack/heap, String type, drop/clone).

### A2 — GENERIC-IZE (keep the rule, strip the fixture exemplar) — `extractionAdapters.ts`
- **L105** — keep the source-role test; replace the CS/DB list (merge sort, recursion, DP, greedy, SQL
  clauses, FOREIGN KEY, PRIMARY KEY, referential integrity) with a neutral statement: a concept whose
  home field is a *different* discipline, appearing only as sample/example/benchmark/evaluation
  material, is `out_of_domain_illustration`.
- **L109, L202, L478** — replace "Division of Labour Limited by the Extent of the Market" with a
  generic subject–relation–object illustration ("X is/depends on/is limited by Y" → demote, keep the
  underlying noun phrase).
- **L199, L211** — keep the "retain established domain concepts even when the source uses/baselines
  them" rule; remove the named MLE-bench concepts (Monte Carlo Tree Search, Evolutionary Search,
  AutoML, Overfitting) and "Operator Set as Bottleneck to Performance"; describe the class generically
  (algorithm/method/model/named phenomenon/technique with accepted field meaning).
- **L203** — keep the generic graph-role rule (`Concept`, `Node`, `Edge`, `Relationship` are generic,
  not project fixtures → may stay); drop `'Educational Concept'` and the method-paper framing.
- **L204** — keep the narrow illustrative-demotion rule; remove the `'Dynamic Programming' / 'Greedy
  Algorithms' / §5 case-study graph` exemplar or replace with a neutral "case-study-only node" phrasing.
- **L408, L411** — replace `'MLE-bench lite' is not 'MLE-bench'` with a generic suffixed/qualified-variant
  example (a narrower/broader/suffixed form is not interchangeable with the requested subject).
- **L409–L410** — replace `'graph-based search framework'` / `'an agent'` negative example with a
  generic "anonymous noun does not identify a named subject" illustration.

### A3 — SWAP for abstract placeholder (structural-mechanic; per decision) — both files
- **`extractionAdapters.ts` L103** — atomic-split format: replace `'The stack and the heap' / 'Ownership
  and Functions'` and `stack_heap -> stack_heap__stack/__heap` with abstract placeholders, e.g.
  `'A and B' -> parent 'a_and_b' -> atoms 'a_and_b__a' and 'a_and_b__b'`.
- **`extractionAdapters.ts` L121, L212** — vague-label qualification: replace `'Move' -> 'Rust move
  semantics'` and the `'Ownership and Functions'` section-label example with a generic vague→domain-
  qualified pair that names no fixture (e.g. a generic vague label clarified by its declared domain),
  plus a generic section-style-label illustration.
- **`extractionAdapters.ts` L477** — concept-label positives: **keep** `'Right to Be Forgotten'` and
  `'Survival of the Fittest'` (generic, name no project fixture — exactly the allowed case), **remove**
  `'Monte Carlo Tree Search'` and `'AutoML'`.
- **`toolSchemas.ts` L32** — `candidateKey` example `'ownership'` → a generic slug (e.g. `'topic-x'`).
- **`toolSchemas.ts` L118** — `atomicKey` example `'stack_heap__stack' / 'stack_heap__heap'` →
  `'a_and_b__a' / 'a_and_b__b'`.
- **`toolSchemas.ts` L128** — `sourceRole` description: replace "a generic sorting algorithm or SQL
  query inside an educational-technology paper" with "a concept whose home field is a different
  discipline, appearing only as example/sample/benchmark/evaluation material".
- **`toolSchemas.ts` L467, L472** — `labelKind`/`underlyingNounPhrase` descriptions: replace the two
  fixture propositions with generic subject–relation–object illustrations.

### A4 — Bump the pipeline config hash (forces re-extraction; no stale cache)
- `apps/kg-worker/src/knowledgeGraphWorker.ts:40` — `PIPELINE_CONFIG_HASH` →
  e.g. `"cep-domain-neutral-prompts-v34"`.

### A5 — Manual hack-free sweep (verification aid, not a permanent gate)
Run the expanded denylist over the two files and eyeball each hit; the only acceptable remaining hits
are comments (e.g. L165 "dropped"). Do **not** wire this into CI (rule 16 — generic words like
`stack`/`sql`/`drop` would veto legitimate prose).
```
grep -RIniE \
"rust|ownership|copy trait|stack|heap|clone|drop|move semantics|ownership and functions|variable scope|dna|isotope|band position|monte carlo|evolutionary search|automl|overfitting|operator set|mle-bench|graph-based search|division of labour|foreign key|primary key|referential integrity|merge sort|recursion|dynamic programming|greedy algorithms|sql|educational concept" \
packages/infrastructure-litellm/src/extractionAdapters.ts \
packages/infrastructure-litellm/src/toolSchemas.ts
```

---

## Part B — AGENTS.md rule 17 (Task 2)

Add after rule 16, cross-referencing rules 3/13/14/16:

> **17. Keep extraction domain-neutral; never overfit prompts to fixtures or benchmarks.**
> Concept discovery, admission, Core Set Selection, CEP extraction, and all judge prompts — *including
> forced-tool-schema `description` fields, which are model-facing* — must express domain-neutral rubric
> language only. Do NOT inject fixture- or benchmark-specific calibration: named concepts from a known
> source, expected per-source outcomes, "this source should yield X" tuning, or exemplar lists drawn
> from a project fixture (e.g. Rust ownership terms, MLE-bench method names, a specific economics
> chapter title). Such hacks raise one benchmark's score while violating the learner-neutral,
> domain-general contract (rule 3) and hiding the real defect. When real-use output is wrong, do not
> patch the prompt with the fixture's answer: **surface the defect, record it as a run-scoped quality
> issue, and fix the root cause** — a generic rubric clause, a measured neural judge (rule 16), or an
> architectural change. Accepting temporary, explicitly-noted quality degradation while the root-cause
> fix is designed (rules 13–14) is preferred over a benchmark-fitting prompt. Generic illustrative
> phrasing and abstract placeholders that name no project fixture are allowed; fixture-derived
> exemplars are not.

---

## Part C — Run-scoped `ExtractionQualityIssue` records

A **deterministic, domain-neutral detector** over data the run already produces. No LLM call, no
fixture knowledge, **no veto** — records are `info`/`warning` notes only and never change
admission/publication decisions (consistent with rule 16). Every signal it needs already lives on
`RunCandidate.admission` (`tier`, `sourceRole`, `coreSelected`, `selectionReasonCode`, rationales) and
`RunEvidenceProfile.complete`, so the detector is a pure function over the run aggregate.

### `packages/domain-core/src/index.ts`
- Add `ExtractionQualityIssue` type:
  `{ stage, candidateKey?, conceptLabel?, issueType, severity: "info" | "warning", evidenceQuotes: string[], rationale: string }`.
- Add `qualityIssues: ExtractionQualityIssue[]` to `ExtractionRunResult` (≈L340).

### `packages/application/src/detectExtractionQualityIssues.ts` (new, pure)
- `status === "failed"` from a core concept lacking a complete CEP → `insufficient_source_treatment`.
- zero `core` concepts admitted → `possible_missing_core_concept` (core-poor source).
- candidate demoted by the admission-label judge → `possible_proposition_label`.
- candidate rejected with `sourceRole === "out_of_domain_illustration"` → `possible_out_of_domain_illustration` (info).
- always emit one `info` `generic_domain_neutral_prompt`: "fixture-specific calibration removed; inspect
  core-set omissions / redundant granularity before publishing" (the standing run note).

### `packages/application/src/executeExtractionRun.ts`
- Call `detectExtractionQualityIssues(runResult)` after assembling `runResult`; attach to `qualityIssues`.
- Bump artifact: `EXTRACTION_RUN_ARTIFACT_TYPE` `extraction_run.v5` → `.v6`,
  `EXTRACTION_RUN_SCHEMA_VERSION` `"5"` → `"6"`. Issues ride the existing JSONB artifact payload —
  **no DB migration** (the `artifact_versions.payload` is arbitrary JSONB; keeps the single migration,
  rule 8). No relational `extraction_quality_issues` table in this round (roadmap).

### `apps/admin-lab/src/app/admin/lab/runs/[runId]/page.tsx`
- Render `qualityIssues` from the run artifact in a small read-only "Quality issues" section (severity,
  stage, label, rationale, quotes). No mutation (rule 12).

### Tests
- Unit-test `detectExtractionQualityIssues` over hand-built `ExtractionRunResult` values (no LLM):
  core-poor run, failed-CEP run, proposition-demoted candidate.

---

## Roadmap (NOT this PR)

1. **Targeted repair tool** — `submit_admission_repair` with an allowed-action enum (`split`, `demote`,
   `rename_to_source_grounded_label`, `mark_out_of_domain`, `mark_proposition_label`, `keep_with_note`),
   run only on detector-flagged candidates; keep original + repaired decision for inspection
   (OAK+MEND-lite); gate behind a measured judge (rule 16).
2. **Queryable issue surface** — promote `qualityIssues` to a relational `extraction_quality_issues`
   table + JSON_TABLE read model once there is a measured need to aggregate across runs.
3. **Curated regression guard** — if wanted, a CI check limited to project-fixture proper nouns only.
4. **KB-backed generic rule retrieval** — only generalized rule IDs enter prompts, never raw fixture
   examples. Defer until a router/DAG move is justified by measurement.

---

## Verification (end-to-end)

1. **Static:** `pnpm --filter @lrnki/domain-core typecheck`,
   `pnpm --filter @lrnki/infrastructure-litellm typecheck`,
   `pnpm --filter @lrnki/application typecheck && pnpm --filter @lrnki/application test`.
2. **Manual hack-free sweep** (A5) — zero model-facing fixture hits; only comment hits remain.
3. **Real-use (rule 14), measured degradation:** fire one real Rust extraction run via the worker with
   the bumped `PIPELINE_CONFIG_HASH`. Compare against baseline run
   `0d6c6d67-d5bf-408f-9eba-29ed024eebd7` (core: Copy Trait, Move semantics, Ownership, Variable Scope).
   Record which core concepts survive and which `qualityIssues` fire.
4. **Admin Lab:** load the new run detail; confirm the Quality issues section renders.
5. **Note + docs:** write `tmp/dehack-prompt-quality-evaluation.md` (gitignored) with the rule-14
   evaluation block (milestone, fixture, before/after core set, defects, explicit caveat that
   Rust/MLE/economics recall may drop and is being gathered as issues for a root-cause fix). Update
   `docs/plans/TODO.md` VALIDATION + a COMPLETED entry. No ADR change — the neutral-prompt requirement
   is an AGENTS rule, not a durable architectural decision.

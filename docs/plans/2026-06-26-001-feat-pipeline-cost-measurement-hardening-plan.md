---
title: "feat: Harden and complete per-journey pipeline-cost measurement + ranked targets"
date: 2026-06-26
type: feat
status: ready
origin: docs/brainstorms/2026-06-26-pipeline-cost-measurement-hardening-requirements.md
depth: standard
---

# feat: Harden and complete per-journey pipeline-cost measurement + ranked targets

## Summary

The per-journey cost rollup ships and reads live, but two defects make it untrustworthy for the
deferred rule-21 optimization pass. (1) Inside enrichment, per-stage **wall-clock** is bracketed
under coarse composite names (`rescue-mint`, `dedup`) while the LLM calls inside self-tag their
**cost** with finer `STAGE_TAGS` names, so the report's stage-name join never meets — a stage shows
~150s of wall with no cost, and its real cost stages show cost with no wall. (2) The rollup is
structurally incomplete: study-item generation (the fourth operation) was never run for the measured
journeys, so its cost is unknown.

This plan reconciles the enrichment stage vocabulary onto one set of fine names, runs one
representative source end-to-end so the rollup is complete, and produces a ranked list of cost and
time targets as the handoff artifact for the optimization pass. It changes no prompts and ships no
cuts (origin KD1, AGENTS rule 21).

---

## Problem Frame

The deferred optimization was gated on "the rollup's evidence and a rule-21 best-practices pass"
(prior cost doc, KD4). Acting on the current evidence would mean optimizing against a lens that is
partly mis-attributed (the enrichment join) and partly blind (no `study_items` cost). The fix is
small and structural: the cost side of the join already expects fine stage names — `ENRICHMENT_STAGES`
in `packages/application/src/bottleneckReport.ts` lists all four rescue/mint fine names plus both
dedup fine names and omits the coarse `rescue-mint`/`dedup`. Only the **wall-clock bracketing** in
`runGraphEnrichment` keys to the coarse names. Reconciling the two halves onto the fine vocabulary
closes the join; running the existing `generate-study-items` operation closes the completeness gap.

**Who is affected:** the operator reading `journey-cost-report` and the Admin Lab bottleneck view
(both call the same `bottleneckReport` use-case), and the next engineer running the rule-21
optimization pass, who needs one clean complete baseline to measure before/after against.

---

## Key Technical Decisions

- **KTD1. Reconcile enrichment onto fine stage brackets, not coarse cost tags.** Replace the coarse
  `runStage("rescue-mint", …)` and `runStage("dedup", …)` wrappers with finer brackets keyed to the
  exact `STAGE_TAGS` names the inner LLM calls already emit (`missing-prerequisite-proposal`,
  `grounding-generation`, `rescue-durability`, `minting-durability`; and `node-embedding`,
  `node-merge-adjudication`). Preserves the granularity the cost side was built for (origin KD2),
  and `ENRICHMENT_STAGES` needs **no edit** — it already contains exactly these names.

- **KTD2. Same-name brackets sum but must never overlap; no schema change.** `operation_run_stages`
  has no unique constraint on `(operation_run_id, stage)`; each `enterStage` inserts a fresh row, and
  the timeline read + `bottleneckReport` accumulate `durationMs` per stage name (`bottleneckReport.ts`
  lines 125-129), so multiple brackets of one fine stage sum correctly. **The load-bearing
  invariant:** `completeStage` (and `recordProgress`) in `PostgresRunProgressReporter.ts` updates
  *every* open row matching `(operationId, stage, ended_at IS NULL)` with no `LIMIT` — so two
  brackets of the **same** name open concurrently would mis-pair (the first completion closes both).
  Therefore each unit brackets at a granularity that keeps same-name brackets non-overlapping: U1
  brackets per port call because `assembleEnrichmentNodes` is a sequential `await` loop (only one
  bracket of a given name open at a time); U2 brackets each dedup *phase* once because
  `deduplicateDerivedNodes` adjudicates via `mapWithConcurrency` at `adjudicationConcurrency = 4`
  (KTD3). No migration, no `STAGE_TAGS`/`ENRICHMENT_STAGES`/`EXTRACTION_STAGES` change (greenfield,
  AGENTS rule 8).

- **KTD3. Thread the stage-bracket function into the helpers at the safe granularity.** Pass the
  existing `runStage` bracket (from `bracketStage`) into `assembleEnrichmentNodes` and
  `deduplicateDerivedNodes`. In `assembleEnrichmentNodes` (sequential), wrap each port-call site with
  its fine stage name; the per-anchor proposal→judge→grounding interleaving and the minting budget
  logic are unchanged — only the timing envelope moves inward. In `deduplicateDerivedNodes`, wrap the
  whole PROPOSE (embedding) phase in one `node-embedding` bracket and the whole DECIDE
  (`mapWithConcurrency` adjudication) phase in one `node-merge-adjudication` bracket — **not** per
  call, because adjudication runs concurrently and per-call same-name brackets would overlap (KTD2).
  Whole-phase wall-clock is the correct attribution for a concurrent batch, and cost still joins
  because each call's LiteLLM tag carries the fine name regardless of the wall-clock envelope.

- **KTD4. Fix `dedup` alongside `rescue-mint`.** Dedup is on by default in `enrich-graph-version`, so
  a clean baseline reproduces the identical wall-without-cost defect on the dedup stages. Same
  mechanism, same change, so R1 ("no enrichment stage shows time without its cost or cost without its
  time") holds generally rather than for one path. Non-LLM brackets (`symbolic-disposal`, `persist`)
  are deliberately left wall-only — they incur no LLM cost and are designed to sit out the cost half
  of the join (`runProgressReporter.ts` lines 20-23); they are not join failures.

- **KTD5. Ranked targets are a tested pure function behind a `--ranked` flag.** Compute the ranked
  cost and wall-clock target lists in the application layer as a pure function over the existing
  `BottleneckReport`, exposed through a `--ranked` flag on the report commands and recorded under
  `tmp/` for the baseline. Durable and reusable: the optimization pass measures before/after and a
  ranked share view is exactly what it re-reads. No app-side cost computation or storage — the
  function derives shares from the already-joined live numbers (prior doc KD5).

- **KTD6. The baseline is a fresh end-to-end run of the `c2e28622` source.** The existing journey's
  enrichment timeline already holds the *old* coarse `rescue-mint` rows; the join fix only affects new
  runs. So the clean baseline is a fresh extraction → minting → enrichment → `study_items` run with
  the fixed code on the same representative source, recorded as the handoff artifact (origin KD4).

---

## High-Level Technical Design

The defect and the fix are a stage-name alignment. Today the two halves of the join key to different
vocabularies; the fix moves the wall-clock bracket inward to the names the cost tags already use.

```
BEFORE (join fails on stage name)
  wall-clock (operation_run_stages)        cost (LiteLLM /SpendLogs tags)
  ────────────────────────────────         ──────────────────────────────
  rescue-mint .............. 151.7s   ⋈    missing-prerequisite-proposal .. $cost
     (coarse bracket)         (no cost)     grounding-generation ........... $cost
                                            rescue-durability .............. $cost
                                            minting-durability ............. $cost
  dedup .................... NNs            node-embedding ................. $cost
     (coarse bracket)         (no cost)     node-merge-adjudication ........ $cost
  → rescue-mint/dedup: wall, no cost   → fine stages: cost, no wall   (NEVER JOIN)

AFTER (one fine vocabulary on both halves)
  missing-prerequisite-proposal  wall + cost   ✓ joins
  grounding-generation           wall + cost   ✓ joins
  rescue-durability              wall + cost   ✓ joins
  minting-durability             wall + cost   ✓ joins
  node-embedding                 wall + cost   ✓ joins
  node-merge-adjudication        wall + cost   ✓ joins
  (ENRICHMENT_STAGES already lists exactly these — cost side unchanged)
```

Ranked-target derivation (KTD5) is a pure read over the completed report:

```
rankBottleneckTargets(report) ->
  byCost:  [(operationType, stage, costUsd, costShare, calls, tokens, wallMs)] desc by costUsd
  byWall:  [(operationType, stage, wallMs, wallShare, calls, tokens, costUsd)] desc by wallMs
  shares computed against report.total.costUsd / report.total.wallClockMs
```

*(Directional guidance for reviewers, not implementation specification.)*

---

## Requirements Traceability

| Origin requirement | Where addressed |
| --- | --- |
| R1 — one enrichment stage vocabulary (wall ⋈ cost) | U1 (rescue/mint), U2 (dedup) |
| R2 — complete rollup, all four operations incl. `study_items` | U4 (run); no code change — lineage already includes the `study_items` ref |
| R3 — one representative source run end-to-end, baseline recorded | U4 |
| R4 — ranked cost + time target list (operation, stage) with shares | U3 (function + flag), U4 (recorded baseline) |
| AE1 — rescue path joins, no `rescue-mint` wall-only row | U1 |
| AE2 — complete journey, four operations, `study_items` non-null | U4 |
| AE3 — stages rank by cost share and wall-clock share | U3, U4 |

---

## Implementation Units

### U1. Fine-grained rescue/mint stage brackets

**Goal:** Replace the coarse `rescue-mint` wall-clock bracket with fine brackets keyed to the four
`STAGE_TAGS` names the inner LLM calls already emit, so each rescue/mint stage carries both its
wall-clock and its cost under one name.

**Requirements:** R1, AE1.

**Dependencies:** none.

**Files:**
- `packages/application/src/runGraphEnrichment.ts` — remove the `runStage("rescue-mint", …)` wrapper
  (around line 214); pass the `runStage` bracket into `assembleEnrichmentNodes`.
- `packages/application/src/enrichmentNodeMinting.ts` — accept the bracket function; wrap each port
  call site with its fine stage name (`STAGE_TAGS.missingPrerequisiteProposal` around
  `proposalPort.propose`, `STAGE_TAGS.rescueDurability` around the rescue durability judge,
  `STAGE_TAGS.mintingDurability` around the minting durability judge, `STAGE_TAGS.groundingGeneration`
  around `groundingPort.generate`).
- `packages/application/src/runGraphEnrichment.test.ts` — update for the new bracket vocabulary.
- `packages/application/src/enrichmentNodeMinting.test.ts` — assert per-stage bracketing (create if
  absent; otherwise extend).

**Approach:** Thread the bracket (KTD3) rather than re-batching the assembly. The per-anchor
proposal→judge→grounding loop stays sequential, so wrapping each port call individually is safe and
the timeline sums durations per fine stage name (KTD2). Verbatim-floor and budget logic are
untouched. The bracket retains `bracketStage`'s failure semantics — a throw in any wrapped call marks
the operation `failed` and leaves a readable timeline, identical to today.

**Patterns to follow:** the existing `runStage(STAGE_TAGS.prerequisiteOrdering, …)` and
`runStage(STAGE_TAGS.intrinsicDifficulty, …)` brackets already in `runGraphEnrichment.ts`; the
`bracketStage` factory in `runProgressReporter.ts`.

**Execution note:** Start with a failing assertion that no rescue/mint stage in the persisted/fake
timeline has wall-clock while its cost stage has none — the join-alignment property is the contract.

**Test scenarios:**
- Covers AE1. A run exercising the rescue+mint path (proposal + grounding ports provided) records
  timeline stages named `missing-prerequisite-proposal`, `grounding-generation`, `rescue-durability`,
  `minting-durability`, and records **no** `rescue-mint` stage.
- Each of the four fine stages, when its calls run, shows non-null wall-clock; a fake reporter
  capturing `enterStage`/`completeStage` confirms one bracket per port call.
- Multiple calls to the same fine stage within one run (e.g. grounding across several anchors) each
  open and close a distinct stage row (sequential, never overlapping).
- Anchor-only run (proposal/grounding ports omitted): no rescue/mint brackets emitted, behavior
  byte-identical to today (the `if (missingPrerequisiteProposal && groundingGeneration)` guard).
- A thrown port call (e.g. forced-tool budget exhausted) closes its fine stage `ok:false` and marks
  the operation `failed`.

**Verification:** A real or faked enrichment run's timeline contains the four fine rescue/mint stage
names and no `rescue-mint`; the suite asserting the join-alignment property passes.

---

### U2. Fine-grained dedup stage brackets

**Goal:** Apply the same reconciliation to the dedup sub-stage so `node-embedding` and
`node-merge-adjudication` each carry both wall-clock and cost, since dedup runs by default in the
baseline.

**Requirements:** R1.

**Dependencies:** U1 (shares the `runGraphEnrichment.ts` bracket-threading edit; sequence after to
avoid overlap).

**Files:**
- `packages/application/src/runGraphEnrichment.ts` — remove the `runStage("dedup", …)` wrapper
  (around line 266); pass the bracket into `deduplicateDerivedNodes`.
- `packages/application/src/deduplicateDerivedNodes.ts` — accept the bracket; wrap the whole PROPOSE
  (per-domain `embedding.embed`) phase in one `STAGE_TAGS.nodeEmbedding` bracket and the whole DECIDE
  (`mapWithConcurrency` adjudication, line 119) phase in one `STAGE_TAGS.nodeMergeAdjudication`
  bracket. **Not** per call — adjudication runs at `adjudicationConcurrency = 4` and per-call
  same-name brackets would overlap and mis-pair (KTD2/KTD3).
- `packages/application/src/deduplicateDerivedNodes.test.ts` — assert exactly one `node-embedding`
  row and one `node-merge-adjudication` row per run (create or extend).

**Approach:** Mirror U1's intent (fine names that join), but bracket at the *phase* level because the
adjudication loop is concurrent. The dedup pass embeds per domain (recall) then adjudicates proposed
pairs concurrently (precision); one bracket around each phase yields the phase's wall-clock under the
two `STAGE_TAGS` names already listed in `ENRICHMENT_STAGES`, while each call's LiteLLM tag carries
the cost. Opt-in behavior (both dedup ports must be provided) is unchanged.

**Patterns to follow:** U1; the existing `onDedupSummary` reporting seam (the application reports,
the worker formats — no console I/O added here).

**Test scenarios:**
- Covers R1. A run with both dedup ports provided records exactly one `node-embedding` stage and one
  `node-merge-adjudication` stage, each with non-null wall-clock, and **no** `dedup` stage.
- With adjudication concurrency > 1 and multiple proposed pairs, the single
  `node-merge-adjudication` bracket opens once and closes once (no overlapping same-name rows that
  `completeStage` would close together) — the persisted duration is the whole concurrent batch's
  wall-clock, not a corrupted partial.
- Dedup-disabled run (`ENRICH_DISABLE_DEDUP` / ports omitted): no dedup brackets emitted, behavior
  unchanged.
- A per-domain embedding failure (surfaced via `onUnavailable`) still closes the single
  `node-embedding` bracket; an adjudicator throw inside the phase does not strand an open stage row.

**Verification:** A dedup-on run's timeline shows the two fine dedup stages and no `dedup`; the
dedup-off path is unchanged.

---

### U3. Ranked-target derivation and `--ranked` report mode

**Goal:** Produce the ranked list of cost targets and time targets — each an (operation, stage) pair
with its share of the journey total and its driver (calls, tokens, wall-clock) — as a tested pure
function exposed through a `--ranked` flag.

**Requirements:** R4, AE3.

**Dependencies:** none (operates on the existing `BottleneckReport` shape).

**Files:**
- `packages/application/src/rankBottleneckTargets.ts` — new pure function
  `rankBottleneckTargets(report: BottleneckReport): { byCost: RankedTarget[]; byWall: RankedTarget[] }`.
- `packages/application/src/rankBottleneckTargets.test.ts` — new.
- `packages/application/src/index.ts` — export the function and `RankedTarget` type (mirror how
  `bottleneckReport` is exported).
- `apps/kg-worker/src/knowledgeGraphWorker.ts` — handle `--ranked` in `journeyCostReportCommand` and
  `bottleneckReportCommand`; add a `renderRankedTargets` printer; update the usage string.

**Approach:** The function flattens every operation's stage rows into `(operationType, stage, costUsd,
wallClockMs, calls, tokens)` entries, drops stages with null cost from the cost ranking and null wall
from the wall ranking, sorts each descending, and computes `costShare = costUsd / total.costUsd` and
`wallShare = wallClockMs / total.wallClockMs`. Domain-neutral — it names (operation, stage) targets
and shares only; it reads no concept content and touches no prompt (origin R4, AGENTS rule 17). The
flag is additive: `--ranked` renders the two ordered lists; `--json` continues to emit the raw
report; absent flags render the existing table. `--ranked --json` emits the ranked structure as JSON
for recording.

**Patterns to follow:** the existing `renderBottleneckTable` printer and the `flags.includes("--json")`
branch in `bottleneckReportCommand`/`journeyCostReportCommand`.

**Test scenarios:**
- Covers AE3. Given a report with known per-stage cost and wall, `byCost` is ordered by `costUsd`
  descending and `byWall` by `wallClockMs` descending, with shares summing to ~1.0 across non-null
  stages.
- A stage with cost but null wall appears in `byCost` and is excluded from `byWall` (and vice versa).
- Cost-unavailable report (`costAvailable: false`, all cost null): `byCost` is empty, `byWall` still
  ranks by wall-clock — no divide-by-null, no throw.
- Single-operation operation-scoped report ranks within that operation; journey-scoped report ranks
  across all four operations' stages.
- Empty report (no stages) yields two empty lists.

**Verification:** `worker:kg journey-cost-report <enrichmentId> --ranked` prints a cost-ranked and a
wall-ranked list of (operation, stage) rows with shares; the pure-function suite passes.

---

### U4. Run and record the clean complete baseline

**Goal:** Run the representative `c2e28622` source end-to-end with the fixed code through study-item
generation, producing one coherent journey whose rollup includes all four operations, and record the
ranked baseline as the optimization-pass handoff artifact.

**Requirements:** R2, R3, R4, AE2, AE3.

**Dependencies:** U1, U2, U3.

**Files:**
- `tmp/2026-06-26-pipeline-cost-baseline/` — recorded `journey-cost-report … --json` and
  `--ranked --json` outputs plus a short notes file (gitignored `tmp/`, AGENTS rule 10). No source
  changes.

**Approach:** With the dev LiteLLM stack running, execute the existing per-operation worker commands
in sequence on the chosen source (origin "Outside this work": no orchestration runner — reuse the
commands): `run-extraction` → `build-graph-version` → `enrich-graph-version` (dedup on, default
ports) → `generate-study-items` on the new enrichment id. Then read the journey live:
`journey-cost-report <enrichmentId>`, `--ranked`, and `--json`, recording all under `tmp/`. Confirm
the rollup lists four operations, that `study_items` shows non-null wall-clock and cost, and that no
enrichment stage shows wall without cost or cost without wall. This unit also satisfies AGENTS rule 14
(real-use quality evaluation after a behavior-changing milestone) — a green unit suite is not the
evidence; the live report is.

**Execution note:** This is an operational run, not a code change. If the chosen source's enrichment
yields no rescue/mint or dedup activity, pick a mixed-domain source that exercises both so AE1 is
actually demonstrated.

**Test scenarios:** `Test expectation: none — operational baseline run; verified by inspecting the
live `journey-cost-report` output (four operations, joined enrichment stages, non-null `study_items`),
not by an automated test.`

**Verification:** `tmp/2026-06-26-pipeline-cost-baseline/` contains the recorded baseline; the live
report shows four operations with the `study_items` operation non-null and every enrichment LLM stage
joined; the ranked lists name the top cost target and top time targets in order.

---

## Scope Boundaries

### Deferred to Follow-Up Work

- None — this plan is self-contained.

### Deferred for later (from origin)

- The actual cuts — admission payload scoping, prerequisite-ordering / rescue-mint latency,
  study-item cost reduction. Each gets its own rule-21 root-cause pass gated on this baseline.
- Learner-loop *runtime* cost measurement (per-interaction answer grading); keyed by learner state,
  not journey lineage.
- A window / all-runs aggregate cost view.

### Outside this work (from origin)

- Pipeline orchestration — a single end-to-end journey runner or workflow engine. The baseline uses
  the existing per-operation worker commands in sequence.
- Any app-side cost computation or storage; cost stays read-live.
- Any prompt or provider tuning; the list names targets, it does not act on them.

---

## Risks & Mitigations

- **Overlapping same-name brackets would corrupt the sum.** `completeStage`/`recordProgress` update
  *every* open row matching the stage name (no `LIMIT`), so two concurrently-open brackets of one
  name mis-pair — the first completion closes both. This is real in the dedup path: adjudication runs
  via `mapWithConcurrency` at `adjudicationConcurrency = 4`. *Mitigation (KTD2/KTD3):* bracket each
  granularity to keep same-name brackets non-overlapping — U1 per call (sequential `await` loop, one
  name open at a time) and U2 once per *phase* (one bracket spanning the whole concurrent adjudication
  batch). A U2 test asserts exactly one open/close pair per dedup phase. The K-draw ordering path is
  already wrapped in a single `prerequisite-ordering` bracket and is out of scope here.
- **Baseline source exercises neither rescue/mint nor dedup.** Then AE1 is not demonstrated.
  *Mitigation:* U4 execution note requires a mixed-domain source that triggers both; verify from the
  enrichment summary lines (`minting: accepted=…`, `dedup: merges=…`) before recording.
- **LiteLLM `/SpendLogs` unavailable during the baseline run.** The report degrades to wall-only
  (`costAvailable: false`) and the cost ranking is empty. *Mitigation:* U3 handles this without
  throwing; re-run the report once spend logs are reachable to record the complete baseline.

---

## Dependencies / Assumptions

- Builds on the completed per-journey-pipeline-cost work and the ADR-0029 substrate (`operation_runs`
  / `operation_run_stages`, the Postgres timeline reader, the `bottleneckReport` use-case, and
  `LiteLlmSpendLogsReadAdapter`).
- "Loops generation" == study-item generation (ADR-0026); `OperationType = extraction | minting |
  enrichment | study_items`. The journey lineage in `bottleneckReport` already includes the
  `study_items` ref, so running the operation is sufficient for completeness — no rollup code change.
- `ENRICHMENT_STAGES` and `EXTRACTION_STAGES` require no edit: they already list every fine name this
  plan brackets to, and never listed the coarse `rescue-mint`/`dedup`.
- Greenfield: no migration for already-persisted `operation_run_stages` rows (AGENTS rule 8); the old
  `c2e28622` enrichment's coarse rows simply age out, which is why U4 is a fresh run.

---

## Sources / Research

- `packages/application/src/bottleneckReport.ts` — the stage-name join, `stageBelongsToOperation`, and
  the `ENRICHMENT_STAGES` / `EXTRACTION_STAGES` sets (lines 157-188); per-stage `durationMs` sum
  (lines 125-129).
- `packages/application/src/runGraphEnrichment.ts` — coarse `rescue-mint` bracket (line 214) and
  `dedup` bracket (line 266).
- `packages/application/src/enrichmentNodeMinting.ts` — the sequential rescue/mint assembly and its
  four port calls.
- `packages/application/src/runProgressReporter.ts` — `bracketStage` factory and the non-LLM stage
  rationale (lines 20-23).
- `packages/domain-core/src/index.ts` — `STAGE_TAGS` (lines 1360-1386) and `isStageTag`.
- `packages/infrastructure-postgres/src/PostgresRunProgressReporter.ts` and
  `PostgresOperationTimelineRead.ts` — fresh-row-per-`enterStage`, no unique constraint, per-row
  duration in SQL.
- `apps/kg-worker/src/knowledgeGraphWorker.ts` — `journey-cost-report` / `generate-study-items` /
  `enrich-graph-version` commands and `renderBottleneckTable`.
- `docs/brainstorms/2026-06-26-pipeline-cost-measurement-hardening-requirements.md` — origin.

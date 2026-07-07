---
title: "fix: expedition generation latency and operation-run liveness"
type: fix
date: 2026-07-07
origin: conversation 2026-07-07 (TODO item 1; no separate brainstorm; requirements inline below).
  User decisions — admin extraction pipeline out of scope; one-off cleanup of operation_runs
  history approved (rule 9); deepseek-v4-pro vetoed for pipeline use (config cost cap).
---

# fix: expedition generation latency and operation-run liveness

## Summary

A topic expedition costs ~$0.05 of LLM spend but makes the learner wait **~8–9 minutes**; the
Operations page additionally shows phantom `running` operations that are hours dead. Measured
2026-07-07 against live `operation_run_stages` + `LiteLLM_SpendLogs` (recent succeeded runs):

| Contributor | Wall-clock / run | Root cause |
| --- | --- | --- |
| study-items stages (lesson 74s, blueprint 25s, option-select 44s, matching 71s, impostor 123s) | ~337s | per-node loop runs at `DEFAULT_STUDY_ITEM_CONCURRENCY = 1`; the bounded-concurrency seam exists but no learner-path caller raises it |
| prerequisite-ordering | ~108s | max of K=8 already-parallel draws on `gpt-oss-120b` (~55s avg/call) — a tail-latency problem, not a concurrency one |
| knowledge-boundary-probe | ~54s | K=10 measured necessary 2026-07-07 (K=5 caught 3/10 fabricated); **not** a cut candidate |
| phantom `running` rows | n/a | a killed process can never write its terminal status; nothing reaps `operation_runs` (7 stuck rows now, some >5h) |

Problem classes (rule 21): **bounded-concurrency fan-out** over independent per-node units
(already the codebase's own pattern — `conceptConcurrency: 4`), **tail-latency model selection**
for max-of-K sampling, and **lease/heartbeat orphan detection** — the standard job-queue reaper the
expedition store already implements for `learner_expeditions` but `operation_runs` lacks.

Out of scope by user decision: the admin extraction pipeline (admission/discovery latency), and
all cost *optimization* — per-expedition spend is cents, the probe (60% of enrichment cost) is
measured-necessary at K=10, and prefix caching for extraction is already solved. Cost is recorded
in evidence, never tuned here. `deepseek-v4-pro` is excluded as an ordering candidate: the config's
own registration comments cap production learner-generation traffic at $0.50/M output and pro is
$0.87/M; the contradictory "OPEN: test deepseek-v4-pro" note on the ordering alias is stale and is
deleted by this plan (rule 18).

---

## Problem Frame and Requirements

Decided in conversation (2026-07-07); this section owns them until completion.

- **R1 — Study-item generation fans out per node.** `DEFAULT_STUDY_ITEM_CONCURRENCY` rises from 1
  to 4 (matching the synthetic pipeline's `conceptConcurrency: 4`), so all five type-major stages
  parallelize through the existing `mapWithConcurrency` seam. One default for every caller — the
  learner root and the worker CLI — no per-root override added (rule 18: the byte-identical
  transition rationale on the constant is superseded and rewritten).
- **R2 — Orphaned `operation_runs` are reaped.** A `running` row whose heartbeat is older than the
  shared stale window is marked `failed` by a sweeper invoked from the expedition supervisor tick,
  next to `failExhaustedGenerating`. Self-healing property preserved: `completeOperation` has no
  `completed_at IS NULL` guard, so a falsely-reaped live run overwrites its status at completion.
- **R3 — One staleness rule.** The "stale after 2 minutes without heartbeat" fact currently exists
  four times (supervisor constant, two UI inline predicates, the store's SQL predicate). One
  exported constant + predicate in `@lrnki/application` becomes the single TypeScript source; the
  three TS sites import it and the reaper reuses it. (Architecture-deepening review Candidate 5,
  executed here because R2 needs the rule.)
- **R4 — One-off history cleanup (rule 9, user-approved).** Delete `failed` operation_runs rows
  (and their stage rows) plus the current phantom `running` rows — including the hand-backdated
  test residue where `last_progress_at` precedes `started_at`. Succeeded history is kept for
  reports. No UI pagination work (ADR-0011 minimal).
- **R5 — Measured ordering-model experiment, fail-safe to the incumbent.**
  `openrouter/qwen/qwen3-235b-a22b-2507` (already registered as the candidate prerequisite judge,
  $0.09/$0.10 per Mtok) is evaluated as the `kg-prerequisite-ordering` backing model. Gate order:
  (a) empirical forced tool_choice verification per the forced-tool-choice reference practice;
  (b) offline K=8 whole-set ordering comparison vs `gpt-oss-120b` on at least two existing derived
  layers across domains — edge agreement with the incumbent's consensus DAG, contested-pair rate,
  cycle-routing rate, and wall-clock. The alias flips only if quality holds at parity; if it
  loses, the incumbent stays, the ~108s is accepted, and the result is recorded so the candidate
  is not re-proposed. `deepseek-v4-pro` is not a candidate (user decision; config cost cap).
- **R6 — Domain-neutral evaluation (rule 17).** The ordering comparison judges structural
  agreement metrics and inspected rationales, never fixture-expected edges.
- **R7 — Rule-14 gate on the real learner path.** A fresh topic expedition end-to-end after the
  changes, with before/after bottleneck reports (wall-clock, calls, tokens, cost per stage) and
  real-output inspection of generated items/lessons — concurrency must change timing only, never
  content quality.

Acceptance examples:

- **AE1:** A fresh expedition's `study_items` operation shows all five LLM stages with materially
  lower wall-clock than the 2026-07-07 baseline (~337s), with per-node outputs passing the same
  guards and human inspection finding no quality regression.
- **AE2:** Kill a generation process mid-run; within one supervisor tick after the stale window
  the operation row is `failed`, and the Operations page shows no phantom `running` card and stops
  auto-refresh polling.
- **AE3:** Changing the stale window means editing exactly one constant; supervisor relaunch, both
  UI badges, and the reaper all move together (the store SQL either derives from it or carries the
  binding comment).
- **AE4:** The ordering experiment produces a written comparison table; the alias flip (or the
  decision not to flip) cites it. The stale pro OPEN comment is gone from `litellm/config.yaml`.

---

## Key Technical Decisions

- **KTD1 — Raise the default, don't thread a new knob.** The concurrency seam was landed with
  default 1 purely for byte-identical rollout; the metering pass (TODO validation trail
  `tmp/2026-06-30-generation-metering/`) already showed bounded per-node concurrency reduces
  wall-clock without changing cost ownership. Value 4 mirrors the probe stage's proven
  `conceptConcurrency` against the same LiteLLM proxy (which already sustains 20 concurrent probe
  draws). If the rule-14 gate shows provider 429-driven retries, drop to 2 before adding any
  machinery.
- **KTD2 — Reaper lives behind the store seam the supervisor already drives.** No new scheduler:
  the supervisor tick (kept alive by the Operations page auto-refresh and learner polling) gains
  one sweep call. The sweep is a single SQL UPDATE (`status='failed', completed_at=now()` where
  `status='running'` and heartbeat stale) — same lease-expiry shape as
  `failExhaustedGenerating`. It must not touch rows the fenced expedition claim protocol owns
  beyond marking the *timeline* row; expedition retry semantics are unchanged.
- **KTD3 — One stale window, 2 minutes.** The supervisor claim/fail predicate already uses 2
  minutes against a 30s heartbeat (4 missed beats). The reaper adopts the same constant rather
  than inventing a second "really dead" window; a false positive is visible, terminal-state
  self-healing (R2), and preferable to a second hand-synced number.
- **KTD4 — Ordering experiment is offline-first and alias-only.** `PrerequisiteOrderingPort` and
  its adapter are untouched; the candidate is exercised through the existing
  `kg-prerequisite-ordering` alias mechanics (a temporary experiment alias), so the production
  path never sees the candidate until the gate passes. The swap, if it happens, is one
  `model_group_alias` line.
- **KTD5 — Probe stays exactly as calibrated.** K=10 / threshold 0.89 / temp 0.7 shipped
  yesterday with a measured ladder; no latency work touches the probe in this plan.

## High-Level Technical Design

Everything rides existing seams. R1 is one constant + comment rewrite in
`packages/application/src/generateStudyItemBank.ts`. R2/R3 add one application-owned staleness
module (constant + predicate), one store/reporter sweep method implemented as a single autocommit
UPDATE in `packages/infrastructure-postgres`, and one call in
`apps/admin-lab/src/lib/topicGenerationSupervisor.ts`; the two UI predicates
(`operations/page.tsx`, `GenerationProgressCard.tsx`) and the supervisor constant switch to the
shared import. R4 is a one-off SQL cleanup, run manually and recorded in evidence. R5 is a
config-and-measurement unit: verify forced tool_choice, run the offline comparison via the
existing `kg-worker` enrichment path against review data, then flip (or decline to flip) the
alias and delete the stale pro comment.

## Implementation Units

### U1. Baseline capture

Before any change: run one fresh topic expedition on the current tree, capture ranked
`bottleneck-report` / `journey-cost-report` output (wall-clock, calls, tokens, cost per stage) to
`tmp/2026-07-07-expedition-latency/baseline/`. This is the comparison anchor TODO item 1 requires.

### U2. Study-item concurrency default (R1)

`DEFAULT_STUDY_ITEM_CONCURRENCY` 1 → 4; rewrite the constant's rationale comment (the
byte-identical transition note is superseded). No caller changes. Unit tests asserting order
preservation already exist via `mapWithConcurrency`.

### U3. Shared staleness rule + operation-run reaper (R2, R3)

Export the constant + predicate from `@lrnki/application`; convert the three TypeScript sites;
bind or derive the store SQL. Add the sweep (single UPDATE, autocommit handle, same style as
`PostgresRunProgressReporter`) and invoke it from the supervisor tick. Test through fakes like the
existing claim/fail predicates.

### U4. One-off history cleanup (R4)

Manual SQL against the dev DB: delete failed operation_runs + stages, reap current phantom
running rows. Record the executed statements and row counts in the evidence dir.

### U5. Ordering-model experiment (R5, R6)

Verify forced tool_choice on `qwen3-235b-a22b-2507` empirically; run the K=8 offline comparison on
two existing derived layers; write the comparison table. On parity: flip
`kg-prerequisite-ordering`, restart `lrnki-litellm` (alias-edit gotcha), and note the model change
in the enrichment config identity if the enrichment config hash convention requires a bump. On
loss: keep `gpt-oss-120b` and record the negative result here and in the LiteLLM config comment.
Either way: delete the stale `OPEN: test deepseek-v4-pro` note (rule 18).

### U6. Rule-14 real-use gate (R7)

Fresh topic expedition end-to-end on the changed tree. Evidence: before/after ranked bottleneck
reports, inspected real study items/lessons from the concurrent run, the AE2 kill-and-reap check,
and an Operations page pass showing no phantom actives. PASS criteria: AE1–AE4.

## Validation

- Deterministic envelope: workspace typecheck; `@lrnki/application`, `@lrnki/infrastructure-postgres`,
  and `apps/admin-lab` tests green.
- Real-use gate (rule 14): U6 evidence under `tmp/2026-07-07-expedition-latency/`; a green suite is
  not quality evidence (ADR-0013).

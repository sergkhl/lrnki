---
date: 2026-06-25
topic: run-observability-and-progress
---

# Run Observability and Progress

## Summary

Give every triggered pipeline operation — Extraction Run, Graph-Version Build (minting),
and Enrichment Run (including study-item generation) — a durable, sub-stage-resolved
**run-stage timeline** in authoritative relational state. One substrate serves two
consumers: a live progress signal the operator client reads so it can tell a long
operation is advancing and not hung, and a per-stage speed measurement joined to LiteLLM's
per-stage cost so bottlenecks are locatable. The first target is extraction, which takes
over ten minutes on a single small document today. The timeline is operation-agnostic and
externally driven, so a future single durable processing workflow (Temporal, Restate, or
similar — engine not yet chosen) can drive it without a rewrite.

## Problem Frame

The authoritative run state is coarse and non-live. `extraction_runs.status` is only
`running | succeeded | failed` with a `started_at`; the enrichment run record is the same
shape. A client polling that status sees `running` for the full ten-plus minutes of an
extraction with no way to distinguish "still progressing" from "hung or failed" — the exact
failure mode that makes the current latency a development blocker rather than just slow.

Per-stage *timing* exists only in-process and only for enrichment (its `onStageTiming`
callback); extraction records a single whole-run `latencyMs`. Per-stage *cost and tokens*
are already collected authoritatively by the LiteLLM proxy, which persists every request's
token/cost/start/end to `LiteLLM_SpendLogs` keyed by a stable per-stage tag
(`STAGE_TAGS`). Nothing joins the two signals, and nothing surfaces either back to an
operator. So today there is no repeatable way to answer "which stage is the bottleneck, in
wall-clock and in dollars" — which is the prerequisite to any rule-21 root-cause fix of the
slow extraction.

Both asks bottom out in the same missing thing: a persisted, sub-stage-resolved run
timeline with timestamps. Progress reporting is a live read of it; bottleneck measurement
is a projection of it joined to LiteLLM cost.

## Key Decisions

- **Per-operation timelines, not a unifying pipeline object.** Extraction, minting, and
  enrichment+study-items stay separate triggered operations (the ADR-0017 split is
  deliberate). Each gets the *same* stage-timeline model; the client stitches them into a
  "where is my document" view by reading them in sequence. A single end-to-end pipeline run
  is explicitly deferred.

- **Liveness needs a heartbeat, not a richer status enum.** A terminal status cannot show
  motion during a long stage. The timeline carries a current sub-stage label plus a
  monotonically updated `last_progress_at`, advanced as items within a stage complete (for
  example "admission 7/20"), so the client distinguishes slow progress from a stall.

- **Speed and cost come from different sources joined on one key.** Wall-clock comes from
  the persisted in-process stage timestamps — the only source that sees non-LLM work
  (Docling ingestion, DB writes, embedding batches). Cost and tokens come from LiteLLM,
  read by stage tag. The application records time and the stage tag only and never computes
  or stores a cost figure; LiteLLM stays the single source of cost.

- **The timeline is operation-agnostic and externally driven.** Progress is recorded
  through one small seam each operation reports into, not logic buried in each call stack.
  This is the seam a future durable workflow engine plugs into. We do not build, choose, or
  specify that engine now; we only avoid precluding it.

- **Durable, because the surface continuously changes a live decision.** Unlike a
  throwaway measurement harness (rule 11), this substrate is the operator's live
  abort/wait signal on every run, so it earns persistence rather than being disposable.

## Requirements

- **R1 — Persisted stage timeline.** Each triggered operation records its sub-stages in
  authoritative relational state with per-stage start and end timestamps, a current
  sub-stage, terminal disposition, and a `last_progress_at` heartbeat. Exact schema shape
  (stage-event log vs mutable current-stage row) is a planning decision; the constraint is
  relational and authoritative (rule 7).

- **R2 — Shared stage model across operations.** Extraction, minting, and
  enrichment+study-items report through one uniform stage vocabulary. Where a sub-stage
  issues LLM calls, its stage identifier aligns with the existing `STAGE_TAGS` so cost and
  wall-clock join on the same key; non-LLM sub-stages (ingestion, persistence) are timed
  too even though LiteLLM never sees them.

- **R3 — Intra-stage heartbeat.** Long stages that iterate over items update
  `last_progress_at` and an item progress count as items complete, so liveness is visible
  without waiting for a stage boundary.

- **R4 — Live progress read-model.** A read-only inspection projection (ADR-0027 port)
  exposes each operation's current stage, heartbeat, and per-stage timing to the client.
  Admin Lab renders it as a "where is this operation, is it moving" view. No published graph
  state is mutated.

- **R5 — Bottleneck report.** A repeatable report joins per-stage wall-clock (from the
  persisted timeline) with per-stage cost and tokens (from LiteLLM `/spend/tags`, projected
  onto the `STAGE_TAGS` vocabulary so LiteLLM's auto-emitted User-Agent pseudo-tags are
  excluded) into one per-stage view: calls, tokens, cost, wall-clock. It is operable as a
  standing surface, not a one-off pull.

- **R6 — No app-level cost capture.** The application records time and stage tags only. It
  must not compute, infer, or persist any cost figure; cost is read from LiteLLM at report
  time.

- **R7 — Externally-driven seam.** Operations report progress through a single injected
  reporting seam rather than embedding progress writes inline, so the substrate can later be
  driven by a durable workflow engine without changing operation logic.

## Scope Boundaries

### In scope

- Durable per-operation stage timeline (R1–R3).
- Live operator progress in Admin Lab (R4).
- Standing speed-and-cost bottleneck report (R5).

### Deferred for later

- A single user-triggered end-to-end "process this document through to study items"
  pipeline run that spans all operations as one journey.
- Adopting a durable workflow engine (Temporal, Restate, or similar). Engine choice is not
  made here; the design only keeps the seam open.
- The actual root-cause fix of slow extraction. It follows once the instrument names the
  bottleneck and gets its own rule-21 pass.

### Outside this work

- Learner-facing progress UI. This signal is operator/ingestion-facing.
- Any app-level cost computation or storage.

## Dependencies and Assumptions

- LiteLLM already persists per-request token/cost/timing to `LiteLLM_SpendLogs` and exposes
  it via `/spend/tags`; the shape `{individual_request_tag, log_count, total_spend}` was
  confirmed against a prior pull. The report depends on this remaining available.
- The `STAGE_TAGS` vocabulary remains the stable join key. Adding a stage means adding a tag
  and a matching timeline stage in the same change.
- The client for now is Admin Lab; these operations are operator-triggered, not
  learner-initiated.
- Operations currently run in `apps/kg-worker`; progress is assumed reported from there as
  the operation executes.

## Success Criteria

- During a slow extraction, the operator can see the current sub-stage advance and a
  heartbeat update, and can tell progress from a stall without reading logs.
- For any completed operation, a per-stage report shows wall-clock and cost side by side,
  and the extraction bottleneck is attributable to specific sub-stages.
- Non-LLM stages (ingestion, persistence) appear in the wall-clock view even though they
  carry no LiteLLM cost.
- Adopting a durable workflow engine later requires driving the existing reporting seam, not
  reworking how operations record progress.

## Outstanding Questions

- Persistence shape for the timeline: append-only stage-event log vs mutable current-stage
  row with per-stage durations. Resolved in planning.
- Sub-stage granularity per operation: default to the natural `STAGE_TAGS` boundaries plus
  an item counter for the heartbeat, unless a finer split proves necessary to locate the
  extraction bottleneck.
- Whether the bottleneck report is a read-model surfaced in Admin Lab alongside R4 or a
  separate operator script; both satisfy R5, the choice is cost vs convenience at planning
  time.

# Plans

This directory indexes live coordination and ready or in-progress implementation plans. Plan
lifecycle, retention, and validation rules live in
[AGENTS.md](../../AGENTS.md#documentation-workflow).

## Live coordination

- [TODO](./TODO.md) — current tasks, grouped completed outcomes, and the latest plan-less validation.
- [BLOCKERS](./BLOCKERS.md) — unresolved manual actions required from the user only.

## Active implementation plans (execution order)

1. [2026-08-23-001 — Cut Over Topic Expedition Generation to DeepSeek Flash and Measure Stage Value](./2026-08-23-001-cut-over-topic-expedition-generation-to-deepseek-flash.md)
   — **Completed and consolidated; delete next.** Detailed evidence is committed and durable status
   is re-homed. Delete this plan in its own commit before entering the successor.

2. [2026-08-23-002 — Deepen Source-less Grounding Context and Answer Correlation](./2026-08-23-002-deepen-source-less-grounding-and-answer-correlation.md)
   — **Ready; U0 next.** Supply batch-owned identity context, make answer correlation structural,
   and qualify Topic, Graph Enrichment, and Support Step consumers before latency resumes.

3. [2026-08-22-001 — Restore Topic Expedition Generation to Seven Minutes](./2026-08-22-001-repair-topic-expedition-generation-latency.md)
   — **Blocked in U3 (`FIX_FIRST`).** The bounded pipeline and shared stage profile are complete,
   but widths 8, 12, and 16 missed the latency/quality contract. Resume only after the deepening
   successor supplies a successful, fully inspected quality baseline.

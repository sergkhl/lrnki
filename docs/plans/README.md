# Plans

This directory indexes live coordination and ready or in-progress implementation plans. Plan
lifecycle, retention, and validation rules live in
[AGENTS.md](../../AGENTS.md#documentation-workflow).

## Live coordination

- [TODO](./TODO.md) — current tasks, grouped completed outcomes, and the latest plan-less validation.
- [BLOCKERS](./BLOCKERS.md) — unresolved manual actions required from the user only.

## Active implementation plans (execution order)

1. [2026-08-23-002 — Deepen Source-less Grounding Context and Answer Correlation](./2026-08-23-002-deepen-source-less-grounding-and-answer-correlation.md)
   — **In progress; U0–U1 complete, U2 next.** Batch-owned identity context reaches Grounding
   Generation and answer correlation is now an exact key-indexed provider object behind the
   unchanged ports. Qualify every exact served route next, then run affected consumers.

2. [2026-08-22-001 — Restore Topic Expedition Generation to Seven Minutes](./2026-08-22-001-repair-topic-expedition-generation-latency.md)
   — **Blocked in U3 (`FIX_FIRST`).** The bounded pipeline and shared stage profile are complete,
   but widths 8, 12, and 16 missed the latency/quality contract. Resume only after the deepening
   successor supplies a successful, fully inspected quality baseline.

# Plans

This directory indexes live coordination and ready or in-progress implementation plans. Plan
lifecycle, retention, and validation rules live in
[AGENTS.md](../../AGENTS.md#documentation-workflow).

## Live coordination

- [TODO](./TODO.md) — current tasks, grouped completed outcomes, and the latest plan-less validation.
- [BLOCKERS](./BLOCKERS.md) — unresolved manual actions required from the user only.

## Active implementation plans (execution order)

1. [2026-08-23-003 — Unify Source-less Grounding on DeepSeek](./2026-08-23-003-unify-source-less-grounding-on-deepseek.md)
   — **In progress; U0 complete, U1 next.** The clean pre-cutover source/config and loaded-router
   inventory are frozen. Give all three Source-less Grounding consumers one operation-neutral
   topology: DeepSeek produces source-less nodes and Grounding, MiMo answers and judges, and GPT-OSS
   plans/challenges/orders; implement the primary-route candidate before any provider draw or reload.

2. [2026-08-23-002 — Deepen Source-less Grounding Context and Answer Correlation](./2026-08-23-002-deepen-source-less-grounding-and-answer-correlation.md)
   — **On hold; U0–U1 complete.** Identity context and exact-key answer correlation are committed.
   Plan 003 supersedes the preserved-assignment matrix and owns all remaining qualification and
   consolidation handback.

3. [2026-08-22-001 — Restore Topic Expedition Generation to Seven Minutes](./2026-08-22-001-repair-topic-expedition-generation-latency.md)
   — **Blocked in U3 (`FIX_FIRST`).** The bounded pipeline and shared stage profile are complete,
   but widths 8, 12, and 16 missed the latency/quality contract. Resume only after the deepening
   successor supplies a successful, fully inspected quality baseline.

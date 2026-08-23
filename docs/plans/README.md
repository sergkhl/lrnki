# Plans

This directory indexes live coordination and ready or in-progress implementation plans. Plan
lifecycle, retention, and validation rules live in
[AGENTS.md](../../AGENTS.md#documentation-workflow).

## Live coordination

- [TODO](./TODO.md) — current tasks, grouped completed outcomes, and the latest plan-less validation.
- [BLOCKERS](./BLOCKERS.md) — unresolved manual actions required from the user only.

## Active implementation plans (execution order)

1. [2026-08-23-001 — Cut Over Topic Expedition Generation to DeepSeek Flash and Measure Stage Value](./2026-08-23-001-cut-over-topic-expedition-generation-to-deepseek-flash.md)
   — **In progress; U2 complete, U3 real-use sample next.** All seven scoped aliases are loaded and
   attributed to the exact DeepInfra/Xiaomi/Novita topology. Reset only the local application data,
   run the four bounded KTD5 expeditions, and inspect every descriptor output and learner asset.

2. [2026-08-22-001 — Restore Topic Expedition Generation to Seven Minutes](./2026-08-22-001-repair-topic-expedition-generation-latency.md)
   — **Blocked in U3 (`FIX_FIRST`).** The bounded pipeline and shared stage profile are complete,
   but widths 8, 12, and 16 missed the latency/quality contract and production-model remediation
   trials failed. U4 remains gated behind the DeepSeek cutover's evidence and the resulting final
   pipeline-shape decision.

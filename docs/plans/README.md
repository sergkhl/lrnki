# Plans

This directory indexes live coordination and ready or in-progress implementation plans. Plan
lifecycle, retention, and validation rules live in
[AGENTS.md](../../AGENTS.md#documentation-workflow).

## Live coordination

- [TODO](./TODO.md) — current tasks, grouped completed outcomes, and the latest plan-less validation.
- [BLOCKERS](./BLOCKERS.md) — unresolved manual actions required from the user only.

## Active implementation plans (execution order)

1. [2026-08-23-001 — Cut Over Topic Expedition Generation to DeepSeek Flash and Measure Stage Value](./2026-08-23-001-cut-over-topic-expedition-generation-to-deepseek-flash.md)
   — **Blocked in U2; owner route-contract decision required.** No exact MiMo route passed the
   required-parameter filter, the DeepSeek fallback stayed unavailable, and the no-seed diagnostic
   did not clear the incompatibility. Follow [the owner blocker](./BLOCKERS.md) before more calls;
   no runtime route changed.

2. [2026-08-22-001 — Restore Topic Expedition Generation to Seven Minutes](./2026-08-22-001-repair-topic-expedition-generation-latency.md)
   — **Blocked in U3 (`FIX_FIRST`).** The bounded pipeline and shared stage profile are complete,
   but widths 8, 12, and 16 missed the latency/quality contract and production-model remediation
   trials failed. U4 remains gated behind the DeepSeek cutover's evidence and the resulting final
   pipeline-shape decision.

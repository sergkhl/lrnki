# Plans

This directory indexes live coordination and ready or in-progress implementation plans. Plan
lifecycle, retention, and validation rules live in
[AGENTS.md](../../AGENTS.md#documentation-workflow).

## Live coordination

- [TODO](./TODO.md) — current tasks, grouped completed outcomes, and the latest plan-less validation.
- [BLOCKERS](./BLOCKERS.md) — unresolved manual actions required from the user only.

## Active implementation plans (execution order)

1. [2026-08-23-001 — Apply the ADR Audit Without Changing ADR-0006 or Cross-Family Rules](./2026-08-23-001-apply-adr-audit.md)
   — **In progress; U4 next.** Concept Canonicalization, deterministic artifact replay,
   application-owned Operation Timeline membership, Processing Journey lineage, and the generated
   operation constraint are locally and database verified; the audited durable documentation
   boundaries are repaired. Next, run the production-model semantic canonicalization and local
   replay gate without changing Model Assignments, ADR-0006, or cross-family rules.

2. [2026-08-22-001 — Restore Topic Expedition Generation to Seven Minutes](./2026-08-22-001-repair-topic-expedition-generation-latency.md)
   — **Blocked in U3 (`FIX_FIRST`).** The bounded pipeline and shared stage profile are complete,
   but widths 8, 12, and 16 missed the latency/quality contract and production-model remediation
   trials failed. U4 is gated behind the ready DeepSeek cutover and pipeline-simplification
   follow-up.

Shaping, not yet a plan:
[2026-08-08-002 — DeepSeek Flash generation cutover and pipeline simplification](../brainstorms/2026-08-08-002-generation-model-evaluation.md)
records the decided model direction; its interview must settle stage removal/combination and the
remaining independent judge before a ready implementation plan exists.

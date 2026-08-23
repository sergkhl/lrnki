# Plans

This directory indexes live coordination and ready or in-progress implementation plans. Plan
lifecycle, retention, and validation rules live in
[AGENTS.md](../../AGENTS.md#documentation-workflow).

## Live coordination

- [TODO](./TODO.md) — current tasks, grouped completed outcomes, and the latest plan-less validation.
- [BLOCKERS](./BLOCKERS.md) — unresolved manual actions required from the user only.

## Active implementation plans (execution order)

1. [2026-08-23-001 — Apply the ADR Audit Without Changing ADR-0006 or Cross-Family Rules](./2026-08-23-001-apply-adr-audit.md)
   — **Ready; U1 next.** Extract Concept Canonicalization into an immutable replay input, make the
   application catalog the sole Operation Timeline membership owner, and correct the audited durable
   documentation boundaries without changing Model Assignments, ADR-0006, or cross-family rules.

2. [2026-08-22-001 — Restore Topic Expedition Generation to Seven Minutes](./2026-08-22-001-repair-topic-expedition-generation-latency.md)
   — **Blocked in U3 (`FIX_FIRST`).** The bounded pipeline and shared stage profile are complete,
   but widths 8, 12, and 16 missed the latency/quality contract and production-model remediation
   trials failed. U4 is gated; the next move requires the owner-gated Grounding Generation scope
   decision in [BLOCKERS](./BLOCKERS.md).

Shaping, not yet a plan:
[2026-08-08-002 — Generation model evaluation](../brainstorms/2026-08-08-002-generation-model-evaluation.md)
needs a planning interview; change scope and judge independence remain unresolved.

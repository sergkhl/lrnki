# Plans

This directory indexes live coordination and ready or in-progress implementation plans. Plan
lifecycle, retention, and validation rules live in
[AGENTS.md](../../AGENTS.md#documentation-workflow).

## Live coordination

- [TODO](./TODO.md) — current tasks, grouped completed outcomes, and the latest plan-less validation.
- [BLOCKERS](./BLOCKERS.md) — unresolved manual actions required from the user only.

## Active implementation plans (execution order)

1. [2026-08-24-001 — Test a Same-Call Grounding Identity-Scope Audit](./2026-08-24-001-test-grounding-identity-scope-audit.md)
   — **In progress; U0–U1 complete, U2 next.** The same-call audit contract is implemented without
   activation and every frozen interface/config boundary passes deterministic checks. The fixed
   three-by-three direct matrix is next; one material scope defect ends the candidate and reopens the
   Grounding Generation Model Assignment decision.

2. [2026-08-23-003 — Unify Source-less Grounding on DeepSeek](./2026-08-23-003-unify-source-less-grounding-on-deepseek.md)
   — **On hold; U0–U3 and U5 complete, U4 remains `FIX_FIRST`.** Exact routes and the repository gate
   pass, but the first required Topic consumer exposed context-narrowed Grounding that independent
   verification correctly rejected. Resume the remaining U4 matrix only after the 2026-08-24
   experiment's direct matrix and first production-composed Topic operation pass.

3. [2026-08-23-002 — Deepen Source-less Grounding Context and Answer Correlation](./2026-08-23-002-deepen-source-less-grounding-and-answer-correlation.md)
   — **On hold; U0–U1 complete.** Identity context and exact-key answer correlation are committed.
   Plan 003 supersedes the preserved-assignment matrix and owns all remaining qualification and
   consolidation handback.

4. [2026-08-22-001 — Restore Topic Expedition Generation to Seven Minutes](./2026-08-22-001-repair-topic-expedition-generation-latency.md)
   — **Blocked in U3 (`FIX_FIRST`).** The bounded pipeline and shared stage profile are complete,
   but widths 8, 12, and 16 missed the latency/quality contract. Resume only after the deepening
   successor supplies a successful, fully inspected quality baseline.

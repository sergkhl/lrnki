# Plans

This directory indexes live coordination and ready or in-progress implementation plans. Plan
lifecycle, retention, and validation rules live in
[AGENTS.md](../../AGENTS.md#documentation-workflow).

## Live coordination

- [TODO](./TODO.md) — current tasks, grouped completed outcomes, and the latest plan-less validation.
- [BLOCKERS](./BLOCKERS.md) — unresolved manual actions required from the user only.

## Active implementation plans (execution order)

1. [2026-08-10-001 — Repair the 320 dp native Support Path flow](./2026-08-10-001-repair-320dp-native-support-path-flow.md)
   — in progress; the exact-action and final one-tap flow positives pass, while the isolated
   dialog-collapse negative control and restoration pass remain.
2. [2026-08-10-002 — One-tap e2e sign-in for the native Maestro rig](./2026-08-10-002-one-tap-e2e-signin-gate.md)
   — in progress; U1–U3 are closed and U4 is implemented with current-build positives, but its
   authority and consolidation ride with plan 001 U2's negative-control re-run.

Shaping, not yet a plan:
[2026-08-08-002 — Generation model evaluation](../brainstorms/2026-08-08-002-generation-model-evaluation.md)
needs a planning interview; change scope and judge independence remain unresolved.

# Plans

This directory indexes live coordination and ready or in-progress implementation plans. Plan
lifecycle is adopted and overridden in [AGENTS.md](../../AGENTS.md#documentation-workflow), which
routes shared mechanics through the vendored
[`plan-lifecycle` skill](../../.agents/plugins/agent-workflow-core/skills/plan-lifecycle/SKILL.md).

## Live coordination

- [TODO](./TODO.md) — current tasks, grouped completed outcomes, and the latest plan-less validation.
- [BLOCKERS](./BLOCKERS.md) — unresolved manual actions required from the user only.

## Active implementation plans (execution order)

- [Simplify the Learner Runtime Around Directly Authored Expeditions](./2026-08-31-001-retire-model-generation-for-authored-expeditions.md)
  — In progress; U0 baseline and implementation history are preserved. Make directly authored documents
  the sole content authority, build one two-method learner runtime over one persisted aggregate, and
  atomically cut over before deleting generation-era architecture. **NEXT:** commit replacement
  coordination, then remove the abandoned plan standalone.

- [Expand Source Expedition Legs and Qualify Mixed Study Items](./2026-08-29-001-expand-source-expedition-legs-and-mixed-study-items.md)
  — Abandoned on 2026-08-31; superseded by the plan above. Retained only until the replacement
  plan's U0 deletes it in a commit of its own.

<!-- Lifecycle adoption and overrides: AGENTS.md → Documentation workflow. -->

---
name: plan-from-tasks
description: Explicit invocation only. Turn a list of tasks into a new implementation plan file under `docs/plans/` and register it in the ordered index. Use only when the current prompt names $plan-from-tasks or this skill path; never infer it from a task list, a defect screenshot, or a feature idea on its own.
disable-model-invocation: true
---

# From a task list to a plan

Produce **one** new plan file in `docs/plans/`, designed with the user rather than for them. The plan
is the deliverable; do not start implementing.

## Authorization boundary

Proceed only when the current user prompt explicitly names `$plan-from-tasks` or this skill path. A
task list, a defect screenshot, or a feature idea is the *subject* of this skill, never permission to
run it.

This skill writes a tracked plan file **and registers it** in `docs/plans/README.md`, `TODO.md` and
`BLOCKERS.md`. A repository that has not adopted that index has not asked for those files, and
creating them from an inferred trigger imposes a workflow its owner did not choose. Where the index
is absent, say so and describe what it would take, rather than starting one.

## 1. Find the facts yourself first

Before asking the user anything, answer what the environment can answer: the codebase, the database,
the git history, the running services. A question whose answer is in the repository is a question you
should not have asked. Read, in this order:

- `CONTEXT.md` — the ubiquitous language. Use these words in the plan; a plan that invents a synonym
  for an existing term has started a second vocabulary.
- `docs/adr/README.md` and the ADRs it links that touch this area. An ADR is a constraint, not a
  suggestion: a plan that contradicts one is proposing to supersede it and must say so explicitly.
- `docs/plans/README.md` and the linked plans — so the new work is placed against what is already
  ordered, and so you notice when it is really an extension of an open plan rather than a new one.

Read [`plan-lifecycle`](../plan-lifecycle/SKILL.md) for what a plan file owns and what it must not.

## 2. Grill the design

Run the [`grilling`](../grilling/SKILL.md) frontier loop: map the design tree, ask the whole current
frontier in one round with a recommended answer for each, wait, recompute the frontier, repeat. Do not
ask a question whose answer depends on another question still open in the same round.

Dispatch a sub-agent for facts you need mid-round rather than blocking the whole frontier on one
lookup. The decisions are the user's; the facts are yours.

## 3. Apply these standing constraints

They shape every recommended answer unless the user overrides one:

- **UX first, then durability, then low complexity.** Prefer the solution a user would notice was
  right over the one that is elegant internally.
- **Mock or skip anything that will not transfer to the final version.** Scaffolding that has to be
  removed later is cost with no residue.
- **Propose removing redundant modules.** If the work reveals something no longer carrying its weight,
  say so in the plan rather than routing around it.
- **Assume a hard reset is available for local development.** Do not design a migration path for local
  state that can simply be rebuilt; reserve migration effort for data that actually persists.

## 4. Write the plan

One file, named `docs/plans/YYYY-MM-DD-<short-kebab-summary>.md`. It owns its own problem framing,
requirements and scope, and links rather than restating what an ADR or `CONTEXT.md` already says.

Give it: a status header (≤15 lines), the problem and the intended outcome, the design and the
alternatives that were rejected and why, ordered implementation units with their acceptance criteria,
an empty `Validation Log`, and `Open findings: _None._`. Put the retention rules as a hygiene comment
at the top, so whoever appends sees them.

Then register it: add the index entry in `docs/plans/README.md` at the position its value per unit of
effort earns — or at the position the user names — and a `TODO.md` entry at its own altitude. Anything
only the owner can clear goes to `BLOCKERS.md` now, not later.

## 5. Stop

Confirm the shared understanding is reached and the plan is committed. Implementation is a separate
invocation — [`drain-plans`](../drain-plans/SKILL.md), or the repository's own worktree lane skill.

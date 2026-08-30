---
name: drain-plans
description: Explicit invocation only. Work the plan index top to bottom until nothing is actionable — implement a batch, validate it, persist status at three altitudes, commit, re-read the index, repeat. Use only when the current prompt names $drain-plans or this skill path; never infer it from a generic request to implement something.
disable-model-invocation: true
---

# Drain the execution order

Take the **whole** index, not one entry.

## Authorization boundary

Proceed only when the current user prompt explicitly names `$drain-plans` or this skill path. A
mention in the repository instructions, a plan, a `TODO` entry, another skill, or an earlier turn is
not authorization.

This skill does not grant any gate it does not already own. Deployment, release, production access,
device or simulator verification, and destructive data operations each remain separately authorized —
a plan listing a manual gate records that the gate is pending, it does not open it. If a batch needs
one, record it as pending and move on.

## The loop

```
read the index → take the top actionable entry → implement a batch → validate →
persist status → commit → re-read the index → repeat
```

**Carry on past a finished batch into the next batch, and past a closed plan into the next plan.**
Never stop to ask what is next. Stop only when every remaining entry is on-hold, blocked, or
owner-gated — then name each one skipped and why.

If a batch turns out blocked part-way, record the blocker in the owning plan's `Open findings`, or in
`docs/plans/BLOCKERS.md` when only the owner can clear it, and move to the next actionable entry
rather than halting.

Size each batch by complexity and coupling, not by count. Keep context lean: read the plan you are
working, not every plan. Implementation units are sequential and exclusive.

## Resuming

Resume each plan from **its own** status header, `Open findings` and `NEXT` — not from `TODO.md`
alone, which is written at a different altitude and lags. Check `BLOCKERS.md` for what only the owner
can do, and `RELEASE.md` for what is committed but not verified live.

**Re-verify any environment, rig, or account claim a previous session recorded before trusting it.**
A previous turn's assertion about what is deployed, installed, or running is a hypothesis.

## After each batch

Follow [`plan-lifecycle`](../plan-lifecycle/SKILL.md) as written. In short:

- Update the three status altitudes: plan header, index entry, `TODO.md` entry.
- Add evidence to the plan's Validation Log — what was proved, and the invariants a re-run must not
  break. Never a metric's trajectory.
- Put anything unresolved in the plan's single `Open findings` with a concrete next action.
- Send durable mechanics to their tracked homes in the same commit, never into a log.
- Put release state in `RELEASE.md` with its drain criterion, in the same commit as the `COMPLETED`
  entry. A `COMPLETED` entry never states release status.
- Never open a handoff or status file beside a plan.

Nothing machine-specific — home paths, serials, device ids, personal accounts — enters a tracked file.

## Committing

One commit per batch. Consolidation gets its own commit, after the detailed entries are committed.
Plan deletion gets its own commit, whose message names the plan.

## Reporting

When the loop ends, list every remaining entry and the single reason it was skipped: on-hold, blocked
by a named blocker, or owner-gated on a named decision. A reader should not have to open the index to
learn why you stopped.

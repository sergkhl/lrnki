---
name: plan-lifecycle
description: The conventions every other planning skill assumes — the ordered plan index, the TODO/RELEASE/BLOCKERS triad, who may write what, the exit test that closes a plan, and Validation Log retention. Use when reading or writing anything under docs/plans/, when a plan seems finished, when status has to be recorded in more than one place, or when setting this workflow up in a repository that does not have it yet.
---

# The plan lifecycle

A plan is the canonical design for one piece of work **only while that work is ready or in progress**.
It is not an archive, not a status report, and not a release record. It is deleted when its exit test
passes, and git history is the archive.

## The four files

| File | Holds | Empty state |
|---|---|---|
| `docs/plans/README.md` | The ordered execution index. Every plan file appears here, ordered by value per unit of effort. Blocked items keep their merit position and say so. | — |
| `docs/plans/TODO.md` | `TODO` (3–10 current workstreams), `COMPLETED` (rolling, ≤10 outcomes), `VALIDATION` (active plan-less work). Nothing else. | — |
| `docs/plans/RELEASE.md` | One line per change committed but **not yet verified live**, grouped by shipping surface, each with its drain criterion. | `_None._` |
| `docs/plans/BLOCKERS.md` | Unresolved manual actions only the owner can take. | `_None._` |

**Every plan file in the directory appears in the index.** A plan linked from nowhere is a bug, not an
archive — it stops being read while its work is still owed. Check the directory against the index
whenever a plan is added or deleted.

## Not every workstream gets a plan

Work that fits in one `TODO.md` entry stays there; opening a plan file for it only duplicates the
entry. Write a plan when the work needs design, phasing, or acceptance criteria that would not fit.
List plan-less work in the execution order by name, with no link. A `TODO` item that outgrows ~15
lines has earned a plan file.

## Three status altitudes, and they do not restate each other

The same status is written in the plan header (≤15 lines), the index entry (≤5 lines), and the
`TODO.md` entry (≤10 lines). Keep each at its own altitude. After every batch, update all three.

## Who may write what

- An ADR owns durable policy and its reasoning. A plan owns its own requirements and scope. Plans
  link rather than restate.
- A plan owns its verification state, in its own Validation Log. **Never open a separate handoff or
  status document beside a plan** — that is a third copy of the same facts, and a log in its own file
  only moves the growth somewhere nobody prunes.
- Durable mechanics — rig gotchas, operational procedure, code invariants — go to their tracked homes
  in the same commit that discovers them, with a pointer left in the log. A plan is deleted at
  completion; anything that should outlive it must not be living there when that happens.
- Nothing machine-specific — home paths, serials, device ids, personal accounts — enters a tracked
  file. Write the discovery step instead of the answer.

## Closing a plan

A plan is closed by its **exit test**, not by a deploy. Delete it when all three hold:

1. **Every durable fact has a tracked home.** Policy → an ADR; code invariants → the repository
   instructions or a test that fails without them; procedure → the relevant runbook or skill. A guard
   that explains itself when it fires is its own home.
2. **Everything a deployer still needs fits its `RELEASE.md` line**, including that line's drain
   criterion. If the remainder is a multi-step acceptance with a rig, criteria and a device, it does
   not fit, and the plan stays open **for that reason**, stated in its status line. "Unreleased" is
   never that reason.
3. **`Open findings` is `_None._`**, or every line has been re-homed to a `TODO.md` item in the same
   commit. Findings are not release state and `RELEASE.md` cannot hold them; deleting a plan with open
   findings loses them silently.

Deleting is a commit of its own, whose message names the plan. Retrieval is
`git log --diff-filter=D -p -- docs/plans/<plan>.md`.

**Never delete a plan that was never committed.** Commit the plan file first — even when the work is
already done — then delete it in a later commit. The same applies to any validation record: content
that exists nowhere in git history must not be deleted from anywhere.

## Release state

`RELEASE.md` owns release state and is the only place that does. It is a manifest, not a task list.
Every line names what a release operator deploys, verifies, or must not do, and nothing else belongs
there — not a resolved hazard, not a rationale an ADR already owns, not a docs-only commit that ships
nothing, not a count of how far behind a surface is.

- A `COMPLETED` entry is written when the work is **done**, not when it ships, and **never states
  release status**. The rolling window deletes that entry on schedule and the pending proof would go
  with it. Release state goes in `RELEASE.md` in the same commit as the `COMPLETED` entry.
- **Every line states its drain criterion**: the one observation that proves the change is live and
  correct. Without it, only the author knows when the line may go — which is what keeps finished plans
  open.
- **A drain criterion must be observable without a manual rig — or it must name the gate and the item
  that owns that session.** Three shapes are unreachable and none is release state: a literal that
  never appears in the data, an observation requiring a failure to occur first, and an
  operator-induced test that real traffic cannot produce. Fix the criterion or re-home the line.
- **A line is deleted when the surface is verified live, not when the deploy command exits.** Whoever
  deploys re-reads the deployed state live and drains in the same session. This file is never the
  source of what is live, for anyone, for any purpose — it is hand-maintained and has been wrong in
  every direction.

## Validation Log retention

A log that is only ever appended to becomes most of its plan.

- **Append-only within a phase, rewritten when that phase closes.** A closed phase leaves **one**
  entry: date, commits, what is proved, the invariants a re-run must not break, what it hands off.
  Aim for under a screen. Two entries for the same phase means a consolidation was skipped.
- **Never record a metric's trajectory.** One current value and its invariant, never the sequence that
  produced it. Same for re-run tallies: record that the suites are green and which did not run, not
  their counts per pass. This is the single largest source of log growth.
- **One `Open findings` section per plan**, at the end. A pass that finds something appends there; the
  pass that closes it deletes the line. Never a per-entry "not done in this pass" list — each is
  superseded by the next pass and none ever gets removed.
- **Caps.** Validation Log ≤ ~350 lines; `TODO.md` ≤ ~150 lines whole-file. Crossing a cap means
  consolidation is due **before** anything new is appended. Consolidate in its own commit, after the
  detailed entries are committed. Never consolidate content that has not been committed.

## Parallel work

Implementation units are **exclusive unless the owning plan declares them parallel-safe**. A
declaration names compatible claim identifiers, satisfied prerequisites, and the owned subsystem.
Without it, do not skip an earlier claimed unit; use a read-only review lane or stop. Worker lanes
update only their owning plan. The integration lane alone edits the index and `TODO.md`. Do not copy a
changing active-claim table into a plan or the index — it will race the real registry.

## Setting this up in a new repository

Create the four files with the sections above and nothing in them, `RELEASE.md` and `BLOCKERS.md` at
`_None._`. Add a hygiene comment at the top of each naming its caps, so whoever opens one to append
sees the rules without coming here. Then write the first plan with `plan-from-tasks`.

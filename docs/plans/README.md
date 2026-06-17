# Plans

## Live plans
Only `TODO.md` and `BLOCKERS.md` are live. Stale planning docs should be removed; completed
implementation plans are moved to the archived list below rather than left as ambiguous live docs.

- [TODO](./TODO.md)
- [BLOCKERS](./BLOCKERS.md)

## Archived (completed) plans

Retained for implementation provenance only and cited by `TODO.md` VALIDATION evidence pointers.
These are not live work; their tasks are recorded in `TODO.md` COMPLETED.

- [2026-06-16-001 Evaluation-first roadmap reset](./2026-06-16-001-feat-evaluation-first-roadmap-reset-plan.md)
- [2026-06-16-002 Evidence-backed node treatment contract](./2026-06-16-002-feat-evidence-backed-node-treatment-plan.md)

## Progress report instructions

### ADRs

Update @docs/adr/README.md and linked ADRs only when a durable architectural decision changed.

ADR rules:
- one durable decision per ADR,
- policy-level decisions only,
- no implementation details,
- no speculative or pending decisions,
- no duplicate decisions.

### TODO

Keep @docs/plans/TODO.md limited to exactly these sections:

- `TODO`: Recommended next implementation tasks
- `COMPLETED`: Tasks that are done
- `VALIDATION`: Latest validation results

For TODO:

- keep 3–7 top-level tasks,
- order by dependency and value,
- use sub-bullets for concrete steps,
- remove stale or completed work.

For COMPLETED:

- consolidate work into 5–10 durable groups,
- group by subsystem, milestone, or outcome,
- do not append one bullet per code edit.

For VALIDATION
- keep only latest test results here.


### Blockers

Record unresolved manual actions required from the user in @docs/plans/blockers.md.
Do not write in manual actions something that you can complete yourself.

Remove resolved blockers.

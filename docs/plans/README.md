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
- [2026-06-17-001 Demote ungroundable core concepts](./2026-06-17-001-feat-demote-ungroundable-core-plan.md)
- [2026-06-17-002 Enrichment-ordering eval gate + F3 v1 densification](./2026-06-17-002-feat-enrichment-eval-graph-densification-plan.md)
- [2026-06-18-002 F3 v2 measured thin-connected-region trigger](./2026-06-18-002-feat-densification-thin-region-trigger-plan.md) — archived as a stopped experiment; F3 was removed by the 2026-06-18 intrinsic-difficulty handoff.
- [2026-06-18-003 Remove F3 and build intrinsic difficulty](./2026-06-18-003-feat-intrinsic-difficulty-f3-removal-plan.md) — archived with intrinsic difficulty implemented; rule-14 evidence is recorded in `TODO.md` VALIDATION.

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

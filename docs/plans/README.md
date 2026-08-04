# Plans

Planning documents are the canonical source for implementation design only while the work is ready or
in progress. Linked brainstorms own accepted problem framing, requirements, and scope. When work
completes, fold durable decisions into ADRs, current status into `TODO.md`, and terminology into
`CONTEXT.md`, then delete the completed plan.

## Live coordination

- [TODO](./TODO.md) — current tasks, grouped completed outcomes, and the latest validation.
- [BLOCKERS](./BLOCKERS.md) — unresolved manual actions required from the user only.

### TODO retention

`TODO.md` has exactly three sections — `TODO`, `COMPLETED`, `VALIDATION` — and is bounded by every
edit that touches it, not by a later cleanup pass. Enforce these limits in the same change that adds
the entry:

- **TODO** holds 3–7 tasks. A task is status + link + live state that exists nowhere else. A plan's
  requirements, design, implementation units, and acceptance criteria stay in the plan.
- **COMPLETED** holds at most 8 grouped outcomes. Adding a ninth deletes the oldest in the same edit.
- **VALIDATION** holds exactly one entry: the latest. Adding one deletes the previous one.
- No entry links into `tmp/` — it is gitignored and auto-pruned, so such a link is dead on arrival
  for every other checkout.

Deleted detail is not lost: git history is the provenance record for outcomes and validation runs.

## Active implementation plans (execution order)

- [Integrate Drizzle Migrations](./2026-08-04-001-refactor-integrate-drizzle-migrations-plan.md) —
  in progress; U1-U2 established the code-first schema and catalog-equivalent generated lineage,
  with the single programmatic migrator and reset state machine next.

## Ownership rules

- ADRs own durable policy; linked brainstorms own accepted requirements and scope; plans link to both
  rather than restating them.
- Source types and the initial migration own exact interfaces and persisted shapes.
- Keep only ready/in-progress plans here. Delete stale or completed plans immediately after their
  durable content has been consolidated.

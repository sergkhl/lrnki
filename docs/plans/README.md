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

- [2026-08-05-001 — Study Item grounding and key verification](./2026-08-05-001-fix-study-item-grounding-and-key-verification-plan.md)
  — U1 shipped. Its next unit is U2, a measured real-use gate, and two steps precede it in this
  order. The plan owns U1–U4; this list owns only where those two steps sit relative to them.

  1. **Green the deterministic gates before running a measured one.** `pnpm test:db` is red on a
     test-isolation race ([TODO](./TODO.md) owns the defect). It sits on this plan's acceptance list
     and will sit on U3's, and a measured gate run beside a red automated gate makes every later
     "was that mine?" more expensive to answer, not less.
  2. **Spend nothing before spending something.** The local development database holds a free replay
     corpus of persisted lessons. Size U1's deterministic effect there — colliding ids under the old
     scheme, added grounding per lesson, and whether any node's pre-gate count *drops* below a
     type threshold — before a run that costs a shared-host deploy and production tokens.
  3. **Then U2**, which needs operator consent, not just plan authorization: D12 permits the shared
     VPS, a `db:reset` on the shared application schema, and production spend, but permission in a
     plan is not the operator saying go on a shared environment.

  Steps 1 and 2 are independent of the shared environment and of each other.

## Ownership rules

- ADRs own durable policy; linked brainstorms own accepted requirements and scope; plans link to both
  rather than restating them.
- Source types own exact interfaces and the internal Drizzle schema owns exact persisted shapes
  ([ADR-0039](../adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md)).
- Keep only ready/in-progress plans here. Delete stale or completed plans immediately after their
  durable content has been consolidated.

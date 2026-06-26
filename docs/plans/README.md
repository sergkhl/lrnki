# Plans

Planning documents are the canonical source for implementation design only while the work is ready or
in progress. Linked brainstorms own accepted problem framing, requirements, and scope. When work
completes, fold durable decisions into ADRs, current status into `TODO.md`, and terminology into
`CONTEXT.md`, then delete the completed plan.

## Live coordination

- [TODO](./TODO.md) — 3–7 current tasks, 5–10 grouped completed outcomes, and latest validation.
- [BLOCKERS](./BLOCKERS.md) — unresolved manual actions required from the user only.

## Active implementation plans

- [2026-06-26-001 — fix: rescue definition-bearing optional concepts into the derived layer]
  (./2026-06-26-001-fix-rescue-seam-derived-grounding-plan.md) — U1–U5 (code) shipped on branch
  `fix/rescue-seam-derived-grounding`; U6 (reset + clean seed) and U7 (real-source + e2e rule-14
  verification) remain. Status in [TODO #1](./TODO.md).

## Ownership rules

- ADRs own durable policy; linked brainstorms own accepted requirements and scope; plans link to both
  rather than restating them.
- Source types and the initial migration own exact interfaces and persisted shapes.
- Keep only ready/in-progress plans here. Delete stale or completed plans immediately after their
  durable content has been consolidated.
- Do not duplicate a plan's requirements, design, implementation units, or acceptance criteria in
  `TODO.md`; link to the active plan with a short status note.
- `TODO.md` has exactly `TODO`, `COMPLETED`, and `VALIDATION` sections.

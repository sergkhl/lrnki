# Plans

Planning documents are the canonical source for implementation design only while the work is ready or
in progress. Linked brainstorms own accepted problem framing, requirements, and scope. When work
completes, fold durable decisions into ADRs, current status into `TODO.md`, and terminology into
`CONTEXT.md`, then delete the completed plan.

## Live coordination

- [TODO](./TODO.md) — 3–7 current tasks, 5–10 grouped completed outcomes, and latest validation.
- [BLOCKERS](./BLOCKERS.md) — unresolved manual actions required from the user only.

## Active implementation plans (execution order)

- [2026-07-10-005 — Fix expedition discoverability: curated Explore + Browse all catalog](./2026-07-10-005-fix-expedition-catalog-discovery-plan.md)
  — ready; stop the top-3 readiness slice from hiding ready trails: keep a curated top-5 Explore,
  add a searchable Browse all screen over the full shared catalog via a new `/catalog` endpoint,
  add a ≥2-stop structural floor, and clean degenerate/placeholder test enrichments from the data.
- [2026-07-11-001 — Derived Graph Layer completion](./2026-07-11-001-refactor-derived-graph-layer-completion-plan.md)
  — ready; consolidate the duplicated Graph Enrichment and Synthetic Topic Generation completion
  back halves behind one lifecycle-aware, atomically persisted application module.

## Ownership rules

- ADRs own durable policy; linked brainstorms own accepted requirements and scope; plans link to both
  rather than restating them.
- Source types and the initial migration own exact interfaces and persisted shapes.
- Keep only ready/in-progress plans here. Delete stale or completed plans immediately after their
  durable content has been consolidated.
- Do not duplicate a plan's requirements, design, implementation units, or acceptance criteria in
  `TODO.md`; link to the active plan with a short status note.
- `TODO.md` has exactly `TODO`, `COMPLETED`, and `VALIDATION` sections.

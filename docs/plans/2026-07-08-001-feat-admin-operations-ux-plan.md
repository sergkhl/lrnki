# Admin Operations UX Implementation Plan

Improve the Admin Lab Operations page by making stage expansion instant and scroll-stable, converting Processing Journey steps into a sortable table, and keeping the solution local to the Admin UI helper/component layer.

No database schema, persisted read model, public port, migration, or application contract changes are planned.

## Scope

- Split the Operations route into a server data-loading page and a client `OperationsTimelineView`.
- Replace URL-driven `expand` navigation with local client expansion state.
- Initialize running operations expanded.
- Keep stage details preloaded through the existing `listOperationJourneys()` path and render stage tables only for opened operations.
- Convert per-journey operation steps into a sortable shadcn table.
- Add deterministic UI-local sorting helpers in `operationJourneyView.ts`.
- Keep LiteLLM costs read-live-never-stored per ADR-0029.

## Verification

- `pnpm --filter @lrnki/admin-lab test`
- `pnpm --filter @lrnki/admin-lab typecheck`
- `pnpm run lint`
- `pnpm --filter @lrnki/admin-lab build`
- Real Admin Lab inspection of `/admin/lab/operations` with `DATABASE_URL` loaded from `.env`.

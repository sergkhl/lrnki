# Blockers

Manual actions and unresolved external dependencies. Remove entries once resolved.

- **Drizzle snapshot meta is stale relative to `schema.ts`.** The single migration SQL is hand-authored
  and is the source of truth; `drizzle-kit migrate` applies it correctly. Do not run `drizzle-kit
  generate` expecting a clean diff — it would regenerate against the old `0000_snapshot.json`. Reset
  local state with `scripts/reset-db.sh`.

- **Admin Lab server bind requires DATABASE_URL in the process env.** `next start` does not load the
  monorepo-root `.env`; launch the admin-lab server with `DATABASE_URL` exported (e.g.
  `DATABASE_URL=… pnpm exec next start -p 3000`) or the inspectors fall back to "database unavailable".
  Backgrounded dev servers must use a process-group-detached launch that survives the shell (the
  sandbox reaps plain `nohup &` children when the foreground command returns).

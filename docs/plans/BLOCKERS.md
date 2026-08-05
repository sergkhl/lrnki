# Blockers

- **Cut the shared deployment over to the Drizzle baseline.** Everything else in the
  [Drizzle migration plan](./2026-08-04-001-refactor-integrate-drizzle-migrations-plan.md) is
  implemented and validated. This last step runs on the **VPS** that serves
  `api.lrnki.globesoul.com`, because `scripts/deploy-learner-api.sh` drives that host's local Docker
  daemon — no coding session on the development Mac can reach it.

  Start with the ordinary deploy. It is non-destructive: a database the migrator does not recognize
  makes it exit nonzero and leaves the running API untouched, so this is also the safe way to learn
  that database's actual state, which cannot be inspected from here.

  ```bash
  scripts/deploy-learner-api.sh
  ```

  If it succeeds, this blocker is closed. If it reports `legacy-schema` — expected, since that
  database predates the migrator — perform the `## Shared schema cutover` runbook in the
  [root README](../../README.md), which **discards the shared application data** in database `lrnki`
  while preserving the `postgres_data` volume and LiteLLM's separate database, then run the
  post-cutover checks listed there.

  Until this is done the plan stays in progress and must not be deleted.

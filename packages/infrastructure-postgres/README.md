# @lrnki/infrastructure-postgres

Postgres owns Better Auth's four relations and one learner-state aggregate. The package exports the
Better Auth database adapter, the aggregate `LearnerStateStore`, connectivity checks, and the sole
baseline migrator.

## Persisted shape

`src/schema/` is the hand-edited persisted-shape authority, except for Better Auth's generated
`auth.ts`:

| Module | Owns |
| --- | --- |
| `auth.ts` | Better Auth `user`, `session`, `account`, and `verification` relations |
| `learnerJourney.ts` | `learner_journey_state` aggregate, version, timestamps, and user cascade |

The runtime parses every loaded and proposed JSON state through the Zod schema in
`@lrnki/learner-runtime`; Drizzle's TypeScript annotation is not runtime validation.

Regenerate Better Auth's candidate schema only when its config changes, compare it with the
installed runtime metadata, then regenerate the one baseline:

```bash
pnpm dlx @better-auth/cli generate \
  --config apps/learner-api/src/auth.ts \
  --output packages/infrastructure-postgres/src/schema/auth.ts -y
pnpm db:generate
```

`src/migrations/` is generated output. Do not hand-edit or apply its SQL directly. `pnpm db:check`
proves schema parity and `pnpm db:migrate` applies the baseline only to an empty database or accepts
the exact current five-relation state. All legacy, partial, stale, and unexpected-history states
refuse and require the guarded greenfield reset.

Run database-backed tests only through `pnpm test:db`; that command resets and targets `lrnki_test`.

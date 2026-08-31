# Local automated validation

Use this route for content structure, pure/runtime/store behavior, types, lint, builds, schema parity,
and deterministic intercepted web.

Start with the narrow owner:

```sh
pnpm content:check
pnpm --filter @lrnki/learner-runtime test
pnpm --filter @lrnki/learner-api test
pnpm --filter @lrnki/learner-app test
pnpm --filter @lrnki/infrastructure-postgres test
```

Escalate to:

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm db:check
pnpm e2e:web
pnpm check
```

Run DB-backed tests separately:

```sh
pnpm test:db
```

`test:db` refuses any target except `lrnki_test`, serializes destructive runs, exercises the
migration state matrix, resets only the test application schemas, and then runs workspace suites.
Do not repoint it at development or shared data.

Report exact counts and any skipped tests. A green automated gate is structural/behavioral evidence,
not authored teaching-quality, real-backend, deployed, native, or physical evidence.

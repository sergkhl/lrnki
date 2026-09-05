# @lrnki/infrastructure-postgres

[The Drizzle schema](src/schema/) owns persisted shape under
[ADR-0039](../../docs/adr/0039-own-persisted-shape-in-code-first-drizzle-schema.md).
[The root database runbook](../../README.md#database) owns baseline checks, migration, reset, and tests.

## Better Auth schema regeneration

`src/schema/auth.ts` is generated from the API's Better Auth configuration. Regenerate it only when
that configuration changes, compare the candidate with installed runtime metadata, then regenerate
the baseline:

```sh
pnpm dlx @better-auth/cli generate \
  --config apps/learner-api/src/auth.ts \
  --output packages/infrastructure-postgres/src/schema/auth.ts -y
pnpm db:generate
```

# Local automated validation

Use this route for deterministic structure, runtime/store contracts, types, lint, builds, and schema
parity. Start with the owning workspace's test command:

```sh
pnpm --filter <owning-workspace> test
```

For content qualification and database schema parity, use the root README's
[content](../../../../README.md#directly-authored-content) and
[database](../../../../README.md#database) commands. Other narrow checks are declared in
[package.json](../../../../package.json); the full gate is documented under
[Validation](../../../../README.md#validation).

DB-backed tests must use `pnpm test:db`. It serializes destructive runs, exercises the migration
matrix, resets only the `lrnki_test` application schemas, and then runs workspace suites.

Report exact counts and skipped tests. Content qualification proves structure and credit resolution;
[semantic acceptance](../../../../content/AUTHORING.md#semantic-quality-rubric) requires direct review.

# Local automated checks

Use this layer for source-level contracts and deterministic local checks. Inspect the current root
and package `package.json` scripts before invoking them; those scripts own the command surface.

## Workflow

1. Start with the narrowest changed-module test, typecheck, lint, schema check, or build that can
   falsify the implementation.
2. Run DB-backed automated tests only through `pnpm test:db`. Test files must opt in through
   `TEST_DATABASE_URL`; never point them at the development `DATABASE_URL`.
3. Run `pnpm check` when the change scope warrants the repository gate. It includes the intercepted
   learner-web Playwright suite, so classify that part through
   [the intercepted-web route](web-intercepted.md) when reporting it.
4. Read failures at the individual test or build step. Do not summarize a composite command only by
   its final exit code.
5. Run `git diff --check` and inspect the final diff for stale paths, duplicate authorities, and
   unrelated changes.

## Claim boundary

These checks can prove source contracts, types, deterministic behavior, buildability, and the exact
integration seams they execute. They do not by themselves prove real-use quality, a deployed
artifact, native rendering, OS integration, or physical-device behavior. Load the corresponding
reference when the product claim requires one of those layers.

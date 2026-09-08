# TODO

## TODO

- Finish the authorized Contabo web/API deployment: build and validate the release images, reset
  only the `lrnki` application schemas without a backup, deploy, and verify/clean up one temporary
  learner. Local hosting checks have passed; deployment acceptance remains pending.

## COMPLETED

- **Documentation hygiene (2026-09-05).** Consolidated ADRs and linked workflow documentation into
  canonical owners, preserving project constraints and repairing stale references.
- **Researched Expedition catalog (2026-09-01).** Catalog cutover and learner-first/source review
  evidence remain in commits `28f325f`, `e10515d`, and `eba37f5`. The preceding full validation
  record is preserved in `7b88a36`.

## VALIDATION

### Contabo web deployment — 2026-09-08 (in progress)

- User authorized moving the web SPA from GitHub Pages to Contabo, resetting the `lrnki`
  application schemas without a backup, and a temporary deployed learner smoke test with cleanup.
- DNS-only A records for web and API resolve to `31.220.78.189`. SSH deployment checkout is
  `/home/globesoul/pi-workspace/lrnki`; PostgreSQL also serves unrelated databases and must be reused.
- `pnpm content:check` qualified all five Expeditions at catalog revision `1c29d8c2…d78e9ff`;
  `pnpm db:check` verified the five-table source/baseline parity.
- `pnpm typecheck` passed all four workspaces; learner-app Jest passed 26 suites / 151 tests;
  `pnpm e2e:web` passed 20 intercepted phone/desktop scenarios.
- `pnpm test:deploy` passed six CLI-controlled scenarios, including a successful release as the
  positive control and refusal before application replacement on build, image, schema, or host
  configuration failure. Changed JavaScript/TypeScript lint, Bash syntax, and `git diff --check` passed.
- Image builds, live reset, deployment identity, TLS, real learner smoke, and cleanup remain pending.

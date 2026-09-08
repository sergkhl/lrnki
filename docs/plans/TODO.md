# TODO

## TODO

_None._

## COMPLETED

- **Contabo web/API deployment (2026-09-08).** Release `39305b1` serves the Expo website and API
  over HTTPS. The authorized application-schema reset, matched-image deployment, desktop/phone
  browser smoke, and exact temporary-learner cleanup passed. Routine deployments preserve the
  shared PostgreSQL container; commands and hosting policy live in the [runbook](../../README.md#deployment).
- **Documentation hygiene (2026-09-05).** Consolidated ADRs and linked workflow documentation into
  canonical owners, preserving project constraints and repairing stale references.
- **Researched Expedition catalog (2026-09-01).** Catalog cutover and learner-first/source review
  evidence remain in commits `28f325f`, `e10515d`, and `eba37f5`. The preceding full validation
  record is preserved in `7b88a36`.

## VALIDATION

### Contabo web deployment — 2026-09-08

- **Target and source.** User authorized deployment, an application-schema reset without a backup,
  and temporary learner writes/cleanup. The clean checkout at `/home/globesoul/pi-workspace/lrnki`
  on `globesoul@contabo.globesoul.com:37161` was fast-forwarded by Git bundle to
  `39305b1ab24ef0e583aa252df3cd7eb16ea49f40`, based on requested source `96ba3db`. Deployment used
  `LRNKI_SKIP_GIT_PULL=1 LRNKI_SKIP_BUILD=1` after both images were built and qualified on that host.
  The subsequent validation-record and deployed-test worker changes are local follow-up changes,
  outside the running release. Repository GitHub Pages deployment was retired.
- **Prepared artifacts.** Both OCI image labels equal the full release SHA. Caddy configuration
  validation and isolated serving probes passed before reset: SPA fallback, valid asset/404 control,
  HTML revalidation, and only exported public files in the serving image. Required auth settings,
  the actual `lrnki` endpoint, disk space, and PostgreSQL health were checked before reset.

| Running service | Image ID (`sha256:`) | Container ID |
| --- | --- | --- |
| Learner API | `1ddd22281e3ecaa60bc9118bd7346f8aec07aff4100ef69daa498880710649d5` | `b95d98c6bb61` |
| Caddy / Expo web | `a17611f24236b38ce60fd6ff9d581cf4468363f7669815714a38f930d92643d2` | `ca388c9cba1f` |

- **Migration and reset.** Before reset, the prepared migration refused the old schema with
  `Application schema is reset-required: partial-schema.` API/Caddy/PostgreSQL container identities,
  start times, the old migration hash, and two existing user rows remained unchanged. The old API
  was then stopped; the guarded `pnpm db:reset` targeted database `lrnki`, dropped its `public` and
  `drizzle` schemas, and applied the generated baseline without creating a backup. The two prior
  accounts and application progress were cleared; the immediate post-reset user count was zero.
  The new migration service used the API image above, exited **0**, and reported the schema current.
  The final database has five public tables and baseline hash
  `c06644ac5cb045041f3962cbf84d9e89dbcb53a6395b37f6c1eade52ce01354d`
  (`created_at=1788171093097`). Reset remains separate from routine deployment.
- **Shared host preservation.** PostgreSQL `62ac35ad36a9` remained healthy with its original
  `2026-08-05T09:32:42.18848192Z` start time. Its other six databases remained present. LiteLLM,
  Docling, WireGuard, the other Caddy, and Hercules Hermes retained their IDs and start times.
  The existing retired initializer bind source and host fixtures were preserved and excluded from
  Git status/build inputs. Final host inspection at **15:17 UTC** showed 24 GiB available.
- **Catalog and local gates.** `pnpm content:check` qualified all five Expeditions; the built API
  image qualified the same catalog revision
  `1c29d8c2a9c5f94fa8d671a15dad0a4bbe9fb7e8c51321da6863337c2d78e9ff`.
  `pnpm db:check` verified the five-table source/baseline parity.
- `pnpm typecheck` passed all four workspaces; learner-app Jest passed 26 suites / 151 tests;
  `pnpm e2e:web` passed 20 intercepted phone/desktop scenarios.
- `pnpm test:deploy` passed six CLI-controlled scenarios, including a successful release as the
  positive control and refusal before application replacement on build, image, schema, or host
  configuration failure. Changed JavaScript/TypeScript lint, Bash syntax, and `git diff --check` passed.
- **Public serving.** Web/API DNS-only A records resolve to `31.220.78.189`; both HTTPS routes passed
  certificate verification. Direct container health and public `/health` returned success. The public
  root matched the running image's `index.html` byte-for-byte. Root, Expedition, and Guardian URLs
  returned the same SPA shell with `Cache-Control: public, max-age=0, must-revalidate`. A real JS
  bundle returned 200 with JavaScript MIME; a missing bundle in the same namespace returned an
  empty 404. Browser JavaScript, CSS, and font requests succeeded.
- **Deployed intercepted suite.** All three artifact deep-link/OAuth-refusal scenarios passed in
  21 seconds with one worker. These tests load the real public artifact and intercept the learner
  API. The first parallel run exceeded its 30-second deadline after a 28-second cold bundle transfer;
  serial execution passed without changing deadlines or assertions. The deployed config now defaults
  to one worker because routing fixtures disable browser HTTP caching.
- **Actual deployed browser journey.** A fresh Chromium browser used real HTTPS/API/PostgreSQL,
  without API interception, at 1280×800 and 390×844 viewports. Signed-out controls and a deliberately
  stale session rendered the sign-in gate. Email/password signup reached the journal; catalog search
  found Critical Thinking; `adopt_expedition` and `activate_expedition` both returned `applied`.
  The Expedition opened and survived direct reload. Sign-out/sign-in restored the same active
  Expedition and state version. Phone sign-in, resume, reload, and sign-out passed. Session cookies
  were present with Secure/HttpOnly flags. Screenshots of both sign-in and Expedition views were
  visually inspected. No application page errors were observed after a deliberate error proved the
  page-error collector worked. No activity answers, Guardian encounter, or mastery completion were submitted.
- **Exact test activity and cleanup.** The reserved alias
  `deployment-d4b2a1e4-51fe-4311-ad31-68e98b0614cf@lrnki.invalid` was used sequentially for two
  attempts. The first created user `PUm1JzTWVNZZpptZ5RMzgnLYmV7ao0kT` and reached the journal,
  then an ambiguous test locator stopped the run. Its user/account/session counts were each 1
  before exact deletion and 0 afterward; it had no journey. After correcting the locator, the full
  journey above passed as user `WgNKuZjcvPgUyIPdHB8VxutkJKeuKukr`. Its user/account/journey counts
  were each 1 before exact ID-and-email deletion and 0 afterward. Sessions were already 0 after
  sign-out and remained 0. Both cleanup transactions targeted only those test identities.
- **Evidence limits.** Email/password authentication and the browser journey above are live evidence.
  The intercepted OAuth-refusal case does not establish a successful Google login; that remains a
  user-driven check. Phone viewport evidence does not establish native or physical-device behavior.
  The new deployment rendered correctly; the earlier reported blank screen was not reproduced.

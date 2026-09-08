# TODO

## TODO

_None._

## COMPLETED

- **Focused learning and main-journey UX (2026-09-08).** Theory, questions and Support now progress
  one card at a time with compact source dialogs, retained feedback, device resume, readable Trail
  navigation, keyboard-safe forms and reliable pending/failure actions. Android E2E defaults to
  the connected device through the [native rig](../../apps/learner-app/e2e-native/README.md).

- **Contabo web/API deployment (2026-09-09).** Release `2293806` serves the focused learning flow
  and API over HTTPS. Matched-image deployment, unchanged-schema verification, public artifact
  checks and 23 browser checks passed. The shared PostgreSQL container was preserved and no reset
  was performed. Commands and hosting policy live in the [runbook](../../README.md#deployment).
- **Documentation hygiene (2026-09-05).** Consolidated ADRs and linked workflow documentation into
  canonical owners, preserving project constraints and repairing stale references.
- **Researched Expedition catalog (2026-09-01).** Catalog cutover and learner-first/source review
  evidence remain in commits `28f325f`, `e10515d`, and `eba37f5`. The preceding full validation
  record is preserved in `7b88a36`.


## VALIDATION

### Focused learning release on Contabo — 2026-09-09

- **Authorization and source.** The user requested push and deployment. Branch
  `codex/focused-learning-cards` was pushed to `origin`, and the clean saved checkout at
  `contabo.globesoul.com:/home/globesoul/pi-workspace/lrnki` was fast-forwarded to
  `229380633287ff21194f3595899414148090ed15`. The earlier implementation, local/backend/native
  validation and detailed plan remain in Git history (`9ec3568` and `2293806`). This latest record
  is a documentation follow-up; it does not change the deployed application revision.
- **Deployment.** Ran `LRNKI_SKIP_GIT_PULL=1 scripts/deploy-learner-api.sh` from that host checkout.
  Both image builds, offline Caddy validation, the application-schema guard, direct-container API
  health, authentication-origin check and public TLS/artifact probes passed. The API and Caddy
  started at 2026-09-08 23:47 UTC with the exact release revision in their running image labels.
  The API is healthy, has no host-published port and has zero restarts; Caddy is running with zero
  restarts and serves the verified HTTPS routes.
- **Running images.** API image SHA-256:
  `13d815870350216c27392847d58ba0444731f26b6f7ce3b68145be6751c25aca`.
  Caddy image SHA-256:
  `a54ca051cc4b388a2b68dec42ff0050840e3349c594ca33e207a9d70cd1f5f79`.
- **Shared database preservation.** PostgreSQL container `62ac35ad36a9` retained its exact identity,
  healthy state and 2026-08-05 09:32:42 UTC start time. The guard reported “Application schema is
  current”; the existing migration hash
  `c06644ac5cb045041f3962cbf84d9e89dbcb53a6395b37f6c1eade52ce01354d`
  and timestamp `1788171093097` were unchanged. No reset, learner creation or learner command was
  performed. The pre-existing unrelated services were left running.
- **Local and deployed content.** `pnpm test:deploy` passed all six deployment safety tests.
  `pnpm content:check` passed locally and inside the running API container, qualifying all five
  unchanged Expeditions at catalog revision
  `1c29d8c2a9c5f94fa8d671a15dad0a4bbe9fb7e8c51321da6863337c2d78e9ff`.
- **Public read-only probes.** The HTTPS root, Expedition and Guardian deep links returned the
  same SPA shell with HTML revalidation enabled. Public HTML and JavaScript hashes matched the
  running Caddy files byte-for-byte. The bundle contains the focused learning/source controls and
  production API origin. Actual JavaScript returned 200 with a JavaScript content type; missing
  assets in both asset namespaces returned 404. API `/health` returned 200, an unauthenticated
  `/auth/get-session` returned `null`, and unauthenticated `/catalog` returned 401.
- **Deployed browser artifact.** `pnpm e2e:web:deployed` passed all three deep-link/OAuth-return
  scenarios in 9.5 s. A temporary config using the same public origin and complete API interception
  ran the existing `focused-flow.spec.ts` and `auth-layout.spec.ts` at phone/desktop viewports:
  20 passed in 1.3 m. These cover ordered cards, explicit reading progression, source focus,
  feedback/retry, reload, Support return and pending/failure actions, Guardian partial/final feedback,
  retreat/abandon failures, and 320-pixel authentication with enlarged text and reduced height.
- **Evidence limits.** Browser journeys loaded the real deployed bundle but intercepted all learner
  API traffic, including commands and authentication fixtures. They prove deployed presentation,
  not a live authenticated Better Auth/Postgres learner journey or Google sign-in. Live API checks
  were unauthenticated reads only. This deployment performed no store build or physical acceptance
  run. Earlier local/backend/native evidence remains separate in the preserved validation record.

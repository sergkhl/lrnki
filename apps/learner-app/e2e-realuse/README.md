# Real-backend web gate

This opt-in gate drives a production-format Expo web export against the current learner-api over
the local development Postgres database. Nothing is intercepted. It complements the intercepted
suite in `../e2e/` and is intentionally outside `pnpm check` because it needs the repository `.env`
and a live local database.

## Run

From the repository root:

```bash
pnpm e2e:web:realuse
```

The runner:

1. loads `.env` into its own process and creates a safe run id plus ephemeral credentials;
2. refuses occupied API or web ports rather than reusing unknown processes;
3. exports the production Expo web bundle against the run's API origin;
4. starts the normal authored-content learner-api and a loopback static server;
5. signs up a disposable probe, reads the direct catalog, and selects its first Expedition;
6. drives the probe through the full public HTTP journey in all five authored Expeditions;
7. runs a phone Playwright journey through all of Critical Thinking and a desktop journey through
   three frozen secondary Leg scopes for stale-session recovery, private grading, Support,
   persistence, rewards, isolation, and leaderboard presentation; and
8. on success or failure, removes exactly the probe, phone, and desktop learners for that run and
   stops its children.

The direct HTTP journey covers adoption replay, stale versions, every activity family,
wrong-to-right grading, lesson reads, calibration and restoration, Support
open/hide/restore/referenced grading, Guardian lock/retreat/resume/abandon/shield/recovery/first
win/rematch/final win, rewards, board points, content privacy, and sign-out/sign-in persistence in
all five Expeditions.

The phone UI journey completes all 12 Critical Thinking Stops and all four Guardians, including
citations, recovery, rematch, summit, Journal/board navigation, logout/login persistence, and exact
points. The desktop UI journey completes these frozen secondary scopes and their Leg Guardians:

- Probability and Statistics: `produce-and-describe-data` (Leg 1);
- Personal Finance: `borrow-and-protect` (Leg 2); and
- Machine Learning: `deploy-and-respond` (Leg 3).

Neuroscience of Memory and Attention receives the full direct HTTP journey plus reviewer,
structural/runtime, and intercepted presentation evidence; this gate intentionally makes no
real-backend UI Leg claim for it. Phone and desktop separately prove the real Expo seam and
two-learner isolation.

Install Chromium once if needed:

```bash
pnpm --filter @lrnki/learner-app e2e:setup
```

If exact cleanup fails, rerun only cleanup with the printed run id:

```bash
pnpm --filter @lrnki/learner-app run e2e:realuse -- --cleanup-run=<runId>
```

That command can derive only the three exact reserved `.invalid` addresses; it accepts no wildcard
or prefix deletion.

## Optional environment

| Variable | Default | Purpose |
|---|---:|---|
| `REALUSE_API_PORT` | `8790` | Loopback learner-api port. |
| `REALUSE_WEB_PORT` | `8091` | Loopback static server and browser origin port. |

Web and API must use the same host and different ports. Cookies are host-scoped but not port-scoped,
so `127.0.0.1:<web>` to `127.0.0.1:<api>` exercises the credentialed cross-origin path while
remaining same-site. Do not mix `localhost` and `127.0.0.1`.

## Safety and qualification

- Only learner-api receives `DATABASE_URL`. The export, static server, browser, and Playwright child
  do not receive database or secret-shaped environment variables.
- A per-run Better Auth secret is generated; no deployment signing key is needed.
- Browser traces are disabled because they can contain session cookies. Failure screenshots and
  sanitized diagnostics are gitignored.
- The page proves it cannot read the HTTP-only session cookie or a token-like storage key.
- All learning content comes from the checked-in direct catalog accepted at API startup. There is no
  model, generation supervisor, installer, publication, or content database involved.
- The gate is local real-backend evidence. It is not deployed, native, distributable, or physical
  device evidence.

The direct loopback process can emit Better Auth's missing-client-IP warning because no trusted proxy
supplies an address. Runs are sequential and ephemeral, so the warning does not invalidate this
gate. The deployed proxy contract is qualified separately.

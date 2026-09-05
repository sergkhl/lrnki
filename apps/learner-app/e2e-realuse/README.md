# Real-backend web gate

This opt-in gate runs a production-format Expo web export against learner-api and local development
Postgres without interception. It stays outside `pnpm check` because it requires `.env` and a live DB.

## Preflight and run

Confirm `.env` resolves to a development endpoint/database and the reserved test identities are
disposable. From the repository root:

```sh
pnpm e2e:web:realuse
```

The runner creates a run id and ephemeral credentials, refuses occupied API/web ports, exports Expo,
and starts the API and loopback static server. It drives separate probe, phone, and desktop learners;
on success or failure, it deletes those exact learners and stops its children. Verify cleanup
explicitly rather than inferring it from browser closure.

Install Chromium once if needed:

```sh
pnpm --filter @lrnki/learner-app e2e:setup
```

If cleanup fails, rerun only cleanup with the printed run id:

```sh
pnpm --filter @lrnki/learner-app run e2e:realuse -- --cleanup-run=<runId>
```

Cleanup derives only the three exact reserved `.invalid` addresses; it accepts no wildcard or prefix
deletion.

## Journey claims

The direct HTTP journey covers every catalog Expedition: adoption replay, stale versions, every
Activity family, wrong-to-right grading, Lesson reads, calibration/restoration, Support
open/hide/restore/referenced grading, Guardian lock/retreat/resume/abandon/shield/recovery/first
win/rematch/final win, rewards, board points, content privacy, and sign-out/sign-in persistence.

The phone UI journey completes Critical Thinking through every Stop and Guardian, including
citations, recovery, rematch, summit, Journal/board navigation, logout/login persistence, and exact
points. The desktop UI journey completes the frozen secondary Leg scopes and their Guardians in
[the scenario source](realuse.spec.ts). Phone and desktop also exercise stale-session recovery,
private grading, Support, persistence, rewards, isolation, and leaderboard presentation.

Neuroscience receives the full HTTP journey but has no real-backend UI Leg claim from this gate.
Phone and desktop separately prove the real Expo seam and two-learner isolation. General evidence
limits belong to [AGENTS.md](../../../AGENTS.md#validation-authority).

## Optional environment

| Variable | Default | Purpose |
| --- | ---: | --- |
| `REALUSE_API_PORT` | `8790` | Loopback learner-api port. |
| `REALUSE_WEB_PORT` | `8091` | Static server/browser origin port. |

Use the same host and different ports for web/API to exercise the credentialed same-site path.
Do not mix `localhost` and `127.0.0.1`.

## Credentials and diagnostics

Only learner-api receives `DATABASE_URL`; the export, static server, browser, and Playwright child
receive no database or secret-shaped variables. The runner generates a per-run Better Auth secret.
Browser traces are disabled because they may contain cookies; screenshots and sanitized diagnostics
are gitignored. The page checks that it cannot read the HTTP-only session cookie or token-like
storage keys.

A direct loopback API can emit Better Auth's missing-client-IP warning because no trusted proxy
supplies an address. Sequential ephemeral runs tolerate that warning; the deployed proxy contract
requires separate qualification.

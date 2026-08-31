# Real-backend web

Run:

```sh
pnpm e2e:web:realuse
```

Read [the owning rig contract](../../../../apps/learner-app/e2e-realuse/README.md) first. The runner uses
the checked-in authored catalog, real learner-api startup, Better Auth, Hono, server-side grading,
and the development `lrnki` Postgres database.

Before the run, confirm `.env` resolves a development endpoint/database and that the reserved test
identities are disposable. Afterward, verify exact cleanup rather than inferring it from browser
closure. Preserve the first API/browser error and distinguish harness startup, stale cookies,
content-revision refusal, and product behavior.

Qualify only the journey actually exercised. A pass proves the local real backend and web artifact;
it does not prove deployment, native rendering, store builds, physical devices, or external source
facts.

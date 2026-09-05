# Intercepted Expo web

Run:

```sh
pnpm e2e:web
```

The rig exports a production-format Expo web artifact and intercepts the entire learner API at
owned phone and desktop viewports. Fail every unmatched request. The
[owned scenarios and fixtures](../../../../apps/learner-app/e2e/) define journey, auth recovery,
loading/error, and retired-route absence assertions.

Qualify this as Expo presentation against DTO fixtures. Better Auth, Hono, Postgres, and API startup
are outside the exercised seam.

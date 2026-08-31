# Intercepted Expo web

Run:

```sh
pnpm e2e:web
```

The rig exports a production-format Expo web artifact, serves it locally, and intercepts the entire
learner API at owned phone and desktop viewports. It must fail any unmatched request.

Cover Journal/catalog, adoption/activation, authored trail, all Activity families, calibration,
Support, Guardian, formation/reward, leaderboard, auth refusal/recovery, loading, and named error
surfaces. Assert the absence of topic planning, generation progress, retry/polling, and deleted routes.

Qualify the result as intercepted production-format web only. DTO fixtures prove client behavior and
transport expectations; they do not prove Better Auth, Hono, Postgres, startup qualification, or a
deployed route.

# Deployed validation

Apply [execution authority](../../../../AGENTS.md#execution-authority) to the target and any writes.
For read-only checks, identify the hostname, deployed revision/image, catalog revision, and API
health result. With the environment and credentials explicitly in scope, run:

```sh
pnpm e2e:web:deployed
```

Follow [the deployment runbook](../../../../README.md#deployment) when deploying. Validate both
container health and the public TLS route: public `/health` alone cannot identify the newly built
container or establish migration, OAuth callback, learner-command, or Expo-artifact behavior.
Report the exact deployed reads and writes exercised.

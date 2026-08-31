# Deployed validation

Use deployed evidence only when the user authorizes the target and any writes. A health check or read
does not authorize sign-up, mutation, reset, deployment, or release.

For an authorized read-only route, identify the exact hostname, deployed revision/image, catalog
revision, and API health result. Run the deployed Playwright configuration only when its owning
environment and credentials are explicitly in scope:

```sh
pnpm e2e:web:deployed
```

The public topology is Caddy to the one learner-api container. Validate both container health and the
public TLS route when deploying through `scripts/deploy-learner-api.sh`; a green public `/health`
alone does not prove the newly built container, migration, auth callbacks, learner commands, or Expo
artifact.

Never reset a shared/production database or publish a build without explicit authority. Qualify the
exact deployed reads/writes performed and keep local, emulator, and deployed evidence separate.

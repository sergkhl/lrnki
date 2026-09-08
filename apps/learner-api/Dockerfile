# Learner API production image. Build context is the repository root
# ROOT so the pnpm workspace closure is visible; build with:
#   docker build -f apps/learner-api/Dockerfile -t lrnki-learner-api .
# The container runs the TS source through tsx exactly like `pnpm start`, but reads env
# from the container environment (compose) rather than a dev-only `--env-file`.
FROM node:22-alpine

# Pin the package manager to the root `packageManager` field so installs are reproducible.
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate

WORKDIR /app

# Copy the whole workspace (`.dockerignore` strips node_modules/build outputs) and install
# only the learner-api dependency closure. The trailing `...` on the filter pulls in every
# workspace package learner-api depends on (learner-runtime and infrastructure-postgres).
COPY . .
RUN pnpm install --frozen-lockfile --filter @lrnki/learner-api...

ARG LRNKI_DEPLOY_REVISION=development
LABEL org.opencontainers.image.revision=$LRNKI_DEPLOY_REVISION

# tsx runs the ESM TypeScript entrypoint directly — no build step, matching the dev runtime.
CMD ["node_modules/.bin/tsx", "apps/learner-api/src/index.ts"]

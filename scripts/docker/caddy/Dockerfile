# Build from the repository root. The final image contains only public Expo output and Caddy.
FROM node:22-alpine AS web-build
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @lrnki/learner-app...
RUN CI=1 EXPO_NO_DOTENV=1 \
    EXPO_PUBLIC_LEARNER_API_URL=https://api.lrnki.globesoul.com \
    pnpm --filter @lrnki/learner-app export:web

FROM caddy:2-alpine
ARG LRNKI_DEPLOY_REVISION=development
LABEL org.opencontainers.image.revision=$LRNKI_DEPLOY_REVISION
COPY --from=web-build /app/apps/learner-app/dist/ /srv/lrnki/
COPY scripts/docker/caddy/Caddyfile /etc/caddy/Caddyfile

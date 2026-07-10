# The Caddyfile is baked into the image instead of bind-mounted: on this VPS the docker
# daemon's filesystem view diverges from the repo checkout, so file bind-mounts silently
# resolve to auto-created directories and the container fails to start. Build contexts are
# streamed to the daemon, so COPY always works. Config change => `docker compose up -d --build caddy`.
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile

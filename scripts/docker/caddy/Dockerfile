# The Caddyfile is baked into the image instead of bind-mounted, because a build context is
# STREAMED to the daemon while a bind source is a path the daemon must resolve itself. COPY
# therefore works from any caller; a bind only works from a caller whose paths the daemon shares.
#
# The earlier reason given here — "on this VPS the daemon's filesystem view diverges from the
# checkout" — was wrong, and is corrected rather than deleted because it misdirects: a file bind
# from the host checkout resolves normally (verified 2026-08-05). What diverges is an agent
# container that binds the workspace at a different prefix and shares the socket, so the fault
# tracked the caller, not the host (ADR-0040). The compose file now fails closed on that; baking
# stays regardless, on the streaming argument above.
#
# Config change => `docker compose up -d --build caddy`.
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile

import { serve } from "@hono/node-server";
import { createDatabaseClient } from "@lrnki/infrastructure-postgres";
import { createLearnerApp } from "./app";

// Supervisor-free, loopback-only learner-api entrypoint for the durable real-use web gate
// (plan 2026-07-15-001 U2, R6/KTD6). It composes the SAME production Hono app over the real
// Postgres database, but starts NO topic/Scaffold generation supervisor — so a suite that only
// reads a ready catalog enrichment and grades one persisted answer can never trigger a model
// call (the neural clients are constructed lazily inside a supervisor's `run` hook, which never
// runs here). It owns its OWN database client (not the process-shared pool) and closes both the
// HTTP listener and the client on SIGINT/SIGTERM so the runner can join it cleanly.
//
// The runner supplies an explicit minimum environment: DATABASE_URL, LEARNER_API_PORT,
// LEARNER_WEB_ORIGIN (the exact-match CORS origin), and Better Auth's BETTER_AUTH_URL +
// BETTER_AUTH_SECRET. No LiteLLM/provider/Expo secret is inherited.
//
// `BETTER_AUTH_URL` must be this process's own loopback base (`http://127.0.0.1:<port>`) and is
// not optional in practice: Better Auth derives the cookie's `Secure` flag from that URL's scheme,
// so the production https default would mint a cookie no http rig can ever store — the browser
// simply drops it and every journey fails signed out, with nothing in any log to point at it.
// The secret is deliberately a per-run ephemeral value from the runner, never the deployment's.
const port = Number(process.env.LEARNER_API_PORT ?? 8790);
const sql = createDatabaseClient(); // throws if DATABASE_URL is missing — the runner guarantees it
// Better Auth needs a client of its own; sharing `sql` would strip json serialization from every
// store on it (see `createAuthDatabase`). Closed alongside `sql` in `shutdown`.
const authClientSql = createDatabaseClient();
const app = createLearnerApp(sql, authClientSql);

const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`[realuse-api] supervisor-free learner-api on http://127.0.0.1:${info.port}`);
});

let closing = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (closing) return;
  closing = true;
  console.log(`[realuse-api] ${signal} — closing HTTP + database`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.all([sql.end({ timeout: 5 }), authClientSql.end({ timeout: 5 })]);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

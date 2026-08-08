import { createDatabaseClient } from "@lrnki/infrastructure-postgres";

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;

// The ONE postgres.js pool for routes and supervisor alike (KTD5). The per-request
// createDatabaseClient()/end() churn of the old server actions is not ported.
let shared: DatabaseClient | null = null;

export function sharedSql(): DatabaseClient {
  shared ??= createDatabaseClient();
  return shared;
}

// Better Auth's client, deliberately NOT the shared one. Drizzle rewrites the type codecs of
// whatever client it wraps, which would strip json/jsonb serialization from every store sharing
// that pool — see `createAuthDatabase` for the full mechanism. Two long-lived pools is the cost
// of an adapter that takes ownership of its driver; it is paid once per process, not per request,
// which is the churn KTD5 actually exists to prevent.
let auth: DatabaseClient | null = null;

export function authSql(): DatabaseClient {
  auth ??= createDatabaseClient();
  return auth;
}

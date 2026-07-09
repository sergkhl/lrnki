import { createDatabaseClient } from "@lrnki/infrastructure-postgres";

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;

// The ONE postgres.js pool for the whole process — routes and supervisor alike (KTD5).
// The per-request createDatabaseClient()/end() churn of the old server actions is not ported.
let shared: DatabaseClient | null = null;

export function sharedSql(): DatabaseClient {
  shared ??= createDatabaseClient();
  return shared;
}

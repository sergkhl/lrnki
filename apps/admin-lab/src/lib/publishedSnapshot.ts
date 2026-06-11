import type { GraphSnapshot } from "@lrnki/domain-core";
import { PostgresGraphVersionStore, createDatabaseClient } from "@lrnki/infrastructure-postgres";
import { demoSnapshot } from "./demoSnapshot";

// Server-only: load the latest atomically published graph version (ADR-0010).
// Falls back to the demo snapshot when nothing is published yet, so the Admin
// Lab renders before the first Gate 1 build. Read-only (ADR-0011).
export async function loadPublishedSnapshot(): Promise<{ snapshot: GraphSnapshot; live: boolean }> {
  if (!process.env.DATABASE_URL) return { snapshot: demoSnapshot, live: false };
  const sql = createDatabaseClient();
  try {
    const store = new PostgresGraphVersionStore(sql);
    const published = await store.getPublishedSnapshot();
    return published ? { snapshot: published, live: true } : { snapshot: demoSnapshot, live: false };
  } catch {
    return { snapshot: demoSnapshot, live: false };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

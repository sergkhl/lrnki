import { PostgresInspectionRead, createDatabaseClient } from "@lrnki/infrastructure-postgres";

// Server-only thin shell over the Inspection Read Model (ADR-0027). The
// PostgresInspectionRead adapter owns every query and row-stitch; this module
// only manages the `sql` lifecycle and the DATABASE_URL-absent → demo/empty
// fallback. Real DB errors propagate to the Next.js error boundary instead of
// being silently rendered as empty (ADR-0027 decision 5).
async function withInspectionRead<T>(fn: (read: PostgresInspectionRead) => Promise<T>): Promise<T | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    return await fn(new PostgresInspectionRead(sql));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function listRuns() {
  return withInspectionRead((read) => read.listRunSummaries());
}

export function getRunInspection(runId: string) {
  return withInspectionRead((read) => read.getRunInspection(runId));
}

export function listSourcesWithStats() {
  return withInspectionRead((read) => read.listSourceSummaries());
}

export function getSourceInspection(sourceResourceId: string) {
  return withInspectionRead((read) => read.getSourceInspection(sourceResourceId));
}

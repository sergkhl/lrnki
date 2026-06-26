import { PostgresEnrichmentInspectionRead, createDatabaseClient } from "@lrnki/infrastructure-postgres";

// Server-only thin shell over the Derived Graph Layer Inspection Read Model
// (ADR-0027). The Postgres adapter owns every query, artifact row stitch, and
// origin-count reduction; this module only manages sql lifecycle and the
// DATABASE_URL-absent fallback. Real DB errors propagate to the Next.js error
// boundary, matching the other Admin Lab inspection loaders.
async function withEnrichmentInspectionRead<T>(fn: (read: PostgresEnrichmentInspectionRead) => Promise<T>): Promise<T | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    return await fn(new PostgresEnrichmentInspectionRead(sql));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function listEnrichments() {
  return withEnrichmentInspectionRead((read) => read.listEnrichmentSummaries());
}

export function getEnrichmentDetail(enrichmentId: string) {
  return withEnrichmentInspectionRead((read) => read.getDerivedGraphDetail(enrichmentId));
}

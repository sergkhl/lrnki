import { PostgresLearnerPathInspectionRead, createDatabaseClient } from "@lrnki/infrastructure-postgres";

// Server-only thin shell over the Learner Path Inspection Read Model (ADR-0027). The
// Postgres adapter owns every query and row-stitch; this module only manages sql lifecycle
// and the DATABASE_URL-absent fallback. Real DB errors propagate to the Next.js error
// boundary, matching the other Admin Lab inspection loaders.
export type { LearnerPathSummary, LearnerPathNode, LearnerPathEdge, LearnerPathDetail } from "@lrnki/ports";

async function withLearnerPathRead<T>(fn: (read: PostgresLearnerPathInspectionRead) => Promise<T>): Promise<T | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    return await fn(new PostgresLearnerPathInspectionRead(sql));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function listLearnerPaths() {
  return withLearnerPathRead((read) => read.listLearnerPaths());
}

export function getLearnerPathDetail(learnerPathId: string) {
  return withLearnerPathRead((read) => read.getLearnerPathDetail(learnerPathId));
}

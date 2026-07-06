import type { LearnerExpedition } from "@lrnki/ports";
import { PostgresLearnerExpeditionStore, createDatabaseClient } from "@lrnki/infrastructure-postgres";

// Server-only read of one learner's expedition row for an enrichment (unique per
// (learner_state_ref, enrichment_id)). Mirrors lib/learnerStudySession.ts lifecycle.
export async function getLearnerExpeditionByEnrichment(
  enrichmentId: string,
  learnerStateRef: string
): Promise<LearnerExpedition | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    return await new PostgresLearnerExpeditionStore(sql).getByEnrichment({ learnerStateRef, enrichmentId });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

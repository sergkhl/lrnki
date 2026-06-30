import { getStudySession as loadStudySession, type StudySession } from "@lrnki/application";
import {
  createDatabaseClient,
  PostgresCalibrationVerdictStore,
  PostgresConceptLessonStore,
  PostgresEnrichmentInspectionRead,
  PostgresResponseLogStore,
  PostgresStudyItemBankStore
} from "@lrnki/infrastructure-postgres";

// Server-only thin shell over the Study Session use-case (ADR-0027). The adaptation
// compute (prune closure, mastery composition, node classification, goal-scoped frontier,
// per-node sheet gating, coexistence + restorations) and the Derived Graph Layer read both
// live in `@lrnki/application` now (`getStudySession` + `composeStudySession`), so the
// Admin Lab and the forthcoming Learner App share one definition (AGENTS rule 18).
// This module only manages the sql lifecycle, injects the four Postgres adapters, and keeps
// the DATABASE_URL-absent fallback. It opens no graph write port, so it structurally cannot
// mutate a published graph (R10); real DB errors propagate to the Next.js error boundary,
// matching the other Admin Lab inspection loaders.

export type { StudySession } from "@lrnki/application";

export async function getStudySession(
  enrichmentId: string,
  targetDerivedNodeId: string,
  learnerStateRef: string
): Promise<StudySession | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    return await loadStudySession({
      enrichmentId,
      targetDerivedNodeId,
      learnerStateRef,
      enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
      studyItemStore: new PostgresStudyItemBankStore(sql),
      conceptLessonStore: new PostgresConceptLessonStore(sql),
      responseLog: new PostgresResponseLogStore(sql),
      verdictStore: new PostgresCalibrationVerdictStore(sql)
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

import { getStudySession as loadStudySession, type StudySession } from "@lrnki/application";
import {
  createDatabaseClient,
  PostgresCalibrationVerdictStore,
  PostgresConceptLessonStore,
  PostgresEnrichmentInspectionRead,
  PostgresLessonReadStore,
  PostgresResponseLogStore,
  PostgresStudyItemBankStore
} from "@lrnki/infrastructure-postgres";

export type { StudySession } from "@lrnki/application";

export async function getLearnerStudySession(
  enrichmentId: string,
  learnerStateRef: string
): Promise<StudySession | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    return await loadStudySession({
      enrichmentId,
      learnerStateRef,
      enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
      studyItemStore: new PostgresStudyItemBankStore(sql),
      conceptLessonStore: new PostgresConceptLessonStore(sql),
      lessonReadStore: new PostgresLessonReadStore(sql),
      responseLog: new PostgresResponseLogStore(sql),
      verdictStore: new PostgresCalibrationVerdictStore(sql)
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

import { getStudySession as loadStudySession, type StudySession } from "@lrnki/application";
import {
  createDatabaseClient,
  PostgresCalibrationVerdictStore,
  PostgresConceptLessonStore,
  PostgresEnrichmentInspectionRead,
  PostgresResponseLogStore,
  PostgresStudyItemBankStore
} from "@lrnki/infrastructure-postgres";

export type { StudySession } from "@lrnki/application";

export async function getLearnerStudySession(
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

export async function listAnsweredStudyItemIds(learnerStateRef: string): Promise<Set<string>> {
  if (!process.env.DATABASE_URL) return new Set();
  const sql = createDatabaseClient();
  try {
    const rows = await sql<{ study_item_id: string }[]>`
      SELECT DISTINCT study_item_id
      FROM response_log
      WHERE learner_state_ref = ${learnerStateRef}`;
    return new Set(rows.map((row) => row.study_item_id));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

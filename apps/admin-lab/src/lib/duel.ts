import { getDuelSetup, type DuelSetup } from "@lrnki/application";
import {
  PostgresCalibrationVerdictStore,
  PostgresConceptLessonStore,
  PostgresEnrichmentInspectionRead,
  PostgresLearnerExpeditionStore,
  PostgresLessonReadStore,
  PostgresResponseLogStore,
  PostgresStudyItemBankStore,
  createDatabaseClient
} from "@lrnki/infrastructure-postgres";

// Server-only load of a learner's Crystal Duel setup (R7): unlock state + the eligible item pool
// drawn from their mastered crystals. Mirrors lib/leaderboard.ts lifecycle.
export async function loadDuelSetup(learnerStateRef: string): Promise<DuelSetup | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const sql = createDatabaseClient();
  try {
    return await getDuelSetup(
      { learnerStateRef },
      {
        expeditionStore: new PostgresLearnerExpeditionStore(sql),
        enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
        studyItemStore: new PostgresStudyItemBankStore(sql),
        conceptLessonStore: new PostgresConceptLessonStore(sql),
        responseLog: new PostgresResponseLogStore(sql),
        verdictStore: new PostgresCalibrationVerdictStore(sql),
        lessonReadStore: new PostgresLessonReadStore(sql)
      }
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

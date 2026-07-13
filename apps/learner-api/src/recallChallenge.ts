import { createRecallChallenge, type RecallChallengeModule } from "@lrnki/application";
import {
  PostgresEnrichmentInspectionRead,
  PostgresLearnerRecallChallengeStore,
  PostgresResponseLogStore,
  PostgresStudyItemBankStore
} from "@lrnki/infrastructure-postgres";
import type { DatabaseClient } from "./db";

// Production binding of the Recall Challenge deep module (plan 2026-07-13-003 U3, KTD1):
// the narrow read/store ports are bound ONCE here at the composition root; the routes in
// `app.ts` receive one finished module and stay thin transport mappers. The response log is
// bound READ-ONLY inside the module (eligibility fold) — no challenge operation can write it.
export function createLearnerRecallChallenge(sql: DatabaseClient): RecallChallengeModule {
  return createRecallChallenge({
    enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
    studyItemStore: new PostgresStudyItemBankStore(sql),
    responseLog: new PostgresResponseLogStore(sql),
    challengeStore: new PostgresLearnerRecallChallengeStore(sql)
  });
}

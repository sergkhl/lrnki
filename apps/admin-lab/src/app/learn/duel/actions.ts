"use server";

import { randomUUID } from "node:crypto";
import { gradeDuelAnswer, type DuelAnswerSubmission, type GradeDuelAnswerResult } from "@lrnki/application";
import { PostgresLearnerAwardsStore, PostgresStudyItemBankStore, createDatabaseClient } from "@lrnki/infrastructure-postgres";

async function withSqlClient<T>(fn: (sql: ReturnType<typeof createDatabaseClient>) => Promise<T>): Promise<T> {
  const sql = createDatabaseClient();
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Grade one duel answer (KTD3): resolves the key server-side and returns correctness only — it
// NEVER writes to the response log, so a duel cannot touch mastery state.
export async function gradeDuelAnswerAction(input: { studyItemId: string; submission: DuelAnswerSubmission }): Promise<GradeDuelAnswerResult> {
  return withSqlClient((sql) => gradeDuelAnswer(input, { studyItemStore: new PostgresStudyItemBankStore(sql) }));
}

// Record a durable `duel_win` award on a win (R7/R8). The `duelId` is the dedupe key, so a screen
// that re-submits the same finished duel never double-awards. Losing calls this never — the loser
// pays nothing (AE4).
export async function recordDuelWinAction(input: { learnerStateRef: string; duelId: string }): Promise<void> {
  if (!input.learnerStateRef || !input.duelId) return;
  await withSqlClient((sql) =>
    new PostgresLearnerAwardsStore(sql).record({
      awardId: randomUUID(),
      learnerRef: input.learnerStateRef,
      awardType: "duel_win",
      dedupeKey: input.duelId,
      context: { at: new Date().toISOString() }
    })
  );
}

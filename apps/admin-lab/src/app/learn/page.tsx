import { listExpeditionCandidates } from "@lrnki/application";
import {
  PostgresEnrichmentInspectionRead,
  PostgresLessonReadStore,
  PostgresLearnerExpeditionStore,
  PostgresLearnerStore,
  PostgresResponseLogStore,
  PostgresStudyItemBankStore,
  createDatabaseClient
} from "@lrnki/infrastructure-postgres";
import { ExpeditionEntry } from "@/components/learn/ExpeditionEntry";
import { DuelUnlockSplash } from "@/components/learn/DuelUnlockSplash";
import { LearnerMenuDrawer } from "@/components/learn/LearnerMenuDrawer";
import { LearnerNameGate, type GateError } from "@/components/learn/LearnerNameGate";
import { LeaderboardSplash } from "@/components/learn/LeaderboardSplash";
import { loadDuelSetup } from "@/lib/duel";
import { loadLeaderboard } from "@/lib/leaderboard";
import { readLearnerRef } from "@/lib/learnerSession";

async function loadEntry(learnerStateRef: string) {
  if (!process.env.DATABASE_URL) {
    return { candidates: [], learnerExpeditions: [] };
  }
  const sql = createDatabaseClient();
  try {
    return await listExpeditionCandidates({
      learnerStateRef,
      enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
      expeditionStore: new PostgresLearnerExpeditionStore(sql),
      studyItemStore: new PostgresStudyItemBankStore(sql),
      responseLog: new PostgresResponseLogStore(sql),
      lessonReadStore: new PostgresLessonReadStore(sql)
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Whether the cookie-resumed ref is still a registered learner (a dev DB reset can orphan a
// cookie). The full registry belongs to Admin Lab inspection, not the learner gate.
async function cookieLearnerExists(cookieRef: string | undefined): Promise<boolean> {
  if (!cookieRef || !process.env.DATABASE_URL) return false;
  const sql = createDatabaseClient();
  try {
    return Boolean(await new PostgresLearnerStore(sql).get(cookieRef));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export default async function LearnLandingPage({ searchParams }: { searchParams: Promise<{ error?: string; ref?: string }> }) {
  const learnerStateRef = await readLearnerRef();
  const cookieValid = await cookieLearnerExists(learnerStateRef);

  if (learnerStateRef && cookieValid) {
    const [entry, board, duel] = await Promise.all([loadEntry(learnerStateRef), loadLeaderboard(learnerStateRef), loadDuelSetup(learnerStateRef)]);
    return (
      <>
        {board ? (
          <LeaderboardSplash
            learnerRef={learnerStateRef}
            weekKey={board.weekKey}
            entries={board.entries}
            chase={board.chase}
            viewerRank={board.viewerRank}
            viewerPoints={board.viewerPoints}
            masteredCrystalCount={board.masteredCrystalCount}
            podiumEarnedForPreviousWeek={board.podiumEarnedForPreviousWeek}
          />
        ) : null}
        <DuelUnlockSplash learnerRef={learnerStateRef} unlocked={Boolean(duel?.unlocked)} />
        <div className="flex justify-end pb-2">
          <LearnerMenuDrawer board={board} />
        </div>
        <ExpeditionEntry learnerStateRef={learnerStateRef} entry={entry} />
      </>
    );
  }

  const { error: errorParam, ref } = await searchParams;
  const error: GateError | undefined =
    errorParam === "name_taken" || errorParam === "wrong_pin" || errorParam === "invalid_pin" || errorParam === "invalid_name"
      ? errorParam
      : undefined;

  return (
    <section className="flex min-h-[calc(100svh-2rem)] items-center justify-center">
      <LearnerNameGate error={error} defaultName={ref} />
    </section>
  );
}

import { randomUUID } from "node:crypto";
import { getWeeklyLeaderboard, isoWeekRange, lifetimeMasteredCrystalCount, previousIsoWeekKey } from "@lrnki/application";
import {
  PostgresCalibrationVerdictStore,
  PostgresConceptLessonStore,
  PostgresEnrichmentInspectionRead,
  PostgresLearnerAwardsStore,
  PostgresLearnerExpeditionStore,
  PostgresLearnerStore,
  PostgresLessonReadStore,
  PostgresResponseLogStore,
  PostgresStudyItemBankStore
} from "@lrnki/infrastructure-postgres";
import type { DatabaseClient } from "./db";
import { assembleWeeklyBoard, type BoardEntry, type ChaseTarget } from "./rivalSimulation";

export type LeaderboardView = {
  weekKey: string;
  entries: BoardEntry[];
  chase: ChaseTarget | null;
  viewerPoints: number;
  viewerRank: number | null;
  masteredCrystalCount: number;
  podiumEarnedForPreviousWeek: boolean;
};

const PODIUM_RANK = 3;

// Load the weekly board a learner sees and run the weekly lifecycle (R3/R8, KTD6). It reuses
// the application `getWeeklyLeaderboard` (real rows) and merges seeded rivals presentation-side
// (KTD1). Because the ISO-week score is recomputable at any time, there is NO scheduler: on each
// load we also recompute the PRIOR week's final board and idempotently record a `weekly_podium`
// award if the viewer finished in the top three (`dedupe_key` = prior week key), so a re-entered
// week never double-awards (AE5). `sql` is the process's shared pool (KTD5).
export async function loadLeaderboard(sql: DatabaseClient, learnerStateRef: string, now: Date = new Date()): Promise<LeaderboardView> {
  const deps = {
    learnerStore: new PostgresLearnerStore(sql),
    expeditionStore: new PostgresLearnerExpeditionStore(sql),
    awardsStore: new PostgresLearnerAwardsStore(sql),
    enrichmentRead: new PostgresEnrichmentInspectionRead(sql),
    studyItemStore: new PostgresStudyItemBankStore(sql),
    conceptLessonStore: new PostgresConceptLessonStore(sql),
    responseLog: new PostgresResponseLogStore(sql),
    verdictStore: new PostgresCalibrationVerdictStore(sql),
    lessonReadStore: new PostgresLessonReadStore(sql)
  };

  const current = await getWeeklyLeaderboard({ now, ...deps });
  // The lifetime crystal count is derived from the SAME pass's contributions — no third full
  // projection (R4). A viewer with no evidence has an empty/absent contribution list → 0.
  const masteredCrystalCount = lifetimeMasteredCrystalCount(current.contributionsByLearner.get(learnerStateRef));
  const viewerHasEvidence = current.contributionsByLearner.has(learnerStateRef) && current.rows.some((row) => row.learnerRef === learnerStateRef);
  const currentBoard = assembleWeeklyBoard({
    viewerRef: learnerStateRef,
    realRows: current.rows,
    weekKey: current.weekKey,
    nowMs: now.getTime(),
    weekStartMs: isoWeekRange(now).startMs,
    weekEndMs: isoWeekRange(now).endMs
  });

  const podiumEarnedForPreviousWeek = await recordPreviousWeekPodium(learnerStateRef, now, deps, viewerHasEvidence);

  const viewerEntry = currentBoard.entries.find((entry) => entry.isViewer);
  return {
    weekKey: current.weekKey,
    entries: currentBoard.entries,
    chase: currentBoard.chase,
    viewerPoints: currentBoard.viewerPoints,
    viewerRank: viewerEntry?.rank ?? null,
    masteredCrystalCount,
    podiumEarnedForPreviousWeek
  };
}

// Recompute the prior ISO week's final board for this learner and, if they finished top-3,
// idempotently record the podium award. Returns whether THIS call newly earned it (the caller
// uses that to fire the celebration once; a re-entry sees `false` because the record is a no-op).
type LeaderboardDeps = Omit<Parameters<typeof getWeeklyLeaderboard>[0], "now">;

async function recordPreviousWeekPodium(learnerStateRef: string, now: Date, deps: LeaderboardDeps, viewerHasEvidence: boolean): Promise<boolean> {
  const prevWeekEnd = new Date(isoWeekRange(now).startMs - 1);
  const prevWeekKey = previousIsoWeekKey(now);
  // Guard the second full board pass (KTD3): a viewer with no evidence never podiums, and once
  // the idempotent `weekly_podium` award for this prior week exists, re-running the recompute
  // can only be a no-op. Skipping it in both cases stops the board reading twice per navigation
  // forever, while the FIRST entry of each week still recomputes and records.
  if (!viewerHasEvidence) return false;
  const viewerAwards = await deps.awardsStore.listForLearner(learnerStateRef);
  if (viewerAwards.some((award) => award.awardType === "weekly_podium" && award.dedupeKey === prevWeekKey)) return false;
  const prev = await getWeeklyLeaderboard({ now: prevWeekEnd, ...deps });
  const prevRange = isoWeekRange(prevWeekEnd);
  const prevBoard = assembleWeeklyBoard({
    viewerRef: learnerStateRef,
    realRows: prev.rows,
    weekKey: prev.weekKey,
    nowMs: prevRange.endMs - 1,
    weekStartMs: prevRange.startMs,
    weekEndMs: prevRange.endMs
  });
  const viewerEntry = prevBoard.entries.find((entry) => entry.isViewer);
  // A learner earns a podium only if they actually scored last week AND finished top-3; a
  // zero-point learner never "podiums" on an empty board.
  if (!viewerEntry || viewerEntry.points <= 0 || viewerEntry.rank > PODIUM_RANK) return false;
  const { recorded } = await deps.awardsStore.record({
    awardId: randomUUID(),
    learnerRef: learnerStateRef,
    awardType: "weekly_podium",
    dedupeKey: prevWeekKey,
    context: { rank: viewerEntry.rank, points: viewerEntry.points }
  });
  return recorded;
}

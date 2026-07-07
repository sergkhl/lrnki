import type {
  CalibrationVerdictStorePort,
  ConceptLessonStorePort,
  EnrichmentInspectionReadPort,
  LearnerAwardsStorePort,
  Learner,
  LearnerStorePort,
  LearnerExpeditionStorePort,
  LessonReadStorePort,
  ResponseLogStorePort,
  StudyItemBankStorePort
} from "@lrnki/ports";
import { composeStudySession } from "./studySessionProjection";
import {
  badgesFromAwards,
  computeWeeklyPoints,
  isoWeekRange,
  nodeCompletionTimeMs,
  type MasteredNodeContribution,
  type WeeklyLeaderboardRow
} from "./weeklyLeaderboard";

// The reading use-case for the global weekly leaderboard (R3/R4, KTD2). It reuses the SAME
// Study Session projection every other surface reads to decide WHAT each real learner has
// mastered, and the learner's own response/lesson-read timestamps to decide WHEN — so no
// parallel SQL mastery predicate is ever written (rule 18). It returns REAL rows only; the
// simulated rivals (KTD1) are merged presentation-side in the Learner App. At cohort scale
// (a handful of learners) recomputing projections per board read is cheap; caching is premature.
export async function getWeeklyLeaderboard(input: {
  now: Date;
  learnerStore: LearnerStorePort;
  expeditionStore: LearnerExpeditionStorePort;
  awardsStore: LearnerAwardsStorePort;
  enrichmentRead: EnrichmentInspectionReadPort;
  studyItemStore: StudyItemBankStorePort;
  conceptLessonStore: ConceptLessonStorePort;
  responseLog: ResponseLogStorePort;
  verdictStore: CalibrationVerdictStorePort;
  lessonReadStore: LessonReadStorePort;
}): Promise<{ weekKey: string; rows: WeeklyLeaderboardRow[] }> {
  const { startMs, endMs, key } = isoWeekRange(input.now);
  const learners = await input.learnerStore.list();

  const rows: WeeklyLeaderboardRow[] = [];
  for (const learner of learners) {
    const [{ contributions }, awards] = await Promise.all([
      readLearnerMasteredNodeContributions({ learner, ...input }),
      input.awardsStore.listForLearner(learner.learnerRef)
    ]);

    const { points, contributingNodeIds } = computeWeeklyPoints({ nodes: contributions, weekStartMs: startMs, weekEndMs: endMs });
    rows.push({ learnerRef: learner.learnerRef, displayName: learner.displayName, points, badges: badgesFromAwards(awards), contributingNodeIds });
  }

  rows.sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName));
  return { weekKey: key, rows };
}

export async function getLearnerLifetimeMasteredCrystalCount(input: {
  learnerRef: string;
  learnerStore: LearnerStorePort;
  expeditionStore: LearnerExpeditionStorePort;
  enrichmentRead: EnrichmentInspectionReadPort;
  studyItemStore: StudyItemBankStorePort;
  conceptLessonStore: ConceptLessonStorePort;
  responseLog: ResponseLogStorePort;
  verdictStore: CalibrationVerdictStorePort;
  lessonReadStore: LessonReadStorePort;
}): Promise<number> {
  const learner = await input.learnerStore.get(input.learnerRef);
  if (!learner) return 0;
  const { contributions } = await readLearnerMasteredNodeContributions({ learner, ...input });
  return contributions.filter((contribution) => contribution.completionTimeMs !== null).length;
}

async function readLearnerMasteredNodeContributions(input: {
  learner: Learner;
  expeditionStore: LearnerExpeditionStorePort;
  enrichmentRead: EnrichmentInspectionReadPort;
  studyItemStore: StudyItemBankStorePort;
  conceptLessonStore: ConceptLessonStorePort;
  responseLog: ResponseLogStorePort;
  verdictStore: CalibrationVerdictStorePort;
  lessonReadStore: LessonReadStorePort;
}): Promise<{ contributions: MasteredNodeContribution[] }> {
  const [responses, lessonReads, verdicts, expeditions] = await Promise.all([
    input.responseLog.listForLearner(input.learner.learnerRef),
    input.lessonReadStore.listForLearner(input.learner.learnerRef),
    input.verdictStore.listForLearner(input.learner.learnerRef),
    input.expeditionStore.listForLearner(input.learner.learnerRef)
  ]);

  // The learner's own evidence timestamps (KTD2): the latest CORRECT answer per study item
  // and the first read per lesson. These, not a new mastery predicate, decide completion time.
  const latestCorrectAtByItem = new Map<string, number>();
  for (const row of responses) {
    if (row.judgedOutcome !== "correct" || !row.createdAt) continue;
    const at = new Date(row.createdAt).getTime();
    const prior = latestCorrectAtByItem.get(row.studyItemId);
    if (prior === undefined || at > prior) latestCorrectAtByItem.set(row.studyItemId, at);
  }
  const lessonReadAtByNode = new Map(lessonReads.map((read) => [read.derivedNodeId, new Date(read.firstReadAt).getTime()] as const));
  const knownNodes = new Set(verdicts.filter((verdict) => verdict.verdict === "known").map((verdict) => verdict.derivedNodeId));
  const readyExpeditions = expeditions.filter((expedition) => expedition.status === "ready" && expedition.enrichmentId);

  const contributions: MasteredNodeContribution[] = [];
  for (const expedition of readyExpeditions) {
    const enrichmentId = expedition.enrichmentId as string;
    const detail = await input.enrichmentRead.getDerivedGraphDetail(enrichmentId);
    if (!detail) continue;
    const [studyItems, lessons, lessonAbsent] = await Promise.all([
      input.studyItemStore.listStudyItemsForEnrichment(enrichmentId),
      input.conceptLessonStore.listLessonsForEnrichment(enrichmentId),
      input.conceptLessonStore.listAbsentForEnrichment(enrichmentId)
    ]);
    const session = composeStudySession({
      enrichmentId,
      learnerStateRef: input.learner.learnerRef,
      detail,
      studyItems,
      lessons,
      lessonAbsent,
      lessonReads: lessonReads.map((read) => read.derivedNodeId),
      rows: responses,
      verdicts
    });
    const difficultyByNode = new Map(detail.nodes.map((node) => [node.derivedNodeId, node.difficulty] as const));
    for (const [derivedNodeId, state] of Object.entries(session.classification.stateByNode)) {
      // Score only nodes mastered by STUDYING them this cohort: known-skips carry no
      // timestamped evidence and are excluded, matching the crystal tallies (R4).
      if (state !== "mastered" || knownNodes.has(derivedNodeId)) continue;
      const segments = session.studySegmentsByNode[derivedNodeId] ?? [];
      const completionTimeMs = nodeCompletionTimeMs({
        segmentCorrectAtMs: segments.map((segment) => latestCorrectAtByItem.get(segment.item.studyItemId) ?? null),
        lessonReadAtMs: lessonReadAtByNode.get(derivedNodeId) ?? null,
        hasLesson: Boolean(session.lessonByNode[derivedNodeId])
      });
      contributions.push({ derivedNodeId, difficultyScore: difficultyByNode.get(derivedNodeId) ?? null, completionTimeMs });
    }
  }
  return { contributions };
}

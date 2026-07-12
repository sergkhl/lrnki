import { neutralResponses, type CalibrationVerdict, type ConceptLesson, type LessonAbsentNode, type ResponseLogRow, type StudyItem } from "@lrnki/domain-core";
import type {
  CalibrationVerdictStorePort,
  ConceptLessonStorePort,
  DerivedGraphDetail,
  EnrichmentInspectionReadPort,
  LearnerAward,
  LearnerAwardsStorePort,
  Learner,
  LearnerStorePort,
  LearnerExpeditionStorePort,
  LessonRead,
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

// One distinct enrichment's projection inputs, read exactly ONCE per board load (R4/KTD2)
// and reused across every learner who holds a ready expedition on it — replacing the prior
// per-(learner, expedition) re-fetch of the same detail/study-items/lessons.
type EnrichmentProjectionData = {
  detail: DerivedGraphDetail;
  studyItems: StudyItem[];
  lessons: ConceptLesson[];
  lessonAbsent: LessonAbsentNode[];
};

export type WeeklyLeaderboard = {
  weekKey: string;
  rows: WeeklyLeaderboardRow[];
  // Per-learner mastered-node contributions from THIS pass, so the caller derives the viewer's
  // lifetime crystal count without a second full projection (R4).
  contributionsByLearner: Map<string, MasteredNodeContribution[]>;
};

// The reading use-case for the global weekly leaderboard (R3/R4, KTD2). It reuses the SAME
// Study Session projection every other surface reads to decide WHAT each real learner has
// mastered, and the learner's own response/lesson-read timestamps to decide WHEN — so no
// parallel SQL mastery predicate is ever written (rule 18). It returns REAL rows only; the
// simulated rivals (KTD1) are merged presentation-side in the Learner App.
//
// Performance (R4): per-enrichment reads are hoisted OUT of the per-learner loop into one
// keyed map built from the distinct enrichment ids of all ready expeditions, and learners
// with zero study evidence are skipped before any projection work (they score 0 with no
// crystals by construction, so their row is emitted directly — byte-identical to the full
// projection, AE4). Awards for the whole cohort are read in one batched call.
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
}): Promise<WeeklyLeaderboard> {
  const { startMs, endMs, key } = isoWeekRange(input.now);
  const [learners, evidenceRefs] = await Promise.all([
    input.learnerStore.list(),
    input.learnerStore.listRefsWithStudyEvidence()
  ]);
  const withEvidence = new Set(evidenceRefs);
  const activeLearners = learners.filter((learner) => withEvidence.has(learner.learnerRef));

  // One batched award read for the whole cohort, folded to per-learner (KTD2: no per-learner
  // award round-trip inside the loop).
  const allAwards = await input.awardsStore.listForLearners(learners.map((learner) => learner.learnerRef));
  const awardsByLearner = new Map<string, LearnerAward[]>();
  for (const award of allAwards) {
    const list = awardsByLearner.get(award.learnerRef) ?? [];
    list.push(award);
    awardsByLearner.set(award.learnerRef, list);
  }

  // Read each ACTIVE learner's own evidence + expeditions (cheap indexed per-learner reads).
  const activeState = await Promise.all(
    activeLearners.map(async (learner) => {
      const [responses, lessonReads, verdicts, expeditions] = await Promise.all([
        input.responseLog.listForLearner(learner.learnerRef),
        input.lessonReadStore.listForLearner(learner.learnerRef),
        input.verdictStore.listForLearner(learner.learnerRef),
        input.expeditionStore.listForLearner(learner.learnerRef)
      ]);
      const readyExpeditions = expeditions.filter((expedition) => expedition.status === "ready" && expedition.enrichmentId);
      return { learner, responses, lessonReads, verdicts, readyExpeditionEnrichmentIds: readyExpeditions.map((e) => e.enrichmentId as string) };
    })
  );

  // Read every DISTINCT enrichment's projection inputs exactly once (AE5).
  const enrichmentIds = new Set<string>();
  for (const state of activeState) for (const id of state.readyExpeditionEnrichmentIds) enrichmentIds.add(id);
  const enrichmentDataById = new Map<string, EnrichmentProjectionData>();
  await Promise.all(
    [...enrichmentIds].map(async (enrichmentId) => {
      const detail = await input.enrichmentRead.getDerivedGraphDetail(enrichmentId);
      if (!detail) return;
      const [studyItems, lessons, lessonAbsent] = await Promise.all([
        input.studyItemStore.listStudyItemsForEnrichment(enrichmentId),
        input.conceptLessonStore.listLessonsForEnrichment(enrichmentId),
        input.conceptLessonStore.listAbsentForEnrichment(enrichmentId)
      ]);
      enrichmentDataById.set(enrichmentId, { detail, studyItems, lessons, lessonAbsent });
    })
  );

  const contributionsByLearner = new Map<string, MasteredNodeContribution[]>();
  const rows: WeeklyLeaderboardRow[] = [];

  // Learners with no evidence contribute nothing: emit their 0-point row directly and skip the
  // projection (R4). This is byte-identical to running the projection over empty evidence.
  for (const learner of learners) {
    if (withEvidence.has(learner.learnerRef)) continue;
    contributionsByLearner.set(learner.learnerRef, []);
    rows.push({ learnerRef: learner.learnerRef, displayName: learner.displayName, points: 0, badges: badgesFromAwards(awardsByLearner.get(learner.learnerRef) ?? []), contributingNodeIds: [] });
  }

  for (const state of activeState) {
    const contributions = computeLearnerContributions({
      learner: state.learner,
      responses: state.responses,
      lessonReads: state.lessonReads,
      verdicts: state.verdicts,
      readyExpeditionEnrichmentIds: state.readyExpeditionEnrichmentIds,
      enrichmentDataById
    });
    contributionsByLearner.set(state.learner.learnerRef, contributions);
    const { points, contributingNodeIds } = computeWeeklyPoints({ nodes: contributions, weekStartMs: startMs, weekEndMs: endMs });
    rows.push({ learnerRef: state.learner.learnerRef, displayName: state.learner.displayName, points, badges: badgesFromAwards(awardsByLearner.get(state.learner.learnerRef) ?? []), contributingNodeIds });
  }

  rows.sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName));
  return { weekKey: key, rows, contributionsByLearner };
}

// Fold one learner's pre-read evidence + the shared per-enrichment data into their mastered-node
// contributions (KTD2). Pure over its inputs — it reads no store, so the hoisted enrichment map
// is reused across every learner without re-fetching.
function computeLearnerContributions(input: {
  learner: Learner;
  responses: ResponseLogRow[];
  lessonReads: LessonRead[];
  verdicts: CalibrationVerdict[];
  readyExpeditionEnrichmentIds: string[];
  enrichmentDataById: Map<string, EnrichmentProjectionData>;
}): MasteredNodeContribution[] {
  // The learner's own evidence timestamps (KTD2): the latest CORRECT answer per study item
  // and the first read per lesson. These, not a new mastery predicate, decide completion time.
  // Leaderboard points fold NEUTRAL responses only — scaffold work earns no points (R19, KTD4).
  const latestCorrectAtByItem = new Map<string, number>();
  for (const row of neutralResponses(input.responses)) {
    if (row.judgedOutcome !== "correct" || !row.createdAt) continue;
    const at = new Date(row.createdAt).getTime();
    const prior = latestCorrectAtByItem.get(row.studyItemId);
    if (prior === undefined || at > prior) latestCorrectAtByItem.set(row.studyItemId, at);
  }
  const lessonReadAtByNode = new Map(input.lessonReads.map((read) => [read.derivedNodeId, new Date(read.firstReadAt).getTime()] as const));
  const knownNodes = new Set(input.verdicts.filter((verdict) => verdict.verdict === "known").map((verdict) => verdict.derivedNodeId));

  const contributions: MasteredNodeContribution[] = [];
  for (const enrichmentId of input.readyExpeditionEnrichmentIds) {
    const data = input.enrichmentDataById.get(enrichmentId);
    if (!data) continue;
    const session = composeStudySession({
      enrichmentId,
      learnerStateRef: input.learner.learnerRef,
      detail: data.detail,
      studyItems: data.studyItems,
      lessons: data.lessons,
      lessonAbsent: data.lessonAbsent,
      lessonReads: input.lessonReads.map((read) => read.derivedNodeId),
      rows: input.responses,
      verdicts: input.verdicts
    });
    const difficultyByNode = new Map(data.detail.nodes.map((node) => [node.derivedNodeId, node.difficulty] as const));
    for (const [derivedNodeId, nodeState] of Object.entries(session.classification.stateByNode)) {
      // Score only nodes mastered by STUDYING them this cohort: known-skips carry no
      // timestamped evidence and are excluded, matching the crystal tallies (R4).
      if (nodeState !== "mastered" || knownNodes.has(derivedNodeId)) continue;
      const segments = session.studySegmentsByNode[derivedNodeId] ?? [];
      const completionTimeMs = nodeCompletionTimeMs({
        segmentCorrectAtMs: segments.map((segment) => latestCorrectAtByItem.get(segment.item.studyItemId) ?? null),
        lessonReadAtMs: lessonReadAtByNode.get(derivedNodeId) ?? null,
        hasLesson: Boolean(session.lessonByNode[derivedNodeId])
      });
      contributions.push({ derivedNodeId, difficultyScore: difficultyByNode.get(derivedNodeId) ?? null, completionTimeMs });
    }
  }
  return contributions;
}

// The viewer's lifetime mastered-crystal count = the mastered (timestamped) contributions from
// the SAME weekly pass (R4). A crystal is a node whose mastery completed, regardless of week.
export function lifetimeMasteredCrystalCount(contributions: MasteredNodeContribution[] | undefined): number {
  return (contributions ?? []).filter((contribution) => contribution.completionTimeMs !== null).length;
}

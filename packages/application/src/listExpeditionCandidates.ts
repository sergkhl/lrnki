import type {
  DerivedGraphDetail,
  EnrichmentInspectionReadPort,
  EnrichmentSummary,
  LearnerExpedition,
  LearnerExpeditionStorePort,
  ResponseLogStorePort,
  StudyItemBankStorePort
} from "@lrnki/ports";
import { buildTargetCandidates, recommendedTargets, type TargetCandidate } from "./targetCandidates";

export type ExpeditionCandidate = {
  enrichmentId: string;
  graphVersionId: string | null;
  title: string;
  startedAt: string;
  target: TargetCandidate;
  readinessRank: number;
};

export type LearnerExpeditionEntry = {
  candidates: ExpeditionCandidate[];
  learnerExpeditions: (LearnerExpedition & { progress?: { itemsPassed: number; itemsTotal: number } })[];
};

export async function listExpeditionCandidates(input: {
  learnerStateRef: string;
  enrichmentRead: EnrichmentInspectionReadPort;
  expeditionStore: LearnerExpeditionStorePort;
  studyItemStore?: StudyItemBankStorePort;
  responseLog?: ResponseLogStorePort;
  limit?: number;
}): Promise<LearnerExpeditionEntry> {
  const [summaries, learnerExpeditions] = await Promise.all([
    input.enrichmentRead.listEnrichmentSummaries(),
    input.expeditionStore.listForLearner(input.learnerStateRef)
  ]);

  const details = await Promise.all(
    summaries
      .filter((summary) => summary.status === "succeeded" && summary.studyItemCount > 0)
      .map(async (summary) => ({ summary, detail: await input.enrichmentRead.getDerivedGraphDetail(summary.enrichmentId) }))
  );

  const candidates = details.flatMap(({ summary, detail }) => detail ? candidatesForSummary(summary, detail) : []);
  candidates.sort(compareExpeditionCandidates);

  return {
    candidates: candidates.slice(0, input.limit ?? 3).map((candidate, index) => ({ ...candidate, readinessRank: index + 1 })),
    learnerExpeditions: await withExpeditionProgress({
      learnerStateRef: input.learnerStateRef,
      expeditions: learnerExpeditions,
      studyItemStore: input.studyItemStore,
      responseLog: input.responseLog
    })
  };
}

async function withExpeditionProgress(input: {
  learnerStateRef: string;
  expeditions: LearnerExpedition[];
  studyItemStore?: StudyItemBankStorePort;
  responseLog?: ResponseLogStorePort;
}): Promise<LearnerExpeditionEntry["learnerExpeditions"]> {
  if (!input.studyItemStore || !input.responseLog) return input.expeditions;
  const rows = await input.responseLog.listForLearner(input.learnerStateRef);
  const latest = new Map<string, { attemptSeq: number; correct: boolean }>();
  for (const row of rows) {
    if (row.signalType !== "graded" || !row.judgedOutcome) continue;
    const prior = latest.get(row.studyItemId);
    if (prior && prior.attemptSeq >= row.attemptSeq) continue;
    latest.set(row.studyItemId, { attemptSeq: row.attemptSeq, correct: row.judgedOutcome === "correct" });
  }
  return Promise.all(input.expeditions.map(async (expedition) => {
    if (expedition.status !== "ready" || !expedition.enrichmentId) return expedition;
    const items = await input.studyItemStore!.listStudyItemsForEnrichment(expedition.enrichmentId);
    const itemIds = new Set(items.map((item) => item.studyItemId));
    const itemsPassed = [...itemIds].filter((studyItemId) => latest.get(studyItemId)?.correct === true).length;
    return { ...expedition, progress: { itemsPassed, itemsTotal: itemIds.size } };
  }));
}

function candidatesForSummary(summary: EnrichmentSummary, detail: DerivedGraphDetail): ExpeditionCandidate[] {
  return recommendedTargets(buildTargetCandidates(detail), detail, 3).map((target) => ({
    enrichmentId: summary.enrichmentId,
    graphVersionId: summary.graphVersionId,
    title: target.label,
    startedAt: summary.startedAt,
    target,
    readinessRank: 0
  }));
}

function compareExpeditionCandidates(a: ExpeditionCandidate, b: ExpeditionCandidate): number {
  const ready = Number(b.target.isFullyReady) - Number(a.target.isFullyReady);
  if (ready !== 0) return ready;
  const aReadyFraction = a.target.questNodeCount === 0 ? 0 : a.target.readyNodeCount / a.target.questNodeCount;
  const bReadyFraction = b.target.questNodeCount === 0 ? 0 : b.target.readyNodeCount / b.target.questNodeCount;
  return bReadyFraction - aReadyFraction ||
    b.target.coneSize - a.target.coneSize ||
    Date.parse(b.startedAt) - Date.parse(a.startedAt) ||
    a.title.localeCompare(b.title) ||
    a.enrichmentId.localeCompare(b.enrichmentId);
}

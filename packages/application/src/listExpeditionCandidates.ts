import type {
  DerivedGraphDetail,
  EnrichmentInspectionReadPort,
  EnrichmentSummary,
  LearnerExpedition,
  LearnerExpeditionStorePort
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
  learnerExpeditions: LearnerExpedition[];
};

export async function listExpeditionCandidates(input: {
  learnerStateRef: string;
  enrichmentRead: EnrichmentInspectionReadPort;
  expeditionStore: LearnerExpeditionStorePort;
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
    learnerExpeditions
  };
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

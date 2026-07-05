import type {
  DerivedGraphDetail,
  EnrichmentInspectionReadPort,
  EnrichmentSummary,
  LearnerExpedition,
  LearnerExpeditionStorePort,
  ResponseLogStorePort,
  StudyItemBankStorePort
} from "@lrnki/ports";
import { deriveFlooredExpedition } from "./expeditionSections";

// One Begin candidate per enrichment (U3): the whole layer is the trail, so an enrichment offers
// a single expedition titled with its DERIVED summit. Readiness and counts are trail-scoped —
// they read only non-floored nodes, the same scope the projection walks (U4, rule 18).
export type ExpeditionCandidate = {
  enrichmentId: string;
  graphVersionId: string | null;
  title: string;
  declaredDomain: string;
  startedAt: string;
  summitDerivedNodeId: string;
  // Trail-scoped stop readiness: non-floored nodes that carry a study item over all non-floored
  // nodes.
  readyStopCount: number;
  totalStopCount: number;
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

  const candidates = details.flatMap(({ summary, detail }) => (detail ? candidateForSummary(summary, detail) : []));
  candidates.sort(compareExpeditionCandidates);

  return {
    candidates: candidates.slice(0, input.limit ?? 3).map((candidate, index) => ({ ...candidate, readinessRank: index + 1 })),
    learnerExpeditions: await withExpeditionProgress({
      learnerStateRef: input.learnerStateRef,
      expeditions: learnerExpeditions,
      enrichmentRead: input.enrichmentRead,
      studyItemStore: input.studyItemStore,
      responseLog: input.responseLog
    })
  };
}

async function withExpeditionProgress(input: {
  learnerStateRef: string;
  expeditions: LearnerExpedition[];
  enrichmentRead: EnrichmentInspectionReadPort;
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
    const [items, detail] = await Promise.all([
      input.studyItemStore!.listStudyItemsForEnrichment(expedition.enrichmentId),
      input.enrichmentRead.getDerivedGraphDetail(expedition.enrichmentId)
    ]);
    // U4/AE3: count only items on TRAIL-reachable (non-floored) nodes, so the total matches the
    // stop math the trail walks. A missing detail falls back to the whole bank.
    const trailNodeIds = detail ? deriveFlooredExpedition(detail).trailNodeIds : null;
    const trailItems = trailNodeIds ? items.filter((item) => trailNodeIds.has(item.derivedNodeId)) : items;
    const itemIds = new Set(trailItems.map((item) => item.studyItemId));
    const itemsPassed = [...itemIds].filter((studyItemId) => latest.get(studyItemId)?.correct === true).length;
    return { ...expedition, progress: { itemsPassed, itemsTotal: itemIds.size } };
  }));
}

function candidateForSummary(summary: EnrichmentSummary, detail: DerivedGraphDetail): ExpeditionCandidate[] {
  const { summit, trailNodeIds } = deriveFlooredExpedition(detail);
  if (!summit) return [];
  const trailNodes = detail.nodes.filter((node) => trailNodeIds.has(node.derivedNodeId));
  const declaredDomain = detail.nodes.find((node) => node.derivedNodeId === summit.derivedNodeId)?.declaredDomain ?? detail.nodes[0]?.declaredDomain ?? "";
  return [{
    enrichmentId: summary.enrichmentId,
    graphVersionId: summary.graphVersionId,
    title: summit.label,
    declaredDomain,
    startedAt: summary.startedAt,
    summitDerivedNodeId: summit.derivedNodeId,
    readyStopCount: trailNodes.filter((node) => node.hasStudyItem).length,
    totalStopCount: trailNodes.length,
    readinessRank: 0
  }];
}

function readyFraction(candidate: ExpeditionCandidate): number {
  return candidate.totalStopCount === 0 ? 0 : candidate.readyStopCount / candidate.totalStopCount;
}

function compareExpeditionCandidates(a: ExpeditionCandidate, b: ExpeditionCandidate): number {
  const aFullyReady = a.readyStopCount === a.totalStopCount && a.totalStopCount > 0;
  const bFullyReady = b.readyStopCount === b.totalStopCount && b.totalStopCount > 0;
  return Number(bFullyReady) - Number(aFullyReady) ||
    readyFraction(b) - readyFraction(a) ||
    b.totalStopCount - a.totalStopCount ||
    Date.parse(b.startedAt) - Date.parse(a.startedAt) ||
    a.title.localeCompare(b.title) ||
    a.enrichmentId.localeCompare(b.enrichmentId);
}

import type {
  DerivedGraphDetail,
  EnrichmentInspectionReadPort,
  EnrichmentLayerPurposeStorePort,
  EnrichmentSummary,
  LearnerExpedition,
  LearnerExpeditionStorePort,
  LessonReadStorePort,
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
  existingLearnerExpeditionId?: string;
};

export type LearnerExpeditionEntry = {
  candidates: ExpeditionCandidate[];
  // `layerPurpose` is the enrichment's plain-register capability statement (plan
  // 2026-07-10-001 U1); null/absent renders the mechanical template (fail-open).
  learnerExpeditions: (LearnerExpedition & { progress?: { itemsPassed: number; itemsAttempted: number; lessonsRead: number; itemsTotal: number }; layerPurpose?: string | null })[];
};

export async function listExpeditionCandidates(input: {
  learnerStateRef: string;
  enrichmentRead: EnrichmentInspectionReadPort;
  expeditionStore: LearnerExpeditionStorePort;
  studyItemStore?: StudyItemBankStorePort;
  responseLog?: ResponseLogStorePort;
  lessonReadStore?: LessonReadStorePort;
  layerPurposeStore?: EnrichmentLayerPurposeStorePort;
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

  const learnerExpeditionIdByEnrichment = new Map(
    learnerExpeditions
      .filter((expedition) => expedition.enrichmentId)
      .map((expedition) => [expedition.enrichmentId!, expedition.learnerExpeditionId] as const)
  );
  const candidates = details
    .flatMap(({ summary, detail }) => (detail ? candidateForSummary(summary, detail) : []))
    .map((candidate) => ({
      ...candidate,
      existingLearnerExpeditionId: learnerExpeditionIdByEnrichment.get(candidate.enrichmentId)
    }));
  candidates.sort(compareExpeditionCandidates);

  return {
    candidates: candidates.slice(0, input.limit ?? 3).map((candidate, index) => ({ ...candidate, readinessRank: index + 1 })),
    learnerExpeditions: await withExpeditionProgress({
      learnerStateRef: input.learnerStateRef,
      expeditions: learnerExpeditions,
      enrichmentRead: input.enrichmentRead,
      studyItemStore: input.studyItemStore,
      responseLog: input.responseLog,
      lessonReadStore: input.lessonReadStore,
      layerPurposeStore: input.layerPurposeStore
    })
  };
}

async function withExpeditionProgress(input: {
  learnerStateRef: string;
  expeditions: LearnerExpedition[];
  enrichmentRead: EnrichmentInspectionReadPort;
  studyItemStore?: StudyItemBankStorePort;
  responseLog?: ResponseLogStorePort;
  lessonReadStore?: LessonReadStorePort;
  layerPurposeStore?: EnrichmentLayerPurposeStorePort;
}): Promise<LearnerExpeditionEntry["learnerExpeditions"]> {
  if (!input.studyItemStore || !input.responseLog) return input.expeditions;
  const [rows, lessonReads] = await Promise.all([
    input.responseLog.listForLearner(input.learnerStateRef),
    input.lessonReadStore ? input.lessonReadStore.listForLearner(input.learnerStateRef) : Promise.resolve([])
  ]);
  const latest = new Map<string, { attemptSeq: number; correct: boolean }>();
  const attempted = new Set<string>();
  for (const row of rows) {
    if (row.signalType !== "graded" || !row.judgedOutcome) continue;
    attempted.add(row.studyItemId);
    const prior = latest.get(row.studyItemId);
    if (prior && prior.attemptSeq >= row.attemptSeq) continue;
    latest.set(row.studyItemId, { attemptSeq: row.attemptSeq, correct: row.judgedOutcome === "correct" });
  }
  return Promise.all(input.expeditions.map(async (expedition) => {
    if (expedition.status !== "ready" || !expedition.enrichmentId) return expedition;
    const [items, detail, layerPurpose] = await Promise.all([
      input.studyItemStore!.listStudyItemsForEnrichment(expedition.enrichmentId),
      input.enrichmentRead.getDerivedGraphDetail(expedition.enrichmentId),
      input.layerPurposeStore ? input.layerPurposeStore.get(expedition.enrichmentId) : Promise.resolve(undefined)
    ]);
    // U4/AE3: count only items on TRAIL-reachable (non-floored) nodes, so the total matches the
    // stop math the trail walks. A missing detail falls back to the whole bank.
    const trailNodeIds = detail ? deriveFlooredExpedition(detail).trailNodeIds : null;
    const trailItems = trailNodeIds ? items.filter((item) => trailNodeIds.has(item.derivedNodeId)) : items;
    const itemIds = new Set(trailItems.map((item) => item.studyItemId));
    const itemsPassed = [...itemIds].filter((studyItemId) => latest.get(studyItemId)?.correct === true).length;
    const itemsAttempted = [...itemIds].filter((studyItemId) => attempted.has(studyItemId)).length;
    const lessonsRead = trailNodeIds
      ? lessonReads.filter((read) => trailNodeIds.has(read.derivedNodeId)).length
      : lessonReads.length;
    return { ...expedition, progress: { itemsPassed, itemsAttempted, lessonsRead, itemsTotal: itemIds.size }, layerPurpose: layerPurpose ?? null };
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

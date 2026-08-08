import { neutralResponses, STAGE_TAGS } from "@lrnki/domain-core";
import type {
  DerivedGraphDetail,
  EnrichmentInspectionReadPort,
  EnrichmentLayerPurposeStorePort,
  EnrichmentSummary,
  LearnerExpedition,
  LearnerExpeditionStorePort,
  LessonReadStorePort,
  OperationTimelineDetail,
  OperationTimelineReadPort,
  ResponseLogStorePort,
  StudyItemBankStorePort
} from "@lrnki/ports";
import { deriveFlooredExpedition } from "./expeditionSections";
import { isStaleOperation } from "./operationRunLiveness";

// The Expedition Journal projection (plan 2026-07-12-001): one application module owns
// candidate derivation, trail-scoped progress, generation facts, the tier partition, and
// Explore curation behind two entry points. Rows cross the seam as a finished
// status-discriminated union — raw LearnerExpedition rows, fencing fields, and operation
// timelines never reach the wire.

// The shared, beginnable candidate as surfaces render and act on it. Readiness rank,
// adoption linkage, and summit identity are module-internal.
export type ExpeditionCandidateCard = {
  enrichmentId: string;
  title: string;
  declaredDomain: string;
  totalStopCount: number;
  // Search-only trail vocabulary keeps Browse all discoverable when a learner's broad
  // topic word differs from the derived summit title (for example, photosynthesis →
  // carbon fixation). It is sourced from the already-visible trail, never inferred.
  searchTerms: string[];
};

export type ExpeditionProgress = {
  itemsPassed: number;
  itemsAttempted: number;
  lessonsRead: number;
  itemsTotal: number;
};

// Finished generation facts computed server-side at read time (KTD3): the app performs
// no time math and owns no stage plan. `currentStage` is the plain stage tag (ADR-0033);
// themed copy stays app-side.
export type ExpeditionGenerationFacts = {
  queued: boolean;
  stalled: boolean;
  completed: number;
  total: number;
  fraction: number | null;
  indeterminate: boolean;
  currentStage: string | null;
};

export type ReadyExpeditionRow = {
  status: "ready";
  learnerExpeditionId: string;
  title: string;
  declaredDomain: string | null;
  // Nullable by persisted reality (KTD10): the UI guard that refuses to route without an
  // enrichment is presentation, not data repair.
  enrichmentId: string | null;
  active: boolean;
  progress: ExpeditionProgress;
  // The layer's plain-register capability statement (plan 2026-07-10-001); null renders
  // the mechanical template (fail-open).
  layerPurpose: string | null;
};

export type GeneratingExpeditionRow = {
  status: "generating" | "failed";
  learnerExpeditionId: string;
  title: string;
  declaredDomain: string | null;
  failureMessage: string | null;
  generation: ExpeditionGenerationFacts;
};

export type ExpeditionJournalRow = ReadyExpeditionRow | GeneratingExpeditionRow;

export type ExpeditionJournal = {
  // Owned expeditions the learner has engaged with (a graded attempt or a lesson read).
  started: ReadyExpeditionRow[];
  // Owned expeditions not yet started — generating/failed scouts and ready-but-untouched.
  yours: ExpeditionJournalRow[];
  // Curated Explore: top shared candidates the learner has NOT adopted.
  shared: ExpeditionCandidateCard[];
};

export type ExpeditionCatalog = {
  candidates: ExpeditionCandidateCard[];
};

export type ExpeditionCatalogDeps = {
  enrichmentRead: EnrichmentInspectionReadPort;
  expeditionStore: LearnerExpeditionStorePort;
};

// Every dependency is required (KTD7): the interface no longer encodes the
// implementation's data flow, so `progress` is always present on ready rows.
export type ExpeditionJournalDeps = ExpeditionCatalogDeps & {
  studyItemStore: StudyItemBankStorePort;
  responseLog: ResponseLogStorePort;
  lessonReadStore: LessonReadStorePort;
  layerPurposeStore: EnrichmentLayerPurposeStorePort;
  timelineRead: OperationTimelineReadPort;
};

// Explore shows the top shared candidates; the catalog stays unlimited.
const EXPLORE_CANDIDATE_LIMIT = 5;

// The expected topic-generation stage plan (KTD4): the two producer phases' LLM stages,
// locked to OPERATION_TIMELINE_CATALOG membership and LLM stage kind by a set-inclusion
// test. Which stages the synthetic path runs is producer knowledge no mechanical
// derivation from the catalog can express (the catalog's `enrichment` entry includes
// source-grounded-only stages), so a new catalog stage still requires a deliberate
// update here.
export const EXPECTED_TOPIC_GENERATION_STAGE_PLAN = {
  enrichment: [
    STAGE_TAGS.declaredDomainInference,
    STAGE_TAGS.conceptSetSynthesis,
    STAGE_TAGS.knowledgeBoundaryProbe,
    STAGE_TAGS.groundingGeneration,
    STAGE_TAGS.prerequisiteOrdering,
    STAGE_TAGS.intrinsicDifficulty
  ],
  study_items: [
    STAGE_TAGS.layerPurposeGeneration,
    STAGE_TAGS.conceptLessonGeneration,
    STAGE_TAGS.lessonRedundancyJudgment,
    STAGE_TAGS.studyItemBlueprint,
    STAGE_TAGS.studyItemGeneration,
    STAGE_TAGS.matchingGeneration,
    STAGE_TAGS.impostorGeneration,
    STAGE_TAGS.optionSelectKeyVerification,
    STAGE_TAGS.impostorKeyVerification,
    STAGE_TAGS.matchingAssignmentVerification
  ]
} as const;

const ENRICHMENT_STAGE_SET = new Set<string>(EXPECTED_TOPIC_GENERATION_STAGE_PLAN.enrichment);
const STUDY_ITEM_STAGE_SET = new Set<string>(EXPECTED_TOPIC_GENERATION_STAGE_PLAN.study_items);
const STUDY_ITEM_STAGE_OFFSET = EXPECTED_TOPIC_GENERATION_STAGE_PLAN.enrichment.length;
const TOTAL_EXPECTED_STAGES = STUDY_ITEM_STAGE_OFFSET + EXPECTED_TOPIC_GENERATION_STAGE_PLAN.study_items.length;

export async function getExpeditionJournal(
  input: { learnerStateRef: string },
  deps: ExpeditionJournalDeps
): Promise<ExpeditionJournal> {
  const [candidates, expeditions, responseRows, lessonReads] = await Promise.all([
    deriveSharedCandidates(deps.enrichmentRead),
    deps.expeditionStore.listForLearner(input.learnerStateRef),
    deps.responseLog.listForLearner(input.learnerStateRef),
    deps.lessonReadStore.listForLearner(input.learnerStateRef)
  ]);

  const attempts = foldGradedAttempts(responseRows);
  const rows = await Promise.all(
    expeditions.map((expedition) =>
      expedition.status === "ready"
        ? readyRow(expedition, attempts, lessonReads, deps)
        : generatingRow(expedition, deps.timelineRead)
    )
  );

  // Partition WITHOUT re-sorting: owned rows arrive active-first from the store and
  // candidates readiness-ranked from the derivation; preserving input order keeps those
  // guarantees (KTD5).
  const started: ReadyExpeditionRow[] = [];
  const yours: ExpeditionJournalRow[] = [];
  for (const row of rows) {
    if (row.status === "ready" && (row.progress.itemsAttempted > 0 || row.progress.lessonsRead > 0)) {
      started.push(row);
    } else {
      yours.push(row);
    }
  }

  return {
    started,
    yours,
    // Curation (KTD8): filter adopted candidates first, then take the top five — an
    // adopted expedition surfaces as an owned row and consumes no Explore slot.
    shared: filterAdopted(candidates, expeditions).slice(0, EXPLORE_CANDIDATE_LIMIT).map(candidateCard)
  };
}

// Browse all: every shared, beginnable, ≥2-stop expedition the learner has not adopted,
// readiness-ranked and unlimited. Fetched lazily; carries no timelines or owned rows.
export async function getExpeditionCatalog(
  input: { learnerStateRef: string },
  deps: ExpeditionCatalogDeps
): Promise<ExpeditionCatalog> {
  const [candidates, expeditions] = await Promise.all([
    deriveSharedCandidates(deps.enrichmentRead),
    deps.expeditionStore.listForLearner(input.learnerStateRef)
  ]);
  return { candidates: filterAdopted(candidates, expeditions).map(candidateCard) };
}

// One Begin candidate per enrichment: the whole layer is the trail, so an enrichment
// offers a single expedition titled with its DERIVED summit. Readiness and counts are
// trail-scoped — they read only non-floored nodes, the same scope the projection walks.
type InternalCandidate = ExpeditionCandidateCard & {
  startedAt: string;
  readyStopCount: number;
};

async function deriveSharedCandidates(enrichmentRead: EnrichmentInspectionReadPort): Promise<InternalCandidate[]> {
  const summaries = await enrichmentRead.listEnrichmentSummaries();
  const details = await Promise.all(
    summaries
      .filter((summary) => summary.status === "succeeded" && summary.studyItemCount > 0)
      .map(async (summary) => ({ summary, detail: await enrichmentRead.getDerivedGraphDetail(summary.enrichmentId) }))
  );
  const candidates = details.flatMap(({ summary, detail }) => (detail ? candidateForSummary(summary, detail) : []));
  candidates.sort(compareExpeditionCandidates);
  return candidates;
}

function filterAdopted(candidates: InternalCandidate[], expeditions: LearnerExpedition[]): InternalCandidate[] {
  const adopted = new Set(expeditions.flatMap((expedition) => (expedition.enrichmentId ? [expedition.enrichmentId] : [])));
  return candidates.filter((candidate) => !adopted.has(candidate.enrichmentId));
}

function candidateCard(candidate: InternalCandidate): ExpeditionCandidateCard {
  return {
    enrichmentId: candidate.enrichmentId,
    title: candidate.title,
    declaredDomain: candidate.declaredDomain,
    totalStopCount: candidate.totalStopCount,
    searchTerms: candidate.searchTerms
  };
}

function candidateForSummary(summary: EnrichmentSummary, detail: DerivedGraphDetail): InternalCandidate[] {
  const { summit, trailNodeIds } = deriveFlooredExpedition(detail);
  if (!summit) return [];
  const trailNodes = detail.nodes.filter((node) => trailNodeIds.has(node.derivedNodeId));
  // A one-node layer is a summit without a trail. This is a structural property of an
  // expedition, shared by Explore and Browse all, rather than a heuristic content gate.
  if (trailNodes.length < 2) return [];
  const declaredDomain = detail.nodes.find((node) => node.derivedNodeId === summit.derivedNodeId)?.declaredDomain ?? detail.nodes[0]?.declaredDomain ?? "";
  return [{
    enrichmentId: summary.enrichmentId,
    title: summit.label,
    declaredDomain,
    searchTerms: [...new Set(trailNodes.flatMap((node) => [node.label, ...node.aliases]))],
    startedAt: summary.startedAt,
    readyStopCount: trailNodes.filter((node) => node.hasStudyItem).length,
    totalStopCount: trailNodes.length
  }];
}

function readyFraction(candidate: InternalCandidate): number {
  return candidate.totalStopCount === 0 ? 0 : candidate.readyStopCount / candidate.totalStopCount;
}

function compareExpeditionCandidates(a: InternalCandidate, b: InternalCandidate): number {
  const aFullyReady = a.readyStopCount === a.totalStopCount && a.totalStopCount > 0;
  const bFullyReady = b.readyStopCount === b.totalStopCount && b.totalStopCount > 0;
  return Number(bFullyReady) - Number(aFullyReady) ||
    readyFraction(b) - readyFraction(a) ||
    b.totalStopCount - a.totalStopCount ||
    Date.parse(b.startedAt) - Date.parse(a.startedAt) ||
    a.title.localeCompare(b.title) ||
    a.enrichmentId.localeCompare(b.enrichmentId);
}

type GradedAttempts = {
  attempted: Set<string>;
  latestCorrect: Map<string, boolean>;
};

function foldGradedAttempts(rows: Awaited<ReturnType<ResponseLogStorePort["listForLearner"]>>): GradedAttempts {
  const latest = new Map<string, { attemptSeq: number; correct: boolean }>();
  const attempted = new Set<string>();
  // Journal progress folds NEUTRAL study-item evidence only — scaffold responses never move a
  // journal bar (R19, KTD4).
  for (const row of neutralResponses(rows)) {
    if (row.signalType !== "graded" || !row.judgedOutcome) continue;
    attempted.add(row.studyItemId);
    const prior = latest.get(row.studyItemId);
    if (prior && prior.attemptSeq >= row.attemptSeq) continue;
    latest.set(row.studyItemId, { attemptSeq: row.attemptSeq, correct: row.judgedOutcome === "correct" });
  }
  return { attempted, latestCorrect: new Map([...latest].map(([id, entry]) => [id, entry.correct])) };
}

async function readyRow(
  expedition: LearnerExpedition,
  attempts: GradedAttempts,
  lessonReads: Awaited<ReturnType<LessonReadStorePort["listForLearner"]>>,
  deps: ExpeditionJournalDeps
): Promise<ReadyExpeditionRow> {
  const base = {
    status: "ready" as const,
    learnerExpeditionId: expedition.learnerExpeditionId,
    title: expedition.title,
    declaredDomain: expedition.declaredDomain,
    enrichmentId: expedition.enrichmentId,
    active: expedition.active
  };
  if (!expedition.enrichmentId) {
    return { ...base, progress: { itemsPassed: 0, itemsAttempted: 0, lessonsRead: 0, itemsTotal: 0 }, layerPurpose: null };
  }
  const [items, detail, layerPurpose] = await Promise.all([
    deps.studyItemStore.listStudyItemsForEnrichment(expedition.enrichmentId),
    deps.enrichmentRead.getDerivedGraphDetail(expedition.enrichmentId),
    deps.layerPurposeStore.get(expedition.enrichmentId)
  ]);
  // Count only items on TRAIL-reachable (non-floored) nodes, so the total matches the
  // stop math the trail walks. A missing detail falls back to the whole bank.
  const trailNodeIds = detail ? deriveFlooredExpedition(detail).trailNodeIds : null;
  const trailItems = trailNodeIds ? items.filter((item) => trailNodeIds.has(item.derivedNodeId)) : items;
  const itemIds = new Set(trailItems.map((item) => item.studyItemId));
  return {
    ...base,
    progress: {
      itemsPassed: [...itemIds].filter((studyItemId) => attempts.latestCorrect.get(studyItemId) === true).length,
      itemsAttempted: [...itemIds].filter((studyItemId) => attempts.attempted.has(studyItemId)).length,
      lessonsRead: trailNodeIds ? lessonReads.filter((read) => trailNodeIds.has(read.derivedNodeId)).length : lessonReads.length,
      itemsTotal: itemIds.size
    },
    layerPurpose: layerPurpose ?? null
  };
}

async function generatingRow(
  expedition: LearnerExpedition,
  timelineRead: OperationTimelineReadPort
): Promise<GeneratingExpeditionRow> {
  // Timelines are fetched only for rows that are generating/failed with a claimed
  // operation — exactly the rows the route stitched timelines for before this module.
  const timeline = expedition.currentOperationId
    ? await timelineRead.getOperationTimeline(expedition.currentOperationId, expedition.currentOperationType ?? undefined)
    : undefined;
  return {
    status: expedition.status === "failed" ? "failed" : "generating",
    learnerExpeditionId: expedition.learnerExpeditionId,
    title: expedition.title,
    declaredDomain: expedition.declaredDomain,
    failureMessage: expedition.failureMessage,
    generation: generationFacts(expedition, timeline)
  };
}

function generationFacts(expedition: LearnerExpedition, timeline: OperationTimelineDetail | undefined): ExpeditionGenerationFacts {
  // `generating` with no operation id means nobody is working the row — it is queued
  // (or transiently released for retry), so the card shows a waiting state instead of a
  // progress surface that never moves.
  const queued = expedition.status === "generating" && !expedition.currentOperationId;
  const total = TOTAL_EXPECTED_STAGES;
  if (!timeline) {
    return { queued, stalled: false, completed: 0, total, fraction: null, indeterminate: true, currentStage: null };
  }
  const stageSet = timeline.summary.operationType === "study_items" ? STUDY_ITEM_STAGE_SET : ENRICHMENT_STAGE_SET;
  const offset = timeline.summary.operationType === "study_items" ? STUDY_ITEM_STAGE_OFFSET : 0;
  // A succeeded phase counts as its full stage span regardless of which conditional
  // stages actually appeared (domain inference is skipped on retry; matching/impostor
  // and their judges when the blueprint admits none) — so the bar reaches its phase
  // boundary and 100% at success instead of capping below it. Mid-run skew from an
  // absent stage stays small.
  const phaseComplete = timeline.summary.status === "succeeded";
  const completedInTimeline = phaseComplete
    ? stageSet.size
    : timeline.stages.filter((stage) => stageSet.has(stage.stage) && stage.endedAt && stage.ok !== false).length;
  const completed = Math.min(total, Math.max(0, offset + completedInTimeline));
  const currentStage = timeline.stages.find((stage) => !stage.endedAt)?.stage ?? timeline.stages.at(-1)?.stage ?? null;
  const indeterminate = currentStage !== null && !stageSet.has(currentStage) && timeline.summary.status === "running";
  return {
    queued,
    stalled: isStaleOperation(timeline.summary.status, timeline.summary.lastProgressAt),
    completed,
    total,
    fraction: indeterminate ? null : completed / total,
    indeterminate,
    currentStage
  };
}

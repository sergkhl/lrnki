import { neutralResponses } from "@lrnki/domain-core";
import type {
  EnrichmentInspectionReadPort,
  EnrichmentLayerPurposeStorePort,
  LearnerExpedition,
  LearnerExpeditionStorePort,
  LessonReadStorePort,
  OperationTimelineDetail,
  OperationTimelineReadPort,
  ResponseLogStorePort,
  StudyItemBankStorePort
} from "@lrnki/ports";
import { deriveFlooredExpedition } from "./expeditionSections";
import {
  learnerKnowledgeCapabilityIsAvailable,
  type LearnerKnowledgeAvailability
} from "./learnerKnowledgeAvailability";
import { isStaleOperation } from "./operationRunLiveness";
import type { SourceExpeditionCandidate, SourceExpeditionModule } from "./sourceExpedition";
import {
  TOPIC_EXPEDITION_STAGE_PROFILE,
  TOPIC_EXPEDITION_STAGE_TOTAL,
  type TopicExpeditionPhase
} from "./topicExpeditionStageProfile";

// The Expedition Journal projection (plan 2026-07-12-001): one application module owns
// candidate derivation, trail-scoped progress, generation facts, the tier partition, and
// Explore curation behind two entry points. Rows cross the seam as a finished
// status-discriminated union — raw LearnerExpedition rows, fencing fields, and operation
// timelines never reach the wire.

// The shared, beginnable candidate as surfaces render and act on it. Readiness rank,
// adoption linkage, and summit identity are module-internal.
export type ExpeditionCandidateCard = SourceExpeditionCandidate;

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
  sourceExpeditions: Pick<SourceExpeditionModule, "listCandidates">;
};

// Every dependency is required (KTD7): the interface no longer encodes the
// implementation's data flow, so `progress` is always present on ready rows.
export type ExpeditionJournalDeps = {
  sourceExpeditions: Pick<SourceExpeditionModule, "listCandidates" | "openOwned">;
  enrichmentRead: EnrichmentInspectionReadPort;
  expeditionStore: LearnerExpeditionStorePort;
  learnerKnowledgeAvailability: LearnerKnowledgeAvailability;
  studyItemStore: StudyItemBankStorePort;
  responseLog: ResponseLogStorePort;
  lessonReadStore: LessonReadStorePort;
  layerPurposeStore: EnrichmentLayerPurposeStorePort;
  timelineRead: OperationTimelineReadPort;
};

// Explore shows the top shared candidates; the catalog stays unlimited.
const EXPLORE_CANDIDATE_LIMIT = 5;

const PROFILE_STAGE_SETS: Readonly<Record<TopicExpeditionPhase, ReadonlySet<string>>> = {
  enrichment: new Set(TOPIC_EXPEDITION_STAGE_PROFILE.enrichment.map((descriptor) => descriptor.stage)),
  study_items: new Set(TOPIC_EXPEDITION_STAGE_PROFILE.study_items.map((descriptor) => descriptor.stage))
};
const STUDY_ITEM_STAGE_OFFSET = TOPIC_EXPEDITION_STAGE_PROFILE.enrichment.length;

export async function getExpeditionJournal(
  input: { learnerStateRef: string },
  deps: ExpeditionJournalDeps
): Promise<ExpeditionJournal> {
  const [candidates, expeditions, responseRows, lessonReads] = await Promise.all([
    deps.sourceExpeditions.listCandidates(input),
    deps.expeditionStore.listForLearner(input.learnerStateRef),
    deps.responseLog.listForLearner(input.learnerStateRef),
    deps.lessonReadStore.listForLearner(input.learnerStateRef)
  ]);

  const attempts = foldGradedAttempts(responseRows);
  const syntheticAvailable = learnerKnowledgeCapabilityIsAvailable(
    deps.learnerKnowledgeAvailability,
    "syntheticTopicGeneration"
  );
  const ownedExpeditions = expeditions.filter((expedition) =>
    expedition.kind === "source"
      ? expedition.status === "ready"
      : syntheticAvailable
  );
  const rows = (await Promise.all(
    ownedExpeditions.map((expedition) =>
      expedition.status === "ready"
        ? readyRow(expedition, attempts, lessonReads, deps)
        : generatingRow(expedition, deps.timelineRead)
    )
  )).filter((row): row is ExpeditionJournalRow => row !== undefined);

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
    // Candidate qualification and valid-adoption filtering are owned by Source Expeditions.
    shared: candidates.slice(0, EXPLORE_CANDIDATE_LIMIT)
  };
}

// Browse all: every shared, beginnable, ≥2-stop expedition the learner has not adopted,
// readiness-ranked and unlimited. Fetched lazily; carries no timelines or owned rows.
export async function getExpeditionCatalog(
  input: { learnerStateRef: string },
  deps: ExpeditionCatalogDeps
): Promise<ExpeditionCatalog> {
  return { candidates: await deps.sourceExpeditions.listCandidates(input) };
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
): Promise<ReadyExpeditionRow | undefined> {
  const opened = expedition.kind === "source" && expedition.enrichmentId
    ? await deps.sourceExpeditions.openOwned({
        learnerStateRef: expedition.learnerStateRef,
        enrichmentId: expedition.enrichmentId
      })
    : undefined;
  if (opened?.status === "unavailable") return undefined;
  const base = {
    status: "ready" as const,
    learnerExpeditionId: expedition.learnerExpeditionId,
    title: opened?.candidate.title ?? expedition.title,
    declaredDomain: opened?.candidate.declaredDomain ?? expedition.declaredDomain,
    enrichmentId: expedition.enrichmentId,
    active: expedition.active
  };
  if (!expedition.enrichmentId) {
    return { ...base, progress: { itemsPassed: 0, itemsAttempted: 0, lessonsRead: 0, itemsTotal: 0 }, layerPurpose: null };
  }
  const [detail, items, layerPurpose] = opened
    ? [opened.assets.detail, opened.assets.studyItems, await deps.layerPurposeStore.get(expedition.enrichmentId)]
    : await Promise.all([
        deps.enrichmentRead.getDerivedGraphDetail(expedition.enrichmentId),
        deps.studyItemStore.listStudyItemsForEnrichment(expedition.enrichmentId),
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
  const total = TOPIC_EXPEDITION_STAGE_TOTAL;
  if (!timeline) {
    return { queued, stalled: false, completed: 0, total, fraction: null, indeterminate: true, currentStage: null };
  }
  const phase: TopicExpeditionPhase = timeline.summary.operationType === "study_items" ? "study_items" : "enrichment";
  const phaseProfile = TOPIC_EXPEDITION_STAGE_PROFILE[phase];
  const stageSet = PROFILE_STAGE_SETS[phase];
  const offset = phase === "study_items" ? STUDY_ITEM_STAGE_OFFSET : 0;
  // A succeeded phase counts as its full stage span regardless of which conditional
  // stages actually appeared (domain inference is skipped on retry; matching/impostor
  // and their judges when the blueprint admits none) — so the bar reaches its phase
  // boundary and 100% at success instead of capping below it. Mid-run skew from an
  // absent stage stays small.
  const phaseComplete = timeline.summary.status === "succeeded";
  const successfulStages = new Set(
    timeline.stages
      .filter((stage) => stageSet.has(stage.stage) && stage.endedAt && stage.ok !== false)
      .map((stage) => stage.stage)
  );
  const completedInTimeline = phaseComplete ? phaseProfile.length : successfulStages.size;
  const completed = Math.min(total, Math.max(0, offset + completedInTimeline));
  const openStages = timeline.stages.filter((stage) => !stage.endedAt);
  const currentStage = phaseProfile.find((descriptor) =>
    openStages.some((stage) => stage.stage === descriptor.stage)
  )?.stage ?? openStages[0]?.stage ?? timeline.stages.at(-1)?.stage ?? null;
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

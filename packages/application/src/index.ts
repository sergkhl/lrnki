export { runExtractionOverSources, type ExtractionSourceUnit } from "./runExtractionOverSources";
export { buildGraphVersion } from "./buildGraphVersion";
export { runGraphEnrichment, DEFAULT_ENRICHMENT_CONFIG } from "./runGraphEnrichment";
export type { GraphEnrichmentConfig } from "./runGraphEnrichment";
export { runSyntheticGeneration, DEFAULT_SYNTHETIC_GENERATION_CONFIG } from "./runSyntheticGeneration";
export type { SyntheticGenerationConfig } from "./runSyntheticGeneration";
export {
  calibrateKnowledgeBoundaryProbe,
  parseKnowledgeBoundaryLadder,
  scoreKnowledgeBoundaryVectors,
  type KnowledgeBoundaryCalibrationReport,
  type KnowledgeBoundaryLadderConcept
} from "./calibrateKnowledgeBoundaryProbe";
export {
  auditDiscoveryCoverage,
  aggregateDiscoveryCoverageMisses,
  normalizeObjectiveLabel,
  DISCOVERY_COVERAGE_RECURRENCE_THRESHOLD,
  type DiscoveryCoverageAuditReport,
  type DiscoveryCoverageAggregatedMiss,
  type DiscoveryCoverageSample
} from "./auditDiscoveryCoverage";
export { generateStudyItemBank } from "./generateStudyItemBank";
export {
  composeScaffoldDetours,
  type ScaffoldDetourView,
  type ScaffoldStepView,
  type ScaffoldDetourGroup,
  type ScaffoldGeneratingPhase,
  type ComposeScaffoldDetoursInput,
  type ReferencedNodeCompletion
} from "./studySessionTrail";
export {
  runScaffoldGeneration,
  resolveExactMatch,
  buildScaffoldNodePayload,
  type ScaffoldGenerationDeps,
  type ScaffoldReuseCandidate,
  type ScaffoldParentContext,
  type ScaffoldGroundResult,
  type ScaffoldGenerationOutcome
} from "./learnerScaffoldGeneration";
export { generateTopicExpedition } from "./generateTopicExpedition";
export {
  registerLearner,
  enterLearnerSession,
  hashLearnerPin,
  type RegisterLearnerResult,
  type EnterLearnerSessionResult
} from "./learnerRegistry";
export {
  isoWeekKey,
  isoWeekRange,
  previousIsoWeekKey,
  difficultyBand,
  computeWeeklyPoints,
  nodeCompletionTimeMs,
  badgesFromAwards,
  type MasteredNodeContribution,
  type WeeklyLeaderboardRow,
  type LearnerBadges
} from "./weeklyLeaderboard";
export { getWeeklyLeaderboard, lifetimeMasteredCrystalCount, type WeeklyLeaderboard } from "./getWeeklyLeaderboard";
export {
  getDuelSetup,
  gradeDuelAnswer,
  DUEL_REQUIRED_CRYSTALS,
  DUEL_REQUIRED_ITEMS,
  DUEL_QUESTION_COUNT,
  type DuelSetup,
  type DuelPoolItem,
  type DuelAnswerSubmission,
  type GradeDuelAnswerResult
} from "./crystalDuel";

export { createIntrinsicDifficultyPort } from "./intrinsicDifficulty";
export { resolveConceptIdentity, type ConceptIdentityCandidate } from "./resolveConceptIdentity";
export { synthesizeResponses } from "./syntheticResponses";

export {
  costTimingReport,
  mergeOperationStageRows,
  type CostTimingReport,
  type CostTimingStageRow,
  type CostTimingTotals,
  type CostTimingOperationReport
} from "./costTimingReport";
export {
  listOperationJourneys,
  type OperationJourney,
  type OperationJourneyList
} from "./listOperationJourneys";
export { rankBottleneckTargets, type RankedTarget } from "./rankBottleneckTargets";
export {
  OPERATION_HEARTBEAT_STALE_AFTER_MS,
  isStaleOperation,
  operationStaleBefore
} from "./operationRunLiveness";
export {
  NON_LLM_STAGES,
  operationTimelineLlmSpendStageTags,
  stageBelongsToOperation,
  spendStageBelongsToOperation
} from "./operationTimelineCatalog";

export { appendGradedMatchingOutcome, appendGradedSelectionOutcome, type MatchingAttemptTrace } from "./gradedSelectionOutcome";
export {
  gradeStudyResponse,
  checkMatchingAttempt,
  recordLearnerVerdict,
  recordLessonRead,
  type StudyResponseSubmission,
  type GradeStudyResponseResult,
  type GradeRefusalReason,
  type NodeWriteRefusalReason,
  type GradedResponse,
  type MatchingAttemptCheckResult,
  type NodeWriteResult
} from "./gradeStudyResponse";
export {
  listLearnerStates,
  listLearnerAdminSummaries,
  getLearnerLoopDetail,
  type ConceptConflict,
  type LearnerAdminRegistry,
  type LearnerAdminStats,
  type LearnerAdminSummary,
  type LearnerLoopDetail,
  type LearnerResponseView,
  type LearnerStateSummary,
  type ResponseSourceSummary
} from "./learnerLoopProjection";

export {
  buildTargetCandidates,
  filterTargets,
  recommendedTargets,
  type TargetCandidate
} from "./targetCandidates";
export {
  getExpeditionCatalog,
  getExpeditionJournal,
  type ExpeditionCandidateCard,
  type ExpeditionCatalog,
  type ExpeditionCatalogDeps,
  type ExpeditionGenerationFacts,
  type ExpeditionJournal,
  type ExpeditionJournalDeps,
  type ExpeditionJournalRow,
  type ExpeditionProgress,
  type GeneratingExpeditionRow,
  type ReadyExpeditionRow
} from "./expeditionJournal";

export {
  labelFor,
  type ConceptLessonSectionView,
  type ConceptLessonView,
  type SheetContent,
  type StudyImpostorView,
  type StudyItemView,
  type StudyMatchingView,
  type StudyOptionSelectView,
  type StudySession
} from "./studySessionProjection";
export { getStudySession } from "./getStudySession";
export {
  type AdaptedNodeClassification,
  type AdaptedNodeState
} from "./adaptivePathProjection";
export {
  deriveFlooredExpedition,
  projectExpeditionSections,
  type ExpeditionSection,
  type ExpeditionSectionStep,
  type SectionedExpedition
} from "./expeditionSections";

export {
  composeCalibrationSession,
  type CalibrationSessionProjection
} from "./calibrationList";
export {
  layoutSphereGrid,
  type SphereGridEdgeInput,
  type SphereGridFlaggedLoop,
  type SphereGridLayout,
  type SphereGridNodeInput
} from "./sphereGridLayout";

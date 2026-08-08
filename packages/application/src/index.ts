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
export {
  auditScaffoldContent,
  detectFormattingArtifacts,
  scaffoldMicroLessonText,
  SCAFFOLD_CONTENT_CONGRUENCE_RECURRENCE_THRESHOLD,
  type ScaffoldContentAuditReport,
  type ScaffoldContentStepAudit,
  type ScaffoldContentCongruenceSample,
  type ScaffoldContentAuditSampleProgress,
  type FormattingArtifactFinding,
  type FormattingArtifactType,
  type ScaffoldContentField
} from "./auditScaffoldContent";
export { generateStudyItemBank } from "./generateStudyItemBank";
export {
  composeScaffoldDetours,
  type ScaffoldDetourView,
  type ScaffoldStepView,
  type ScaffoldReferenceDestination,
  type ScaffoldGeneratingPhase,
  type ComposeScaffoldDetoursInput,
  type ProjectedScaffoldReference
} from "./studySessionTrail";
export {
  createScaffoldGeneration,
  DEFAULT_SCAFFOLD_GENERATION_CONFIG,
  type ScaffoldGeneration,
  type ScaffoldGenerationConfig,
  type ScaffoldGenerationConstruction,
  type ScaffoldGenerationRequest,
  type ScaffoldOpeningStudySession
} from "./learnerScaffoldGeneration";
export {
  createTopicExpeditionGeneration,
  type TopicExpeditionGeneration,
  type TopicExpeditionRequest
} from "./generateTopicExpedition";
export { GenerationClaimLostError, isGenerationClaimLostError } from "./generationClaimLost";
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
  OPERATION_TIMELINE_CATALOG,
  SHARED_STAGES,
  operationTimelineLlmSpendStageTags,
  stageBelongsToOperation,
  spendStageBelongsToOperation
} from "./operationTimelineCatalog";
export {
  runInstrumentedOperation,
  noopRunProgressReporter,
  passthroughStageBracket,
  type StageBracket
} from "./runProgressReporter";
export {
  probeKnowledgeBoundary,
  DEFAULT_KNOWLEDGE_BOUNDARY_PROBE_CONFIG,
  type KnowledgeBoundaryVerdict,
  type KnowledgeBoundaryProbeConfig
} from "./knowledgeBoundaryProbe";

export { appendGradedMatchingOutcome, appendGradedScaffoldOutcome, appendGradedSelectionOutcome, keyedCorrectIdFor, keyedMatchIdFor, type MatchingAttemptTrace } from "./gradedSelectionOutcome";
export { ENRICHMENT_LINEUP_MAX, SECTION_LINEUP_MAX } from "./recallLineupBudget";
export {
  RECALL_MISS_BUFFER,
  currentTurnItemId,
  foldRecallChallenge,
  latestCorrectStudyItemIds,
  projectRecallChallengeView,
  projectRecallScopeStatuses,
  eligibleRecallItems,
  selectRecallLineup,
  createRecallChallenge,
  type RecallAnswerFeedback,
  type RecallAnswerResult,
  type RecallChallengeDeps,
  type RecallChallengeModule,
  type RecallChallengeRefusal,
  type RecallCreateResult,
  type RecallLifecycleResult,
  type RecallReadResult,
  type RecallScopeStatus,
  type RecallChallengeView,
  type RecallCombatPhase,
  type RecallCombatState,
  type RecallEligibleItem,
  type RecallMatchingBoard,
  type RecallMatchingProgressView
} from "./recallChallenge";
export {
  gradeStudyResponse,
  checkMatchingAttempt,
  recordLearnerVerdict,
  recordLessonRead,
  gradeScaffoldOptionSelect,
  gradeScaffoldReferenceOptionSelect,
  recordScaffoldLessonRead,
  type StudyResponseSubmission,
  type GradeStudyResponseResult,
  type GradeRefusalReason,
  type NodeWriteRefusalReason,
  type GradedResponse,
  type MatchingAttemptCheckResult,
  type NodeWriteResult,
  type GradeScaffoldOptionSelectResult,
  type ScaffoldGradeRefusal,
  type RecordScaffoldLessonReadResult
} from "./gradeStudyResponse";
export {
  requestLearnerScaffold,
  retryLearnerScaffold,
  hideLearnerScaffold,
  type ScaffoldTermSource,
  type RequestScaffoldRefusal,
  type RequestLearnerScaffoldResult
} from "./requestLearnerScaffold";
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
  type ExplorableTermSupport,
  type ExplorableTermSupportLookup,
  type ExplorableTermView,
  type SheetContent,
  type StudyImpostorView,
  type StudyItemView,
  type StudyMatchingView,
  type NeutralReferenceAssets,
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
  layoutSphereGrid,
  type SphereGridEdgeInput,
  type SphereGridFlaggedLoop,
  type SphereGridLayout,
  type SphereGridNodeInput
} from "./sphereGridLayout";

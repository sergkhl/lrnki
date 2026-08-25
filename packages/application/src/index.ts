export { runExtractionOverSources, type ExtractionSourceUnit } from "./runExtractionOverSources";
export { ADMISSION_LABEL_NON_CONCEPT_POLICY } from "./applyAdmissionLabelJudge";
export { buildGraphVersion } from "./buildGraphVersion";
export {
  canonicalizeConcepts,
  loadConceptCanonicalizationArtifact,
  summarizeConceptCanonicalization,
  DEFAULT_CONCEPT_CANONICALIZATION_CONFIG,
  type ConceptCanonicalizationConfig,
  type ConceptCanonicalizationMode,
  type ConceptCanonicalizationSummary
} from "./canonicalizeConcepts";
export { runGraphEnrichment, DEFAULT_ENRICHMENT_CONFIG } from "./runGraphEnrichment";
export type { GraphEnrichmentConfig } from "./runGraphEnrichment";
export { runSyntheticGeneration, DEFAULT_SYNTHETIC_GENERATION_CONFIG } from "./runSyntheticGeneration";
export type { SyntheticGenerationConfig } from "./runSyntheticGeneration";
export {
  createSourceLessGroundingAdmission,
  DEFAULT_SOURCE_LESS_GROUNDING_ADMISSION_POLICY,
  type BoundaryProbeSummary,
  type CoreProbeSummary,
  type GroundingAdmissionCandidate,
  type GroundingAdmissionOutcome,
  type SourceLessGroundingAdmission,
  type SourceLessGroundingAdmissionPolicy
} from "./sourceLessGroundingAdmission";
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
  operationTimelineAllowedNeuralStages,
  operationTimelineAllowedStages,
  operationTimelineLlmSpendStageTags,
  stageBelongsToOperation,
  spendStageBelongsToOperation
} from "./operationTimelineCatalog";
export {
  DERIVED_GRAPH_COMPLETION_STAGE_GROUP,
  SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP,
  STUDY_ITEM_BANK_STAGE_GROUP,
  SYNTHETIC_GENERATION_STAGE_GROUP,
  TOPIC_EXPEDITION_PRODUCER_STAGE_GROUPS,
  TOPIC_EXPEDITION_STAGE_PROFILE,
  TOPIC_EXPEDITION_STAGE_TOTAL,
  type GenerationStageDescriptor,
  type TopicExpeditionPhase
} from "./topicExpeditionStageProfile";
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
  CURRENT_LEARNER_KNOWLEDGE_AVAILABILITY,
  derivedGraphLearnerKnowledgeAvailability,
  learnerKnowledgeCapabilityIsAvailable,
  learnerKnowledgeIsAvailable,
  type LearnerKnowledgeAvailability,
  type LearnerKnowledgeCapability,
  type LearnerKnowledgeCapabilityAvailability,
  type LearnerKnowledgeHoldoutReason,
  type DerivedGraphLearnerKnowledgeAvailability
} from "./learnerKnowledgeAvailability";
export {
  SOURCE_EXPEDITION_ASSET_QUALIFICATION_CONTRACT,
  createSourceExpeditionModule,
  qualifiedSourceExpeditionAssetConfigHash,
  type OpenedSourceExpedition,
  type QualifiedSourceExpedition,
  type QualifiedSourceExpeditionAssets,
  type SourceExpeditionCandidate,
  type SourceExpeditionModule,
  type SourceExpeditionModuleDeps,
  type SourceExpeditionOpenResult,
  type SourceExpeditionQualification,
  type SourceExpeditionUnavailable,
  type SourceExpeditionUnavailableReason
} from "./sourceExpedition";
export {
  SOURCE_CITATION_MATCH_CLASSIFICATION_POLICY,
  SOURCE_MATERIAL_CLAIM_PROJECTION,
  projectSourceMaterialClaims,
  renderSourceMaterialClaim,
  type SourceMaterialClaim,
  type SourceMaterialClaimLocation,
  type SourceMaterialClaimProjection,
  type SourceMaterialClaimSet,
  type SourceMaterialClaimSubject,
  type SourceMaterialEvidenceReference
} from "./sourceMaterialClaims";
export {
  settleSourceCitationMatchKinds,
  type ResolvedSourceCitationEvidence
} from "./sourceCitationMatch";
export {
  SOURCE_MATERIAL_CLAIM_SUPPORT_QUALIFICATION_SCHEMA_VERSION,
  parseSourceMaterialClaimSupportQualificationMatrix,
  qualifySourceMaterialClaimSupport,
  type SourceMaterialClaimSupportQualificationCase,
  type SourceMaterialClaimSupportQualificationMatrix,
  type SourceMaterialClaimSupportQualificationObservation,
  type SourceMaterialClaimSupportQualificationReport,
  type SourceMaterialClaimSupportQualificationSource
} from "./sourceMaterialClaimSupportQualification";
export {
  SOURCE_ASSET_EVALUATION_REPORT_SCHEMA_VERSION,
  SOURCE_LESSON_EXTRACTIVE_ADMISSION_POLICY,
  SOURCE_MATERIAL_CLAIM_SUPPORT_ACCEPTANCE_DRAWS,
  evaluateProjectedOptionSelectTruth,
  evaluateProjectedSourceSupport,
  type SourceAssetEvaluationStage,
  evaluateQualifiedSourceExpedition,
  settleOptionSelectTruth,
  type DistractorInvalidityDecision,
  type DistractorInvalidityDecisionReason,
  type EvaluationDisposition,
  type JoinedSourceMaterialEvidence,
  type ProjectedOptionSelectTruthEvaluation,
  type ProjectedSourceSupportEvaluation,
  type KeyUniquenessDecision,
  type KeyUniquenessDecisionReason,
  type SourceAssetEvaluationReport,
  type SourceSupportDecision,
  type SourceSupportDecisionReason,
  type SourceSupportSample,
  type SourceSupportNodeContext
} from "./sourceAssetEvaluation";
export {
  admitSourceConceptLessons,
  type SourceLessonAdmissionResult
} from "./sourceLessonAdmission";
export {
  admitSourceOptionSelectItems,
  type SourceOptionSelectAdmissionResult
} from "./sourceOptionSelectAdmission";
export {
  SOURCE_OPTION_EXACT_REFERENCE_ADMISSION_POLICY,
  sourceOptionExactReferenceContractReasons,
  sourceOptionExactReferenceQuestion,
  sourceOptionUsesExactReferenceContract
} from "./sourceOptionExactReference";

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

import {
  createTopicExpeditionGeneration,
  createSourceLessGroundingAdmission,
  createIntrinsicDifficultyPort,
  generateStudyItemBank,
  runSyntheticGeneration,
  DEFAULT_ENRICHMENT_CONFIG,
  DEFAULT_SYNTHETIC_GENERATION_CONFIG,
  type TopicExpeditionGeneration
} from "@lrnki/application";
import {
  createConceptLessonGenerationPort,
  createConceptLessonRedundancyJudgmentPort,
  createConceptSetSynthesisPort,
  createClaimFactualityChallengePort,
  createClaimFactualityJudgmentPort,
  createClaimVerificationAnsweringPort,
  createClaimVerificationQuestionPlanningPort,
  createGroundingGenerationPort,
  createAnswerKeyVerificationPort,
  createMatchingAssignmentVerificationPort,
  createIntrinsicDifficultyJudgmentPort,
  createLayerPurposeGenerationPort,
  createKnowledgeBoundaryProbePort,
  createDeclaredDomainInferencePort,
  LiteLlmNodeEmbeddingAdapter,
  createPrerequisiteOrderingPort,
  createStudyItemBlueprintPort,
  createStudyItemGenerationPort,
  createNeuralClients,
  studyItemBankConfigHash,
  withSyntheticGenerationConfigHash,
  type TopicExpeditionModelRouting
} from "@lrnki/infrastructure-litellm";
import {
  PostgresConceptLessonStore,
  PostgresEnrichmentLayerPurposeStore,
  PostgresEnrichmentRunStore,
  PostgresGraphVersionStore,
  PostgresLearnerExpeditionStore,
  PostgresRunProgressReporter,
  PostgresStudyItemBankStore
} from "@lrnki/infrastructure-postgres";
import type { DatabaseClient } from "./db";

export const TOPIC_EXPEDITION_MODEL_ROUTING = {
  generation: "kg-topic-expedition-generation",
  independentJudge: "kg-topic-expedition-independent-judge",
  claimVerificationAnswerer: "kg-topic-expedition-claim-verification-answerer",
  claimFactualityJudge: "kg-topic-expedition-claim-factuality-judge",
  claimVerificationPlanner: "kg-topic-expedition-claim-verification-planner",
  claimFactualityChallenger: "kg-topic-expedition-claim-factuality-challenger",
  prerequisiteOrdering: "kg-topic-expedition-prerequisite-ordering"
} as const satisfies TopicExpeditionModelRouting;

// Production composition for Topic Expedition generation (plan 2026-07-13-001 U2): the
// full neural, store, reporter, and config-hash construction happens ONCE here, adapted
// into the lifecycle module's small construction interface. `sql` is the supervisor's
// shared pool — this composition borrows it and never closes it.
export function createLearnerTopicExpeditionGeneration(sql: DatabaseClient): TopicExpeditionGeneration {
  // Client-construction policy (env base config + deterministic/probe/embedding
  // sampling decisions and their rationale) lives once in createNeuralClients,
  // shared with the kg-worker root.
  const { deterministicClient, probeClient, embeddingClient } = createNeuralClients();
  const graphStore = new PostgresGraphVersionStore(sql);
  const enrichmentStore = new PostgresEnrichmentRunStore(sql);
  const reporter = new PostgresRunProgressReporter(sql);
  const routing = TOPIC_EXPEDITION_MODEL_ROUTING;
  const syntheticConfig = withSyntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG, routing);
  const sourceLessGroundingAdmission = createSourceLessGroundingAdmission({
    knowledgeBoundaryProbe: createKnowledgeBoundaryProbePort(probeClient),
    embedding: new LiteLlmNodeEmbeddingAdapter(embeddingClient),
    groundingGeneration: createGroundingGenerationPort(deterministicClient, routing.generation),
    claimVerificationQuestionPlanning: createClaimVerificationQuestionPlanningPort(
      deterministicClient,
      routing.claimVerificationPlanner
    ),
    claimVerificationAnswering: createClaimVerificationAnsweringPort(
      deterministicClient,
      routing.claimVerificationAnswerer
    ),
    claimFactualityJudgments: [
      createClaimFactualityJudgmentPort(deterministicClient, routing.claimFactualityJudge),
      createClaimFactualityChallengePort(deterministicClient, routing.claimFactualityChallenger)
    ],
    policy: syntheticConfig.sourceLessGroundingAdmission
  });
  const bankConfigHash = studyItemBankConfigHash(routing);
  return createTopicExpeditionGeneration({
    expeditionProgress: new PostgresLearnerExpeditionStore(sql),
    syntheticGeneration: async (activity) => {
      const layer = await runSyntheticGeneration({
        enrichmentId: activity.enrichmentId,
        topic: activity.topic,
        declaredDomain: activity.declaredDomain,
        onDeclaredDomain: activity.onDeclaredDomain,
        declaredDomainInference: createDeclaredDomainInferencePort(deterministicClient, routing.generation),
        conceptSetSynthesis: createConceptSetSynthesisPort(deterministicClient, routing.generation),
        sourceLessGroundingAdmission,
        prerequisiteOrdering: createPrerequisiteOrderingPort(deterministicClient, routing.prerequisiteOrdering),
        difficulty: createIntrinsicDifficultyPort(
          createIntrinsicDifficultyJudgmentPort(deterministicClient, routing.independentJudge),
          DEFAULT_ENRICHMENT_CONFIG.difficultySampleCount
        ),
        enrichmentStore,
        config: syntheticConfig,
        reporter
      });
      return { conceptCount: layer.derivedNodes.length };
    },
    studyItemBankGeneration: async (activity) => {
      await generateStudyItemBank({
        enrichmentId: activity.enrichmentId,
        configHash: bankConfigHash,
        graphStore,
        enrichmentStore,
        conceptLessonGeneration: createConceptLessonGenerationPort(deterministicClient, routing.generation),
        conceptLessonRedundancyJudge: createConceptLessonRedundancyJudgmentPort(
          deterministicClient,
          routing.independentJudge
        ),
        layerPurposeGeneration: createLayerPurposeGenerationPort(deterministicClient, routing.generation),
        layerPurposeStore: new PostgresEnrichmentLayerPurposeStore(sql),
        studyItemBlueprint: createStudyItemBlueprintPort(deterministicClient, routing.generation),
        answerKeyVerification: createAnswerKeyVerificationPort(deterministicClient, routing.independentJudge),
        matchingAssignmentVerification: createMatchingAssignmentVerificationPort(
          deterministicClient,
          routing.independentJudge
        ),
        conceptLessonStore: new PostgresConceptLessonStore(sql),
        studyItemGeneration: createStudyItemGenerationPort(deterministicClient, routing.generation),
        studyItemBankStore: new PostgresStudyItemBankStore(sql),
        reporter
      });
    }
  });
}

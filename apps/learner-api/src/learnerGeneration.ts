import {
  createTopicExpeditionGeneration,
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
  createGroundingFactualityRevisionPort,
  createGroundingGenerationPort,
  createGroundingVerificationAnsweringPort,
  createGroundingVerificationQuestionPlanningPort,
  createImpostorLieValidityJudgmentPort,
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
  withSyntheticGenerationConfigHash
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
  const syntheticConfig = withSyntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG);
  const bankConfigHash = studyItemBankConfigHash();
  return createTopicExpeditionGeneration({
    expeditionProgress: new PostgresLearnerExpeditionStore(sql),
    syntheticGeneration: async (activity) => {
      const layer = await runSyntheticGeneration({
        enrichmentId: activity.enrichmentId,
        topic: activity.topic,
        declaredDomain: activity.declaredDomain,
        onDeclaredDomain: activity.onDeclaredDomain,
        declaredDomainInference: createDeclaredDomainInferencePort(deterministicClient),
        conceptSetSynthesis: createConceptSetSynthesisPort(deterministicClient),
        knowledgeBoundaryProbe: createKnowledgeBoundaryProbePort(probeClient),
        embedding: new LiteLlmNodeEmbeddingAdapter(embeddingClient),
        groundingGeneration: createGroundingGenerationPort(deterministicClient),
        groundingVerificationQuestionPlanning: createGroundingVerificationQuestionPlanningPort(deterministicClient),
        groundingVerificationAnswering: createGroundingVerificationAnsweringPort(deterministicClient),
        groundingFactualityRevision: createGroundingFactualityRevisionPort(deterministicClient),
        prerequisiteOrdering: createPrerequisiteOrderingPort(deterministicClient),
        difficulty: createIntrinsicDifficultyPort(
          createIntrinsicDifficultyJudgmentPort(deterministicClient),
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
        conceptLessonGeneration: createConceptLessonGenerationPort(deterministicClient),
        conceptLessonRedundancyJudge: createConceptLessonRedundancyJudgmentPort(deterministicClient),
        layerPurposeGeneration: createLayerPurposeGenerationPort(deterministicClient),
        layerPurposeStore: new PostgresEnrichmentLayerPurposeStore(sql),
        studyItemBlueprint: createStudyItemBlueprintPort(deterministicClient),
        impostorLieValidityJudge: createImpostorLieValidityJudgmentPort(deterministicClient),
        conceptLessonStore: new PostgresConceptLessonStore(sql),
        studyItemGeneration: createStudyItemGenerationPort(deterministicClient),
        studyItemBankStore: new PostgresStudyItemBankStore(sql),
        reporter
      });
    }
  });
}

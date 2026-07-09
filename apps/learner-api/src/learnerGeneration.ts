import {
  generateTopicExpedition,
  createIntrinsicDifficultyPort,
  DEFAULT_ENRICHMENT_CONFIG,
  DEFAULT_SYNTHETIC_GENERATION_CONFIG
} from "@lrnki/application";
import {
  createConceptLessonGenerationPort,
  createConceptLessonRedundancyJudgmentPort,
  createConceptSetSynthesisPort,
  createGroundingGenerationPort,
  createImpostorLieValidityJudgmentPort,
  createIntrinsicDifficultyJudgmentPort,
  createKnowledgeBoundaryProbePort,
  createDeclaredDomainInferencePort,
  LiteLlmNodeEmbeddingAdapter,
  createNodeMergeAdjudicationPort,
  createPrerequisiteOrderingPort,
  createStudyItemBlueprintPort,
  createStudyItemGenerationPort,
  createNeuralClients,
  studyItemBankConfigHash,
  withSyntheticGenerationConfigHash
} from "@lrnki/infrastructure-litellm";
import {
  PostgresConceptLessonStore,
  PostgresEnrichmentRunStore,
  PostgresGraphVersionStore,
  PostgresLearnerExpeditionStore,
  PostgresRunProgressReporter,
  PostgresStudyItemBankStore
} from "@lrnki/infrastructure-postgres";
import type { DatabaseClient } from "./db";

function buildContext(sql: DatabaseClient) {
  // Client-construction policy (env base config + deterministic/probe/embedding
  // sampling decisions and their rationale) lives once in createNeuralClients,
  // shared with the kg-worker root.
  const { deterministicClient, probeClient, embeddingClient } = createNeuralClients();
  const graphStore = new PostgresGraphVersionStore(sql);
  const enrichmentStore = new PostgresEnrichmentRunStore(sql);
  const runProgressReporter = new PostgresRunProgressReporter(sql);
  return {
    graphStore,
    enrichmentStore,
    runProgressReporter,
    expeditionStore: new PostgresLearnerExpeditionStore(sql),
    declaredDomainInference: createDeclaredDomainInferencePort(deterministicClient),
    conceptSetSynthesis: createConceptSetSynthesisPort(deterministicClient),
    knowledgeBoundaryProbe: createKnowledgeBoundaryProbePort(probeClient),
    nodeEmbedding: new LiteLlmNodeEmbeddingAdapter(embeddingClient),
    nodeMergeAdjudicator: createNodeMergeAdjudicationPort(deterministicClient),
    groundingGeneration: createGroundingGenerationPort(deterministicClient),
    prerequisiteOrdering: createPrerequisiteOrderingPort(deterministicClient),
    difficulty: createIntrinsicDifficultyPort(createIntrinsicDifficultyJudgmentPort(deterministicClient), DEFAULT_ENRICHMENT_CONFIG.difficultySampleCount),
    conceptLessonGeneration: createConceptLessonGenerationPort(deterministicClient),
    conceptLessonRedundancyJudge: createConceptLessonRedundancyJudgmentPort(deterministicClient),
    conceptLessonStore: new PostgresConceptLessonStore(sql),
    studyItemBlueprint: createStudyItemBlueprintPort(deterministicClient),
    studyItemGeneration: createStudyItemGenerationPort(deterministicClient),
    impostorLieValidityJudge: createImpostorLieValidityJudgmentPort(deterministicClient),
    studyItemBankStore: new PostgresStudyItemBankStore(sql)
  };
}

// `sql` is the supervisor's shared pool — this run borrows it and never closes it.
export async function generateLearnerTopicExpedition(input: {
  learnerExpeditionId: string;
  topic: string;
  declaredDomain: string | null;
}, sql: DatabaseClient): Promise<void> {
  const ctx = buildContext(sql);
  await generateTopicExpedition({
    learnerExpeditionId: input.learnerExpeditionId,
    topic: input.topic,
    declaredDomain: input.declaredDomain,
    declaredDomainInference: ctx.declaredDomainInference,
    expeditionStore: ctx.expeditionStore,
    conceptSetSynthesis: ctx.conceptSetSynthesis,
    knowledgeBoundaryProbe: ctx.knowledgeBoundaryProbe,
    embedding: ctx.nodeEmbedding,
    groundingGeneration: ctx.groundingGeneration,
    prerequisiteOrdering: ctx.prerequisiteOrdering,
    difficulty: ctx.difficulty,
    enrichmentStore: ctx.enrichmentStore,
    graphStore: ctx.graphStore,
    conceptLessonGeneration: ctx.conceptLessonGeneration,
    studyItemBlueprint: ctx.studyItemBlueprint,
    impostorLieValidityJudge: ctx.impostorLieValidityJudge,
    conceptLessonStore: ctx.conceptLessonStore,
    studyItemGeneration: ctx.studyItemGeneration,
    studyItemBankStore: ctx.studyItemBankStore,
    config: withSyntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG),
    configHash: studyItemBankConfigHash(),
    reporter: ctx.runProgressReporter
  });
}

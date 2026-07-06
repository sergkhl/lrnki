import {
  generateTopicExpedition,
  createIntrinsicDifficultyPort,
  DEFAULT_ENRICHMENT_CONFIG,
  STUDY_ITEM_BANK_CONFIG_HASH
} from "@lrnki/application";
import {
  LiteLlmConceptLessonGenerationAdapter,
  LiteLlmConceptLessonRedundancyJudgmentAdapter,
  LiteLlmConceptSetSynthesisAdapter,
  LiteLlmEmbeddingClient,
  LiteLlmForcedToolClient,
  LiteLlmGroundingGenerationAdapter,
  LiteLlmImpostorLieValidityJudgmentAdapter,
  LiteLlmIntrinsicDifficultyJudgmentAdapter,
  LiteLlmKnowledgeBoundaryProbeAdapter,
  LiteLlmDeclaredDomainInferenceAdapter,
  LiteLlmNodeEmbeddingAdapter,
  LiteLlmNodeMergeAdjudicationAdapter,
  LiteLlmPrerequisiteOrderingAdapter,
  LiteLlmStudyItemBlueprintAdapter,
  LiteLlmStudyItemGenerationAdapter
} from "@lrnki/infrastructure-litellm";
import {
  PostgresConceptLessonStore,
  PostgresEnrichmentRunStore,
  PostgresGraphVersionStore,
  PostgresLearnerExpeditionStore,
  PostgresRunProgressReporter,
  PostgresStudyItemBankStore
} from "@lrnki/infrastructure-postgres";
import type { DatabaseClient } from "./topicGenerationSupervisor";

function baseClientConfig() {
  return {
    baseUrl: process.env.LITELLM_BASE_URL ?? "http://localhost:4000",
    apiKey: process.env.LITELLM_API_KEY ?? "sk-local",
    timeoutMs: Number(process.env.LITELLM_TIMEOUT_SECONDS ?? "600") * 1000
  };
}

function buildContext(sql: DatabaseClient) {
  const baseClient = baseClientConfig();
  const deterministicClient = new LiteLlmForcedToolClient({ ...baseClient, temperature: 0, seed: 7 });
  const probeClient = new LiteLlmForcedToolClient({ ...baseClient, temperature: 0.7 });
  const embeddingClient = new LiteLlmEmbeddingClient(baseClient);
  const graphStore = new PostgresGraphVersionStore(sql);
  const enrichmentStore = new PostgresEnrichmentRunStore(sql);
  const runProgressReporter = new PostgresRunProgressReporter(sql);
  return {
    graphStore,
    enrichmentStore,
    runProgressReporter,
    expeditionStore: new PostgresLearnerExpeditionStore(sql),
    declaredDomainInference: new LiteLlmDeclaredDomainInferenceAdapter(deterministicClient),
    conceptSetSynthesis: new LiteLlmConceptSetSynthesisAdapter(deterministicClient),
    knowledgeBoundaryProbe: new LiteLlmKnowledgeBoundaryProbeAdapter(probeClient),
    nodeEmbedding: new LiteLlmNodeEmbeddingAdapter(embeddingClient),
    nodeMergeAdjudicator: new LiteLlmNodeMergeAdjudicationAdapter(deterministicClient),
    groundingGeneration: new LiteLlmGroundingGenerationAdapter(deterministicClient),
    prerequisiteOrdering: new LiteLlmPrerequisiteOrderingAdapter(deterministicClient),
    difficulty: createIntrinsicDifficultyPort(new LiteLlmIntrinsicDifficultyJudgmentAdapter(deterministicClient), DEFAULT_ENRICHMENT_CONFIG.difficultySampleCount),
    conceptLessonGeneration: new LiteLlmConceptLessonGenerationAdapter(deterministicClient),
    conceptLessonRedundancyJudge: new LiteLlmConceptLessonRedundancyJudgmentAdapter(deterministicClient),
    conceptLessonStore: new PostgresConceptLessonStore(sql),
    studyItemBlueprint: new LiteLlmStudyItemBlueprintAdapter(deterministicClient),
    studyItemGeneration: new LiteLlmStudyItemGenerationAdapter(deterministicClient),
    impostorLieValidityJudge: new LiteLlmImpostorLieValidityJudgmentAdapter(deterministicClient),
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
    configHash: STUDY_ITEM_BANK_CONFIG_HASH,
    reporter: ctx.runProgressReporter
  });
}

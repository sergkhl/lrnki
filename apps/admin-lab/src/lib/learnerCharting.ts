import {
  chartTopicExpedition,
  createIntrinsicDifficultyPort,
  DEFAULT_ENRICHMENT_CONFIG,
  STUDY_ITEM_BANK_CONFIG_HASH
} from "@lrnki/application";
import {
  LiteLlmConceptLessonGenerationAdapter,
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
  createDatabaseClient,
  PostgresConceptLessonStore,
  PostgresEnrichmentRunStore,
  PostgresGraphVersionStore,
  PostgresLearnerExpeditionStore,
  PostgresRunProgressReporter,
  PostgresStudyItemBankStore
} from "@lrnki/infrastructure-postgres";

function baseClientConfig() {
  return {
    baseUrl: process.env.LITELLM_BASE_URL ?? "http://localhost:4000",
    apiKey: process.env.LITELLM_API_KEY ?? "sk-local",
    timeoutMs: Number(process.env.LITELLM_TIMEOUT_SECONDS ?? "600") * 1000
  };
}

function buildContext() {
  const sql = createDatabaseClient();
  const baseClient = baseClientConfig();
  const deterministicClient = new LiteLlmForcedToolClient({ ...baseClient, temperature: 0, seed: 7 });
  const probeClient = new LiteLlmForcedToolClient({ ...baseClient, temperature: 0.7 });
  const embeddingClient = new LiteLlmEmbeddingClient(baseClient);
  const graphStore = new PostgresGraphVersionStore(sql);
  const enrichmentStore = new PostgresEnrichmentRunStore(sql);
  const runProgressReporter = new PostgresRunProgressReporter(sql);
  return {
    sql,
    graphStore,
    enrichmentStore,
    runProgressReporter,
    expeditionStore: new PostgresLearnerExpeditionStore(sql),
    conceptSetSynthesis: new LiteLlmConceptSetSynthesisAdapter(deterministicClient),
    knowledgeBoundaryProbe: new LiteLlmKnowledgeBoundaryProbeAdapter(probeClient),
    nodeEmbedding: new LiteLlmNodeEmbeddingAdapter(embeddingClient),
    nodeMergeAdjudicator: new LiteLlmNodeMergeAdjudicationAdapter(deterministicClient),
    groundingGeneration: new LiteLlmGroundingGenerationAdapter(deterministicClient),
    prerequisiteOrdering: new LiteLlmPrerequisiteOrderingAdapter(deterministicClient),
    difficulty: createIntrinsicDifficultyPort(new LiteLlmIntrinsicDifficultyJudgmentAdapter(deterministicClient), DEFAULT_ENRICHMENT_CONFIG.difficultySampleCount),
    conceptLessonGeneration: new LiteLlmConceptLessonGenerationAdapter(deterministicClient),
    conceptLessonStore: new PostgresConceptLessonStore(sql),
    studyItemBlueprint: new LiteLlmStudyItemBlueprintAdapter(deterministicClient),
    studyItemGeneration: new LiteLlmStudyItemGenerationAdapter(deterministicClient),
    impostorLieValidityJudge: new LiteLlmImpostorLieValidityJudgmentAdapter(deterministicClient),
    studyItemBankStore: new PostgresStudyItemBankStore(sql)
  };
}

export async function inferDeclaredDomain(input: { topic: string }): Promise<{ declaredDomain: string }> {
  const client = new LiteLlmForcedToolClient({ ...baseClientConfig(), temperature: 0, seed: 7 });
  return new LiteLlmDeclaredDomainInferenceAdapter(client).infer(input);
}

export function startTopicChart(input: {
  learnerExpeditionId: string;
  topic: string;
  declaredDomain: string;
}): void {
  const ctx = buildContext();
  // Admin Lab runs as a long-lived Node process in development/demo deployments. If this
  // route moves to request-scoped hosting, replace this background promise with a durable
  // queue or platform wait-until primitive so charting cannot be cancelled at response end.
  void chartTopicExpedition({
    learnerExpeditionId: input.learnerExpeditionId,
    topic: input.topic,
    declaredDomain: input.declaredDomain,
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
  }).catch((error: unknown) => {
    console.error("Learner topic chart failed.", error);
  }).finally(() => {
    void ctx.sql.end({ timeout: 5 });
  });
}

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_CONCEPT_CANONICALIZATION_CONFIG,
  DEFAULT_ENRICHMENT_CONFIG,
  DEFAULT_SCAFFOLD_GENERATION_CONFIG,
  DEFAULT_SYNTHETIC_GENERATION_CONFIG,
  TOPIC_EXPEDITION_STAGE_PROFILE,
  TOPIC_EXPEDITION_STAGE_TOTAL
} from "@lrnki/application";
import { createConceptLessonGenerationPort } from "./conceptLessonGenerationAdapters";
import { createConceptLessonRedundancyJudgmentPort } from "./conceptLessonRedundancyAdapters";
import {
  conceptCanonicalizationConfigHash,
  effectiveStudyItemBankDescriptors,
  effectiveSyntheticTopicGenerationDescriptors,
  extractionConfigHash,
  graphEnrichmentConfigHash,
  neuralOperationRegistry,
  scaffoldGenerationConfigHash,
  studyItemBankConfigHash,
  syntheticGenerationConfigHash,
  type TopicExpeditionModelRouting
} from "./configHashes";
import {
  createNodeMergeAdjudicationPort,
  GENERATED_NODE_JUDGE_MODEL
} from "./dedupAdapters";
import { createDeclaredDomainInferencePort } from "./domainInferenceAdapters";
import {
  createMintingDurabilityJudgmentPort,
  createPrerequisiteOrderingPort
} from "./enrichmentAdapters";
import {
  createClaimFactualityChallengePort,
  createClaimFactualityJudgmentPort,
  createClaimVerificationAnsweringPort,
  createClaimVerificationQuestionPlanningPort,
  createGroundingGenerationPort
} from "./groundingGenerationAdapters";
import { createIntrinsicDifficultyJudgmentPort } from "./intrinsicDifficultyAdapters";
import { createLayerPurposeGenerationPort } from "./layerPurposeGenerationAdapters";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import {
  modelAssignmentIdentity,
  modelRoutingBehaviorIdentity,
  readLitellmProxyConfig
} from "./litellmProxyConfig";
import { createMissingPrerequisiteProposalPort } from "./missingPrerequisiteProposalAdapters";
import { readPromptFile } from "./promptFile";
import {
  createAnswerKeyVerificationPort,
  createMatchingAssignmentVerificationPort,
  createStudyItemBlueprintPort,
  createStudyItemGenerationPort
} from "./studyItemGenerationAdapters";
import { createConceptSetSynthesisPort } from "./syntheticGenerationAdapters";

const routing: TopicExpeditionModelRouting = {
  generation: "kg-topic-expedition-generation",
  independentJudge: "kg-topic-expedition-independent-judge",
  prerequisiteOrdering: "kg-topic-expedition-prerequisite-ordering"
};

const SOURCE_LESS_NODE_GENERATION = "kg-source-less-node-generation";
const GROUNDING_GENERATION = "kg-grounding-generation";
const VERIFICATION_PLANNER = "kg-grounding-verification-planner";
const VERIFICATION_ANSWERER = "kg-grounding-verification-answerer";
const FACTUALITY_JUDGE = "kg-grounding-factuality-judge";
const FACTUALITY_CHALLENGER = "kg-grounding-factuality-challenger";

const DEEPSEEK_GROUP = "openrouter/deepseek/deepseek-v4-flash-0731";
const MIMO_GROUP = "openrouter/xiaomi/mimo-v2.5-topic-expedition";
const GPT_GROUP = "openrouter/openai/gpt-oss-120b-topic-expedition-novita";
const GPT_FALLBACK_GROUP = "openrouter/openai/gpt-oss-120b-topic-expedition-parasail-backup";

const DEEPSEEK_BEHAVIOR = {
  litellmParams: {
    model: DEEPSEEK_GROUP,
    extra_body: {
      reasoning: { enabled: false },
      provider: {
        require_parameters: true,
        quantizations: ["fp8"],
        only: ["deepinfra/fp8"],
        order: ["deepinfra/fp8"],
        allow_fallbacks: false
      }
    }
  },
  modelInfo: { mode: "chat", max_input_tokens: 1048576 }
};
const MIMO_BEHAVIOR = {
  litellmParams: {
    model: "openrouter/xiaomi/mimo-v2.5",
    extra_body: {
      reasoning: { enabled: false },
      provider: {
        quantizations: ["fp8"],
        only: ["xiaomi/fp8"],
        order: ["xiaomi/fp8"],
        allow_fallbacks: false
      }
    }
  },
  modelInfo: { mode: "chat", max_input_tokens: 1048576, max_output_tokens: 131072 }
};
const GPT_BEHAVIOR = {
  litellmParams: {
    model: "openrouter/openai/gpt-oss-120b",
    extra_body: {
      reasoning: { effort: "medium" },
      provider: {
        require_parameters: true,
        quantizations: ["fp4"],
        only: ["novita/fp4"],
        order: ["novita/fp4"],
        allow_fallbacks: false
      }
    }
  },
  modelInfo: { mode: "chat", max_input_tokens: 131072 }
};
const GPT_FALLBACK_BEHAVIOR = {
  litellmParams: {
    model: "openrouter/openai/gpt-oss-120b",
    extra_body: {
      reasoning: { effort: "medium" },
      provider: {
        quantizations: ["fp4"],
        only: ["parasail/fp4"],
        order: ["parasail/fp4"],
        allow_fallbacks: false
      }
    }
  },
  modelInfo: { mode: "chat", max_input_tokens: 131072 }
};

type DescriptorRef = Readonly<{ promptPath: string; modelOverride?: string }>;

function effectiveModel(descriptor: DescriptorRef): string {
  return descriptor.modelOverride ?? readPromptFile(descriptor.promptPath).model;
}

function descriptorFor(descriptors: readonly DescriptorRef[], promptPath: string): DescriptorRef {
  const descriptor = descriptors.find((candidate) => candidate.promptPath === promptPath);
  assert.ok(descriptor, `missing descriptor ${promptPath}`);
  return descriptor;
}

test("Topic owns only learner-asset routing while Source-less Grounding factories use neutral defaults", () => {
  const client = {} as LiteLlmForcedToolClient;
  const topicGenerationPorts = [
    createDeclaredDomainInferencePort(client, routing.generation),
    createLayerPurposeGenerationPort(client, routing.generation),
    createConceptLessonGenerationPort(client, routing.generation),
    createStudyItemBlueprintPort(client, routing.generation),
    createStudyItemGenerationPort(client, routing.generation)
  ];
  assert.ok(topicGenerationPorts.every((port) => port.model === routing.generation));

  const topicJudgePorts = [
    createConceptLessonRedundancyJudgmentPort(client, routing.independentJudge),
    createAnswerKeyVerificationPort(client, routing.independentJudge),
    createMatchingAssignmentVerificationPort(client, routing.independentJudge)
  ];
  assert.ok(topicJudgePorts.every((port) => port.model === routing.independentJudge));
  assert.equal(
    createPrerequisiteOrderingPort(client, routing.prerequisiteOrdering).model,
    routing.prerequisiteOrdering
  );

  assert.equal(createConceptSetSynthesisPort(client).model, SOURCE_LESS_NODE_GENERATION);
  assert.equal(createMissingPrerequisiteProposalPort(client).model, SOURCE_LESS_NODE_GENERATION);
  assert.equal(createGroundingGenerationPort(client).model, GROUNDING_GENERATION);
  assert.equal(createClaimVerificationQuestionPlanningPort(client).model, VERIFICATION_PLANNER);
  assert.equal(createClaimVerificationAnsweringPort(client).model, VERIFICATION_ANSWERER);
  assert.equal(createClaimFactualityJudgmentPort(client).model, FACTUALITY_JUDGE);
  assert.equal(createClaimFactualityChallengePort(client).model, FACTUALITY_CHALLENGER);
  assert.equal(createMintingDurabilityJudgmentPort(client).model, GENERATED_NODE_JUDGE_MODEL);
  assert.equal(createIntrinsicDifficultyJudgmentPort(client).model, GENERATED_NODE_JUDGE_MODEL);
  assert.equal(
    createNodeMergeAdjudicationPort(client, GENERATED_NODE_JUDGE_MODEL).model,
    GENERATED_NODE_JUDGE_MODEL
  );
});

test("effective Topic descriptors override only declared domain, learner assets, and ordering", () => {
  const synthetic = effectiveSyntheticTopicGenerationDescriptors(routing);
  const studyItems = effectiveStudyItemBankDescriptors(routing);
  const syntheticOverrides = new Map(
    synthetic.map((descriptor) => [descriptor.promptPath, descriptor.modelOverride])
  );
  const studyOverrides = new Map(
    studyItems.map((descriptor) => [descriptor.promptPath, descriptor.modelOverride])
  );

  assert.equal(syntheticOverrides.get("declared-domain-inference.prompt"), routing.generation);
  assert.equal(syntheticOverrides.get("prerequisite-ordering.prompt"), routing.prerequisiteOrdering);
  for (const promptPath of [
    "concept-set-synthesis.prompt",
    "knowledge-boundary-probe.prompt",
    "grounding-generation.prompt",
    "claim-verification-question-planning.prompt",
    "claim-verification-answering.prompt",
    "claim-factuality-judgment.prompt",
    "claim-factuality-challenge.prompt",
    "intrinsic-difficulty-bands.prompt",
    "intrinsic-difficulty-comparison.prompt"
  ]) {
    assert.equal(syntheticOverrides.get(promptPath), undefined, promptPath);
  }

  for (const promptPath of [
    "layer-purpose.prompt",
    "concept-lesson-generation.prompt",
    "study-item-blueprint.prompt",
    "study-option-select-generation.prompt",
    "study-impostor-generation.prompt",
    "study-matching-generation.prompt"
  ]) {
    assert.equal(studyOverrides.get(promptPath), routing.generation, promptPath);
  }
  for (const promptPath of [
    "concept-lesson-redundancy-judgment.prompt",
    "answer-key-verification.prompt",
    "study-matching-assignment-verification.prompt"
  ]) {
    assert.equal(studyOverrides.get(promptPath), routing.independentJudge, promptPath);
  }
  assert.equal(synthetic.length, 11);
  assert.equal(studyItems.length, 10);
});

test("all three admission consumers resolve the same neutral topology and generated-layer judgments", () => {
  const admissionModels = new Map([
    ["grounding-generation.prompt", GROUNDING_GENERATION],
    ["claim-verification-question-planning.prompt", VERIFICATION_PLANNER],
    ["claim-verification-answering.prompt", VERIFICATION_ANSWERER],
    ["claim-factuality-judgment.prompt", FACTUALITY_JUDGE],
    ["claim-factuality-challenge.prompt", FACTUALITY_CHALLENGER]
  ]);
  const consumers = new Map<string, readonly DescriptorRef[]>([
    ["Graph Enrichment", neuralOperationRegistry.graphEnrichment.descriptors],
    ["default Synthetic", effectiveSyntheticTopicGenerationDescriptors()],
    ["Topic Synthetic", effectiveSyntheticTopicGenerationDescriptors(routing)],
    ["Scaffold", neuralOperationRegistry.scaffoldGeneration.descriptors]
  ]);
  for (const [consumer, descriptors] of consumers) {
    for (const [promptPath, expectedModel] of admissionModels) {
      assert.equal(effectiveModel(descriptorFor(descriptors, promptPath)), expectedModel, `${consumer}:${promptPath}`);
    }
  }

  assert.equal(
    effectiveModel(descriptorFor(effectiveSyntheticTopicGenerationDescriptors(), "concept-set-synthesis.prompt")),
    SOURCE_LESS_NODE_GENERATION
  );
  assert.equal(
    effectiveModel(descriptorFor(effectiveSyntheticTopicGenerationDescriptors(routing), "concept-set-synthesis.prompt")),
    SOURCE_LESS_NODE_GENERATION
  );
  assert.equal(
    effectiveModel(descriptorFor(neuralOperationRegistry.graphEnrichment.descriptors, "missing-prerequisite-proposal.prompt")),
    SOURCE_LESS_NODE_GENERATION
  );
  for (const promptPath of [
    "minting-durability.prompt",
    "node-merge-adjudication.prompt",
    "intrinsic-difficulty-bands.prompt",
    "intrinsic-difficulty-comparison.prompt"
  ]) {
    assert.equal(
      effectiveModel(descriptorFor(neuralOperationRegistry.graphEnrichment.descriptors, promptPath)),
      GENERATED_NODE_JUDGE_MODEL,
      promptPath
    );
  }
  assert.equal(
    effectiveModel(descriptorFor(neuralOperationRegistry.conceptCanonicalization.descriptors, "node-merge-adjudication.prompt")),
    "kg-independent-judge",
    "Concept Canonicalization keeps its source-family judgment assignment"
  );
});

test("only affected operation hashes change and Topic remains nineteen stages", () => {
  const resolvableRouting: TopicExpeditionModelRouting = {
    generation: "default-model",
    independentJudge: "default-model",
    prerequisiteOrdering: "default-model"
  };

  assert.notEqual(
    syntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG, resolvableRouting),
    syntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG)
  );
  assert.notEqual(studyItemBankConfigHash(resolvableRouting), studyItemBankConfigHash());
  assert.equal(
    syntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG, routing),
    "synthetic-topic-generation-d78aba900512"
  );
  assert.notEqual(
    syntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG, routing),
    "synthetic-topic-generation-9a8f4f1cb34b",
    "Topic Synthetic changes from the U0 topology"
  );
  assert.equal(studyItemBankConfigHash(routing), "study-item-bank-02d755d9fae1");
  assert.equal(
    syntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG),
    "synthetic-topic-generation-9f81ce84488e"
  );
  assert.notEqual(
    syntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG),
    "synthetic-topic-generation-901788bb7bd4",
    "default Synthetic changes from the U0 topology"
  );
  assert.equal(studyItemBankConfigHash(), "study-item-bank-d574e02753f9");
  assert.equal(graphEnrichmentConfigHash(DEFAULT_ENRICHMENT_CONFIG), "graph-enrichment-2af0ada6d7e6");
  assert.notEqual(
    graphEnrichmentConfigHash(DEFAULT_ENRICHMENT_CONFIG),
    "graph-enrichment-3cd73a12f2f2",
    "Graph Enrichment changes from the U0 topology"
  );
  assert.equal(
    scaffoldGenerationConfigHash(DEFAULT_SCAFFOLD_GENERATION_CONFIG),
    "learner-scaffold-generation-7930b34c0fdb"
  );
  assert.notEqual(
    scaffoldGenerationConfigHash(DEFAULT_SCAFFOLD_GENERATION_CONFIG),
    "learner-scaffold-generation-be49ba010024",
    "Scaffold changes from the U0 topology"
  );
  assert.equal(extractionConfigHash(), "source-extraction-114ec9e8ddf5");
  assert.equal(
    conceptCanonicalizationConfigHash({
      mode: "semantic",
      config: DEFAULT_CONCEPT_CANONICALIZATION_CONFIG
    }),
    "concept-canonicalization-ce3969a22bea"
  );
  assert.equal(TOPIC_EXPEDITION_STAGE_TOTAL, 19);
  assert.equal(TOPIC_EXPEDITION_STAGE_PROFILE.enrichment.length, 9);
  assert.equal(TOPIC_EXPEDITION_STAGE_PROFILE.study_items.length, 10);
});

test("the seven neutral aliases resolve the approved cross-family assignments and qualified fallbacks", () => {
  const proxy = readLitellmProxyConfig();
  const expectedRoutes = new Map<string, {
    group: string;
    behavior: Record<string, unknown>;
    fallback?: { group: string; behavior: Record<string, unknown> };
  }>([
    [SOURCE_LESS_NODE_GENERATION, { group: DEEPSEEK_GROUP, behavior: DEEPSEEK_BEHAVIOR }],
    [GROUNDING_GENERATION, { group: DEEPSEEK_GROUP, behavior: DEEPSEEK_BEHAVIOR }],
    [VERIFICATION_PLANNER, {
      group: GPT_GROUP,
      behavior: GPT_BEHAVIOR,
      fallback: { group: GPT_FALLBACK_GROUP, behavior: GPT_FALLBACK_BEHAVIOR }
    }],
    [VERIFICATION_ANSWERER, { group: MIMO_GROUP, behavior: MIMO_BEHAVIOR }],
    [FACTUALITY_JUDGE, { group: MIMO_GROUP, behavior: MIMO_BEHAVIOR }],
    [FACTUALITY_CHALLENGER, {
      group: GPT_GROUP,
      behavior: GPT_BEHAVIOR,
      fallback: { group: GPT_FALLBACK_GROUP, behavior: GPT_FALLBACK_BEHAVIOR }
    }],
    [GENERATED_NODE_JUDGE_MODEL, { group: MIMO_GROUP, behavior: MIMO_BEHAVIOR }]
  ]);
  for (const [alias, expected] of expectedRoutes) {
    const route = modelRoutingBehaviorIdentity(alias, proxy);
    assert.equal(route.primary.modelGroup, expected.group, alias);
    assert.equal(route.primary.deployments.length, 1, alias);
    assert.deepEqual(route.primary.deployments[0]?.behavior, expected.behavior, alias);
    assert.deepEqual(
      route.fallbacks.map((fallback) => ({
        group: fallback.modelGroup,
        behavior: fallback.deployments[0]?.behavior
      })),
      expected.fallback ? [expected.fallback] : [],
      `${alias} fallback route`
    );
    assert.equal(modelAssignmentIdentity(alias, proxy).assignments.length, 1, alias);
  }

  const assignmentModels = [
    SOURCE_LESS_NODE_GENERATION,
    VERIFICATION_ANSWERER,
    VERIFICATION_PLANNER
  ].map((alias) => modelAssignmentIdentity(alias, proxy).assignments[0]?.model);
  assert.deepEqual(assignmentModels, [
    "openrouter/deepseek/deepseek-v4-flash-0731",
    "openrouter/xiaomi/mimo-v2.5",
    "openrouter/openai/gpt-oss-120b"
  ]);
  assert.notDeepEqual(
    modelAssignmentIdentity(SOURCE_LESS_NODE_GENERATION, proxy),
    modelAssignmentIdentity(GENERATED_NODE_JUDGE_MODEL, proxy)
  );
  assert.notDeepEqual(
    modelAssignmentIdentity(GROUNDING_GENERATION, proxy),
    modelAssignmentIdentity(FACTUALITY_JUDGE, proxy)
  );
  assert.notDeepEqual(
    modelAssignmentIdentity(FACTUALITY_JUDGE, proxy),
    modelAssignmentIdentity(FACTUALITY_CHALLENGER, proxy)
  );
});

test("superseded claim aliases are absent while Topic keeps only its three owned roles", () => {
  const proxy = readLitellmProxyConfig();
  const retired = [
    "kg-concept-synthesis",
    "kg-claim-verification-planner",
    "kg-claim-verification-answerer",
    "kg-claim-factuality-judge",
    "kg-claim-factuality-challenger",
    "kg-topic-expedition-claim-verification-planner",
    "kg-topic-expedition-claim-verification-answerer",
    "kg-topic-expedition-claim-factuality-judge",
    "kg-topic-expedition-claim-factuality-challenger"
  ];
  for (const alias of retired) {
    assert.equal(proxy.modelGroupAlias[alias], undefined, alias);
    assert.equal(proxy.fallbacks?.[alias], undefined, `${alias} fallback`);
  }

  assert.equal(modelRoutingBehaviorIdentity(routing.generation, proxy).primary.modelGroup, DEEPSEEK_GROUP);
  assert.equal(modelRoutingBehaviorIdentity(routing.independentJudge, proxy).primary.modelGroup, MIMO_GROUP);
  const ordering = modelRoutingBehaviorIdentity(routing.prerequisiteOrdering, proxy);
  assert.equal(ordering.primary.modelGroup, GPT_GROUP);
  assert.deepEqual(ordering.fallbacks.map((fallback) => fallback.modelGroup), [GPT_FALLBACK_GROUP]);
});

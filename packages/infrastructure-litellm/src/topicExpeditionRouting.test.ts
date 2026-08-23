import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_ENRICHMENT_CONFIG,
  DEFAULT_SCAFFOLD_GENERATION_CONFIG,
  DEFAULT_SYNTHETIC_GENERATION_CONFIG,
  TOPIC_EXPEDITION_STAGE_PROFILE,
  TOPIC_EXPEDITION_STAGE_TOTAL
} from "@lrnki/application";
import { createConceptLessonGenerationPort } from "./conceptLessonGenerationAdapters";
import { createConceptLessonRedundancyJudgmentPort } from "./conceptLessonRedundancyAdapters";
import {
  effectiveStudyItemBankDescriptors,
  effectiveSyntheticTopicGenerationDescriptors,
  graphEnrichmentConfigHash,
  scaffoldGenerationConfigHash,
  studyItemBankConfigHash,
  syntheticGenerationConfigHash,
  type TopicExpeditionModelRouting
} from "./configHashes";
import { createDeclaredDomainInferencePort } from "./domainInferenceAdapters";
import { createPrerequisiteOrderingPort } from "./enrichmentAdapters";
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
  createAnswerKeyVerificationPort,
  createMatchingAssignmentVerificationPort,
  createStudyItemBlueprintPort,
  createStudyItemGenerationPort
} from "./studyItemGenerationAdapters";
import { createConceptSetSynthesisPort } from "./syntheticGenerationAdapters";

const routing: TopicExpeditionModelRouting = {
  generation: "kg-topic-expedition-generation",
  independentJudge: "kg-topic-expedition-independent-judge",
  claimVerificationAnswerer: "kg-topic-expedition-claim-verification-answerer",
  claimFactualityJudge: "kg-topic-expedition-claim-factuality-judge",
  claimVerificationPlanner: "kg-topic-expedition-claim-verification-planner",
  claimFactualityChallenger: "kg-topic-expedition-claim-factuality-challenger",
  prerequisiteOrdering: "kg-topic-expedition-prerequisite-ordering"
};

test("every Topic adapter factory exposes its effective scoped model without changing composition", () => {
  const client = {} as LiteLlmForcedToolClient;
  const generationPorts = [
    createDeclaredDomainInferencePort(client, routing.generation),
    createConceptSetSynthesisPort(client, routing.generation),
    createGroundingGenerationPort(client, routing.generation),
    createLayerPurposeGenerationPort(client, routing.generation),
    createConceptLessonGenerationPort(client, routing.generation),
    createStudyItemBlueprintPort(client, routing.generation),
    createStudyItemGenerationPort(client, routing.generation)
  ];
  assert.ok(generationPorts.every((port) => port.model === routing.generation));

  const independentJudgePorts = [
    createIntrinsicDifficultyJudgmentPort(client, routing.independentJudge),
    createConceptLessonRedundancyJudgmentPort(client, routing.independentJudge),
    createAnswerKeyVerificationPort(client, routing.independentJudge),
    createMatchingAssignmentVerificationPort(client, routing.independentJudge)
  ];
  assert.ok(independentJudgePorts.every((port) => port.model === routing.independentJudge));

  assert.equal(
    createClaimVerificationQuestionPlanningPort(client, routing.claimVerificationPlanner).model,
    routing.claimVerificationPlanner
  );
  assert.equal(
    createClaimVerificationAnsweringPort(client, routing.claimVerificationAnswerer).model,
    routing.claimVerificationAnswerer
  );
  assert.equal(
    createClaimFactualityJudgmentPort(client, routing.claimFactualityJudge).model,
    routing.claimFactualityJudge
  );
  assert.equal(
    createClaimFactualityChallengePort(client, routing.claimFactualityChallenger).model,
    routing.claimFactualityChallenger
  );
  assert.equal(
    createPrerequisiteOrderingPort(client, routing.prerequisiteOrdering).model,
    routing.prerequisiteOrdering
  );
});

test("effective Topic descriptor builders map all scoped roles and leave the boundary probe alone", () => {
  const synthetic = effectiveSyntheticTopicGenerationDescriptors(routing);
  const studyItems = effectiveStudyItemBankDescriptors(routing);
  const modelsByPrompt = new Map(
    [...synthetic, ...studyItems].map((descriptor) => [descriptor.promptPath, descriptor.modelOverride])
  );

  assert.equal(modelsByPrompt.get("declared-domain-inference.prompt"), routing.generation);
  assert.equal(modelsByPrompt.get("concept-set-synthesis.prompt"), routing.generation);
  assert.equal(modelsByPrompt.get("grounding-generation.prompt"), routing.generation);
  assert.equal(modelsByPrompt.get("claim-verification-question-planning.prompt"), routing.claimVerificationPlanner);
  assert.equal(modelsByPrompt.get("claim-verification-answering.prompt"), routing.claimVerificationAnswerer);
  assert.equal(modelsByPrompt.get("claim-factuality-judgment.prompt"), routing.claimFactualityJudge);
  assert.equal(modelsByPrompt.get("claim-factuality-challenge.prompt"), routing.claimFactualityChallenger);
  assert.equal(modelsByPrompt.get("prerequisite-ordering.prompt"), routing.prerequisiteOrdering);
  assert.equal(modelsByPrompt.get("intrinsic-difficulty-bands.prompt"), routing.independentJudge);
  assert.equal(modelsByPrompt.get("intrinsic-difficulty-comparison.prompt"), routing.independentJudge);
  assert.equal(modelsByPrompt.get("concept-lesson-redundancy-judgment.prompt"), routing.independentJudge);
  assert.equal(modelsByPrompt.get("answer-key-verification.prompt"), routing.independentJudge);
  assert.equal(modelsByPrompt.get("study-matching-assignment-verification.prompt"), routing.independentJudge);
  assert.equal(modelsByPrompt.get("knowledge-boundary-probe.prompt"), undefined);
  assert.equal(synthetic.length, 11);
  assert.equal(studyItems.length, 10);
});

test("Topic overrides change only Topic hashes while default identities and the 19-stage profile stay stable", () => {
  const resolvableRouting: TopicExpeditionModelRouting = {
    generation: "default-model",
    independentJudge: "default-model",
    claimVerificationAnswerer: "default-model",
    claimFactualityJudge: "default-model",
    claimVerificationPlanner: "default-model",
    claimFactualityChallenger: "default-model",
    prerequisiteOrdering: "default-model"
  };

  assert.notEqual(
    syntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG, resolvableRouting),
    syntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG)
  );
  assert.notEqual(studyItemBankConfigHash(resolvableRouting), studyItemBankConfigHash());
  assert.equal(
    syntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG),
    "synthetic-topic-generation-7b8549a3e0cc"
  );
  assert.equal(studyItemBankConfigHash(), "study-item-bank-d574e02753f9");
  assert.equal(graphEnrichmentConfigHash(DEFAULT_ENRICHMENT_CONFIG), "graph-enrichment-725381e8627a");
  assert.equal(
    scaffoldGenerationConfigHash(DEFAULT_SCAFFOLD_GENERATION_CONFIG),
    "learner-scaffold-generation-763117edcb3d"
  );
  assert.equal(TOPIC_EXPEDITION_STAGE_TOTAL, 19);
  assert.equal(TOPIC_EXPEDITION_STAGE_PROFILE.enrichment.length, 9);
  assert.equal(TOPIC_EXPEDITION_STAGE_PROFILE.study_items.length, 10);
});

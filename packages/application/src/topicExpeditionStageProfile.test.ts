import assert from "node:assert/strict";
import { test } from "node:test";
import {
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
import { OPERATION_TIMELINE_CATALOG } from "./operationTimelineCatalog";

const descriptors = (
  group: Readonly<Record<string, GenerationStageDescriptor>>
): readonly GenerationStageDescriptor[] => Object.values(group);

test("the Topic Expedition profile is the exact 9 + 11 composition of its producer groups", () => {
  const composedByPhase: Record<TopicExpeditionPhase, GenerationStageDescriptor[]> = {
    enrichment: [],
    study_items: []
  };
  for (const group of Object.values(TOPIC_EXPEDITION_PRODUCER_STAGE_GROUPS)) {
    for (const descriptor of descriptors(group)) composedByPhase[descriptor.phase].push(descriptor);
  }

  assert.equal(TOPIC_EXPEDITION_STAGE_PROFILE.enrichment.length, 9);
  assert.equal(TOPIC_EXPEDITION_STAGE_PROFILE.study_items.length, 11);
  assert.equal(TOPIC_EXPEDITION_STAGE_TOTAL, 20);
  assert.deepEqual(TOPIC_EXPEDITION_STAGE_PROFILE, composedByPhase);
  for (const phase of ["enrichment", "study_items"] as const) {
    const phaseStages: string[] = TOPIC_EXPEDITION_STAGE_PROFILE[phase].map((descriptor) => descriptor.stage);
    assert.equal(new Set(phaseStages).size, phaseStages.length, `${phase} contains a duplicate conceptual stage`);
    assert.ok(TOPIC_EXPEDITION_STAGE_PROFILE[phase].every((descriptor) => descriptor.phase === phase));
  }
});

test("every profiled stage is an LLM stage owned by its broad operation catalog", () => {
  for (const phase of ["enrichment", "study_items"] as const) {
    const catalog = new Map(
      OPERATION_TIMELINE_CATALOG[phase].map((descriptor) => [descriptor.stage, descriptor.kind] as const)
    );
    for (const descriptor of TOPIC_EXPEDITION_STAGE_PROFILE[phase]) {
      assert.equal(catalog.get(descriptor.stage), "llm", `${descriptor.stage} is outside the ${phase} LLM catalog`);
    }
  }
});

test("profile metadata records the actual conditional, repeated, and concurrent producer seams", () => {
  assert.equal(SYNTHETIC_GENERATION_STAGE_GROUP.declaredDomainInference.conditional, true);
  assert.equal(SYNTHETIC_GENERATION_STAGE_GROUP.conceptSetSynthesis.conditional, false);
  assert.notEqual(
    SYNTHETIC_GENERATION_STAGE_GROUP.declaredDomainInference.concurrencyGroup,
    SYNTHETIC_GENERATION_STAGE_GROUP.conceptSetSynthesis.concurrencyGroup
  );
  assert.notEqual(
    SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP.knowledgeBoundaryProbe.concurrencyGroup,
    SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP.groundingGeneration.concurrencyGroup
  );

  const verification = [
    SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP.verificationQuestionPlanning,
    SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP.verificationAnswering,
    SOURCE_LESS_GROUNDING_ADMISSION_STAGE_GROUP.factualityJudgment
  ];
  assert.ok(verification.every((descriptor) => descriptor.conditional && descriptor.repeatable));
  assert.equal(new Set(verification.map((descriptor) => descriptor.concurrencyGroup)).size, 1);

  const graphCompletion = descriptors(DERIVED_GRAPH_COMPLETION_STAGE_GROUP);
  assert.ok(graphCompletion.every((descriptor) => !descriptor.conditional && !descriptor.repeatable));
  assert.equal(new Set(graphCompletion.map((descriptor) => descriptor.concurrencyGroup)).size, 1);

  const activityPipelines = [
    STUDY_ITEM_BANK_STAGE_GROUP.optionSelectGeneration,
    STUDY_ITEM_BANK_STAGE_GROUP.matchingGeneration,
    STUDY_ITEM_BANK_STAGE_GROUP.impostorGeneration,
    STUDY_ITEM_BANK_STAGE_GROUP.optionSelectKeyVerification,
    STUDY_ITEM_BANK_STAGE_GROUP.impostorKeyVerification,
    STUDY_ITEM_BANK_STAGE_GROUP.matchingAssignmentVerification
  ];
  assert.ok(activityPipelines.every((descriptor) => descriptor.conditional && !descriptor.repeatable));
  assert.equal(new Set(activityPipelines.map((descriptor) => descriptor.concurrencyGroup)).size, 1);
  assert.equal(STUDY_ITEM_BANK_STAGE_GROUP.lessonRedundancyJudgment.conditional, true);
  assert.equal(STUDY_ITEM_BANK_STAGE_GROUP.lessonRedundancyJudgment.repeatable, false);
  assert.equal(STUDY_ITEM_BANK_STAGE_GROUP.sourceMaterialClaimSupport.conditional, true);
  assert.equal(STUDY_ITEM_BANK_STAGE_GROUP.sourceMaterialClaimSupport.repeatable, true);
  assert.equal(STUDY_ITEM_BANK_STAGE_GROUP.conceptLessonGeneration.conditional, false);
  assert.equal(STUDY_ITEM_BANK_STAGE_GROUP.studyItemBlueprint.conditional, false);
});

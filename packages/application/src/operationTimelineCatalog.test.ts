import assert from "node:assert/strict";
import test from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import {
  NON_LLM_STAGES,
  isKnownOperationTimelineStage,
  isLlmStage,
  operationTimelineLlmSpendStageTags,
  operationTimelineStageKind,
  operationTimelineStagesForOperation,
  spendStageBelongsToOperation,
  stageBelongsToOperation
} from "./operationTimelineCatalog";

test("classifies the closed LLM vocabulary as LLM and non-LLM stages as non-LLM", () => {
  for (const stage of Object.values(STAGE_TAGS)) {
    assert.equal(isLlmStage(stage), true, `expected ${stage} to be an LLM stage`);
    assert.equal(operationTimelineStageKind(stage), "llm");
  }
  for (const stage of Object.values(NON_LLM_STAGES)) {
    assert.equal(isLlmStage(stage), false, `expected ${stage} to be non-LLM`);
    assert.equal(operationTimelineStageKind(stage), "non_llm");
    assert.equal(isKnownOperationTimelineStage(stage), true);
  }
  assert.equal(operationTimelineStageKind("not-a-real-stage"), "unknown");
  assert.equal(isKnownOperationTimelineStage("not-a-real-stage"), false);
});

test("declares reportable stages by operation type", () => {
  assert.deepEqual(operationTimelineStagesForOperation("extraction").map((row) => row.stage), [
    STAGE_TAGS.conceptDiscovery,
    STAGE_TAGS.admission,
    STAGE_TAGS.admissionLabelJudge,
    STAGE_TAGS.cepExtraction,
    STAGE_TAGS.definitionPassageQuality,
    STAGE_TAGS.assertionEntailment,
    NON_LLM_STAGES.persist
  ]);
  assert.deepEqual(operationTimelineStagesForOperation("minting").map((row) => row.stage), [
    NON_LLM_STAGES.load,
    NON_LLM_STAGES.refine,
    NON_LLM_STAGES.persist
  ]);
  assert.deepEqual(operationTimelineStagesForOperation("enrichment").map((row) => row.stage), [
    STAGE_TAGS.prerequisiteOrdering,
    STAGE_TAGS.rescueDurability,
    STAGE_TAGS.rescueDefinitionQuality,
    STAGE_TAGS.mintingDurability,
    STAGE_TAGS.missingPrerequisiteProposal,
    STAGE_TAGS.groundingGeneration,
    STAGE_TAGS.intrinsicDifficulty,
    STAGE_TAGS.nodeEmbedding,
    STAGE_TAGS.nodeMergeAdjudication,
    NON_LLM_STAGES.symbolicDisposal,
    NON_LLM_STAGES.persist
  ]);
  assert.deepEqual(operationTimelineStagesForOperation("study_items").map((row) => row.stage), [
    NON_LLM_STAGES.load,
    STAGE_TAGS.conceptLessonGeneration,
    STAGE_TAGS.studyItemGeneration,
    STAGE_TAGS.impostorGeneration,
    NON_LLM_STAGES.persist
  ]);
});

test("checks operation ownership without claiming unknown stages", () => {
  assert.equal(stageBelongsToOperation(STAGE_TAGS.admission, "extraction"), true);
  assert.equal(stageBelongsToOperation(STAGE_TAGS.admission, "enrichment"), false);
  for (const stage of [
    STAGE_TAGS.conceptLessonGeneration,
    STAGE_TAGS.studyItemGeneration,
    STAGE_TAGS.impostorGeneration
  ]) {
    assert.equal(stageBelongsToOperation(stage, "study_items"), true, `${stage} belongs to study_items`);
    assert.equal(stageBelongsToOperation(stage, "enrichment"), false, `${stage} does not belong to enrichment`);
  }
  assert.equal(stageBelongsToOperation(NON_LLM_STAGES.persist, "minting"), true);
  assert.equal(stageBelongsToOperation("not-a-real-stage", "extraction"), false);
});

test("spend ownership excludes non-LLM and unknown stages", () => {
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.admission, "extraction"), true);
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.admission, "enrichment"), false);
  for (const stage of [
    STAGE_TAGS.conceptLessonGeneration,
    STAGE_TAGS.studyItemGeneration,
    STAGE_TAGS.impostorGeneration
  ]) {
    assert.equal(spendStageBelongsToOperation(stage, "study_items"), true, `${stage} spend belongs to study_items`);
    assert.equal(spendStageBelongsToOperation(stage, "enrichment"), false, `${stage} spend does not belong to enrichment`);
  }
  assert.equal(spendStageBelongsToOperation(NON_LLM_STAGES.persist, "minting"), false);
  assert.equal(spendStageBelongsToOperation("not-a-real-stage", "extraction"), false);
});

test("LiteLLM spend-stage tags are LLM-only", () => {
  const tags = operationTimelineLlmSpendStageTags();
  assert.deepEqual(tags, Object.values(STAGE_TAGS));
  assert.ok(tags.every((stage) => operationTimelineStageKind(stage) === "llm"));
  assert.equal(new Set<string>(tags).has(NON_LLM_STAGES.persist), false);
});

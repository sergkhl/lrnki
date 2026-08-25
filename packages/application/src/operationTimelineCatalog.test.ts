import assert from "node:assert/strict";
import test from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import {
  NON_LLM_STAGES,
  OPERATION_TIMELINE_CATALOG,
  isLlmStage,
  operationTimelineAllowedNeuralStages,
  operationTimelineLlmSpendStageTags,
  operationTimelineStageKind,
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
  }
  assert.equal(operationTimelineStageKind("not-a-real-stage"), "unknown");
});

test("catalog LLM stages are drawn from the closed stage-tag vocabulary", () => {
  const catalogLlmStages = new Set(
    Object.values(OPERATION_TIMELINE_CATALOG)
      .flat()
      .filter(({ kind }) => kind === "llm")
      .map(({ stage }) => stage)
  );
  const vocabulary = new Set<string>(Object.values(STAGE_TAGS));
  const unknownStages = [...catalogLlmStages].filter((stage) => !vocabulary.has(stage));
  assert.deepEqual(unknownStages, [], `catalog LLM stages absent from STAGE_TAGS: ${unknownStages.join(", ")}`);
  assert.equal(catalogLlmStages.has(STAGE_TAGS.discoveryCoverageAudit), false, "measurement-only audit is not an operation stage");
  assert.equal(catalogLlmStages.has(STAGE_TAGS.sourceMaterialClaimSupport), true, "source-backed Study Item Banks own source-support spend");
  assert.equal(catalogLlmStages.has(STAGE_TAGS.scaffoldContentCongruence), true, "scaffold generation uses the shared descriptor inside its operation");
});

test("catalog non-LLM stages are drawn from the known non-LLM vocabulary", () => {
  const knownNonLlm = new Set<string>(Object.values(NON_LLM_STAGES));
  for (const stages of Object.values(OPERATION_TIMELINE_CATALOG)) {
    for (const { stage, kind } of stages) {
      if (kind !== "non_llm") continue;
      assert.equal(knownNonLlm.has(stage), true, `${stage} is not a known non-LLM stage`);
    }
  }
});

// R1 regression: the four live tags that were silently dropped from cost & timings / journey
// reports until this change now belong to their owning operation.
test("previously-dropped spend tags belong to their owning operation", () => {
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.conceptSetSynthesis, "enrichment"), true);
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.knowledgeBoundaryProbe, "enrichment"), true);
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.rescuedNodeLabeling, "enrichment"), true);
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.impostorKeyVerification, "study_items"), true);
  // A stage owned by enrichment must not be attributed to a different operation.
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.conceptSetSynthesis, "study_items"), false);
});

test("checks operation ownership without claiming unknown stages", () => {
  assert.equal(stageBelongsToOperation(STAGE_TAGS.admission, "extraction"), true);
  assert.equal(stageBelongsToOperation(STAGE_TAGS.admission, "enrichment"), false);
  for (const stage of [
    STAGE_TAGS.conceptLessonGeneration,
    STAGE_TAGS.studyItemBlueprint,
    STAGE_TAGS.studyItemGeneration,
    STAGE_TAGS.matchingGeneration,
    STAGE_TAGS.impostorGeneration
  ]) {
    assert.equal(stageBelongsToOperation(stage, "study_items"), true, `${stage} belongs to study_items`);
    assert.equal(stageBelongsToOperation(stage, "enrichment"), false, `${stage} does not belong to enrichment`);
  }
  assert.equal(stageBelongsToOperation(NON_LLM_STAGES.persist, "minting"), true);
  assert.equal(stageBelongsToOperation("not-a-real-stage", "extraction"), false);
});

test("allowed neural stages are derived from the catalog, including shared ownership", () => {
  for (const operationType of ["enrichment", "scaffold"] as const) {
    assert.equal(
      operationTimelineAllowedNeuralStages(operationType).has(STAGE_TAGS.knowledgeBoundaryProbe),
      true,
      operationType
    );
  }
  assert.equal(
    operationTimelineAllowedNeuralStages("extraction").has(STAGE_TAGS.knowledgeBoundaryProbe),
    false
  );
  assert.equal(
    operationTimelineAllowedNeuralStages("extraction").has(STAGE_TAGS.discoveryCoverageAudit),
    false
  );
});

test("spend ownership excludes non-LLM and unknown stages", () => {
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.admission, "extraction"), true);
  assert.equal(spendStageBelongsToOperation(STAGE_TAGS.admission, "enrichment"), false);
  assert.equal(spendStageBelongsToOperation(NON_LLM_STAGES.persist, "minting"), false);
  assert.equal(spendStageBelongsToOperation("not-a-real-stage", "extraction"), false);
});

test("LiteLLM spend-stage inventory is derived from cataloged LLM stages only", () => {
  const tags = operationTimelineLlmSpendStageTags();
  const expected = [...new Set(
    Object.values(OPERATION_TIMELINE_CATALOG)
      .flat()
      .filter((descriptor) => descriptor.kind === "llm")
      .map((descriptor) => descriptor.stage)
  )];
  assert.deepEqual(tags, expected);
  assert.ok(tags.every((stage) => operationTimelineStageKind(stage) === "llm"));
  assert.equal(new Set<string>(tags).has(NON_LLM_STAGES.persist), false);
  assert.equal(tags.includes(STAGE_TAGS.discoveryCoverageAudit), false);
});

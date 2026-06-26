import assert from "node:assert/strict";
import test from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import { noopRunProgressReporter, NON_LLM_STAGES, isLlmStage } from "./runProgressReporter";

// Deterministic contract tests (rule 11): the no-op default and the closed
// stage-vocabulary helper. No model judgment is asserted.

test("noopRunProgressReporter resolves every method with no value and no throw", async () => {
  await assert.doesNotReject(noopRunProgressReporter.beginOperation({ operationType: "extraction", operationId: "op-1" }));
  assert.equal(await noopRunProgressReporter.enterStage({ operationType: "extraction", operationId: "op-1", stage: STAGE_TAGS.cepExtraction, total: 5 }), undefined);
  assert.equal(await noopRunProgressReporter.recordProgress({ operationType: "extraction", operationId: "op-1", stage: STAGE_TAGS.cepExtraction, done: 3 }), undefined);
  assert.equal(await noopRunProgressReporter.completeStage({ operationType: "extraction", operationId: "op-1", stage: STAGE_TAGS.cepExtraction, ok: true }), undefined);
  assert.equal(await noopRunProgressReporter.completeOperation({ operationType: "extraction", operationId: "op-1", status: "succeeded" }), undefined);
});

test("isLlmStage is true for the full LLM stage set (extraction + enrichment + study items)", () => {
  for (const tag of Object.values(STAGE_TAGS)) {
    assert.equal(isLlmStage(tag), true, `expected ${tag} to be an LLM stage`);
  }
  // Spot-check representative members across the three operations explicitly.
  assert.equal(isLlmStage(STAGE_TAGS.conceptDiscovery), true);
  assert.equal(isLlmStage(STAGE_TAGS.prerequisiteOrdering), true);
  assert.equal(isLlmStage(STAGE_TAGS.studyItemGeneration), true);
});

test("isLlmStage is false for non-LLM stages and a fabricated unknown stage", () => {
  for (const stage of Object.values(NON_LLM_STAGES)) {
    assert.equal(isLlmStage(stage), false, `expected ${stage} to be a non-LLM stage`);
  }
  assert.equal(isLlmStage("totally-made-up-stage"), false);
});

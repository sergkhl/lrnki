import assert from "node:assert/strict";
import { test } from "node:test";
import { stageBelongsToOperation } from "@lrnki/application";
import {
  extractionNeuralStageDescriptors,
  graphEnrichmentNeuralStageDescriptors,
  studyItemBankNeuralStageDescriptors,
  syntheticGenerationNeuralStageDescriptors
} from "./configHashes";

test("neural stage descriptors are cataloged under their owning operation", () => {
  for (const descriptor of extractionNeuralStageDescriptors) {
    assert.equal(stageBelongsToOperation(descriptor.stageTag, "extraction"), true, descriptor.stageTag);
  }
  for (const descriptor of graphEnrichmentNeuralStageDescriptors) {
    assert.equal(stageBelongsToOperation(descriptor.stageTag, "enrichment"), true, descriptor.stageTag);
  }
  for (const descriptor of syntheticGenerationNeuralStageDescriptors) {
    assert.equal(stageBelongsToOperation(descriptor.stageTag, "enrichment"), true, descriptor.stageTag);
  }
  for (const descriptor of studyItemBankNeuralStageDescriptors) {
    assert.equal(stageBelongsToOperation(descriptor.stageTag, "study_items"), true, descriptor.stageTag);
  }
});

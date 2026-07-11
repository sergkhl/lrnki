import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ENRICHMENT_CONFIG, DEFAULT_SYNTHETIC_GENERATION_CONFIG, stageBelongsToOperation } from "@lrnki/application";
import {
  extractionNeuralStageDescriptors,
  graphEnrichmentConfigHash,
  graphEnrichmentNeuralStageDescriptors,
  studyItemBankNeuralStageDescriptors,
  syntheticGenerationConfigHash,
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

// Exact identity regression (plan 2026-07-11-001 AE6): the shared-completion-config
// composition must not perturb either default operation identity for unchanged inputs.
// A legitimate behavior change may update these values deliberately — never as a
// side effect of a type refactor.
test("default operation config hashes are stable across the completion-config composition", () => {
  assert.equal(graphEnrichmentConfigHash(DEFAULT_ENRICHMENT_CONFIG), "graph-enrichment-1886ba82e2e5");
  assert.equal(syntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG), "synthetic-topic-generation-978cefbca6ed");
});

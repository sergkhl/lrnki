import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_ENRICHMENT_CONFIG,
  DEFAULT_SCAFFOLD_GENERATION_CONFIG,
  DEFAULT_SYNTHETIC_GENERATION_CONFIG,
  OPERATION_TIMELINE_CATALOG,
  SHARED_STAGES
} from "@lrnki/application";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { OperationType } from "@lrnki/ports";
import {
  allNeuralOperationDescriptors,
  graphEnrichmentConfigHash,
  measurementNeuralStageDescriptors,
  neuralOperationRegistry,
  scaffoldGenerationConfigHash,
  syntheticGenerationConfigHash
} from "./configHashes";
import { operationConfigHash } from "./operationConfigHash";

// KTD7 (plan 2026-07-16-004 U3): the registry is CLOSED against the Operation Timeline catalog.
// For each timeline operation type, the union of registered runtime LLM stages (descriptor stage
// tags + embedding stages) plus the explicitly classified measurement claims must EQUAL — not
// merely subset — the catalog's LLM stage set. A stage the catalog claims that no registry entry
// runs, or a registered stage the catalog never claims, both fail here.
test("registered operation stages union-equal the catalog's LLM stage set per timeline type", () => {
  const registeredByTimeline = new Map<OperationType, Set<string>>();
  const claim = (timelineType: OperationType, stage: string): void => {
    const stages = registeredByTimeline.get(timelineType) ?? new Set<string>();
    stages.add(stage);
    registeredByTimeline.set(timelineType, stages);
  };
  for (const entry of Object.values(neuralOperationRegistry)) {
    for (const descriptor of entry.descriptors) claim(entry.timelineType, descriptor.stageTag);
    for (const stage of entry.embeddingStages) claim(entry.timelineType, stage);
  }
  for (const measurement of measurementNeuralStageDescriptors) {
    claim(measurement.claimedTimelineType, measurement.descriptor.stageTag);
  }

  for (const [operationType, stages] of Object.entries(OPERATION_TIMELINE_CATALOG)) {
    const catalogLlm = stages.filter((stage) => stage.kind === "llm").map((stage) => stage.stage).sort();
    const registered = [...(registeredByTimeline.get(operationType as OperationType) ?? new Set<string>())].sort();
    assert.deepEqual(registered, catalogLlm, `timeline type ${operationType}`);
  }
});

// Each SHARED_STAGE has exactly the accepted owners {enrichment, scaffold} on the registry side
// too; every other registered LLM stage resolves to a single timeline type.
test("shared stages have exactly the accepted registry owners; all other stages one owner", () => {
  const ownersByStage = new Map<string, Set<OperationType>>();
  for (const entry of Object.values(neuralOperationRegistry)) {
    for (const stage of [...entry.descriptors.map((descriptor) => descriptor.stageTag), ...entry.embeddingStages]) {
      const owners = ownersByStage.get(stage) ?? new Set<OperationType>();
      owners.add(entry.timelineType);
      ownersByStage.set(stage, owners);
    }
  }
  for (const [stage, owners] of ownersByStage) {
    if (SHARED_STAGES.has(stage)) {
      assert.deepEqual([...owners].sort(), ["enrichment", "scaffold"], stage);
    } else {
      assert.equal(owners.size, 1, `${stage} is owned by ${[...owners].join(", ")}`);
    }
  }
});

// The Scaffold entry carries its five runtime stages exactly once each (KTD7): outline, probe,
// grounding, content, and the generation-time congruence re-pick.
test("the scaffold operation registers outline, probe, grounding, content, and congruence exactly once", () => {
  const stageTags = neuralOperationRegistry.scaffoldGeneration.descriptors.map((descriptor) => descriptor.stageTag).sort();
  assert.deepEqual(stageTags, [
    STAGE_TAGS.groundingGeneration,
    STAGE_TAGS.knowledgeBoundaryProbe,
    STAGE_TAGS.scaffoldContentCongruence,
    STAGE_TAGS.scaffoldContentGeneration,
    STAGE_TAGS.scaffoldOutlineGeneration
  ].sort());
});

// Complete config identity (KTD7): every application knob — including the nested probe config —
// the embedding model, and the descriptor set all perturb the scaffold operation hash.
test("every scaffold knob, the probe config, the embedding model, and the descriptor set change the hash", () => {
  const entry = neuralOperationRegistry.scaffoldGeneration;
  const base = scaffoldGenerationConfigHash(DEFAULT_SCAFFOLD_GENERATION_CONFIG);
  assert.equal(base, scaffoldGenerationConfigHash({ ...DEFAULT_SCAFFOLD_GENERATION_CONFIG }), "hash is deterministic");

  const variants = [
    { ...DEFAULT_SCAFFOLD_GENERATION_CONFIG, maxSupportSteps: DEFAULT_SCAFFOLD_GENERATION_CONFIG.maxSupportSteps + 1 },
    { ...DEFAULT_SCAFFOLD_GENERATION_CONFIG, outlineAttempts: DEFAULT_SCAFFOLD_GENERATION_CONFIG.outlineAttempts + 1 },
    { ...DEFAULT_SCAFFOLD_GENERATION_CONFIG, contentDraftAttempts: DEFAULT_SCAFFOLD_GENERATION_CONFIG.contentDraftAttempts + 1 },
    {
      ...DEFAULT_SCAFFOLD_GENERATION_CONFIG,
      knowledgeBoundaryProbe: {
        ...DEFAULT_SCAFFOLD_GENERATION_CONFIG.knowledgeBoundaryProbe,
        agreementThreshold: DEFAULT_SCAFFOLD_GENERATION_CONFIG.knowledgeBoundaryProbe.agreementThreshold + 0.01
      }
    }
  ];
  for (const variant of variants) {
    assert.notEqual(scaffoldGenerationConfigHash(variant), base);
  }

  // The embedding model is part of the identity: recomputing the same appConfig without it (or
  // with a different model string) must not collide with the shipped hash.
  const withoutModel = operationConfigHash(entry.configSeed, entry.descriptors, { ...DEFAULT_SCAFFOLD_GENERATION_CONFIG });
  assert.notEqual(withoutModel, base);

  // Dropping any descriptor changes the identity (descriptor-set sensitivity of the derivation).
  for (let index = 0; index < entry.descriptors.length; index++) {
    const narrowed = entry.descriptors.filter((_, position) => position !== index);
    const knobs = { ...DEFAULT_SCAFFOLD_GENERATION_CONFIG, nodeEmbeddingModel: "sentinel" };
    assert.notEqual(
      operationConfigHash(entry.configSeed, narrowed, knobs),
      operationConfigHash(entry.configSeed, entry.descriptors, knobs),
      entry.descriptors[index].stageTag
    );
  }
});

// A descriptor reused by several operations (probe, grounding) appears in every relevant registry
// entry while the all-descriptor inventory deduplicates it by descriptor identity.
test("the all-descriptor inventory deduplicates shared descriptors", () => {
  const keys = allNeuralOperationDescriptors.map(
    (descriptor) => `${descriptor.promptPath} ${descriptor.stageTag} ${descriptor.modelOverride ?? ""}`
  );
  assert.equal(new Set(keys).size, keys.length, "inventory contains a duplicate descriptor identity");
  const probeCount = allNeuralOperationDescriptors.filter(
    (descriptor) => descriptor.stageTag === STAGE_TAGS.knowledgeBoundaryProbe
  ).length;
  assert.equal(probeCount, 1);
  // Both parameterizations of the definition-quality factory are distinct identities and kept.
  const qualityTags = allNeuralOperationDescriptors
    .filter((descriptor) => descriptor.promptPath.includes("definition-passage-quality"))
    .map((descriptor) => descriptor.stageTag)
    .sort();
  assert.deepEqual(qualityTags, [STAGE_TAGS.definitionPassageQuality, STAGE_TAGS.rescueDefinitionQuality].sort());
});

// Exact identity regression (plan 2026-07-11-001 AE6): the registry derivation must not perturb
// either default operation identity for unchanged inputs. A legitimate behavior change may update
// these values deliberately — never as a side effect of a type refactor.
test("default operation config hashes are stable across the registry derivation", () => {
  assert.equal(graphEnrichmentConfigHash(DEFAULT_ENRICHMENT_CONFIG), "graph-enrichment-913d1ab4584f");
  assert.equal(syntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG), "synthetic-topic-generation-28288308e450");
});

test("synthetic execution widths do not change identity while probe behavior still does", () => {
  const base = syntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG);
  assert.equal(
    syntheticGenerationConfigHash({ ...DEFAULT_SYNTHETIC_GENERATION_CONFIG, conceptConcurrency: 1 }),
    base,
    "concept fan-out is execution policy"
  );
  assert.equal(
    syntheticGenerationConfigHash({ ...DEFAULT_SYNTHETIC_GENERATION_CONFIG, verificationConcurrency: 1 }),
    base,
    "verification fan-out is execution policy"
  );
  assert.equal(
    syntheticGenerationConfigHash({
      ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
      probe: { ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.probe, probeConcurrency: 1 }
    }),
    base,
    "within-concept probe fan-out is execution policy"
  );
  assert.notEqual(
    syntheticGenerationConfigHash({
      ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
      probe: { ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.probe, sampleCount: DEFAULT_SYNTHETIC_GENERATION_CONFIG.probe.sampleCount + 1 }
    }),
    base,
    "probe K remains behavioral identity"
  );
  assert.notEqual(
    syntheticGenerationConfigHash({
      ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
      probe: { ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.probe, agreementThreshold: DEFAULT_SYNTHETIC_GENERATION_CONFIG.probe.agreementThreshold + 0.01 }
    }),
    base,
    "probe admission threshold remains behavioral identity"
  );
  assert.notEqual(
    syntheticGenerationConfigHash({
      ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
      groundingDraftAttempts: DEFAULT_SYNTHETIC_GENERATION_CONFIG.groundingDraftAttempts + 1
    }),
    base,
    "bounded grounding rejection sampling remains behavioral identity"
  );
});

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
import { claimVerificationAnsweringDescriptor } from "./groundingGenerationAdapters";
import type { LitellmProxyConfig } from "./litellmProxyConfig";
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
  const claimJudges = neuralOperationRegistry.syntheticTopicGeneration.descriptors.filter(
    (descriptor) => descriptor.stageTag === STAGE_TAGS.groundingFactualityRevision
  );
  assert.equal(claimJudges.length, 2, "the factuality panel keeps both model identities");
  assert.deepEqual(
    claimJudges.map((descriptor) => descriptor.modelOverride),
    [undefined, "kg-claim-factuality-challenger"]
  );
  assert.equal(
    allNeuralOperationDescriptors.filter(
      (descriptor) => descriptor.stageTag === STAGE_TAGS.groundingFactualityRevision
    ).length,
    2,
    "deduplication does not collapse distinct judge deployments"
  );
  // Both parameterizations of the definition-quality factory are distinct identities and kept.
  const qualityTags = allNeuralOperationDescriptors
    .filter((descriptor) => descriptor.promptPath.includes("definition-passage-quality"))
    .map((descriptor) => descriptor.stageTag)
    .sort();
  assert.deepEqual(qualityTags, [STAGE_TAGS.definitionPassageQuality, STAGE_TAGS.rescueDefinitionQuality].sort());
});

// Model reassignment invalidates evidence even when the prompt alias stays stable. The routing
// module keeps the YAML mechanics behind one interface; the operation hash consumes only its
// behavior identity. Accounting-only price edits and unrelated aliases remain non-behavioral.
test("operation identity follows effective model, provider, fallback, and router behavior", () => {
  const fixture = (input: {
    target?: "model-a" | "model-b";
    provider?: string;
    fallback?: boolean;
    routingStrategy?: string;
  } = {}): LitellmProxyConfig => ({
    deployments: [
      {
        modelName: "model-a",
        model: "openrouter/family/model-a",
        inputCostPerToken: 0.1,
        behavior: {
          litellmParams: {
            model: "openrouter/family/model-a",
            extra_body: { provider: { only: [input.provider ?? "provider-a"], allow_fallbacks: false } }
          },
          modelInfo: { mode: "chat" }
        }
      },
      {
        modelName: "model-b",
        model: "openrouter/family/model-b",
        behavior: {
          litellmParams: {
            model: "openrouter/family/model-b",
            extra_body: { provider: { only: ["provider-b"], allow_fallbacks: false } }
          },
          modelInfo: { mode: "chat" }
        }
      },
      {
        modelName: "backup",
        model: "openrouter/family/backup",
        behavior: { litellmParams: { model: "openrouter/family/backup" }, modelInfo: { mode: "chat" } }
      }
    ],
    modelGroupAlias: {
      "kg-claim-verification-answerer": input.target ?? "model-a"
    },
    fallbacks: input.fallback ? { "kg-claim-verification-answerer": ["backup"] } : {},
    routerBehavior: { routing_strategy: input.routingStrategy ?? "usage-based-routing-v2" }
  });
  const hash = (config: LitellmProxyConfig): string => operationConfigHash(
    "routing-probe",
    [claimVerificationAnsweringDescriptor],
    {},
    { litellmConfig: config }
  );

  const baseConfig = fixture();
  const base = hash(baseConfig);
  assert.equal(base, hash(fixture()), "routing identity is deterministic");
  assert.notEqual(hash(fixture({ target: "model-b" })), base, "alias reassignment");
  assert.notEqual(hash(fixture({ provider: "provider-c" })), base, "provider pin");
  assert.notEqual(hash(fixture({ fallback: true })), base, "fallback chain");
  assert.notEqual(hash(fixture({ routingStrategy: "latency-based-routing" })), base, "router behavior");

  const priceOnly = fixture();
  priceOnly.deployments[0] = { ...priceOnly.deployments[0]!, inputCostPerToken: 99 };
  assert.equal(hash(priceOnly), base, "accounting-only prices do not invalidate quality evidence");
  const unrelatedAlias = fixture();
  unrelatedAlias.modelGroupAlias["unrelated-role"] = "model-b";
  assert.equal(hash(unrelatedAlias), base, "unrelated aliases do not perturb this operation");
  const missingDeployment = fixture();
  missingDeployment.modelGroupAlias["kg-claim-verification-answerer"] = "missing-model";
  assert.throws(() => hash(missingDeployment), /has no declared deployment/);
});

// Exact identity regression (plan 2026-07-11-001 AE6): U1 deliberately re-baselined both hashes
// because Grounding Generation now consumes the closed owner-neutral context, Synthetic Topic
// Generation binds the complete Source-less Grounding Admission policy, and v2 binds every stage's
// effective LiteLLM model/provider/fallback behavior. Future non-behavioral refactors must not
// perturb these identities.
test("default operation config hashes are stable across the registry derivation", () => {
  assert.equal(graphEnrichmentConfigHash(DEFAULT_ENRICHMENT_CONFIG), "graph-enrichment-6fe9557d11f3");
  assert.equal(syntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG), "synthetic-topic-generation-2c7d199e35c5");
});

test("synthetic execution widths do not change identity while probe behavior still does", () => {
  const base = syntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG);
  assert.equal(
    syntheticGenerationConfigHash({
      ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
      sourceLessGroundingAdmission: {
        ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission,
        candidateConcurrency: 1
      }
    }),
    base,
    "concept fan-out is execution policy"
  );
  assert.equal(
    syntheticGenerationConfigHash({
      ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
      sourceLessGroundingAdmission: {
        ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission,
        verificationConcurrency: 1
      }
    }),
    base,
    "verification fan-out is execution policy"
  );
  assert.equal(
    syntheticGenerationConfigHash({
      ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
      sourceLessGroundingAdmission: {
        ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission,
        probe: {
          ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission.probe,
          probeConcurrency: 1
        }
      }
    }),
    base,
    "within-concept probe fan-out is execution policy"
  );
  assert.notEqual(
    syntheticGenerationConfigHash({
      ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
      sourceLessGroundingAdmission: {
        ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission,
        probe: {
          ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission.probe,
          sampleCount: DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission.probe.sampleCount + 1
        }
      }
    }),
    base,
    "probe K remains behavioral identity"
  );
  assert.notEqual(
    syntheticGenerationConfigHash({
      ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
      sourceLessGroundingAdmission: {
        ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission,
        probe: {
          ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission.probe,
          agreementThreshold: DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission.probe.agreementThreshold + 0.01
        }
      }
    }),
    base,
    "probe admission threshold remains behavioral identity"
  );
  assert.notEqual(
    syntheticGenerationConfigHash({
      ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
      sourceLessGroundingAdmission: {
        ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission,
        groundingDraftAttempts: DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission.groundingDraftAttempts + 1
      }
    }),
    base,
    "bounded grounding rejection sampling remains behavioral identity"
  );
  assert.notEqual(
    syntheticGenerationConfigHash({
      ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
      sourceLessGroundingAdmission: {
        ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission,
        verificationSampleCount: DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission.verificationSampleCount + 1
      }
    }),
    base,
    "independent verification evidence sample count remains behavioral identity"
  );
  assert.notEqual(
    syntheticGenerationConfigHash({
      ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
      sourceLessGroundingAdmission: {
        ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission,
        verificationDecision: "unanimous" as typeof DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission.verificationDecision
      }
    }),
    base,
    "same-model replicated rejection remains behavioral identity"
  );
  assert.notEqual(
    syntheticGenerationConfigHash({
      ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
      sourceLessGroundingAdmission: {
        ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission,
        verificationSampleCount: 3,
        verificationRejectionSampleQuorum: 3
      }
    }),
    base,
    "replicated rejection sample quorum remains behavioral identity"
  );
  assert.notEqual(
    syntheticGenerationConfigHash({
      ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
      sourceLessGroundingAdmission: {
        ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission,
        groundingClaimProjection: "whole_passage" as "sentence_and_semicolon"
      }
    }),
    base,
    "grounding claim projection granularity remains behavioral identity"
  );
  assert.notEqual(
    syntheticGenerationConfigHash({
      ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
      sourceLessGroundingAdmission: {
        ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission,
        judgmentTargetBatchSize: 2 as 1
      }
    }),
    base,
    "singleton terminal judgment context remains behavioral identity"
  );
});

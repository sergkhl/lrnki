import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADMISSION_LABEL_NON_CONCEPT_POLICY,
  DEFAULT_ENRICHMENT_CONFIG,
  DEFAULT_CONCEPT_CANONICALIZATION_CONFIG,
  DEFAULT_SCAFFOLD_GENERATION_CONFIG,
  DEFAULT_SYNTHETIC_GENERATION_CONFIG
} from "@lrnki/application";
import { STAGE_TAGS } from "@lrnki/domain-core";
import {
  allNeuralOperationDescriptors,
  conceptCanonicalizationConfigHash,
  effectiveStudyItemBankDescriptors,
  extractionConfigHash,
  graphEnrichmentConfigHash,
  neuralOperationRegistry,
  scaffoldGenerationConfigHash,
  studyItemBankConfigHash,
  syntheticGenerationConfigHash
} from "./configHashes";
import { operationConfigHash } from "./operationConfigHash";
import { readPromptFile } from "./promptFile";

test("Concept Canonicalization identity is complete and excludes execution-only concurrency", () => {
  const config = DEFAULT_CONCEPT_CANONICALIZATION_CONFIG;
  const semantic = conceptCanonicalizationConfigHash({ mode: "semantic", config });
  assert.equal(
    semantic,
    conceptCanonicalizationConfigHash({ mode: "semantic", config: { ...config } }),
    "hash is deterministic"
  );
  assert.notEqual(
    conceptCanonicalizationConfigHash({ mode: "exact_label_only", config }),
    semantic,
    "the explicit mode is attributable"
  );
  for (const variant of [
    { ...config, similarityThreshold: config.similarityThreshold - 0.01 },
    { ...config, maxPairsPerNode: config.maxPairsPerNode + 1 },
    { ...config, maxEvidencePerNode: config.maxEvidencePerNode + 1 }
  ]) {
    assert.notEqual(conceptCanonicalizationConfigHash({ mode: "semantic", config: variant }), semantic);
  }
  assert.equal(
    conceptCanonicalizationConfigHash({
      mode: "semantic",
      config: { ...config, adjudicationConcurrency: config.adjudicationConcurrency + 1 }
    }),
    semantic,
    "adjudication concurrency is execution-only"
  );

  const entry = neuralOperationRegistry.conceptCanonicalization;
  const { adjudicationConcurrency: _execution, ...behavior } = config;
  void _execution;
  const appIdentity = { mode: "semantic", ...behavior, nodeEmbeddingModel: "kg-node-embedding" };
  assert.notEqual(
    operationConfigHash(entry.configSeed, entry.descriptors, appIdentity),
    semantic,
    "the embedding Model Assignment is part of identity"
  );
  assert.notEqual(
    operationConfigHash(entry.configSeed, [], appIdentity, { additionalModels: ["kg-node-embedding"] }),
    semantic,
    "the adjudicator descriptor and Model Assignment are part of identity"
  );
});

test("Extraction identity includes the application-owned non-concept availability policy", () => {
  const entry = neuralOperationRegistry.extraction;
  assert.notEqual(
    operationConfigHash(entry.configSeed, entry.descriptors),
    extractionConfigHash(),
    "prompt identity alone must not hide the fail-operation availability policy"
  );
  assert.notEqual(
    operationConfigHash(entry.configSeed, entry.descriptors, {
      admissionLabelNonConceptPolicy: ADMISSION_LABEL_NON_CONCEPT_POLICY
    }),
    extractionConfigHash(),
    "prompt and label policy must not hide Definition Passage disposition behavior"
  );
});

test("Graph Enrichment registers the complete shared admission stage family", () => {
  const stageTags = neuralOperationRegistry.graphEnrichment.descriptors.map((descriptor) => descriptor.stageTag);
  for (const expected of [
    STAGE_TAGS.rescueCarrierAdmission,
    STAGE_TAGS.knowledgeBoundaryProbe,
    STAGE_TAGS.groundingGeneration,
    STAGE_TAGS.groundingVerificationQuestionPlanning,
    STAGE_TAGS.groundingVerificationAnswering
  ]) {
    assert.ok(stageTags.includes(expected), expected);
  }
  assert.equal(
    stageTags.filter((stage) => stage === STAGE_TAGS.groundingFactualityRevision).length,
    2,
    "both factuality model identities are registered"
  );
  assert.equal(
    stageTags.filter((stage) => stage === STAGE_TAGS.groundingGeneration).length,
    1,
    "the one-pass grounding generation identity is registered"
  );
});

test("Study Item Bank identity includes source-support and citation-fidelity policy", () => {
  const entry = neuralOperationRegistry.studyItemBank;
  assert.notEqual(
    operationConfigHash(entry.configSeed, effectiveStudyItemBankDescriptors()),
    studyItemBankConfigHash(),
    "the source-extractive, citation-fidelity, and three-draw policies must invalidate unqualified learner assets"
  );
});

// The Scaffold entry carries its complete runtime descriptor family. The factuality stage appears
// twice because independent primary and challenger model identities are both part of provenance.
test("the scaffold operation registers shared admission, content assurance, and Answer-Key Verification completely", () => {
  const stageTags = neuralOperationRegistry.scaffoldGeneration.descriptors.map((descriptor) => descriptor.stageTag).sort();
  assert.deepEqual(stageTags, [
    STAGE_TAGS.groundingFactualityRevision,
    STAGE_TAGS.groundingFactualityRevision,
    STAGE_TAGS.groundingGeneration,
    STAGE_TAGS.groundingVerificationAnswering,
    STAGE_TAGS.groundingVerificationQuestionPlanning,
    STAGE_TAGS.knowledgeBoundaryProbe,
    STAGE_TAGS.optionSelectKeyVerification,
    STAGE_TAGS.scaffoldContentCongruence,
    STAGE_TAGS.scaffoldContentGeneration,
    STAGE_TAGS.scaffoldOutlineGeneration
  ].sort());
});

// Complete config identity: every behavior knob and descriptor perturbs the hash, while the three
// shared admission fan-out widths remain execution policy exactly as they are for other consumers.
test("scaffold identity includes every admission behavior and descriptor but excludes execution widths", () => {
  const entry = neuralOperationRegistry.scaffoldGeneration;
  const base = scaffoldGenerationConfigHash(DEFAULT_SCAFFOLD_GENERATION_CONFIG);
  assert.equal(base, scaffoldGenerationConfigHash({ ...DEFAULT_SCAFFOLD_GENERATION_CONFIG }), "hash is deterministic");

  const operationVariants = [
    { ...DEFAULT_SCAFFOLD_GENERATION_CONFIG, maxSupportSteps: DEFAULT_SCAFFOLD_GENERATION_CONFIG.maxSupportSteps + 1 },
    { ...DEFAULT_SCAFFOLD_GENERATION_CONFIG, outlineAttempts: DEFAULT_SCAFFOLD_GENERATION_CONFIG.outlineAttempts + 1 },
    { ...DEFAULT_SCAFFOLD_GENERATION_CONFIG, contentDraftAttempts: DEFAULT_SCAFFOLD_GENERATION_CONFIG.contentDraftAttempts + 1 },
    {
      ...DEFAULT_SCAFFOLD_GENERATION_CONFIG,
      positiveClaimProjection: "question_answer_pair_v2" as typeof DEFAULT_SCAFFOLD_GENERATION_CONFIG.positiveClaimProjection
    }
  ];
  for (const variant of operationVariants) {
    assert.notEqual(scaffoldGenerationConfigHash(variant), base);
  }

  const policy = DEFAULT_SCAFFOLD_GENERATION_CONFIG.sourceLessGroundingAdmission;
  const hashWithPolicy = (sourceLessGroundingAdmission: typeof policy) =>
    scaffoldGenerationConfigHash({ ...DEFAULT_SCAFFOLD_GENERATION_CONFIG, sourceLessGroundingAdmission });
  for (const [name, variant] of [
    ["candidate fan-out", { ...policy, candidateConcurrency: policy.candidateConcurrency + 1 }],
    ["question-planning fan-out", {
      ...policy,
      verificationExecution: {
        ...policy.verificationExecution,
        questionPlanningConcurrency: policy.verificationExecution.questionPlanningConcurrency + 1
      }
    }],
    ["answering fan-out", {
      ...policy,
      verificationExecution: {
        ...policy.verificationExecution,
        answeringConcurrency: policy.verificationExecution.answeringConcurrency + 1
      }
    }],
    ["factuality-judgment fan-out", {
      ...policy,
      verificationExecution: {
        ...policy.verificationExecution,
        factualityJudgmentConcurrency: policy.verificationExecution.factualityJudgmentConcurrency + 1
      }
    }],
    ["probe fan-out", { ...policy, probe: { ...policy.probe, probeConcurrency: policy.probe.probeConcurrency + 1 } }]
  ] as const) {
    assert.equal(hashWithPolicy(variant), base, `${name} is execution policy`);
  }
  for (const [name, variant] of [
    ["probe sample count", { ...policy, probe: { ...policy.probe, sampleCount: policy.probe.sampleCount + 1 } }],
    ["probe threshold", { ...policy, probe: { ...policy.probe, agreementThreshold: policy.probe.agreementThreshold + 0.01 } }],
    ["verification samples", { ...policy, verificationSampleCount: policy.verificationSampleCount + 1 }],
    ["rejection quorum", { ...policy, verificationRejectionSampleQuorum: policy.verificationRejectionSampleQuorum + 1 }],
    ["verification decision", { ...policy, verificationDecision: "unanimous" as typeof policy.verificationDecision }],
    ["claim projection", { ...policy, groundingClaimProjection: "whole_passage" as typeof policy.groundingClaimProjection }],
    ["judgment batch size", { ...policy, judgmentTargetBatchSize: 2 as typeof policy.judgmentTargetBatchSize }]
  ] as const) {
    assert.notEqual(hashWithPolicy(variant), base, `${name} is behavioral identity`);
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
  assert.deepEqual(claimJudges.map((descriptor) => descriptor.promptPath), [
    "claim-factuality-judgment.prompt",
    "claim-factuality-challenge.prompt"
  ]);
  assert.deepEqual(claimJudges.map(
    (descriptor) => descriptor.modelOverride ?? readPromptFile(descriptor.promptPath).model
  ), ["kg-grounding-factuality-judge", "kg-grounding-factuality-challenger"]);
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
  const roleSupportTags = allNeuralOperationDescriptors
    .filter((descriptor) => descriptor.promptPath.includes("definition-passage-role-support"))
    .map((descriptor) => descriptor.stageTag)
    .sort();
  assert.deepEqual(roleSupportTags, [STAGE_TAGS.definitionPassageQuality, STAGE_TAGS.rescueDefinitionQuality].sort());
});

test("Graph Enrichment hashes every admission behavior knob but not execution fan-out", () => {
  const base = graphEnrichmentConfigHash(DEFAULT_ENRICHMENT_CONFIG);
  const hashWith = (
    sourceLessGroundingAdmission: typeof DEFAULT_ENRICHMENT_CONFIG.sourceLessGroundingAdmission
  ) => graphEnrichmentConfigHash({ ...DEFAULT_ENRICHMENT_CONFIG, sourceLessGroundingAdmission });
  const policy = DEFAULT_ENRICHMENT_CONFIG.sourceLessGroundingAdmission;

  for (const [name, sourceLessGroundingAdmission] of [
    ["candidate fan-out", { ...policy, candidateConcurrency: policy.candidateConcurrency + 1 }],
    ["question-planning fan-out", {
      ...policy,
      verificationExecution: {
        ...policy.verificationExecution,
        questionPlanningConcurrency: policy.verificationExecution.questionPlanningConcurrency + 1
      }
    }],
    ["answering fan-out", {
      ...policy,
      verificationExecution: {
        ...policy.verificationExecution,
        answeringConcurrency: policy.verificationExecution.answeringConcurrency + 1
      }
    }],
    ["factuality-judgment fan-out", {
      ...policy,
      verificationExecution: {
        ...policy.verificationExecution,
        factualityJudgmentConcurrency: policy.verificationExecution.factualityJudgmentConcurrency + 1
      }
    }],
    ["probe fan-out", { ...policy, probe: { ...policy.probe, probeConcurrency: policy.probe.probeConcurrency + 1 } }]
  ] as const) {
    assert.equal(hashWith(sourceLessGroundingAdmission), base, `${name} is execution policy`);
  }

  const behaviorVariants: readonly [string, typeof policy][] = [
    ["probe sample count", { ...policy, probe: { ...policy.probe, sampleCount: policy.probe.sampleCount + 1 } }],
    ["probe threshold", { ...policy, probe: { ...policy.probe, agreementThreshold: policy.probe.agreementThreshold + 0.01 } }],
    ["verification samples", { ...policy, verificationSampleCount: policy.verificationSampleCount + 1 }],
    ["rejection quorum", { ...policy, verificationRejectionSampleQuorum: policy.verificationRejectionSampleQuorum + 1 }],
    [
      "verification decision",
      { ...policy, verificationDecision: "unanimous" as typeof policy.verificationDecision }
    ],
    [
      "claim projection",
      { ...policy, groundingClaimProjection: "whole_passage" as typeof policy.groundingClaimProjection }
    ],
    [
      "judgment batch size",
      { ...policy, judgmentTargetBatchSize: 2 as typeof policy.judgmentTargetBatchSize }
    ]
  ];
  for (const [name, variant] of behaviorVariants) {
    assert.notEqual(hashWith(variant), base, `${name} is behavioral identity`);
  }
});

test("dropping any shared admission descriptor changes Graph Enrichment identity", () => {
  const entry = neuralOperationRegistry.graphEnrichment;
  const admissionStages = new Set<string>([
    STAGE_TAGS.knowledgeBoundaryProbe,
    STAGE_TAGS.groundingGeneration,
    STAGE_TAGS.groundingVerificationQuestionPlanning,
    STAGE_TAGS.groundingVerificationAnswering,
    STAGE_TAGS.groundingFactualityRevision
  ]);
  const admissionIndexes = entry.descriptors
    .map((descriptor, index) => ({ descriptor, index }))
    .filter(({ descriptor }) => admissionStages.has(descriptor.stageTag));
  assert.equal(admissionIndexes.length, 6, "probe, generation, planner, answerer, and both factuality identities");

  const knobs = { sourceLessGroundingAdmission: DEFAULT_ENRICHMENT_CONFIG.sourceLessGroundingAdmission };
  const full = operationConfigHash(entry.configSeed, entry.descriptors, knobs);
  for (const { descriptor, index } of admissionIndexes) {
    const narrowed = entry.descriptors.filter((_, position) => position !== index);
    assert.notEqual(
      operationConfigHash(entry.configSeed, narrowed, knobs),
      full,
      `${descriptor.stageTag}:${descriptor.modelOverride ?? "default"}`
    );
  }
});

// Exact identity regression: all three consumers share Source-less Grounding Admission and the
// same DeepSeek Provider Route, so an intentional route change re-baselines them together even
// when their Model Assignment is preserved. Non-behavioral refactors must not perturb them.
test("default operation config hashes are stable across the registry derivation", () => {
  assert.equal(graphEnrichmentConfigHash(DEFAULT_ENRICHMENT_CONFIG), "graph-enrichment-cf5536ca7609");
  assert.equal(scaffoldGenerationConfigHash(DEFAULT_SCAFFOLD_GENERATION_CONFIG), "learner-scaffold-generation-25c065547f8a");
  assert.equal(syntheticGenerationConfigHash(DEFAULT_SYNTHETIC_GENERATION_CONFIG), "synthetic-topic-generation-3286a5adf7a3");
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
  for (const field of [
    "questionPlanningConcurrency",
    "answeringConcurrency",
    "factualityJudgmentConcurrency"
  ] as const) {
    assert.equal(
      syntheticGenerationConfigHash({
        ...DEFAULT_SYNTHETIC_GENERATION_CONFIG,
        sourceLessGroundingAdmission: {
          ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission,
          verificationExecution: {
            ...DEFAULT_SYNTHETIC_GENERATION_CONFIG.sourceLessGroundingAdmission.verificationExecution,
            [field]: 1
          }
        }
      }),
      base,
      `${field} is execution policy`
    );
  }
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

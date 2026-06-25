import assert from "node:assert/strict";
import test from "node:test";
import {
  STAGE_TAGS,
  type AdmissionProposal,
  type ArtifactEnvelope,
  type DiscoveredCandidate,
  type ExtractedEvidenceProfile,
  type ExtractionRunResult,
  type StructuredDocument
} from "@lrnki/domain-core";
import type {
  AdmissionLabelJudgmentPort,
  AssertionEntailmentJudgmentPort,
  ConceptConditionedEvidenceProfileExtractionPort,
  DefinitionPassageQualityJudgmentPort,
  ExtractionRunStorePort,
  RunProgressReporterPort
} from "@lrnki/ports";
import { executeExtractionRun } from "./executeExtractionRun";

// A recording reporter fake: captures the ordered reporter calls so tests assert the
// timeline lifecycle (begin → stages → complete) without a database (rule 11).
type ReporterCall =
  | { method: "beginOperation"; operationType: string; operationId: string }
  | { method: "enterStage"; stage: string; total?: number }
  | { method: "recordProgress"; stage: string; done: number }
  | { method: "completeStage"; stage: string; ok: boolean }
  | { method: "completeOperation"; status: string };

function recordingReporter() {
  const calls: ReporterCall[] = [];
  const reporter: RunProgressReporterPort = {
    async beginOperation(i) { calls.push({ method: "beginOperation", operationType: i.operationType, operationId: i.operationId }); },
    async enterStage(i) { calls.push({ method: "enterStage", stage: i.stage, total: i.total }); },
    async recordProgress(i) { calls.push({ method: "recordProgress", stage: i.stage, done: i.done }); },
    async completeStage(i) { calls.push({ method: "completeStage", stage: i.stage, ok: i.ok }); },
    async completeOperation(i) { calls.push({ method: "completeOperation", status: i.status }); }
  };
  return { reporter, calls };
}

// Default judge accepts every optional assertion so these tests exercise the
// deterministic + orchestration behavior; rejection is covered in
// applyAssertionEntailmentJudge.test.ts.
const entailEverything: AssertionEntailmentJudgmentPort = {
  model: "test-judge",
  judgeDefinition: async () => ({ entailed: true, entailingSpan: "", rationale: "test" })
};

// Default admission judge calls every label a concept, so candidates stay core and
// these orchestration tests are unaffected; proposition demotion is covered in
// applyAdmissionLabelJudge.test.ts.
const everythingIsAConcept: AdmissionLabelJudgmentPort = {
  model: "test-admission-judge",
  judge: async () => ({ labelKind: "concept", underlyingNounPhrase: "", groundingSpan: "", rationale: "test" })
};

// Default definition-quality judge keeps every passage, so these orchestration tests
// see unchanged definitions; the drop/demote routing is exercised below with a vetoing
// judge and in applyDefinitionPassageQualityJudge.test.ts.
const keepAllDefinitions: DefinitionPassageQualityJudgmentPort = {
  model: "test-definition-quality-judge",
  judgeDefinitions: async (input) =>
    input.passages.map(() => ({ establishesMeaning: true, category: "establishes_meaning", judgedSpan: "", rationale: "test" }))
};

// A judge that vetoes EVERY definition passage as a heading, grounding on the whole
// quote so the stage honors the veto. Drops a core Concept's last definition.
const vetoAllDefinitions: DefinitionPassageQualityJudgmentPort = {
  model: "test-definition-quality-judge",
  judgeDefinitions: async (input) =>
    input.passages.map((passage) => ({ establishesMeaning: false, category: "heading_or_title", judgedSpan: passage.evidenceQuote, rationale: "hollow" }))
};

const throwingDefinitionJudge: DefinitionPassageQualityJudgmentPort = {
  model: "test-definition-quality-judge",
  judgeDefinitions: async () => { throw new Error("judge transport down"); }
};

const frameworkQuote = "INSTRUCTKG is part of Signal Systems and INSTRUCTKG works by leveraging temporal signals.";
const signalQuote = "Temporal signals organize teaching order and reveal prerequisite structure.";
const document: StructuredDocument = {
  sourceResourceId: "source-1",
  parserName: "test",
  parserVersion: "1",
  parserConfigHash: "test",
  blocks: [
    { blockId: "block-1", blockType: "paragraph", text: frameworkQuote, headingPath: [], locator: {} },
    { blockId: "block-2", blockType: "paragraph", text: signalQuote, headingPath: [], locator: {} }
  ]
};

const candidates: DiscoveredCandidate[] = [
  {
    candidateKey: "framework",
    canonicalLabel: "Instructor-Aligned Knowledge Graphs",
    mentions: [{ blockId: "block-1", evidenceQuote: "INSTRUCTKG" }]
  },
  {
    candidateKey: "signals",
    canonicalLabel: "Temporal Signals",
    mentions: [{ blockId: "block-2", evidenceQuote: "Temporal signals" }]
  }
];

function admission(candidate: DiscoveredCandidate, overrides: Partial<AdmissionProposal> = {}): AdmissionProposal {
  const quote = candidate.candidateKey === "framework" ? frameworkQuote : signalQuote;
  const blockId = candidate.candidateKey === "framework" ? "block-1" : "block-2";
  return {
    atomicKey: candidate.candidateKey,
    parentCandidateKey: candidate.candidateKey,
    proposedCanonicalLabel: candidate.canonicalLabel,
    tier: "core",
    sourceRole: "declared_domain_concept",
    standaloneLearningObjective: { passed: true, rationale: "standalone", evidence: [{ blockId, evidenceQuote: quote }] },
    establishedDomainMeaning: { passed: true, rationale: "established", evidence: [{ blockId, evidenceQuote: quote }] },
    definitionBearingTreatment: { passed: true, rationale: "definition-bearing", evidence: [{ blockId, evidenceQuote: quote }] },
    organizingPower: {
      passed: true,
      rationale: "organizes",
      aspects: [
        { summary: "first aspect", nature: "mechanism", evidence: { blockId, evidenceQuote: quote } },
        { summary: "second aspect", nature: "structural-relationship", evidence: { blockId, evidenceQuote: candidate.candidateKey === "framework" ? "INSTRUCTKG" : "Temporal signals" } }
      ]
    },
    coreSelected: true,
    selectionReasonCode: "source_level_core",
    reasonCodes: ["source_level_core"],
    confidence: 0.9,
    ...overrides
  };
}

// A CEP extractor that gives every admitted subject a verbatim definition plus a
// single verbatim mention drawn from its own block.
const definitionFor: Record<string, ExtractedEvidenceProfile> = {
  framework: {
    definitions: [{ blockId: "block-1", evidenceQuote: frameworkQuote }],
    mentions: [{ blockId: "block-1", evidenceQuote: "INSTRUCTKG works by leveraging temporal signals" }],
    assertions: []
  },
  signals: {
    definitions: [{ blockId: "block-2", evidenceQuote: signalQuote }],
    mentions: [],
    assertions: []
  }
};

function harness(
  extract: ConceptConditionedEvidenceProfileExtractionPort["extract"],
  selectedCandidates = candidates,
  admit: (candidate: DiscoveredCandidate) => AdmissionProposal = admission,
  options: { document?: StructuredDocument; evidenceNeighborhoodConfig?: { maxEvidenceBlocksPerConcept: number; siblingCap: number; adjacencyRadius: number }; definitionPassageQualityJudge?: DefinitionPassageQualityJudgmentPort; reporter?: RunProgressReporterPort } = {}
) {
  let persisted: ExtractionRunResult | undefined;
  let persistedArtifact: ArtifactEnvelope<ExtractionRunResult> | undefined;
  const store: ExtractionRunStorePort = {
    persist: async (result, artifact) => { persisted = result; persistedArtifact = artifact; },
    runsForBuildByIds: async () => []
  };
  return {
    run: () => executeExtractionRun({
      runId: "run-1",
      source: {
        sourceResourceId: "source-1",
        sourceDocumentId: "document-1",
        declaredDomain: "educational technology",
        document: options.document ?? document
      },
      pipelineConfigHash: "test-v1",
      evidenceNeighborhoodConfig: options.evidenceNeighborhoodConfig,
      discovery: { discover: async () => selectedCandidates },
      admission: { admit: async () => selectedCandidates.map(admit) },
      evidenceProfileExtraction: { extract },
      assertionEntailmentJudge: entailEverything,
      admissionLabelJudge: everythingIsAConcept,
      definitionPassageQualityJudge: options.definitionPassageQualityJudge ?? keepAllDefinitions,
      store,
      reporter: options.reporter
    }),
    persisted: () => persisted,
    artifact: () => persistedArtifact
  };
}

const adjacentDefinitionQuote = "It widens the evidence neighborhood with adjacent teachable blocks.";
const adjacentDocument: StructuredDocument = {
  sourceResourceId: "source-adjacent",
  parserName: "test",
  parserVersion: "1",
  parserConfigHash: "test",
  blocks: [
    { blockId: "alpha-mention", blockType: "paragraph", text: "Concept Alpha is named here.", headingPath: ["Method"], locator: {} },
    { blockId: "alpha-definition", blockType: "paragraph", text: adjacentDefinitionQuote, headingPath: ["Method"], locator: {} },
    { blockId: "alpha-sibling", blockType: "paragraph", text: "A later sibling explains why the context window is capped.", headingPath: ["Method"], locator: {} }
  ]
};
const adjacentCandidate: DiscoveredCandidate = {
  candidateKey: "alpha",
  canonicalLabel: "Concept Alpha",
  mentions: [{ blockId: "alpha-mention", evidenceQuote: "Concept Alpha" }]
};

function adjacentAdmission(): AdmissionProposal {
  return {
    atomicKey: "alpha",
    parentCandidateKey: "alpha",
    proposedCanonicalLabel: "Concept Alpha",
    tier: "core",
    sourceRole: "declared_domain_concept",
    standaloneLearningObjective: { passed: true, rationale: "standalone", evidence: [{ blockId: "alpha-mention", evidenceQuote: "Concept Alpha" }] },
    establishedDomainMeaning: { passed: true, rationale: "established", evidence: [{ blockId: "alpha-mention", evidenceQuote: "Concept Alpha" }] },
    definitionBearingTreatment: { passed: true, rationale: "definition-bearing", evidence: [{ blockId: "alpha-mention", evidenceQuote: "Concept Alpha" }] },
    organizingPower: {
      passed: true,
      rationale: "organizes",
      aspects: [
        { summary: "names the subject", nature: "definition-or-property", evidence: { blockId: "alpha-mention", evidenceQuote: "Concept Alpha" } },
        { summary: "explains the window", nature: "mechanism", evidence: { blockId: "alpha-definition", evidenceQuote: adjacentDefinitionQuote } }
      ]
    },
    coreSelected: true,
    selectionReasonCode: "source_level_core",
    reasonCodes: ["source_level_core"],
    confidence: 0.9
  };
}

test("produces one complete CEP per admitted concept and marks the run succeeded", async () => {
  const result = await harness(async (input) => definitionFor[input.subject.candidateKey]).run();
  assert.equal(result.status, "succeeded");
  assert.equal(result.degraded, false);
  assert.equal(result.evidenceProfiles.length, 2);
  const framework = result.evidenceProfiles.find((p) => p.candidateKey === "framework");
  assert.equal(framework?.complete, true);
  assert.equal(framework?.definitions.length, 1);
  assert.equal(framework?.mentions.length, 1);
  assert.equal(result.maxMentionsPerConceptPerSource, 6);
  assert.ok(result.candidates.every((candidate) => !candidate.admission.boundaryReasonCodes.includes("core_demoted_ungroundable")));
});

// --- Definition-Passage quality judge wiring (ADR-0007 extension, U5) -------

test("a vetoed last definition demotes the core with the hollow reason code and the run still succeeds", async () => {
  const h = harness(
    async (input) => definitionFor[input.subject.candidateKey],
    candidates,
    admission,
    { definitionPassageQualityJudge: vetoAllDefinitions }
  );
  const result = await h.run();

  assert.equal(result.status, "succeeded");
  const framework = result.candidates.find((c) => c.candidateKey === "framework");
  assert.equal(framework?.admission.tier, "optional");
  assert.ok(framework?.admission.boundaryReasonCodes.includes("core_demoted_hollow_definition"));
  assert.ok(!framework?.admission.boundaryReasonCodes.includes("core_demoted_ungroundable"));
  assert.equal(result.evidenceProfiles.find((p) => p.candidateKey === "framework")?.complete, false);
  assert.ok(result.definitionQualityDispositions.some((d) => d.candidateKey === "framework" && d.disposition === "vetoed"));
  // The distinct hollow quality issue is surfaced, separate from the ungroundable one.
  assert.ok(result.qualityIssues.some((issue) => issue.issueType === "core_demoted_hollow_definition" && issue.candidateKey === "framework"));
});

test("a surviving definition keeps the core complete when only one of two passages is vetoed", async () => {
  const vetoSecondOnly: DefinitionPassageQualityJudgmentPort = {
    model: "test",
    judgeDefinitions: async (input) =>
      input.passages.map((passage, index) =>
        index === 0
          ? { establishesMeaning: true, category: "establishes_meaning", judgedSpan: "", rationale: "ok" }
          : { establishesMeaning: false, category: "heading_or_title", judgedSpan: passage.evidenceQuote, rationale: "hollow" }
      )
  };
  const h = harness(
    async (input) =>
      input.subject.candidateKey === "framework"
        ? { definitions: [
            { blockId: "block-1", evidenceQuote: frameworkQuote },
            { blockId: "block-1", evidenceQuote: "INSTRUCTKG works by leveraging temporal signals" }
          ], mentions: [], assertions: [] }
        : definitionFor[input.subject.candidateKey],
    candidates,
    admission,
    { definitionPassageQualityJudge: vetoSecondOnly }
  );
  const result = await h.run();

  const framework = result.candidates.find((c) => c.candidateKey === "framework");
  assert.equal(framework?.admission.tier, "core");
  const profile = result.evidenceProfiles.find((p) => p.candidateKey === "framework");
  assert.equal(profile?.complete, true);
  assert.equal(profile?.definitions.length, 1);
});

test("a throwing definition-quality judge demotes nothing and records kept_judge_unavailable", async () => {
  const h = harness(
    async (input) => definitionFor[input.subject.candidateKey],
    candidates,
    admission,
    { definitionPassageQualityJudge: throwingDefinitionJudge }
  );
  const result = await h.run();

  assert.equal(result.status, "succeeded");
  assert.equal(result.candidates.find((c) => c.candidateKey === "framework")?.admission.tier, "core");
  assert.ok(result.candidates.every((c) => !c.admission.boundaryReasonCodes.includes("core_demoted_hollow_definition")));
  assert.ok(result.definitionQualityDispositions.every((d) => d.disposition === "kept_judge_unavailable"));
});

test("definition-quality dispositions are carried on the persisted run artifact payload", async () => {
  const h = harness(
    async (input) => definitionFor[input.subject.candidateKey],
    candidates,
    admission,
    { definitionPassageQualityJudge: vetoAllDefinitions }
  );
  await h.run();
  const payload = h.artifact()?.payload;
  assert.ok(payload?.definitionQualityDispositions.some((d) => d.disposition === "vetoed"));
});

test("passes adjacent definition blocks into the concept-conditioned extractor while preserving verbatim validation", async () => {
  const receivedNeighborhood = new Map<string, string[]>();
  const result = await harness(
    async (input) => {
      receivedNeighborhood.set(input.subject.candidateKey, input.evidenceNeighborhood.map((block) => block.blockId));
      return {
        definitions: [
          { blockId: "alpha-definition", evidenceQuote: adjacentDefinitionQuote },
          { blockId: "alpha-definition", evidenceQuote: "this quote is absent from every source block" }
        ],
        mentions: [],
        assertions: []
      };
    },
    [adjacentCandidate],
    adjacentAdmission,
    { document: adjacentDocument }
  ).run();

  assert.ok(receivedNeighborhood.get("alpha")?.includes("alpha-definition"));
  const profile = result.evidenceProfiles.find((candidate) => candidate.candidateKey === "alpha");
  assert.deepEqual(profile?.definitions.map((definition) => definition.evidenceQuote), [adjacentDefinitionQuote]);
  assert.equal(profile?.complete, true);
});

test("passes evidence neighborhood config overrides into the selector", async () => {
  const receivedNeighborhood = new Map<string, string[]>();
  await harness(
    async (input) => {
      receivedNeighborhood.set(input.subject.candidateKey, input.evidenceNeighborhood.map((block) => block.blockId));
      return { definitions: [{ blockId: "alpha-mention", evidenceQuote: "Concept Alpha" }], mentions: [], assertions: [] };
    },
    [adjacentCandidate],
    adjacentAdmission,
    {
      document: adjacentDocument,
      evidenceNeighborhoodConfig: { maxEvidenceBlocksPerConcept: 1, siblingCap: 4, adjacencyRadius: 1 }
    }
  ).run();

  assert.deepEqual(receivedNeighborhood.get("alpha"), ["alpha-mention"]);
});

test("carries each core subject's admission-verified definition-bearing evidence into extraction (optional carries none)", async () => {
  // U2/R2 wiring: the extract() subject receives the admission-verified
  // definition-bearing passages for core subjects, and an empty hint for optional.
  const carried = new Map<string, string[]>();
  await harness(
    async (input) => {
      carried.set(input.subject.candidateKey, input.definitionBearingEvidence.map((e) => e.evidenceQuote));
      return definitionFor[input.subject.candidateKey];
    },
    candidates,
    (candidate) =>
      candidate.candidateKey === "signals"
        ? admission(candidate, { tier: "optional", coreSelected: false, selectionReasonCode: "supporting_mechanism" })
        : admission(candidate)
  ).run();

  assert.deepEqual(carried.get("framework"), [frameworkQuote]);
  assert.deepEqual(carried.get("signals"), []);
});

test("an extractor that echoes the carried definition hint yields a complete core CEP and a succeeded run", async () => {
  // U2/R2: the hint is conditioning context; the extractor still emits its own
  // verbatim definition passage and the boundary still verifies it.
  const result = await harness(async (input) => ({
    definitions: input.definitionBearingEvidence.map((e) => ({ blockId: e.blockId, evidenceQuote: e.evidenceQuote })),
    mentions: [],
    assertions: []
  })).run();

  assert.equal(result.status, "succeeded");
  assert.equal(result.evidenceProfiles.find((p) => p.candidateKey === "framework")?.complete, true);
});

test("a carried definition the extractor alters off-verbatim is still dropped and the ungroundable core is demoted", async () => {
  // U2: carrying evidence never weakens the verbatim floor. If the extractor returns
  // an altered quote, the policy drops it and the incomplete core is demoted.
  const result = await harness(async (input) =>
    input.subject.candidateKey === "signals"
      ? { definitions: [{ blockId: "block-2", evidenceQuote: `${input.definitionBearingEvidence[0]?.evidenceQuote ?? ""} (added words not in the block)` }], mentions: [], assertions: [] }
      : definitionFor[input.subject.candidateKey]
  ).run();

  assert.equal(result.status, "succeeded");
  assert.equal(result.degraded, false);
  assert.equal(result.evidenceProfiles.find((p) => p.candidateKey === "signals")?.definitions.length, 0);
  assert.equal(result.evidenceProfiles.find((p) => p.candidateKey === "signals")?.tier, "optional");
  const demoted = result.candidates.find((candidate) => candidate.candidateKey === "signals");
  assert.equal(demoted?.admission.tier, "optional");
  assert.equal(demoted?.admission.modelTier, "core");
  assert.ok(demoted?.admission.boundaryReasonCodes.includes("core_demoted_ungroundable"));
});

test("demotes one ungroundable core while keeping grounded cores publishable", async () => {
  const result = await harness(async (input) =>
    input.subject.candidateKey === "signals"
      ? { definitions: [], mentions: [], assertions: [] }
      : definitionFor[input.subject.candidateKey]
  ).run();
  assert.equal(result.status, "succeeded");
  assert.equal(result.degraded, false);
  assert.equal(result.candidates.find((c) => c.candidateKey === "framework")?.admission.tier, "core");
  const demoted = result.candidates.find((c) => c.candidateKey === "signals");
  assert.equal(demoted?.admission.tier, "optional");
  assert.equal(demoted?.admission.modelTier, "core");
  assert.ok(demoted?.admission.boundaryReasonCodes.includes("core_demoted_ungroundable"));
  const profile = result.evidenceProfiles.find((p) => p.candidateKey === "signals");
  assert.equal(profile?.complete, false);
  assert.equal(profile?.tier, "optional");
});

test("keeps an incomplete optional profile inspectable without failing the run", async () => {
  const result = await harness(
    async (input) =>
      input.subject.candidateKey === "signals"
        ? { definitions: [], mentions: [{ blockId: "block-2", evidenceQuote: "Temporal signals" }], assertions: [] }
        : definitionFor[input.subject.candidateKey],
    candidates,
    (candidate) =>
      candidate.candidateKey === "signals"
        ? admission(candidate, { tier: "optional", coreSelected: false, selectionReasonCode: "supporting_mechanism" })
        : admission(candidate)
  ).run();

  assert.equal(result.status, "succeeded");
  assert.equal(result.degraded, false);
  assert.equal(result.evidenceProfiles.find((p) => p.candidateKey === "signals")?.complete, false);
  assert.equal(result.candidates.find((c) => c.candidateKey === "signals")?.admission.tier, "optional");
  assert.ok(!result.candidates.find((c) => c.candidateKey === "signals")?.admission.boundaryReasonCodes.includes("core_demoted_ungroundable"));
  assert.equal(result.evidenceProfiles.find((p) => p.candidateKey === "framework")?.complete, true);
});

test("a non-verbatim definition quote is removed, leaving an incomplete demoted profile and a succeeded run", async () => {
  const result = await harness(async (input) =>
    input.subject.candidateKey === "signals"
      ? { definitions: [{ blockId: "block-2", evidenceQuote: "this text is not in the block" }], mentions: [], assertions: [] }
      : definitionFor[input.subject.candidateKey]
  ).run();
  assert.equal(result.status, "succeeded");
  assert.equal(result.degraded, false);
  assert.equal(result.evidenceProfiles.find((p) => p.candidateKey === "signals")?.definitions.length, 0);
  assert.equal(result.evidenceProfiles.find((p) => p.candidateKey === "signals")?.tier, "optional");
});

test("an extractor failure yields an incomplete demoted profile and a succeeded run, never throwing", async () => {
  const result = await harness(async (input) => {
    if (input.subject.candidateKey === "signals") throw new Error("model unavailable");
    return definitionFor[input.subject.candidateKey];
  }).run();
  assert.equal(result.status, "succeeded");
  assert.equal(result.degraded, false);
  assert.equal(result.evidenceProfiles.find((p) => p.candidateKey === "signals")?.complete, false);
  assert.equal(result.evidenceProfiles.find((p) => p.candidateKey === "signals")?.tier, "optional");
});

test("marks a run degraded when demotion removes the last published core", async () => {
  const result = await harness(
    async () => ({ definitions: [], mentions: [], assertions: [] }),
    [candidates[0]]
  ).run();

  assert.equal(result.status, "succeeded");
  assert.equal(result.degraded, true);
  assert.equal(result.candidates[0].admission.tier, "optional");
  assert.equal(result.candidates[0].admission.modelTier, "core");
  assert.ok(result.candidates[0].admission.boundaryReasonCodes.includes("core_demoted_ungroundable"));
  assert.equal(result.evidenceProfiles[0].tier, "optional");
  assert.equal(result.evidenceProfiles[0].complete, false);
});

test("persists the run with its immutable extraction artifact in the same call", async () => {
  const h = harness(async (input) => definitionFor[input.subject.candidateKey]);
  const result = await h.run();
  assert.equal(h.persisted()?.runId, "run-1");
  const artifact = h.artifact();
  assert.equal(artifact?.artifactType, "extraction_run");
  assert.equal(artifact?.runId, "run-1");
  assert.equal(artifact?.payload, result);
  assert.ok(result.qualityIssues.some((issue) => issue.issueType === "generic_domain_neutral_prompt"));
});

// --- U1 regression: atomic admission splitting and fail-closed atom validation ---

const splitDocument: StructuredDocument = {
  sourceResourceId: "source-2",
  parserName: "test",
  parserVersion: "1",
  parserConfigHash: "test",
  blocks: [
    {
      blockId: "block-1",
      blockType: "paragraph",
      text: "The stack and the heap are two regions of memory. The stack stores values in order; the heap stores data of unknown size.",
      headingPath: [],
      locator: {}
    }
  ]
};

const conflatedCandidate: DiscoveredCandidate = {
  candidateKey: "stack_heap",
  canonicalLabel: "The stack and the heap",
  mentions: [{ blockId: "block-1", evidenceQuote: "The stack and the heap are two regions of memory." }]
};

function atom(atomicKey: string, label: string, defQuote: string, overrides: Partial<AdmissionProposal> = {}): AdmissionProposal {
  return {
    atomicKey,
    parentCandidateKey: "stack_heap",
    proposedCanonicalLabel: label,
    tier: "core",
    sourceRole: "declared_domain_concept",
    standaloneLearningObjective: { passed: true, rationale: "standalone", evidence: [{ blockId: "block-1", evidenceQuote: defQuote }] },
    establishedDomainMeaning: { passed: true, rationale: "established", evidence: [{ blockId: "block-1", evidenceQuote: defQuote }] },
    definitionBearingTreatment: { passed: true, rationale: "definition-bearing", evidence: [{ blockId: "block-1", evidenceQuote: defQuote }] },
    organizingPower: {
      passed: true,
      rationale: "organizes",
      aspects: [
        { summary: "memory region", nature: "definition-or-property", evidence: { blockId: "block-1", evidenceQuote: "The stack and the heap are two regions of memory." } },
        { summary: "storage behavior", nature: "mechanism", evidence: { blockId: "block-1", evidenceQuote: defQuote } }
      ]
    },
    coreSelected: true,
    selectionReasonCode: "source_level_core",
    reasonCodes: ["source_level_core"],
    confidence: 0.9,
    ...overrides
  };
}

function runSplit(admitProposals: AdmissionProposal[]): Promise<ExtractionRunResult> {
  const store: ExtractionRunStorePort = { persist: async () => {}, runsForBuildByIds: async () => [] };
  return executeExtractionRun({
    runId: "run-split",
    source: { sourceResourceId: "source-2", sourceDocumentId: "document-2", declaredDomain: "rust", document: splitDocument },
    pipelineConfigHash: "test-v1",
    discovery: { discover: async () => [conflatedCandidate] },
    admission: { admit: async () => admitProposals },
    evidenceProfileExtraction: {
      extract: async () => ({ definitions: [{ blockId: "block-1", evidenceQuote: "two regions of memory" }], mentions: [], assertions: [] })
    },
    assertionEntailmentJudge: entailEverything,
    admissionLabelJudge: everythingIsAConcept,
    definitionPassageQualityJudge: keepAllDefinitions,
    store
  });
}

test("splits one conflated candidate into independently-tiered atomic concepts retaining the parent key", async () => {
  const result = await runSplit([
    atom("stack_heap__stack", "The stack", "The stack stores values in order"),
    atom("stack_heap__heap", "The heap", "the heap stores data of unknown size", { coreSelected: false, selectionReasonCode: "supporting_mechanism", tier: "optional" })
  ]);
  const core = result.candidates.filter((c) => c.admission.tier === "core");
  const optional = result.candidates.filter((c) => c.admission.tier === "optional");
  assert.equal(core.length, 1);
  assert.equal(core[0].candidateKey, "stack_heap__stack");
  assert.equal(core[0].canonicalLabel, "The stack");
  assert.equal(core[0].parentCandidateKey, "stack_heap");
  assert.equal(optional[0].candidateKey, "stack_heap__heap");
  assert.equal(optional[0].parentCandidateKey, "stack_heap");
  // Both core and optional atoms receive a CEP — confirms the orchestrator wires
  // admitSource through to CEP extraction. The fail-closed cross-atom invariants
  // (duplicate atomic keys, unknown parent) are unit-tested in admitSource.test.ts.
  assert.equal(result.evidenceProfiles.length, 2);
});

// --- U4: run-progress reporter instrumentation -----------------------------

test("a successful run reports beginOperation → stages in pipeline order → completeOperation succeeded", async () => {
  const { reporter, calls } = recordingReporter();
  await harness(async (input) => definitionFor[input.subject.candidateKey], candidates, admission, { reporter }).run();

  // The parent row is created at entry, keyed extraction/runId.
  assert.deepEqual(calls[0], { method: "beginOperation", operationType: "extraction", operationId: "run-1" });
  assert.deepEqual(calls.at(-1), { method: "completeOperation", status: "succeeded" });

  // Stages enter in pipeline order, each closed ok:true; persist is the non-LLM tail.
  const entered = calls.filter((c) => c.method === "enterStage").map((c) => (c as { stage: string }).stage);
  assert.deepEqual(entered, [
    STAGE_TAGS.conceptDiscovery,
    STAGE_TAGS.admission,
    STAGE_TAGS.cepExtraction,
    STAGE_TAGS.definitionPassageQuality,
    STAGE_TAGS.assertionEntailment,
    "persist"
  ]);
  assert.ok(calls.filter((c) => c.method === "completeStage").every((c) => (c as { ok: boolean }).ok === true));
  // No failed status is ever emitted on a clean run.
  assert.ok(!calls.some((c) => c.method === "completeOperation" && (c as { status: string }).status === "failed"));
});

test("the cep-extraction stage emits recordProgress once per admitted concept, final done = admitted count", async () => {
  const { reporter, calls } = recordingReporter();
  await harness(async (input) => definitionFor[input.subject.candidateKey], candidates, admission, { reporter }).run();

  const cepEnter = calls.find((c) => c.method === "enterStage" && (c as { stage: string }).stage === STAGE_TAGS.cepExtraction) as { total?: number };
  assert.equal(cepEnter.total, 2); // two admitted concepts
  const progress = calls.filter((c) => c.method === "recordProgress" && (c as { stage: string }).stage === STAGE_TAGS.cepExtraction) as { done: number }[];
  assert.equal(progress.length, 2);
  assert.deepEqual(progress.map((c) => c.done), [1, 2]);
});

test("a thrown stage closes that stage ok:false and reports completeOperation failed, never succeeded", async () => {
  // CEP per-item extractor errors are SWALLOWED by design (fail-closed to an empty
  // profile), so the error path is driven through discovery, which propagates. The
  // mechanism — completeStage(ok:false) then completeOperation('failed') — is identical
  // for any stage that throws.
  const { reporter, calls } = recordingReporter();
  await assert.rejects(
    executeExtractionRun({
      runId: "run-throw",
      source: { sourceResourceId: "source-1", sourceDocumentId: "document-1", declaredDomain: "educational technology", document },
      pipelineConfigHash: "test-v1",
      discovery: { discover: async () => { throw new Error("discovery transport down"); } },
      admission: { admit: async () => [] },
      evidenceProfileExtraction: { extract: async () => ({ definitions: [], mentions: [], assertions: [] }) },
      assertionEntailmentJudge: entailEverything,
      admissionLabelJudge: everythingIsAConcept,
      definitionPassageQualityJudge: keepAllDefinitions,
      store: { persist: async () => {}, runsForBuildByIds: async () => [] },
      reporter
    })
  );

  assert.deepEqual(calls[0], { method: "beginOperation", operationType: "extraction", operationId: "run-throw" });
  assert.ok(calls.some((c) => c.method === "completeStage" && (c as { stage: string; ok: boolean }).stage === STAGE_TAGS.conceptDiscovery && (c as { ok: boolean }).ok === false));
  assert.deepEqual(calls.at(-1), { method: "completeOperation", status: "failed" });
  assert.ok(!calls.some((c) => c.method === "completeOperation" && (c as { status: string }).status === "succeeded"));
});

test("the no-op default leaves the run result unchanged by reporter presence", async () => {
  // Behavior is byte-identical whether or not a reporter is injected (default-safe).
  const withoutReporter = await harness(async (input) => definitionFor[input.subject.candidateKey]).run();
  const { reporter } = recordingReporter();
  const withReporter = await harness(async (input) => definitionFor[input.subject.candidateKey], candidates, admission, { reporter }).run();

  assert.equal(withoutReporter.status, withReporter.status);
  assert.equal(withoutReporter.degraded, withReporter.degraded);
  assert.deepEqual(
    withoutReporter.evidenceProfiles.map((p) => ({ key: p.candidateKey, complete: p.complete, defs: p.definitions.length })),
    withReporter.evidenceProfiles.map((p) => ({ key: p.candidateKey, complete: p.complete, defs: p.definitions.length }))
  );
});

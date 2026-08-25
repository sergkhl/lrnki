import assert from "node:assert/strict";
import test from "node:test";
import type { ExtractionRunResult, RunCandidate } from "@lrnki/domain-core";
import { detectExtractionQualityIssues } from "./detectExtractionQualityIssues";

test("flags a core-poor run while retaining the standing neutral-prompt note", () => {
  const issues = detectExtractionQualityIssues(run({ candidates: [candidate({ tier: "optional" })], evidenceProfiles: [] }));

  assert.ok(issues.some((issue) => issue.issueType === "generic_domain_neutral_prompt" && issue.severity === "info"));
  assert.ok(issues.some((issue) => issue.issueType === "possible_missing_core_concept" && issue.severity === "warning"));
});

test("flags demoted ungroundable cores at warning severity", () => {
  const issues = detectExtractionQualityIssues(run({
    candidates: [candidate({ candidateKey: "alpha", label: "Alpha", tier: "optional", modelTier: "core", boundaryReasonCodes: ["core_demoted_ungroundable"] })],
    evidenceProfiles: [{ candidateKey: "alpha", tier: "core", definitions: [], mentions: [], assertions: [], complete: false }]
  }));

  const issue = issues.find((item) => item.issueType === "core_demoted_ungroundable");
  assert.equal(issue?.candidateKey, "alpha");
  assert.equal(issue?.conceptLabel, "Alpha");
  assert.equal(issue?.severity, "warning");
  assert.deepEqual(issue?.evidenceQuotes, ["Alpha is a taught concept.", "Alpha has a second aspect."]);
});

test("flags degraded demotion as critical without also emitting missing-core", () => {
  const issues = detectExtractionQualityIssues(run({
    degraded: true,
    candidates: [candidate({ candidateKey: "alpha", label: "Alpha", tier: "optional", modelTier: "core", boundaryReasonCodes: ["core_demoted_ungroundable"] })],
    evidenceProfiles: [{ candidateKey: "alpha", tier: "optional", definitions: [], mentions: [], assertions: [], complete: false }]
  }));

  assert.ok(issues.some((issue) => issue.issueType === "core_demoted_ungroundable" && issue.severity === "critical"));
  assert.ok(!issues.some((issue) => issue.issueType === "possible_missing_core_concept"));
});

test("distinguishes genuinely core-poor runs from demoted runs", () => {
  const issues = detectExtractionQualityIssues(run({ candidates: [candidate({ tier: "optional" })], evidenceProfiles: [] }));

  assert.ok(issues.some((issue) => issue.issueType === "possible_missing_core_concept"));
  assert.ok(!issues.some((issue) => issue.issueType === "core_demoted_ungroundable"));
});

test("flags proposition-label demotions and out-of-domain illustration rejects", () => {
  const issues = detectExtractionQualityIssues(run({
    candidates: [
      candidate({ candidateKey: "claim", label: "Alpha limited by Beta", tier: "optional", boundaryReasonCodes: ["proposition_label_judged"] }),
      candidate({ candidateKey: "foreign", label: "Foreign Example", tier: "reject", sourceRole: "out_of_domain_illustration" })
    ],
    evidenceProfiles: []
  }));

  assert.ok(issues.some((issue) => issue.issueType === "possible_proposition_label" && issue.candidateKey === "claim"));
  assert.ok(issues.some((issue) => issue.issueType === "possible_out_of_domain_illustration" && issue.candidateKey === "foreign" && issue.severity === "info"));
});

test("flags source-artifact labels separately from proposition labels", () => {
  const issues = detectExtractionQualityIssues(run({
    candidates: [
      candidate({
        candidateKey: "carrier",
        label: "Procedure Handbook",
        tier: "optional",
        boundaryReasonCodes: ["source_artifact_label_judged"]
      })
    ],
    evidenceProfiles: []
  }));

  const issue = issues.find((candidateIssue) => candidateIssue.issueType === "source_artifact_label");
  assert.equal(issue?.candidateKey, "carrier");
  assert.equal(issue?.stage, "admission_label_judge");
  assert.equal(issue?.severity, "warning");
  assert.ok(!issues.some((candidateIssue) => candidateIssue.issueType === "possible_proposition_label"));
});

test("flags a demoted hollow-definition core distinctly from the ungroundable issue", () => {
  const issues = detectExtractionQualityIssues(run({
    candidates: [candidate({ candidateKey: "alpha", label: "Alpha", tier: "optional", modelTier: "core", boundaryReasonCodes: ["core_demoted_hollow_definition"] })],
    evidenceProfiles: [{ candidateKey: "alpha", tier: "optional", definitions: [], mentions: [], assertions: [], complete: false }]
  }));

  const hollow = issues.filter((item) => item.issueType === "core_demoted_hollow_definition");
  assert.equal(hollow.length, 1);
  assert.equal(hollow[0].candidateKey, "alpha");
  assert.equal(hollow[0].severity, "warning");
  // It is NOT also reported as the generic ungroundable issue, nor as core-poor.
  assert.ok(!issues.some((item) => item.issueType === "core_demoted_ungroundable"));
  assert.ok(!issues.some((item) => item.issueType === "possible_missing_core_concept"));
});

test("a degraded hollow demotion is critical severity", () => {
  const issues = detectExtractionQualityIssues(run({
    degraded: true,
    candidates: [candidate({ candidateKey: "alpha", label: "Alpha", tier: "optional", modelTier: "core", boundaryReasonCodes: ["core_demoted_hollow_definition"] })],
    evidenceProfiles: [{ candidateKey: "alpha", tier: "optional", definitions: [], mentions: [], assertions: [], complete: false }]
  }));

  assert.ok(issues.some((item) => item.issueType === "core_demoted_hollow_definition" && item.severity === "critical"));
});

function run(overrides: Partial<ExtractionRunResult> = {}): ExtractionRunResult {
  return {
    runId: "run-1",
    sourceResourceId: "source-1",
    sourceDocumentId: "document-1",
    declaredDomain: "test domain",
    pipelineConfigHash: "test",
    maxMentionsPerConceptPerSource: 6,
    candidates: [],
    evidenceProfiles: [],
    definitionQualityDispositions: [],
    qualityIssues: [],
    status: "succeeded",
    degraded: false,
    ...overrides
  };
}

function candidate(input: {
  candidateKey?: string;
  label?: string;
  tier?: RunCandidate["admission"]["tier"];
  modelTier?: RunCandidate["admission"]["modelTier"];
  sourceRole?: RunCandidate["admission"]["sourceRole"];
  boundaryReasonCodes?: string[];
} = {}): RunCandidate {
  const label = input.label ?? "Alpha";
  const tier = input.tier ?? "core";
  return {
    candidateKey: input.candidateKey ?? "alpha",
    parentCandidateKey: input.candidateKey ?? "alpha",
    discoveredLabel: label,
    canonicalLabel: label,
    normalizedLabel: label.toLowerCase(),
    aliases: [],
    mentions: [{ blockId: "block-1", evidenceQuote: `${label} is a taught concept.` }],
    admission: {
      modelTier: input.modelTier ?? tier,
      tier,
      sourceRole: input.sourceRole ?? "declared_domain_concept",
      proposedCanonicalLabel: label,
      standaloneLearningObjective: {
        modelPassed: true,
        passed: true,
        rationale: "standalone",
        submittedEvidence: [{ blockId: "block-1", evidenceQuote: `${label} is a taught concept.` }],
        evidence: [{ blockId: "block-1", evidenceQuote: `${label} is a taught concept.` }]
      },
      establishedDomainMeaning: {
        modelPassed: true,
        passed: true,
        rationale: "meaning",
        submittedEvidence: [{ blockId: "block-1", evidenceQuote: `${label} is a taught concept.` }],
        evidence: [{ blockId: "block-1", evidenceQuote: `${label} is a taught concept.` }]
      },
      definitionBearingTreatment: {
        modelPassed: true,
        passed: true,
        rationale: "definition-bearing",
        submittedEvidence: [{ blockId: "block-1", evidenceQuote: `${label} is a taught concept.` }],
        evidence: [{ blockId: "block-1", evidenceQuote: `${label} is a taught concept.` }]
      },
      organizingPower: {
        modelPassed: true,
        passed: true,
        rationale: "organizes",
        submittedAspects: [],
        aspects: [
          {
            summary: "second aspect",
            nature: "mechanism",
            evidence: { blockId: "block-1", evidenceQuote: `${label} has a second aspect.` }
          }
        ]
      },
      coreSelected: tier === "core",
      selectionReasonCode: tier === "core" ? "source_level_core" : "supporting_mechanism",
      reasonCodes: [],
      boundaryReasonCodes: input.boundaryReasonCodes ?? [],
      confidence: 0.9
    }
  };
}

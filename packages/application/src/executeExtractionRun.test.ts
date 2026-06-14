import assert from "node:assert/strict";
import test from "node:test";
import type {
  AdmissionProposal,
  ClaimExtractionResult,
  DiscoveredCandidate,
  ExtractedClaim,
  ExtractionRunResult,
  StructuredDocument
} from "@lrnki/domain-core";
import type {
  AdmissionLabelJudgmentPort,
  ArtifactRepositoryPort,
  ClaimEntailmentJudgmentPort,
  ConceptConditionedClaimExtractionPort,
  ExtractionRunStorePort
} from "@lrnki/ports";
import { executeExtractionRun } from "./executeExtractionRun";

// Default judge entails everything so these tests exercise the deterministic +
// orchestration behavior; entailment downgrades are covered in
// applyEntailmentJudge.test.ts.
const entailEverything: ClaimEntailmentJudgmentPort = {
  model: "test-judge",
  judge: async () => ({ entailed: true, entailingSpan: "", rationale: "test" }),
  judgeDefinition: async () => ({ entailed: true, entailingSpan: "", rationale: "test" })
};

// Default admission judge calls every label a concept, so candidates stay core and
// these orchestration tests are unaffected; proposition demotion is covered in
// applyAdmissionLabelJudge.test.ts.
const everythingIsAConcept: AdmissionLabelJudgmentPort = {
  model: "test-admission-judge",
  judge: async () => ({ labelKind: "concept", underlyingNounPhrase: "", groundingSpan: "", rationale: "test" })
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

function admission(candidate: DiscoveredCandidate): AdmissionProposal {
  const quote = candidate.candidateKey === "framework" ? frameworkQuote : signalQuote;
  const blockId = candidate.candidateKey === "framework" ? "block-1" : "block-2";
  return {
    candidateKey: candidate.candidateKey,
    proposedCanonicalLabel: candidate.canonicalLabel,
    tier: "core",
    standaloneLearningObjective: { passed: true, rationale: "standalone", evidence: [{ blockId, evidenceQuote: quote }] },
    establishedDomainMeaning: { passed: true, rationale: "established", evidence: [{ blockId, evidenceQuote: quote }] },
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
    confidence: 0.9
  };
}

function usesClaim(): ExtractedClaim {
  return {
    subjectCandidateKey: "framework",
    predicate: "uses",
    object: { kind: "concept", candidateKey: "signals" },
    evidenceLinkNature: "mechanism-employment",
    evidenceDirection: "subject-uses-object",
    evidence: [{ blockId: "block-1", evidenceQuote: frameworkQuote }],
    confidence: 0.9
  };
}

function harness(
  extract: ConceptConditionedClaimExtractionPort["extract"],
  selectedCandidates = candidates,
  claimEntailmentJudge = entailEverything
) {
  let persisted: ExtractionRunResult | undefined;
  const store: ExtractionRunStorePort = {
    persist: async (result) => { persisted = result; },
    runsForBuildByIds: async () => []
  };
  const artifacts: ArtifactRepositoryPort = { append: async () => {} };
  return {
    run: () => executeExtractionRun({
      runId: "run-1",
      source: {
        sourceResourceId: "source-1",
        sourceDocumentId: "document-1",
        declaredDomain: "educational technology",
        document
      },
      pipelineConfigHash: "test-v1",
      discovery: { discover: async () => selectedCandidates },
      admission: { admit: async () => selectedCandidates.map(admission) },
      claimExtraction: { extract },
      claimEntailmentJudge,
      admissionLabelJudge: everythingIsAConcept,
      store,
      artifacts
    }),
    persisted: () => persisted
  };
}

test("retries once with aliases and rejected feedback, preserving both attempts without conflict contamination", async () => {
  const calls: Parameters<ConceptConditionedClaimExtractionPort["extract"]>[0][] = [];
  const extract: ConceptConditionedClaimExtractionPort["extract"] = async (input) => {
    calls.push(input);
    if (input.subject.candidateKey === "signals") return { claims: [], proposals: [] };
    if (!input.feedback) {
      return {
        claims: [
          { ...usesClaim(), predicate: "part-of", evidenceLinkNature: "structural", evidenceDirection: "subject-is-part-of-object" },
          usesClaim()
        ],
        proposals: []
      };
    }
    return { claims: [usesClaim()], proposals: [] };
  };

  const result = await harness(extract).run();
  const frameworkClaims = result.claims.filter((claim) => claim.subjectCandidateKey === "framework");
  assert.equal(frameworkClaims.length, 3);
  assert.equal(frameworkClaims.filter((claim) => claim.extractionAttempt === 1).length, 2);
  assert.equal(frameworkClaims.filter((claim) => claim.extractionAttempt === 1).every((claim) =>
    claim.validationOutcome === "rejected" && claim.boundaryReasonCodes.includes("superseded_by_retry")
  ), true);
  const retryClaim = frameworkClaims.find((claim) => claim.extractionAttempt === 2);
  assert.equal(retryClaim?.validationOutcome, "verified");
  const firstFrameworkCall = calls.find((call) => call.subject.candidateKey === "framework" && !call.feedback);
  assert.deepEqual(firstFrameworkCall?.subject.aliases, ["Instructor-Aligned Knowledge Graphs"]);
  const retryCall = calls.find((call) => call.subject.candidateKey === "framework" && call.feedback);
  assert.equal(retryCall?.feedback?.rejectedClaims.length, 2);
  assert.equal(calls.filter((call) => call.subject.candidateKey === "framework").length, 2);
});

test("does not retry a subject after a verified first-attempt claim", async () => {
  let calls = 0;
  const { run } = harness(async (input): Promise<ClaimExtractionResult> => {
    calls += 1;
    return input.subject.candidateKey === "framework" ? { claims: [usesClaim()], proposals: [] } : { claims: [], proposals: [] };
  });

  const result = await run();
  assert.equal(result.claims.find((claim) => claim.subjectCandidateKey === "framework")?.extractionAttempt, 1);
  assert.equal(calls, 3, "framework runs once; the claimless signals subject runs twice");
});

test("retries when a structurally valid first-attempt claim fails semantic entailment", async () => {
  const calls: Parameters<ConceptConditionedClaimExtractionPort["extract"]>[0][] = [];
  const extract: ConceptConditionedClaimExtractionPort["extract"] = async (input) => {
    calls.push(input);
    if (input.subject.candidateKey === "signals") return { claims: [], proposals: [] };
    return { claims: [usesClaim()], proposals: [] };
  };
  let frameworkJudgments = 0;
  const judge: ClaimEntailmentJudgmentPort = {
    model: "test-judge",
    judge: async () => {
      frameworkJudgments += 1;
      return frameworkJudgments === 1
        ? { entailed: false, entailingSpan: "", rationale: "first attempt unsupported" }
        : { entailed: true, entailingSpan: "leveraging temporal signals", rationale: "retry supported" };
    },
    judgeDefinition: async () => ({ entailed: true, entailingSpan: "", rationale: "test" })
  };

  const result = await harness(extract, candidates, judge).run();
  const frameworkClaims = result.claims.filter((claim) => claim.subjectCandidateKey === "framework");
  assert.equal(calls.filter((call) => call.subject.candidateKey === "framework").length, 2);
  const retryCall = calls.find((call) => call.subject.candidateKey === "framework" && call.feedback);
  assert.deepEqual(retryCall?.feedback?.rejectedClaims[0]?.boundaryReasonCodes, ["evidence_does_not_entail_relation"]);
  assert.equal(frameworkClaims.some((claim) =>
    claim.extractionAttempt === 1 &&
    claim.boundaryReasonCodes.includes("evidence_does_not_entail_relation") &&
    claim.boundaryReasonCodes.includes("superseded_by_retry")
  ), true);
  assert.equal(frameworkClaims.some((claim) =>
    claim.extractionAttempt === 2 && claim.validationOutcome === "verified"
  ), true);
});

test("fails closed after exactly one retry when the model errors", async () => {
  let calls = 0;
  const { run, persisted } = harness(async () => {
    calls += 1;
    throw new Error("model unavailable");
  }, [candidates[0]]);

  const result = await run();
  assert.equal(calls, 2);
  assert.deepEqual(result.claims, []);
  assert.equal(persisted()?.runId, "run-1");
});

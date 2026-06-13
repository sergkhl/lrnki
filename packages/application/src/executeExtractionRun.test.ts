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
  ArtifactRepositoryPort,
  ConceptConditionedClaimExtractionPort,
  ExtractionRunStorePort
} from "@lrnki/ports";
import { executeExtractionRun } from "./executeExtractionRun";

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
    aliases: ["INSTRUCTKG"],
    mentions: [{ blockId: "block-1", evidenceQuote: "INSTRUCTKG" }]
  },
  {
    candidateKey: "signals",
    canonicalLabel: "Temporal Signals",
    aliases: ["temporal signals"],
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

function harness(extract: ConceptConditionedClaimExtractionPort["extract"], selectedCandidates = candidates) {
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
  assert.deepEqual(firstFrameworkCall?.subject.aliases, ["Instructor-Aligned Knowledge Graphs", "INSTRUCTKG"]);
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

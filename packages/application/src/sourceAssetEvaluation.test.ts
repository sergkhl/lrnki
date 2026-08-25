import assert from "node:assert/strict";
import test from "node:test";
import type {
  ConceptLesson,
  OptionSelectItem,
  StudyItemCandidateVerdict
} from "@lrnki/domain-core";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type {
  AnswerKeyVerificationPort,
  DerivedGraphDetail,
  OperationTimelineDetail,
  SourceMaterialClaimSupportVerificationPort
} from "@lrnki/ports";
import type { QualifiedSourceExpedition } from "./sourceExpedition";
import {
  evaluateQualifiedSourceExpedition,
  settleOptionSelectTruth
} from "./sourceAssetEvaluation";
import { projectSourceMaterialClaims } from "./sourceMaterialClaims";
import { answerKeyCandidates } from "./verifyStudyItemKeys";

const citation = {
  provenance: "source" as const,
  sourceResourceId: "resource-1",
  sourceBlockId: "block-1",
  evidenceQuote: "A permit is effective through 12:00 only when the signed exception is present.",
  matchKind: "exact" as const
};

function qualifiedFixture(): QualifiedSourceExpedition {
  const lesson: ConceptLesson = {
    conceptLessonId: "lesson-1",
    derivedNodeId: "node-1",
    graphVersionId: "graph-1",
    enrichmentId: "enrichment-1",
    generatingModel: "generator-test",
    configHash: "qualified:test",
    canonicalLabel: "Conditional permit",
    sections: [{
      kind: "definition",
      text: "The permit lasts through 12:00 only when the signed exception is present.",
      groundingProvenance: "source_cep",
      citation
    }],
    explorableTerms: []
  };
  const item: OptionSelectItem = {
    studyItemId: "item-1",
    graphVersionId: "graph-1",
    enrichmentId: "enrichment-1",
    derivedNodeId: "node-1",
    groundingProvenance: "source_cep",
    generatingModel: "generator-test",
    configHash: "qualified:test",
    explorableTerms: [],
    itemType: "option_select",
    question: "When is the permit effective through 12:00?",
    explanation: "The signed exception is a required condition.",
    options: [
      { optionId: "z-wrong", text: "Whenever it is unsigned", isCorrect: false, provenance: "generated" },
      { optionId: "a-key", text: "When the signed exception is present", isCorrect: true, provenance: "source", citation },
      { optionId: "y-wrong", text: "Only after 12:00", isCorrect: false, provenance: "generated" },
      { optionId: "x-wrong", text: "Under every condition", isCorrect: false, provenance: "generated" }
    ]
  };
  const detail: DerivedGraphDetail = {
    summary: {
      enrichmentId: "enrichment-1",
      graphVersionId: "graph-1",
      enrichmentConfigHash: "enrichment-config-test",
      judgeModel: "prerequisite-test",
      difficultyMethod: "test",
      status: "succeeded",
      edgeCount: 0,
      certainEdgeCount: 0,
      uncertainEdgeCount: 0,
      conceptCount: 1,
      studyItemCount: 1,
      startedAt: "2026-08-25T00:00:00.000Z",
      completedAt: "2026-08-25T00:01:00.000Z"
    },
    nodes: [{
      derivedNodeId: "node-1",
      label: "Conditional permit",
      aliases: ["Time-limited permit"],
      declaredDomain: "policy interpretation",
      difficulty: 2,
      difficultyRationale: null,
      difficultyBand: 2,
      difficultyContested: false,
      nodeKind: "anchor",
      groundingOrigin: "document_anchored",
      role: "anchor",
      hasStudyItem: true,
      grounding: null
    }],
    edges: [],
    originCounts: [],
    rescueDispositions: [],
    mintingDispositions: [],
    merges: []
  };
  return {
    status: "available",
    candidate: {
      enrichmentId: "enrichment-1",
      title: "Conditional permit",
      declaredDomain: "policy interpretation",
      totalStopCount: 1,
      searchTerms: ["Conditional permit", "Time-limited permit"]
    },
    assets: {
      detail,
      lessons: [lesson],
      lessonAbsent: [],
      studyItems: [item],
      trailNodeIds: new Set(["node-1"]),
      expectedAssets: {
        assetSetIdentity: "source-expedition-assets-test",
        currentConceptLessonIds: ["lesson-1"],
        currentStudyItemIds: ["item-1"]
      }
    }
  };
}

const sourceEvidenceRead = {
  async readSourceEvidence() {
    return [{
      sourceResourceId: "resource-1",
      sourceTitle: "Generated permit policy",
      sourceBlockId: "block-1",
      blockType: "paragraph",
      headingPath: ["Permit validity"],
      text: "A permit is effective through 12:00 only when the signed exception is present. An unsigned permit expires earlier."
    }];
  }
};

test("no-activation report joins payload, evidence, decisions, identity, and positive controls with zero calls", async () => {
  const report = await evaluateQualifiedSourceExpedition({
    qualification: qualifiedFixture(),
    sourceEvidenceRead,
    generatedAt: "2026-08-25T12:00:00.000Z"
  });

  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(report.activation, {
    sourceSupportVerifierModel: null,
    answerKeyVerifierModel: null
  });
  assert.deepEqual(report.evaluationCalls, { sourceSupport: 0, answerKey: 0, total: 0 });
  assert.equal(report.qualification.assetSetIdentity, "source-expedition-assets-test");
  assert.equal(report.candidatePayloads.lessons.length, 1);
  assert.equal(report.candidatePayloads.optionSelectItems.length, 1);
  assert.equal(report.evidence.length, 1);
  assert.equal(report.evidence[0]?.resolved, true);
  assert.match(report.evidence[0]?.blockText ?? "", /signed exception/);
  assert.ok(report.positiveControls.projectedClaimRows > 0);
  assert.ok(report.positiveControls.sourceSupportClaimRows > 0);
  assert.equal(report.positiveControls.distractorClaimRows, 3);
  assert.equal(report.positiveControls.resolvedEvidenceRows, 1);
  assert.ok(report.decisions.sourceSupport.every((decision) =>
    decision.disposition === "not_evaluated" &&
    decision.reasonCode === "source_support_verifier_not_activated"
  ));
  assert.ok(report.decisions.distractorInvalidity.every((decision) =>
    decision.disposition === "not_evaluated" &&
    decision.reasonCode === "answer_key_verifier_not_activated"
  ));
  assert.deepEqual(
    report.decisions.keyUniqueness.map((decision) => [decision.disposition, decision.reasonCode]),
    [["not_evaluated", "answer_key_verifier_not_activated"]]
  );
  assert.deepEqual(report.operationEvidence, {
    costTiming: null,
    calls: null,
    tokens: null,
    costUsd: null,
    costEstimated: false
  });
});

test("report rolls operation timelines, calls, tokens, and cost into the candidate evidence", async () => {
  const timelineDetail = (
    operationType: "enrichment" | "study_items",
    stage: string
  ): OperationTimelineDetail => ({
    summary: {
      operationRunId: `${operationType}-run`,
      operationType,
      operationId: "enrichment-1",
      status: "succeeded",
      currentStage: null,
      progressDone: null,
      progressTotal: null,
      lastProgressAt: null,
      startedAt: "2026-08-25T00:00:00.000Z",
      completedAt: "2026-08-25T00:00:01.000Z",
      elapsedMs: 1000,
      stageCount: 1,
      configHash: null
    },
    stages: [{
      stage,
      startedAt: "2026-08-25T00:00:00.000Z",
      endedAt: "2026-08-25T00:00:01.000Z",
      durationMs: 1000,
      ok: true,
      progressDone: null,
      progressTotal: null,
      errorDetail: null
    }]
  });
  const details = [
    timelineDetail("enrichment", STAGE_TAGS.prerequisiteOrdering),
    timelineDetail("study_items", STAGE_TAGS.conceptLessonGeneration)
  ];
  const report = await evaluateQualifiedSourceExpedition({
    qualification: qualifiedFixture(),
    sourceEvidenceRead,
    operationEvidence: {
      timelineRead: {
        async listOperationTimelines() { return details.map((detail) => detail.summary); },
        async getOperationTimeline(operationId, operationType) {
          return details.find((detail) =>
            detail.summary.operationId === operationId && detail.summary.operationType === operationType
          );
        }
      },
      journeyLineageRead: {
        async resolveJourney() {
          return {
            enrichmentId: "enrichment-1",
            graphVersionId: null,
            canonicalizationOperationId: null,
            extractionRunIds: []
          };
        },
        async resolveJourneyDisplay() { return []; }
      },
      operationStageSpendRead: {
        async readOperationStageSpend() {
          return [
            {
              operationId: "enrichment-1",
              stage: STAGE_TAGS.prerequisiteOrdering,
              logCount: 1,
              totalSpend: 0.01,
              estimatedSpend: 0,
              totalTokens: 100
            },
            {
              operationId: "enrichment-1",
              stage: STAGE_TAGS.conceptLessonGeneration,
              logCount: 2,
              totalSpend: 0.02,
              estimatedSpend: 0,
              totalTokens: 200
            }
          ];
        }
      }
    },
    generatedAt: "2026-08-25T12:00:00.000Z"
  });

  assert.equal(report.operationEvidence.costTiming?.operations.length, 2);
  assert.deepEqual({
    calls: report.operationEvidence.calls,
    tokens: report.operationEvidence.tokens,
    costUsd: report.operationEvidence.costUsd,
    costEstimated: report.operationEvidence.costEstimated
  }, { calls: 3, tokens: 300, costUsd: 0.03, costEstimated: false });
  assert.deepEqual(report.evaluationCalls, { sourceSupport: 0, answerKey: 0, total: 0 });
});

test("activated evaluators keep source support independent and hide the server key from answer-key input", async () => {
  const answerRequests: Parameters<AnswerKeyVerificationPort["verify"]>[0][] = [];
  const answerKeyVerifier: AnswerKeyVerificationPort = {
    model: "answer-key-test",
    async verify(request) {
      answerRequests.push(request);
      return request.candidates.map((candidate): StudyItemCandidateVerdict => ({
        ordinal: candidate.ordinal,
        verdict: candidate.text === "When the signed exception is present" ? "claim_true" : "claim_false",
        reason: "test truth classification"
      }));
    }
  };
  const sourceSupportVerifier: SourceMaterialClaimSupportVerificationPort = {
    model: "source-support-test",
    async verify(request) {
      return request.claim.statement.includes("explanation:")
        ? { disposition: "unsupported", reason: "The explanation adds an unsupported claim." }
        : { disposition: "supported", reason: "The source block supports the exact claim." };
    }
  };

  const report = await evaluateQualifiedSourceExpedition({
    qualification: qualifiedFixture(),
    sourceEvidenceRead,
    sourceSupportVerifier,
    answerKeyVerifier,
    generatedAt: "2026-08-25T12:00:00.000Z"
  });

  assert.equal(answerRequests.length, 1, "all option truth is classified in one cross-family call");
  assert.deepEqual(answerRequests[0]?.candidates.map((candidate) => candidate.text), [
    "Only after 12:00",
    "Under every condition",
    "When the signed exception is present",
    "Whenever it is unsigned"
  ]);
  const serializedRequest = JSON.stringify(answerRequests[0]);
  assert.doesNotMatch(serializedRequest, /isCorrect|optionId|derivedNodeId|a-key|z-wrong/);
  assert.equal(report.decisions.sourceSupport.filter((decision) => decision.disposition === "rejected").length, 1);
  assert.ok(report.decisions.distractorInvalidity.every((decision) => decision.disposition === "accepted"));
  assert.deepEqual(
    report.decisions.keyUniqueness.map((decision) => [decision.disposition, decision.reasonCode]),
    [["accepted", "unique_key_verified"]]
  );
  assert.deepEqual(report.evaluationCalls, {
    sourceSupport: report.positiveControls.sourceSupportClaimRows,
    answerKey: 1,
    total: report.positiveControls.sourceSupportClaimRows + 1
  });
});

test("distractor invalidity and key uniqueness retain distinct rejection and abstention reasons", () => {
  const qualification = qualifiedFixture();
  const item = qualification.assets.studyItems[0]!;
  const projection = projectSourceMaterialClaims({
    lessons: qualification.assets.lessons,
    optionSelectItems: qualification.assets.studyItems
  });
  const distractorClaims = projection.claims.filter((claim) => claim.purpose === "distractor_invalidity");
  const candidates = answerKeyCandidates(item.options);
  const ordinal = (text: string) => candidates.find((candidate) => candidate.text === text)!.ordinal;

  const multipleTrue = settleOptionSelectTruth({
    item,
    distractorClaims,
    candidates,
    verdicts: candidates.map((candidate) => ({
      ordinal: candidate.ordinal,
      verdict: candidate.text === "Only after 12:00" || candidate.text === "When the signed exception is present"
        ? "claim_true"
        : "claim_false",
      reason: "test"
    }))
  });
  assert.equal(multipleTrue.keyUniqueness.reasonCode, "multiple_true_answers");
  assert.equal(
    multipleTrue.distractorInvalidity.find((decision) => decision.proposedAnswer === "Only after 12:00")?.reasonCode,
    "distractor_valid_for_question"
  );

  const unclear = settleOptionSelectTruth({
    item,
    distractorClaims,
    candidates,
    verdicts: [
      { ordinal: ordinal("When the signed exception is present"), verdict: "claim_true", reason: "key supported" },
      { ordinal: ordinal("Only after 12:00"), verdict: "claim_false", reason: "false" },
      { ordinal: ordinal("Under every condition"), verdict: "unclear", reason: "insufficient context" },
      { ordinal: ordinal("Whenever it is unsigned"), verdict: "claim_false", reason: "false" }
    ]
  });
  assert.equal(unclear.keyUniqueness.reasonCode, "answer_key_truth_unclear");
  assert.equal(
    unclear.distractorInvalidity.find((decision) => decision.proposedAnswer === "Under every condition")?.reasonCode,
    "distractor_truth_unclear"
  );
});

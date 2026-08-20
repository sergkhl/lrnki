import assert from "node:assert/strict";
import test from "node:test";
import { neutralResponses, scaffoldDetourHasPublishedContent, scaffoldStepHasContent, type GeneratedGroundingBundle, type ResponseLogRow, type ScaffoldDetour, type ScaffoldStep } from "./index";

function groundingBundle(): GeneratedGroundingBundle {
  return { groundingOrigin: "llm_grounded", definitions: [], mentions: [], groundingAnchorReferences: [], generatingModel: "test", rationale: "test fixture" };
}

// U2 (KTD4): neutralResponses narrows a mixed log to the neutral observations only, so a
// scaffold response can never leak into a neutral fold.
test("neutralResponses keeps neutral rows and drops scaffold rows", () => {
  const rows: ResponseLogRow[] = [
    { scope: "neutral", studyItemId: "si-1", derivedNodeId: "n-1", responseId: "r1", learnerStateRef: "L", signalType: "graded", judgedOutcome: "correct", gradedScore: 1, responseSource: "human", graderIdentity: "auto", batchId: null, submittedAnswer: null, attemptSeq: 1 },
    { scope: "scaffold", scaffoldStepId: "step-1", responseId: "r2", learnerStateRef: "L", signalType: "graded", judgedOutcome: "correct", gradedScore: 1, responseSource: "human", graderIdentity: "auto", batchId: null, submittedAnswer: null, attemptSeq: 2 }
  ];
  const neutral = neutralResponses(rows);
  assert.equal(neutral.length, 1);
  assert.equal(neutral[0].scope, "neutral");
  assert.equal(neutral[0].derivedNodeId, "n-1");
});

test("a reference step reports content; a generated step reports content only with options", () => {
  const reference: ScaffoldStep = { scaffoldStepId: "s1", ordinal: 0, kind: "reference", referencedDerivedNodeId: "n-9", referencedConceptLessonId: "l-9", referencedStudyItemId: "i-9" };
  assert.equal(scaffoldStepHasContent(reference), true);
  const generated: ScaffoldStep = {
    scaffoldStepId: "s2",
    ordinal: 1,
    kind: "generated",
    lessonReadAt: null,
    groundingBundle: groundingBundle(),
    payload: {
      scaffoldNodeId: "sn-1",
      label: "Affine types",
      lesson: [{ kind: "definition", text: "A definition.", groundingProvenance: "generated" }],
      item: { scaffoldItemId: "it-1", question: "Q?", explanation: "because", options: [{ optionId: "o1", text: "a", isCorrect: true }] }
    }
  };
  assert.equal(scaffoldStepHasContent(generated), true);
});

test("scaffoldDetourHasPublishedContent is true only when the detour carries steps", () => {
  const base: ScaffoldDetour = {
    detourId: "d1", learnerStateRef: "L", enrichmentId: "e", parentDerivedNodeId: "p", term: "x", normalizedTerm: "x",
    status: "ready", latestOperationId: null, claimToken: null, steps: []
  };
  assert.equal(scaffoldDetourHasPublishedContent(base), false);
  assert.equal(scaffoldDetourHasPublishedContent({ ...base, steps: [{ scaffoldStepId: "s", ordinal: 0, kind: "reference", referencedDerivedNodeId: "n", referencedConceptLessonId: "l", referencedStudyItemId: "i" }] }), true);
});

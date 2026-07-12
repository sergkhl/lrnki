import assert from "node:assert/strict";
import test from "node:test";
import type { ResponseLogRow, ScaffoldDetour, ScaffoldStep } from "@lrnki/domain-core";
import { composeScaffoldDetours, type ReferencedNodeCompletion } from "./studySessionTrail";

let seq = 0;
function scaffoldResponse(scaffoldStepId: string, outcome: "correct" | "incorrect"): ResponseLogRow {
  return { scope: "scaffold", scaffoldStepId, responseId: `r${++seq}`, learnerStateRef: "L", signalType: "graded", judgedOutcome: outcome, gradedScore: outcome === "correct" ? 1 : 0, responseSource: "human", graderIdentity: "auto", batchId: null, submittedAnswer: null, attemptSeq: seq };
}

function generatedStep(id: string, ordinal: number, lessonReadAt: string | null): ScaffoldStep {
  return { scaffoldStepId: id, ordinal, kind: "generated", lessonReadAt, payload: { scaffoldNodeId: `sn-${id}`, label: `Concept ${id}`, lesson: [{ kind: "definition", text: "d", groundingProvenance: "generated" }], item: { scaffoldItemId: `it-${id}`, question: "q", explanation: "e", options: [{ optionId: "o1", text: "a", isCorrect: true }] } } };
}

function detour(overrides: Partial<ScaffoldDetour> & { steps: ScaffoldStep[] }): ScaffoldDetour {
  return { detourId: "d-1", learnerStateRef: "L", enrichmentId: "e", parentDerivedNodeId: "parent", term: "borrow checker", normalizedTerm: "borrow checker", status: "ready", latestOperationId: null, claimToken: null, ...overrides };
}

const noNeutral = (): ReferencedNodeCompletion => ({ lessonRead: false, optionSelectCorrect: false });

test("a generating detour projects the generating group and a broad phase, no child completion", () => {
  const [view] = composeScaffoldDetours({
    detours: [detour({ status: "generating", steps: [] })],
    responses: [],
    masteredParentNodeIds: new Set(),
    referencedNodeCompletion: noNeutral,
    generatingPhase: () => "building"
  });
  assert.equal(view.group, "generating");
  assert.equal(view.phase, "building");
  assert.equal(view.complete, false);
});

test("a failed detour projects the failed group", () => {
  const [view] = composeScaffoldDetours({ detours: [detour({ status: "failed", steps: [] })], responses: [], masteredParentNodeIds: new Set(), referencedNodeCompletion: noNeutral });
  assert.equal(view.group, "failed");
});

test("a generated step completes only when its lesson is read AND its latest response is correct", () => {
  const step = generatedStep("s1", 0, "2026-01-01T00:00:00Z");
  const [view] = composeScaffoldDetours({
    detours: [detour({ steps: [step] })],
    responses: [scaffoldResponse("s1", "correct")],
    masteredParentNodeIds: new Set(),
    referencedNodeCompletion: noNeutral
  });
  assert.equal(view.steps[0].complete, true);
  assert.equal(view.complete, true);
});

test("latest incorrect after correct reopens the generated step (neutral latest-outcome rule)", () => {
  const step = generatedStep("s1", 0, "2026-01-01T00:00:00Z");
  const [view] = composeScaffoldDetours({
    detours: [detour({ steps: [step] })],
    responses: [scaffoldResponse("s1", "correct"), scaffoldResponse("s1", "incorrect")],
    masteredParentNodeIds: new Set(),
    referencedNodeCompletion: noNeutral
  });
  assert.equal(view.steps[0].complete, false);
});

test("a reference step's completion is the neutral lesson-read + option-select subset", () => {
  const step: ScaffoldStep = { scaffoldStepId: "ref-1", ordinal: 0, kind: "reference", referencedDerivedNodeId: "n-9" };
  const complete = composeScaffoldDetours({
    detours: [detour({ steps: [step] })],
    responses: [],
    masteredParentNodeIds: new Set(),
    referencedNodeCompletion: (id) => (id === "n-9" ? { lessonRead: true, optionSelectCorrect: true } : noNeutral())
  })[0];
  assert.equal(complete.steps[0].complete, true);
  const incomplete = composeScaffoldDetours({
    detours: [detour({ steps: [step] })],
    responses: [],
    masteredParentNodeIds: new Set(),
    referencedNodeCompletion: () => ({ lessonRead: true, optionSelectCorrect: false })
  })[0];
  assert.equal(incomplete.steps[0].complete, false);
});

// R20: the collapsed grouping under a mastered parent.
test("R20: a completed detour under a mastered parent is support_explored; a not-yet-complete one is support_available", () => {
  const done = generatedStep("s1", 0, "2026-01-01T00:00:00Z");
  const explored = composeScaffoldDetours({
    detours: [detour({ steps: [done] })],
    responses: [scaffoldResponse("s1", "correct")],
    masteredParentNodeIds: new Set(["parent"]),
    referencedNodeCompletion: noNeutral
  })[0];
  assert.equal(explored.group, "support_explored");

  const partial = composeScaffoldDetours({
    detours: [detour({ steps: [generatedStep("s2", 0, null)] })],
    responses: [],
    masteredParentNodeIds: new Set(["parent"]),
    referencedNodeCompletion: noNeutral
  })[0];
  assert.equal(partial.group, "support_available");
});

test("a ready detour under a NON-mastered parent stays active (expandable on the live trail)", () => {
  const [view] = composeScaffoldDetours({
    detours: [detour({ steps: [generatedStep("s1", 0, null)] })],
    responses: [],
    masteredParentNodeIds: new Set(),
    referencedNodeCompletion: noNeutral
  });
  assert.equal(view.group, "active");
});

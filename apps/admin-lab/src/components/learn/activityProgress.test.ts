import assert from "node:assert/strict";
import test from "node:test";
import type { StudySession } from "@lrnki/application";
import { resolveStopActivity } from "./activityProgress";

test("resolveStopActivity maps a theory stop to the node lesson", () => {
  const activity = resolveStopActivity(session(), "n1:theory:main");
  assert.equal(activity.kind, "theory");
  assert.equal(activity.kind === "theory" ? activity.lesson?.canonicalLabel : null, "Ownership");
});

test("resolveStopActivity maps question and impostor stops to exactly one study item", () => {
  const question = resolveStopActivity(session(), "n1:option_select:i1");
  const impostor = resolveStopActivity(session(), "n1:impostor:i2");
  assert.equal(question.kind, "option_select");
  assert.equal(question.kind === "option_select" ? question.item.studyItemId : null, "i1");
  assert.equal(impostor.kind, "impostor");
  assert.equal(impostor.kind === "impostor" ? impostor.item.studyItemId : null, "i2");
});

test("resolveStopActivity maps capstone stops to gem state", () => {
  const activity = resolveStopActivity(session({ mastered: true }), "n1:capstone:main");
  assert.deepEqual(activity, { kind: "capstone", derivedNodeId: "n1", label: "Ownership", mastered: true });
});

function session(opts: { mastered?: boolean } = {}): StudySession {
  return {
    enrichmentId: "e1",
    learnerStateRef: "learner",
    target: { derivedNodeId: "n1", label: "Ownership" },
    studyItemCount: 2,
    detail: {
      summary: {
        enrichmentId: "e1",
        graphVersionId: null,
        enrichmentConfigHash: "test",
        judgeModel: "test",
        difficultyMethod: "test",
        status: "succeeded",
        edgeCount: 0,
        certainEdgeCount: 0,
        uncertainEdgeCount: 0,
        conceptCount: 1,
        studyItemCount: 2,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z"
      },
      nodes: [{
        derivedNodeId: "n1",
        label: "Ownership",
        aliases: [],
        declaredDomain: "software engineering",
        difficulty: null,
        difficultyRationale: null,
        nodeKind: "enrichment",
        groundingOrigin: "llm_grounded",
        role: "prerequisite",
        hasStudyItem: true,
        grounding: null
      }],
      edges: [],
      originCounts: [],
      rescueDispositions: [],
      mintingDispositions: [],
      merges: []
    },
    classification: { stateByNode: { n1: opts.mastered ? "mastered" : "frontier" }, selectedFrontierTarget: opts.mastered ? null : "n1" },
    adaptedHiddenNodeIds: [],
    responseSourceSummary: { human: 0, synthetic: 0, total: 0 },
    isFoundationalRoot: true,
    statefulPath: [{ position: 0, derivedNodeId: "n1", difficulty: 0, topologicalDepth: 0, state: opts.mastered ? "mastered" : "frontier", isTarget: true }],
    coexistence: [],
    restorations: [],
    sheetByNode: {},
    verdictByNode: {},
    latestOutcomeByStudyItemId: {},
    studySegmentsByNode: {
      n1: [
        { kind: "option_select", item: { studyItemId: "i1", derivedNodeId: "n1", question: "Q?", groundingProvenance: "generated", options: [] } },
        { kind: "impostor", item: { studyItemId: "i2", derivedNodeId: "n1", question: "Which is false?", groundingProvenance: "generated", statements: [], reveal: "Reveal", lieSource: "generated" } }
      ]
    },
    lessonByNode: { n1: { derivedNodeId: "n1", canonicalLabel: "Ownership", sections: [] } },
    lessonAbsent: []
  };
}

import assert from "node:assert/strict";
import { test } from "@jest/globals";
import type { StudySession } from "@lrnki/application/projection";
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

test("resolveStopActivity maps capstone stops to crystal state with full growth on mastery", () => {
  const activity = resolveStopActivity(session({ mastered: true }), "n1:capstone:main");
  assert.deepEqual(activity, { kind: "capstone", derivedNodeId: "n1", label: "Ownership", mastered: true, difficulty: 0, growthFraction: 1, isKnownSkipped: false });
});

test("resolveStopActivity carries partial crystal growth on an unmastered capstone", () => {
  const activity = resolveStopActivity(session(), "n1:capstone:main");
  assert.equal(activity.kind === "capstone" ? activity.mastered : null, false);
  assert.equal(activity.kind === "capstone" ? activity.growthFraction : null, 0);
});

test("resolveStopActivity marks a known-verdict capstone as skipped", () => {
  const activity = resolveStopActivity(session({ mastered: true, knownSkipped: true }), "n1:capstone:main");
  assert.equal(activity.kind === "capstone" ? activity.isKnownSkipped : null, true);
});

function session(opts: { mastered?: boolean; knownSkipped?: boolean } = {}): StudySession {
  return {
    enrichmentId: "e1",
    learnerStateRef: "learner",
    layerPurpose: null,
    target: { derivedNodeId: "n1", label: "Ownership" },
    studyItemCount: 2,
    flooredNodeIds: [],
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
    expeditionPath: [{ position: 0, derivedNodeId: "n1", difficulty: 0, topologicalDepth: 0, state: opts.mastered ? "mastered" : "frontier", isSummit: true, sectionIndex: 0, sectionPositionIndex: 0, milestoneDerivedNodeId: "n1", milestoneLabel: "Ownership", isMilestone: true }],
    sections: [{ sectionIndex: 0, milestoneDerivedNodeId: "n1", milestoneLabel: "Ownership", stepDerivedNodeIds: ["n1"], meanDifficulty: 0 }],
    coexistence: [],
    restorations: [],
    sheetByNode: {},
    verdictByNode: opts.knownSkipped ? { n1: "known" } : {},
    latestOutcomeByStudyItemId: {},
    studySegmentsByNode: {
      n1: [
        { kind: "option_select", item: { studyItemId: "i1", derivedNodeId: "n1", question: "Q?", explanation: "Grounded explanation.", groundingProvenance: "generated", options: [] } },
        { kind: "impostor", item: { studyItemId: "i2", derivedNodeId: "n1", question: "Which is false?", groundingProvenance: "generated", statements: [], reveal: "Reveal", lieSource: "generated" } }
      ]
    },
    lessonByNode: { n1: { derivedNodeId: "n1", canonicalLabel: "Ownership", sections: [] } },
    lessonReadByNode: {},
    lessonAbsent: []
  };
}

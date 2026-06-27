import assert from "node:assert/strict";
import { test } from "node:test";
import { composeCalibrationSession } from "./calibrationSession";
import type { DerivedGraphDetail } from "./derivedGraph";

function detail(): DerivedGraphDetail {
  const nodes = [
    { derivedNodeId: "A", label: "Alpha", aliases: [], declaredDomain: "d", difficulty: 0.1, difficultyRationale: null, nodeKind: "anchor" as const, groundingOrigin: "document_anchored" as const, role: "prerequisite" as const, hasStudyItem: true, grounding: { generatingModel: null, rationale: null, verbatimDisposition: "v", passages: [{ passageType: "definition" as const, text: "Alpha is the first prerequisite. Extra.", groundingOrigin: "document_anchored" as const }] } },
    { derivedNodeId: "B", label: "Beta", aliases: [], declaredDomain: "d", difficulty: 0.7, difficultyRationale: null, nodeKind: "anchor" as const, groundingOrigin: "document_anchored" as const, role: "prerequisite" as const, hasStudyItem: true, grounding: { generatingModel: null, rationale: null, verbatimDisposition: "v", passages: [{ passageType: "mention" as const, text: "Beta appears as a prerequisite.", groundingOrigin: "llm_grounded" as const }] } },
    { derivedNodeId: "Z", label: "Zed", aliases: [], declaredDomain: "d", difficulty: 0.9, difficultyRationale: null, nodeKind: "anchor" as const, groundingOrigin: "document_anchored" as const, role: "anchor" as const, hasStudyItem: true, grounding: null }
  ];
  return {
    summary: { enrichmentId: "e", graphVersionId: "g", enrichmentConfigHash: "cfg", judgeModel: "j", difficultyMethod: "m", status: "succeeded", edgeCount: 2, certainEdgeCount: 2, uncertainEdgeCount: 0, conceptCount: 3, studyItemCount: 3, startedAt: "t", completedAt: "t" },
    nodes,
    edges: [
      { prerequisiteDerivedNodeId: "A", dependentDerivedNodeId: "B", confidence: 0.9, uncertain: false, judgeModel: "j" },
      { prerequisiteDerivedNodeId: "B", dependentDerivedNodeId: "Z", confidence: 0.9, uncertain: false, judgeModel: "j" }
    ],
    originCounts: [],
    rescueDispositions: [],
    mintingDispositions: [],
    merges: []
  };
}

test("composeCalibrationSession projects the hardest-first list and hides implied-known ancestors", () => {
  const session = composeCalibrationSession({
    enrichmentId: "e",
    learnerStateRef: "L1",
    targetDerivedNodeId: "Z",
    detail: detail(),
    knownVerdictNodeIds: ["B"]
  });
  assert.ok(session);
  assert.equal(session.target.label, "Zed");
  assert.deepEqual(session.rows.map((row) => row.derivedNodeId), ["Z", "B"]);
  assert.equal(session.rows.find((row) => row.derivedNodeId === "B")?.known, true);
  assert.deepEqual(session.knownClosure, ["A", "B"]);
});

test("composeCalibrationSession returns undefined for an unknown target", () => {
  assert.equal(composeCalibrationSession({ enrichmentId: "e", learnerStateRef: "L1", targetDerivedNodeId: "missing", detail: detail(), knownVerdictNodeIds: [] }), undefined);
});

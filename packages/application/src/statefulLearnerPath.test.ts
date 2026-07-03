import assert from "node:assert/strict";
import test from "node:test";
import type { DerivedGraphDetail } from "@lrnki/ports";
import { projectStatefulLearnerPath } from "./statefulLearnerPath";

const difficultyByNode: Record<string, number> = { scope: 0.2, borrow: 0.3, ownership: 0.5, move: 0.8, shaky: 0.1 };

function node(id: string): DerivedGraphDetail["nodes"][number] {
  return {
    derivedNodeId: id,
    label: id,
    aliases: [],
    declaredDomain: "rust",
    difficulty: difficultyByNode[id] ?? 0,
    difficultyRationale: null,
    nodeKind: "anchor",
    groundingOrigin: "document_anchored",
    role: "prerequisite",
    hasStudyItem: false,
    grounding: null
  };
}

function edge(prerequisiteDerivedNodeId: string, dependentDerivedNodeId: string, uncertain = false): DerivedGraphDetail["edges"][number] {
  return { prerequisiteDerivedNodeId, dependentDerivedNodeId, confidence: uncertain ? 0.4 : 0.9, uncertain, judgeModel: "j" };
}

function detail(edges: DerivedGraphDetail["edges"], ids = ["scope", "borrow", "ownership", "move", "shaky"]): DerivedGraphDetail {
  return {
    summary: { enrichmentId: "e", graphVersionId: "g", enrichmentConfigHash: "cfg", judgeModel: "j", difficultyMethod: "m", status: "succeeded", edgeCount: edges.length, certainEdgeCount: edges.filter((e) => !e.uncertain).length, uncertainEdgeCount: edges.filter((e) => e.uncertain).length, conceptCount: ids.length, studyItemCount: 0, startedAt: "t", completedAt: "t" },
    nodes: ids.map(node),
    edges,
    originCounts: [],
    rescueDispositions: [],
    mintingDispositions: [],
    merges: []
  };
}

test("projectStatefulLearnerPath is unpruned, prerequisite-first, target-last, and faithful to classification state", () => {
  const graph = detail([edge("scope", "ownership"), edge("ownership", "move")]);
  const steps = projectStatefulLearnerPath({
    targetDerivedNodeId: "move",
    detail: graph,
    stateByNode: { scope: "mastered", ownership: "frontier", move: "locked", borrow: "frontier", shaky: "frontier" }
  });
  assert.deepEqual(steps.map((step) => step.derivedNodeId), ["scope", "ownership", "move"]);
  assert.deepEqual(steps.map((step) => step.state), ["mastered", "frontier", "locked"]);
  assert.equal(steps[2].isTarget, true);
});

test("projectStatefulLearnerPath carries topologicalDepth tiers for parallel prerequisites", () => {
  const graph = detail([edge("scope", "ownership"), edge("borrow", "ownership"), edge("ownership", "move")]);
  const steps = projectStatefulLearnerPath({
    targetDerivedNodeId: "move",
    detail: graph,
    stateByNode: { scope: "frontier", borrow: "frontier", ownership: "locked", move: "locked" }
  });
  const byId = new Map(steps.map((step) => [step.derivedNodeId, step]));
  assert.equal(byId.get("scope")?.topologicalDepth, 0);
  assert.equal(byId.get("borrow")?.topologicalDepth, 0);
  assert.equal(byId.get("ownership")?.topologicalDepth, 1);
  assert.equal(byId.get("move")?.topologicalDepth, 2);
});

test("projectStatefulLearnerPath excludes uncertain edges from scope and yields a single-step foundational path", () => {
  const graph = detail([edge("shaky", "move", true)], ["shaky", "move"]);
  const steps = projectStatefulLearnerPath({
    targetDerivedNodeId: "move",
    detail: graph,
    stateByNode: { shaky: "frontier", move: "frontier" }
  });
  assert.deepEqual(steps.map((step) => step.derivedNodeId), ["move"]);
  assert.equal(steps[0].isTarget, true);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { DerivedGraphEdge } from "@lrnki/ports";
import { applyDifficultyFloor, TRAIL_DIFFICULTY_FLOOR_BAND, type DifficultyFloorNode } from "./applyDifficultyFloor";

function node(id: string, band: number | null, contested: boolean | null = band === null ? null : false): DifficultyFloorNode {
  return { derivedNodeId: id, difficultyBand: band, difficultyContested: contested };
}

function edge(prereq: string, dependent: string, overrides: Partial<DerivedGraphEdge> = {}): DerivedGraphEdge {
  return {
    prerequisiteDerivedNodeId: prereq,
    dependentDerivedNodeId: dependent,
    confidence: 0.9,
    uncertain: false,
    judgeModel: "test-judge",
    ...overrides
  };
}

test("a confident band-1 middle node is floored and its gating survives by contraction", async () => {
  const result = applyDifficultyFloor({
    nodes: [node("a", 3), node("floored", 1), node("c", 4)],
    edges: [edge("a", "floored"), edge("floored", "c")]
  });

  assert.deepEqual(result.flooredNodeIds, ["floored"]);
  assert.deepEqual([...result.includedNodeIds].sort(), ["a", "c"]);
  assert.equal(result.contractedEdges.length, 1);
  assert.equal(result.contractedEdges[0].prerequisiteDerivedNodeId, "a");
  assert.equal(result.contractedEdges[0].dependentDerivedNodeId, "c");
  assert.equal(result.contractedEdges[0].uncertain, false);
});

test("contraction ORs the uncertain flag and keeps the conservative confidence", async () => {
  const result = applyDifficultyFloor({
    nodes: [node("a", 3), node("floored", 1), node("c", 4)],
    edges: [edge("a", "floored", { uncertain: true, confidence: 0.6 }), edge("floored", "c", { confidence: 0.9 })]
  });
  assert.equal(result.contractedEdges[0].uncertain, true);
  assert.equal(result.contractedEdges[0].confidence, 0.6);
});

test("every prerequisite of a floored node wires to every dependent", async () => {
  const result = applyDifficultyFloor({
    nodes: [node("p1", 3), node("p2", 3), node("floored", 1), node("d1", 4), node("d2", 4)],
    edges: [edge("p1", "floored"), edge("p2", "floored"), edge("floored", "d1"), edge("floored", "d2")]
  });
  const pairs = result.contractedEdges.map((e) => `${e.prerequisiteDerivedNodeId}->${e.dependentDerivedNodeId}`);
  assert.deepEqual(pairs, ["p1->d1", "p1->d2", "p2->d1", "p2->d2"]);
});

test("a chain of adjacent floored nodes contracts transitively", async () => {
  const result = applyDifficultyFloor({
    nodes: [node("a", 3), node("f1", 1), node("f2", 1), node("d", 5)],
    edges: [edge("a", "f1"), edge("f1", "f2"), edge("f2", "d")]
  });
  assert.deepEqual(result.flooredNodeIds, ["f1", "f2"]);
  const pairs = result.contractedEdges.map((e) => `${e.prerequisiteDerivedNodeId}->${e.dependentDerivedNodeId}`);
  assert.deepEqual(pairs, ["a->d"]);
});

test("a surviving direct edge between contracted endpoints is kept as-is, not duplicated", async () => {
  const result = applyDifficultyFloor({
    nodes: [node("a", 3), node("floored", 1), node("c", 4)],
    edges: [edge("a", "floored", { uncertain: true }), edge("floored", "c", { uncertain: true }), edge("a", "c", { confidence: 1 })]
  });
  assert.equal(result.contractedEdges.length, 1);
  assert.equal(result.contractedEdges[0].confidence, 1);
  assert.equal(result.contractedEdges[0].uncertain, false, "the direct judgment dominates the contracted composition");
});

test("the chosen target is exempt even at a confident band 1 (AE4)", async () => {
  const result = applyDifficultyFloor({
    nodes: [node("a", 2), node("t", 1)],
    edges: [edge("a", "t")]
  });
  assert.deepEqual(result.flooredNodeIds, ["t"], "with no learner-chosen target, a confident band-1 terminal has no exemption");
  assert.ok(!result.includedNodeIds.has("t"));
  assert.ok(result.includedNodeIds.has("a"));
});

test("contested band-1 nodes and nodes without a difficulty row are untouched (fail-open)", async () => {
  const result = applyDifficultyFloor({
    nodes: [node("contested", 1, true), node("unscored", null), node("t", 3)],
    edges: [edge("contested", "t"), edge("unscored", "t")]
  });
  assert.deepEqual(result.flooredNodeIds, []);
  assert.equal(result.contractedEdges.length, 2);
  assert.equal(result.includedNodeIds.size, 3);
});

test("an empty floor set is a no-op identical to the input view", async () => {
  const edges = [edge("a", "b"), edge("b", "c")];
  const result = applyDifficultyFloor({
    nodes: [node("a", 2), node("b", 3), node("c", 4)],
    edges
  });
  assert.deepEqual(result.flooredNodeIds, []);
  assert.deepEqual(result.contractedEdges, edges);
  assert.equal(result.includedNodeIds.size, 3);
});

test("the floor constant gates band 1 only", () => {
  assert.equal(TRAIL_DIFFICULTY_FLOOR_BAND, 1);
  const result = applyDifficultyFloor({
    nodes: [node("band2", 2), node("t", 5)],
    edges: [edge("band2", "t")]
  });
  assert.deepEqual(result.flooredNodeIds, []);
});

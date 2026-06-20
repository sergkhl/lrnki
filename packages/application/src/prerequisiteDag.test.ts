import assert from "node:assert/strict";
import test from "node:test";
import type { InferredPrerequisiteEdge } from "@lrnki/domain-core";
import {
  cutWeakEdges,
  dagDepthDifficulty,
  prerequisiteAncestors,
  removeCycles,
  topologicalDepth,
  topologicalOrder,
  transitiveReduction
} from "./prerequisiteDag";

function edge(prereq: string, dependent: string, confidence = 0.9, uncertain = false): InferredPrerequisiteEdge {
  return {
    prerequisiteDerivedNodeId: prereq,
    dependentDerivedNodeId: dependent,
    predicate: "inferred-prerequisite-of",
    confidence,
    uncertain,
    provenance: { judgmentRationale: "test" }
  };
}

test("removeCycles breaks a cycle by dropping its lowest-confidence edge", () => {
  // a -> b -> c -> a, with c -> a the weakest.
  const { edges, removed } = removeCycles([edge("a", "b", 0.9), edge("b", "c", 0.8), edge("c", "a", 0.7)]);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].prerequisiteDerivedNodeId, "c");
  assert.equal(removed[0].dependentDerivedNodeId, "a");
  assert.equal(edges.length, 2);
});

test("removeCycles leaves an already-acyclic graph untouched", () => {
  const input = [edge("a", "b"), edge("b", "c")];
  const { edges, removed } = removeCycles(input);
  assert.equal(removed.length, 0);
  assert.equal(edges.length, 2);
});

test("removeCycles drops a self-loop", () => {
  const { edges, removed } = removeCycles([edge("a", "a"), edge("a", "b")]);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].prerequisiteDerivedNodeId, "a");
  assert.equal(removed[0].dependentDerivedNodeId, "a");
  assert.equal(edges.length, 1);
});

test("transitiveReduction removes the redundant shortcut edge", () => {
  // a -> b -> c plus a -> c (redundant).
  const { edges, removed } = transitiveReduction([edge("a", "b"), edge("b", "c"), edge("a", "c")]);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].prerequisiteDerivedNodeId, "a");
  assert.equal(removed[0].dependentDerivedNodeId, "c");
  assert.deepEqual(
    edges.map((e) => `${e.prerequisiteDerivedNodeId}->${e.dependentDerivedNodeId}`).sort(),
    ["a->b", "b->c"]
  );
});

test("transitiveReduction keeps independent parallel prerequisites", () => {
  // x -> target, y -> target: neither is redundant.
  const { removed } = transitiveReduction([edge("x", "target"), edge("y", "target")]);
  assert.equal(removed.length, 0);
});

test("topologicalDepth is longest-path depth from a source", () => {
  // a -> b -> c, and a -> c directly: c's depth is the LONGEST path (2), not 1.
  const depth = topologicalDepth(["a", "b", "c"], [edge("a", "b"), edge("b", "c"), edge("a", "c")]);
  assert.equal(depth.get("a"), 0);
  assert.equal(depth.get("b"), 1);
  assert.equal(depth.get("c"), 2);
});

test("topologicalOrder respects prerequisites and breaks ties by the comparator", () => {
  // x and y both feed target; tie-break prefers lexical order here.
  const order = topologicalOrder(["x", "y", "target"], [edge("x", "target"), edge("y", "target")]);
  assert.equal(order.indexOf("x") < order.indexOf("target"), true);
  assert.equal(order.indexOf("y") < order.indexOf("target"), true);
  assert.deepEqual(order.slice(0, 2).sort(), ["x", "y"]);
});

test("prerequisiteAncestors collects the transitive predecessors of a target", () => {
  const ancestors = prerequisiteAncestors("target", [edge("a", "b"), edge("b", "target"), edge("z", "unrelated")]);
  assert.deepEqual([...ancestors].sort(), ["a", "b"]);
});

test("dagDepthDifficulty normalizes depth and reports interpretable components", () => {
  const difficulties = dagDepthDifficulty(["a", "b", "c"], [edge("a", "b"), edge("b", "c")]);
  const byId = new Map(difficulties.map((d) => [d.derivedNodeId, d]));
  assert.equal(byId.get("a")?.score, 0);
  assert.equal(byId.get("b")?.score, 0.5);
  assert.equal(byId.get("c")?.score, 1);
  assert.equal(byId.get("c")?.method, "dag-depth-mock");
  assert.equal(byId.get("b")?.components.topoDepth, 1);
  assert.equal(byId.get("c")?.components.fanIn, 1);
});

test("cutWeakEdges drops edges below the confidence floor", () => {
  const { kept, cut } = cutWeakEdges([edge("a", "b", 0.9), edge("b", "c", 0.3)], 0.5);
  assert.equal(kept.length, 1);
  assert.equal(cut.length, 1);
  assert.equal(cut[0].dependentDerivedNodeId, "c");
});

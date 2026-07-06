import assert from "node:assert/strict";
import test from "node:test";
import type { InferredPrerequisiteEdge } from "@lrnki/domain-core";
import {
  cutWeakEdges,
  findCycleEdges,
  prerequisiteAncestors,
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

test("findCycleEdges returns null for an acyclic graph", () => {
  assert.equal(findCycleEdges([edge("a", "b"), edge("b", "c")]), null);
});

test("findCycleEdges returns exactly the cycle's edges, deterministically", () => {
  // a -> b -> c -> a.
  const input = [edge("a", "b", 0.9), edge("b", "c", 0.8), edge("c", "a", 0.7)];
  const cycle = findCycleEdges(input);
  assert.ok(cycle, "a cycle is detected");
  const key = (es: typeof input) => es.map((e) => `${e.prerequisiteDerivedNodeId}->${e.dependentDerivedNodeId}`).join(",");
  assert.equal(key(cycle!), "a->b,b->c,c->a");
  // Replay determinism: identical input yields the identical violating cycle.
  assert.equal(key(findCycleEdges([...input])!), key(cycle!));
});

test("findCycleEdges detects a self-loop rather than silently passing it", () => {
  // Should never occur (the boundary excludes equal endpoints), but if it does it is a cycle.
  const cycle = findCycleEdges([edge("a", "a"), edge("a", "b")]);
  assert.ok(cycle, "the self-loop is detected as a cycle");
  assert.equal(cycle![0].prerequisiteDerivedNodeId, "a");
  assert.equal(cycle![0].dependentDerivedNodeId, "a");
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

test("cutWeakEdges drops edges below the confidence floor", () => {
  const { kept, cut } = cutWeakEdges([edge("a", "b", 0.9), edge("b", "c", 0.3)], 0.5);
  assert.equal(kept.length, 1);
  assert.equal(cut.length, 1);
  assert.equal(cut[0].dependentDerivedNodeId, "c");
});

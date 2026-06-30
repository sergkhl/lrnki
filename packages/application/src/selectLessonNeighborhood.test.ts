import assert from "node:assert/strict";
import test from "node:test";
import type { DerivedGraphLayer, DerivedGraphNode, InferredPrerequisiteEdge } from "@lrnki/domain-core";
import { selectLessonNeighborhood } from "./selectLessonNeighborhood";

function anchor(id: string, domain = "software engineering"): DerivedGraphNode {
  return {
    nodeKind: "anchor",
    derivedNodeId: id,
    conceptId: `concept-${id}`,
    groundingOrigin: "document_anchored",
    role: "anchor",
    layer: "asserted",
    canonicalLabel: id,
    normalizedLabel: id.toLowerCase(),
    declaredDomain: domain,
    aliases: []
  };
}

function edge(prereq: string, dependent: string): InferredPrerequisiteEdge {
  return {
    prerequisiteDerivedNodeId: prereq,
    dependentDerivedNodeId: dependent,
    predicate: "inferred-prerequisite-of",
    confidence: 0.9,
    uncertain: false,
    provenance: { judgmentRationale: "test" }
  };
}

function layerOf(nodes: DerivedGraphNode[], edges: InferredPrerequisiteEdge[] = []): DerivedGraphLayer {
  return {
    enrichmentId: "enr-1",
    graphVersionId: "gv-1",
    enrichmentConfigHash: "cfg",
    judgeModel: "mock",
    derivedNodes: nodes,
    prerequisiteEdges: edges,
    difficulties: []
  };
}

// Covers R5: directional partition. The target depends on Ownership (parent) and is a
// prerequisite of Move (child); neither leaks into siblings.
test("partitions a node's prerequisite into parents and its dependent into children", () => {
  const target = anchor("Borrowing");
  const layer = layerOf(
    [target, anchor("Ownership"), anchor("Move")],
    [edge("Ownership", "Borrowing"), edge("Borrowing", "Move")]
  );
  const neighborhood = selectLessonNeighborhood(target, layer);
  assert.deepEqual(neighborhood.parents.map((n) => n.label), ["Ownership"]);
  assert.deepEqual(neighborhood.children.map((n) => n.label), ["Move"]);
  assert.deepEqual(neighborhood.siblings.map((n) => n.label), []);
});

// Same-domain non-adjacent nodes land in siblings; cross-domain nodes are excluded.
test("non-adjacent same-domain nodes are siblings and cross-domain nodes are excluded", () => {
  const target = anchor("Borrowing");
  const layer = layerOf(
    [target, anchor("Lifetime"), anchor("Bond pricing", "economics")],
    []
  );
  const neighborhood = selectLessonNeighborhood(target, layer);
  assert.deepEqual(neighborhood.siblings.map((n) => n.label), ["Lifetime"]);
  assert.deepEqual(neighborhood.parents, []);
  assert.deepEqual(neighborhood.children, []);
});

// Ordering is deterministic across two calls on the same layer.
test("ordering is deterministic across calls", () => {
  const target = anchor("Borrowing");
  const layer = layerOf(
    [target, anchor("Lifetime"), anchor("Slices"), anchor("Ownership"), anchor("Move")],
    [edge("Ownership", "Borrowing"), edge("Borrowing", "Move")]
  );
  const first = selectLessonNeighborhood(target, layer);
  const second = selectLessonNeighborhood(target, layer);
  assert.deepEqual(first, second);
});

// Caps bound each partition independently.
test("each partition is capped", () => {
  const target = anchor("Borrowing");
  const siblings = Array.from({ length: 10 }, (_, i) => anchor(`Sib${i}`));
  const neighborhood = selectLessonNeighborhood(target, layerOf([target, ...siblings]), 3);
  assert.equal(neighborhood.siblings.length, 3);
});

// A node with no edges returns empty parents/children and still returns same-domain siblings.
test("a node with no edges still returns same-domain siblings", () => {
  const target = anchor("Borrowing");
  const layer = layerOf([target, anchor("Ownership"), anchor("Move")]);
  const neighborhood = selectLessonNeighborhood(target, layer);
  assert.deepEqual(neighborhood.parents, []);
  assert.deepEqual(neighborhood.children, []);
  assert.deepEqual(neighborhood.siblings.map((n) => n.label), ["Ownership", "Move"]);
});

// A back-and-forth pair classifies as parent (the tighter relationship), never duplicated.
test("a node that is both parent and child resolves to parent without duplication", () => {
  const target = anchor("Borrowing");
  const layer = layerOf(
    [target, anchor("Ownership")],
    [edge("Ownership", "Borrowing"), edge("Borrowing", "Ownership")]
  );
  const neighborhood = selectLessonNeighborhood(target, layer);
  assert.deepEqual(neighborhood.parents.map((n) => n.label), ["Ownership"]);
  assert.deepEqual(neighborhood.children, []);
  assert.deepEqual(neighborhood.siblings, []);
});

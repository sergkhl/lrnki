import assert from "node:assert/strict";
import test from "node:test";
import type { DerivedGraphNode, InferredPrerequisiteEdge } from "@lrnki/domain-core";
import { connectivityMetrics, detectSparseRegions, type DeclinedPairDisposition } from "./sparseRegionDetection";

function node(id: string, domain = "test"): DerivedGraphNode {
  return {
    nodeKind: "anchor",
    derivedNodeId: id,
    conceptId: id,
    groundingOrigin: "document_anchored",
    role: "anchor",
    layer: "asserted",
    canonicalLabel: id,
    normalizedLabel: id,
    declaredDomain: domain,
    aliases: []
  };
}

function edge(prereq: string, dependent: string, uncertain = false): InferredPrerequisiteEdge {
  return {
    prerequisiteConceptId: prereq,
    dependentConceptId: dependent,
    predicate: "inferred-prerequisite-of",
    confidence: 0.9,
    uncertain,
    provenance: { judgmentRationale: "test" }
  };
}

function declined(aConceptId: string, bConceptId: string, declaredDomain = "test"): DeclinedPairDisposition {
  return { aConceptId, bConceptId, declaredDomain, outcome: "none", rationale: "declined" };
}

test("a declined cross-component same-domain pair becomes one candidate gap", () => {
  const result = detectSparseRegions(
    { derivedNodes: [node("a"), node("b"), node("c"), node("d")], prerequisiteEdges: [edge("a", "b"), edge("c", "d")] },
    [declined("b", "c")]
  );

  assert.equal(result.components.length, 2);
  assert.deepEqual(result.candidateGaps.map((gap) => `${gap.aConceptId}:${gap.bConceptId}:${gap.reason}`), ["b:c:cross_component"]);
});

test("a declined pair touching an orphan becomes a candidate gap", () => {
  const result = detectSparseRegions(
    { derivedNodes: [node("a"), node("b"), node("orphan")], prerequisiteEdges: [edge("a", "b")] },
    [declined("b", "orphan")]
  );

  assert.deepEqual(result.orphanConceptIds, ["orphan"]);
  assert.equal(result.candidateGaps[0].reason, "orphan");
});

test("a declined pair inside one connected component is not a candidate", () => {
  const result = detectSparseRegions(
    { derivedNodes: [node("a"), node("b"), node("c")], prerequisiteEdges: [edge("a", "b"), edge("b", "c")] },
    [declined("a", "c")]
  );

  assert.deepEqual(result.candidateGaps, []);
});

test("a graph with no declined cross-component pairs yields no candidates", () => {
  const result = detectSparseRegions(
    { derivedNodes: [node("a"), node("b"), node("c"), node("d")], prerequisiteEdges: [edge("a", "b"), edge("c", "d")] },
    []
  );

  assert.deepEqual(result.candidateGaps, []);
});

test("candidate ordering is deterministic across input permutations", () => {
  const nodes = [node("d"), node("b"), node("a"), node("c")];
  const edges = [edge("c", "d"), edge("a", "b")];
  const pairs = [declined("b", "c"), declined("a", "d")];

  const first = detectSparseRegions({ derivedNodes: nodes, prerequisiteEdges: edges }, pairs);
  const second = detectSparseRegions({ derivedNodes: [...nodes].reverse(), prerequisiteEdges: [...edges].reverse() }, [...pairs].reverse());

  assert.deepEqual(first, second);
});

test("candidate gaps are bounded deterministically", () => {
  const result = detectSparseRegions(
    { derivedNodes: [node("a"), node("b"), node("c")], prerequisiteEdges: [] },
    [declined("b", "c"), declined("a", "c"), declined("a", "b")],
    { maxCandidateGaps: 2 }
  );

  assert.deepEqual(result.candidateGaps.map((gap) => `${gap.aConceptId}->${gap.bConceptId}`), ["a->b", "a->c"]);
});

test("connectivity metrics count components and target reachability", () => {
  const metrics = connectivityMetrics(
    { derivedNodes: [node("a"), node("b"), node("target"), node("orphan")], prerequisiteEdges: [edge("a", "b"), edge("b", "target")] },
    "target"
  );

  assert.equal(metrics.componentCount, 2);
  assert.equal(metrics.orphanCount, 1);
  assert.equal(metrics.reachableAncestorCount, 2);
  assert.deepEqual(metrics.reachableAncestorIds, ["a", "b"]);
});

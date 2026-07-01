import assert from "node:assert/strict";
import test from "node:test";
import type { DerivedGraphDetail } from "@lrnki/ports";
import { buildTargetCandidates, filterTargets, recommendedTargets } from "./targetCandidates";

function node(id: string, label = id, aliases: string[] = []): DerivedGraphDetail["nodes"][number] {
  return {
    derivedNodeId: id,
    label,
    aliases,
    declaredDomain: "d",
    difficulty: 0,
    difficultyRationale: null,
    nodeKind: "anchor",
    groundingOrigin: "document_anchored",
    role: "prerequisite",
    hasStudyItem: true,
    grounding: null
  };
}

function edge(prerequisiteDerivedNodeId: string, dependentDerivedNodeId: string, uncertain = false): DerivedGraphDetail["edges"][number] {
  return { prerequisiteDerivedNodeId, dependentDerivedNodeId, uncertain, confidence: uncertain ? 0.4 : 0.9, judgeModel: "j" };
}

function detail(nodes: string[], edges: DerivedGraphDetail["edges"]): DerivedGraphDetail {
  return {
    summary: { enrichmentId: "e", graphVersionId: "g", enrichmentConfigHash: "cfg", judgeModel: "j", difficultyMethod: "m", status: "succeeded", edgeCount: edges.length, certainEdgeCount: edges.filter((e) => !e.uncertain).length, uncertainEdgeCount: edges.filter((e) => e.uncertain).length, conceptCount: nodes.length, studyItemCount: nodes.length, startedAt: "t", completedAt: "t" },
    nodes: nodes.map((id) => node(id, id === "z" ? "Zed" : id, id === "alias" ? ["Borrow references"] : [])),
    edges,
    originCounts: [],
    rescueDispositions: [],
    mintingDispositions: [],
    merges: []
  };
}

test("recommendedTargets selects trusted non-foundational sinks and ranks by cone size then label", () => {
  const graph = detail(["a", "b", "c", "d", "z", "e", "f"], [edge("a", "b"), edge("b", "c"), edge("a", "d"), edge("d", "z"), edge("e", "f")]);
  const candidates = buildTargetCandidates(graph);
  const recommended = recommendedTargets(candidates, graph);
  assert.deepEqual(recommended.map((candidate) => candidate.derivedNodeId), ["c", "z", "f"]);
  assert.deepEqual(recommended.map((candidate) => candidate.coneSize), [2, 2, 1]);
});

test("recommendedTargets fills fewer than three milestones from largest remaining cones without duplicates", () => {
  const graph = detail(["a", "b", "c", "lonely"], [edge("a", "b"), edge("b", "c")]);
  const recommended = recommendedTargets(buildTargetCandidates(graph), graph);
  assert.deepEqual(recommended.map((candidate) => candidate.derivedNodeId), ["c", "b", "a"]);
  assert.equal(new Set(recommended.map((candidate) => candidate.derivedNodeId)).size, recommended.length);
});

test("recommendedTargets caps at eight", () => {
  const pairs = Array.from({ length: 10 }, (_, index) => [`root${index}`, `target${index}`] as const);
  const nodes = pairs.flat();
  const edges = pairs.map(([root, target]) => edge(root, target));
  const graph = detail(nodes, edges);
  assert.equal(recommendedTargets(buildTargetCandidates(graph), graph, 8).length, 8);
});

test("foundational and uncertain-dependent targets remain searchable but uncertain outgoing edges do not disqualify sinks", () => {
  const graph = detail(["root", "target", "uncertainDependent"], [edge("root", "target"), edge("target", "uncertainDependent", true)]);
  const candidates = buildTargetCandidates(graph);
  assert.equal(candidates.find((candidate) => candidate.derivedNodeId === "root")?.isFoundational, true);
  assert.ok(recommendedTargets(candidates, graph).some((candidate) => candidate.derivedNodeId === "target"));
});

test("filterTargets matches label and alias substrings case-insensitively and empty query returns all", () => {
  const candidates = buildTargetCandidates(detail(["z", "alias"], []));
  assert.deepEqual(filterTargets(candidates, "zed").map((candidate) => candidate.derivedNodeId), ["z"]);
  assert.deepEqual(filterTargets(candidates, "REFER").map((candidate) => candidate.derivedNodeId), ["alias"]);
  assert.equal(filterTargets(candidates, "").length, 2);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { DerivedGraphDetail, DerivedGraphEdge, DerivedGraphNode } from "@lrnki/ports";
import type { AdaptedNodeState } from "./adaptivePathProjection";
import { projectExpeditionSections } from "./expeditionSections";

function node(id: string, difficulty: number): DerivedGraphNode {
  return {
    derivedNodeId: id,
    label: id.toUpperCase(),
    aliases: [],
    declaredDomain: "test",
    difficulty,
    difficultyRationale: null,
    nodeKind: "anchor",
    groundingOrigin: "document_anchored",
    role: "anchor",
    hasStudyItem: true,
    grounding: null
  };
}

function edge(prereq: string, dependent: string, overrides: Partial<DerivedGraphEdge> = {}): DerivedGraphEdge {
  return { prerequisiteDerivedNodeId: prereq, dependentDerivedNodeId: dependent, confidence: 0.9, uncertain: false, judgeModel: "test", ...overrides };
}

function detail(nodes: DerivedGraphNode[], edges: DerivedGraphEdge[]): Pick<DerivedGraphDetail, "nodes" | "edges"> {
  return { nodes, edges };
}

const allFrontier = (ids: string[]): Record<string, AdaptedNodeState> => Object.fromEntries(ids.map((id) => [id, "frontier" as AdaptedNodeState]));

test("every non-floored node appears in exactly one section", () => {
  const nodes = [node("a", 2), node("b", 3), node("c", 4), node("d", 5)];
  const edges = [edge("a", "b"), edge("b", "d"), edge("c", "d")];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["a", "b", "c", "d"]) });

  const seen = result.steps.map((step) => step.derivedNodeId).sort();
  assert.deepEqual(seen, ["a", "b", "c", "d"], "all four nodes are placed exactly once");
  assert.equal(new Set(seen).size, 4, "no node is duplicated across sections");
});

test("a prerequisite shared by two milestones lands only in the earlier section", () => {
  // shared `s` is a prerequisite of both terminals `m1` (easy cone) and `m2` (hard cone).
  const nodes = [node("s", 2), node("m1", 3), node("m2", 9)];
  const edges = [edge("s", "m1"), edge("s", "m2")];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["s", "m1", "m2"]) });

  const sectionOf = (id: string) => result.steps.find((step) => step.derivedNodeId === id)?.sectionIndex;
  assert.equal(sectionOf("s"), sectionOf("m1"), "shared prerequisite is claimed by the easier (earlier) section with m1");
  assert.notEqual(sectionOf("s"), sectionOf("m2"), "and does NOT reappear in m2's section");
  assert.equal(result.steps.filter((step) => step.derivedNodeId === "s").length, 1);
});

test("validity invariant: every trusted edge points to an equal-or-later position (multi-sink)", () => {
  const nodes = [node("root", 1), node("mid1", 4), node("mid2", 6), node("sinkA", 5), node("sinkB", 8)];
  const edges = [edge("root", "mid1"), edge("root", "mid2"), edge("mid1", "sinkA"), edge("mid2", "sinkB"), edge("mid1", "sinkB")];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["root", "mid1", "mid2", "sinkA", "sinkB"]) });

  const positionOf = new Map(result.steps.map((step) => [step.derivedNodeId, step.position] as const));
  for (const e of edges) {
    assert.ok(
      (positionOf.get(e.prerequisiteDerivedNodeId) ?? -1) < (positionOf.get(e.dependentDerivedNodeId) ?? -1),
      `prerequisite ${e.prerequisiteDerivedNodeId} precedes dependent ${e.dependentDerivedNodeId} in the concatenated path`
    );
  }
});

test("uncertain edges do not constrain sectioning (trusted-only)", () => {
  const nodes = [node("a", 2), node("b", 3)];
  const edges = [edge("a", "b", { uncertain: true })];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["a", "b"]) });
  // With the only edge uncertain, both are terminals → two singleton sections.
  assert.equal(result.sections.length, 2);
});

test("an isolated node forms a singleton section", () => {
  const nodes = [node("lonely", 3), node("a", 2), node("b", 4)];
  const edges = [edge("a", "b")];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["lonely", "a", "b"]) });
  const lonelySection = result.sections.find((section) => section.stepDerivedNodeIds.includes("lonely"));
  assert.ok(lonelySection);
  assert.deepEqual(lonelySection?.stepDerivedNodeIds, ["lonely"], "isolated node is alone in its section");
});

test("a single-terminal layer is one section covering everything, summit = the terminal", () => {
  const nodes = [node("a", 2), node("b", 3), node("c", 4)];
  const edges = [edge("a", "b"), edge("b", "c")];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["a", "b", "c"]) });
  assert.equal(result.sections.length, 1);
  assert.deepEqual(result.sections[0].stepDerivedNodeIds, ["a", "b", "c"]);
  assert.deepEqual(result.summit, { derivedNodeId: "c", label: "C" });
});

test("section order: lower mean difficulty first, deterministic under ties", () => {
  // Two disjoint chains: easy chain (2,3) and hard chain (7,8).
  const nodes = [node("e1", 2), node("e2", 3), node("h1", 7), node("h2", 8)];
  const edges = [edge("e1", "e2"), edge("h1", "h2")];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["e1", "e2", "h1", "h2"]) });
  assert.equal(result.sections[0].milestoneDerivedNodeId, "e2", "easier section first");
  assert.equal(result.sections[1].milestoneDerivedNodeId, "h2", "harder section second");
  // Summit is the last (hardest) section's milestone.
  assert.equal(result.summit?.derivedNodeId, "h2");
});

test("easiest-first within a section respects prerequisites", () => {
  // b(1) depends on a(9): even though b is easier, a must come first.
  const nodes = [node("a", 9), node("b", 1)];
  const edges = [edge("a", "b")];
  const result = projectExpeditionSections({ detail: detail(nodes, edges), stateByNode: allFrontier(["a", "b"]) });
  assert.deepEqual(result.sections[0].stepDerivedNodeIds, ["a", "b"], "prerequisite a precedes easier dependent b");
});

test("state rides through per node; summit flagged", () => {
  const nodes = [node("a", 2), node("b", 3)];
  const edges = [edge("a", "b")];
  const result = projectExpeditionSections({
    detail: detail(nodes, edges),
    stateByNode: { a: "mastered", b: "frontier" }
  });
  const stepA = result.steps.find((step) => step.derivedNodeId === "a");
  const stepB = result.steps.find((step) => step.derivedNodeId === "b");
  assert.equal(stepA?.state, "mastered");
  assert.equal(stepB?.state, "frontier");
  assert.equal(stepB?.isSummit, true);
  assert.equal(stepA?.isSummit, false);
});

test("an empty floored layer yields no sections and a null summit", () => {
  const result = projectExpeditionSections({ detail: detail([], []), stateByNode: {} });
  assert.deepEqual(result.steps, []);
  assert.deepEqual(result.sections, []);
  assert.equal(result.summit, null);
});

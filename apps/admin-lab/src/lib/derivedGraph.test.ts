import assert from "node:assert/strict";
import { test } from "node:test";
import { frontierNeighborhood, filterAndOrderGoals, filterDetailToVisible, isFoundationalGoal, journeySize, type DerivedGraphDetail, type GoalCandidate } from "./derivedGraph";

// `frontierNeighborhood` (KTD2) is the pure helper that frames the study graph on the
// learner's working region: the frontier target plus its direct prerequisites and direct
// dependents, deduped. Direction-agnostic, computed over rendered edges (certain AND
// uncertain). The cy.fit/recenter viewport behavior itself is verified in the U6 rule-14 pass.

function edge(prerequisiteDerivedNodeId: string, dependentDerivedNodeId: string) {
  return { prerequisiteDerivedNodeId, dependentDerivedNodeId };
}

// scope -> ownership -> move ; borrow -> ownership ; ownership -> alias (a dependent).
const edges = [edge("scope", "ownership"), edge("ownership", "move"), edge("borrow", "ownership"), edge("ownership", "alias")];

test("returns the target plus its direct prerequisites and direct dependents, deduped (Covers R3)", () => {
  const hood = frontierNeighborhood("ownership", edges);
  assert.deepEqual([...hood].sort(), ["alias", "borrow", "move", "ownership", "scope"].sort());
  assert.equal(new Set(hood).size, hood.length, "no duplicates");
});

test("an isolated node (no edges) returns just itself", () => {
  assert.deepEqual(frontierNeighborhood("solo", edges), ["solo"]);
  assert.deepEqual(frontierNeighborhood("solo", []), ["solo"]);
});

test("direction-agnostic: both upstream and downstream 1-hop neighbors are included", () => {
  const hood = new Set(frontierNeighborhood("ownership", edges));
  assert.ok(hood.has("scope") && hood.has("borrow"), "upstream prerequisites included");
  assert.ok(hood.has("move") && hood.has("alias"), "downstream dependents included");
});

test("an uncertain-edge neighbor is included — the canvas renders it, so framing should too", () => {
  // frontierNeighborhood ignores certainty by design; an uncertain edge is just an edge here.
  const hood = frontierNeighborhood("ownership", [edge("uncertainPrereq", "ownership")]);
  assert.deepEqual([...hood].sort(), ["ownership", "uncertainPrereq"].sort());
});

test("only DIRECT neighbors — a 2-hop node is not pulled in", () => {
  const hood = new Set(frontierNeighborhood("ownership", edges));
  // `scope`'s prerequisite would be 2 hops from ownership; here scope has none, but assert
  // the rule by adding a grandparent.
  const withGrandparent = frontierNeighborhood("ownership", [...edges, edge("grandparent", "scope")]);
  assert.equal(new Set(withGrandparent).has("grandparent"), false, "2-hop ancestor excluded");
  assert.ok(hood.has("scope"));
});

// --- Goal-first picker helpers (U4, R1/R2/R3) ------------------------------

// scope -> ownership -> move ; borrow -> ownership (certain). An uncertain edge into
// `move` must not inflate its journey (R2/R8 trust model).
function jEdge(prerequisiteDerivedNodeId: string, dependentDerivedNodeId: string, uncertain = false) {
  return { prerequisiteDerivedNodeId, dependentDerivedNodeId, uncertain };
}
const journeyEdges = [jEdge("scope", "ownership"), jEdge("ownership", "move"), jEdge("borrow", "ownership"), jEdge("flaky", "move", true)];

test("journeySize counts trusted prerequisite ancestors only (Covers R2)", () => {
  // move's trusted ancestors: ownership, scope, borrow (the uncertain `flaky` is excluded).
  assert.equal(journeySize("move", journeyEdges), 3);
  assert.equal(journeySize("ownership", journeyEdges), 2);
  assert.equal(journeySize("scope", journeyEdges), 0, "a DAG-root goal has a zero journey");
});

function goal(id: string, journeySize: number, extra: Partial<GoalCandidate> = {}): GoalCandidate {
  return { derivedNodeId: id, label: extra.label ?? id, aliases: extra.aliases ?? [], declaredDomain: "d", nodeKind: "anchor", hasStudyItem: true, journeySize };
}

test("filterAndOrderGoals orders by descending journey size, ties by label (Covers R2)", () => {
  const ordered = filterAndOrderGoals([goal("a", 1), goal("c", 3), goal("b", 3)], "");
  assert.deepEqual(ordered.map((g) => g.derivedNodeId), ["b", "c", "a"], "larger journeys first; equal journeys by label");
});

test("filterAndOrderGoals matches label AND alias substrings, case-insensitively (Covers R1)", () => {
  const candidates = [
    goal("own", 2, { label: "Ownership", aliases: ["move semantics"] }),
    goal("bor", 1, { label: "Borrowing", aliases: ["references"] })
  ];
  assert.deepEqual(filterAndOrderGoals(candidates, "OWNER").map((g) => g.derivedNodeId), ["own"], "label substring");
  assert.deepEqual(filterAndOrderGoals(candidates, "referen").map((g) => g.derivedNodeId), ["bor"], "alias substring");
  assert.equal(filterAndOrderGoals(candidates, "").length, 2, "empty query matches everything");
});

test("isFoundationalGoal is true only for a zero-journey goal (Covers R3)", () => {
  assert.equal(isFoundationalGoal({ journeySize: 0 }), true);
  assert.equal(isFoundationalGoal({ journeySize: 1 }), false);
});

function detailForHide(): DerivedGraphDetail {
  const nodes = [
    { derivedNodeId: "A", label: "A", aliases: [], declaredDomain: "d", difficulty: 0.1, difficultyRationale: null, nodeKind: "anchor" as const, groundingOrigin: "document_anchored" as const, role: "prerequisite" as const, hasStudyItem: true, grounding: null },
    { derivedNodeId: "B", label: "B", aliases: [], declaredDomain: "d", difficulty: 0.5, difficultyRationale: null, nodeKind: "anchor" as const, groundingOrigin: "document_anchored" as const, role: "prerequisite" as const, hasStudyItem: true, grounding: null },
    { derivedNodeId: "Z", label: "Z", aliases: [], declaredDomain: "d", difficulty: 0.9, difficultyRationale: null, nodeKind: "anchor" as const, groundingOrigin: "document_anchored" as const, role: "anchor" as const, hasStudyItem: true, grounding: null }
  ];
  const edges = [
    { prerequisiteDerivedNodeId: "A", dependentDerivedNodeId: "B", confidence: 0.9, uncertain: false, judgeModel: "j" },
    { prerequisiteDerivedNodeId: "B", dependentDerivedNodeId: "Z", confidence: 0.9, uncertain: false, judgeModel: "j" }
  ];
  return {
    summary: {
      enrichmentId: "e",
      graphVersionId: "g",
      enrichmentConfigHash: "cfg",
      judgeModel: "j",
      difficultyMethod: "m",
      status: "succeeded",
      edgeCount: edges.length,
      certainEdgeCount: edges.length,
      uncertainEdgeCount: 0,
      conceptCount: nodes.length,
      studyItemCount: nodes.length,
      startedAt: "t",
      completedAt: "t"
    },
    nodes,
    edges,
    originCounts: [{ domain: "d", anchor: 3, sourceMentioned: 0, llmGrounded: 0 }],
    rescueDispositions: [],
    mintingDispositions: [],
    merges: []
  };
}

test("filterDetailToVisible removes hidden nodes and incident edges from the rendered detail", () => {
  const visible = filterDetailToVisible(detailForHide(), new Set(["A", "B"]));
  assert.deepEqual(visible.nodes.map((node) => node.derivedNodeId), ["Z"]);
  assert.deepEqual(visible.edges, []);
  assert.equal(visible.summary.conceptCount, 1);
  assert.equal(visible.summary.edgeCount, 0);
  assert.equal(visible.summary.certainEdgeCount, 0);
  assert.equal(visible.summary.uncertainEdgeCount, 0);
  assert.deepEqual(visible.originCounts, [{ domain: "d", anchor: 1, sourceMentioned: 0, llmGrounded: 0 }]);
});

test("filterDetailToVisible keeps any node that is not in the hidden set, including a caller-preserved goal", () => {
  const visible = filterDetailToVisible(detailForHide(), new Set(["A", "B"]));
  assert.deepEqual(visible.nodes.map((node) => node.derivedNodeId), ["Z"]);
});

test("filterDetailToVisible has no goal special-case; callers own goal exclusion", () => {
  const visible = filterDetailToVisible(detailForHide(), new Set(["A", "B", "Z"]));
  assert.deepEqual(visible.nodes, []);
  assert.deepEqual(visible.edges, []);
});

test("filterDetailToVisible with an empty hidden set is a no-op shape", () => {
  const detail = detailForHide();
  const visible = filterDetailToVisible(detail, new Set());
  assert.deepEqual(visible.nodes.map((node) => node.derivedNodeId), detail.nodes.map((node) => node.derivedNodeId));
  assert.deepEqual(visible.edges, detail.edges);
});

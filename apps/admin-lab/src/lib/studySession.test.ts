import assert from "node:assert/strict";
import { test } from "node:test";
import type { AdaptedNodeClassification } from "@lrnki/application";
import { sheetContentFor, unmetPrerequisites, selectScopedFrontier, type StudyCardView } from "./studySession";
import type { DerivedGraphEdge } from "./derivedGraph";

// DAG: scope -> ownership -> move, plus a second prerequisite borrow -> move (uncertain).
// Pure gating helpers only — the DB-bound loader is verified by the U7 real-use run.
const edges: DerivedGraphEdge[] = [
  { prerequisiteDerivedNodeId: "scope", dependentDerivedNodeId: "ownership", confidence: 0.9, uncertain: false, judgeModel: "j" },
  { prerequisiteDerivedNodeId: "ownership", dependentDerivedNodeId: "move", confidence: 0.9, uncertain: false, judgeModel: "j" },
  { prerequisiteDerivedNodeId: "borrow", dependentDerivedNodeId: "move", confidence: 0.4, uncertain: true, judgeModel: "j" }
];

const labelByNode = new Map([
  ["scope", "Variable scope"],
  ["ownership", "Ownership"],
  ["move", "Move semantics"],
  ["borrow", "Borrowing"]
]);

function card(derivedNodeId: string): StudyCardView {
  return { cardId: `c-${derivedNodeId}`, derivedNodeId, question: `Q ${derivedNodeId}`, answerKey: `A ${derivedNodeId}`, selfReportPrompt: "Recall?", groundingProvenance: "source_cep" };
}

const classification: AdaptedNodeClassification = {
  stateByNode: { scope: "mastered", ownership: "frontier", move: "locked", borrow: "frontier" },
  selectedFrontierTarget: "ownership"
};

test("sheetContentFor opens a frontier node's recall card (Covers R9)", () => {
  const content = sheetContentFor({ derivedNodeId: "ownership", classification, cardsByNode: new Map([["ownership", card("ownership")]]), edges, labelByNode });
  assert.equal(content.kind, "frontier_card");
  assert.equal(content.kind === "frontier_card" && content.card.cardId, "c-ownership");
});

test("sheetContentFor flags a cardless frontier node, never dropping it (Covers R9/R13)", () => {
  const content = sheetContentFor({ derivedNodeId: "ownership", classification, cardsByNode: new Map(), edges, labelByNode });
  assert.equal(content.kind, "cardless");
});

test("sheetContentFor names a locked node's unmet prerequisites and shows no card (Covers R9)", () => {
  const content = sheetContentFor({ derivedNodeId: "move", classification, cardsByNode: new Map([["move", card("move")]]), edges, labelByNode });
  assert.equal(content.kind, "locked");
  // Only the certain unmet prerequisite (ownership, frontier) — the uncertain borrow edge is excluded.
  assert.deepEqual(content.kind === "locked" && content.unmetPrerequisiteLabels, ["Ownership"]);
});

test("sheetContentFor opens a mastered node's card as a read-only review", () => {
  const content = sheetContentFor({ derivedNodeId: "scope", classification, cardsByNode: new Map([["scope", card("scope")]]), edges, labelByNode });
  assert.equal(content.kind, "mastered_review");
  assert.equal(content.kind === "mastered_review" && content.card?.cardId, "c-scope");
});

test("unmetPrerequisites returns only direct, non-mastered prerequisites, excluding uncertain edges", () => {
  // move's direct prerequisites: ownership (frontier, certain) and borrow (frontier, uncertain).
  assert.deepEqual(unmetPrerequisites("move", edges, classification), ["ownership"]);
  // ownership's only direct prerequisite (scope) is mastered -> none unmet.
  assert.deepEqual(unmetPrerequisites("ownership", edges, classification), []);
});

test("selectScopedFrontier picks the hardest frontier node within the goal cone", () => {
  // Goal = move; scope = {scope, ownership, move}. Only ownership is frontier in scope.
  const frontier = selectScopedFrontier({
    targetDerivedNodeId: "move",
    edges,
    classification,
    difficultyByNode: new Map([["ownership", 0.5], ["borrow", 0.9]])
  });
  // borrow is frontier but OUTSIDE move's certain-edge ancestor cone, so it is not selected.
  assert.equal(frontier, "ownership");
});

test("selectScopedFrontier returns null when the goal cone has no frontier node", () => {
  const allMastered: AdaptedNodeClassification = { stateByNode: { scope: "mastered", ownership: "mastered", move: "frontier" }, selectedFrontierTarget: null };
  // move itself is frontier and in scope (the goal is included), so it IS selected.
  assert.equal(selectScopedFrontier({ targetDerivedNodeId: "move", edges, classification: allMastered, difficultyByNode: new Map() }), "move");
  // With move mastered too, nothing in scope is frontier.
  const done: AdaptedNodeClassification = { stateByNode: { scope: "mastered", ownership: "mastered", move: "mastered" }, selectedFrontierTarget: null };
  assert.equal(selectScopedFrontier({ targetDerivedNodeId: "move", edges, classification: done, difficultyByNode: new Map() }), null);
});

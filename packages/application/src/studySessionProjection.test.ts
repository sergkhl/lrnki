import assert from "node:assert/strict";
import { test } from "node:test";
import type { CalibrationVerdict, ResponseLogRow, StudyItem } from "@lrnki/domain-core";
import type { DerivedGraphDetail } from "@lrnki/ports";
import {
  adaptedHiddenNodeIds,
  composeStudySession,
  studyItemToView,
  studyItemViewToSheet,
  unmetPrerequisites
} from "./studySessionProjection";
import { selectScopedFrontierTarget, type AdaptedNodeClassification } from "./adaptivePathProjection";

// DAG: scope -> ownership -> move (certain), plus borrow -> move (uncertain).
const labelByNode: Record<string, string> = { scope: "Variable scope", ownership: "Ownership", move: "Move semantics", borrow: "Borrowing" };
const difficultyByNode: Record<string, number> = { scope: 0.2, ownership: 0.5, move: 0.8, borrow: 0.9 };

function node(id: string): DerivedGraphDetail["nodes"][number] {
  return {
    derivedNodeId: id,
    label: labelByNode[id],
    aliases: [],
    declaredDomain: "rust",
    difficulty: difficultyByNode[id],
    difficultyRationale: null,
    nodeKind: "anchor",
    groundingOrigin: "document_anchored",
    role: "prerequisite",
    hasStudyItem: false,
    grounding: null
  };
}

function detail(): DerivedGraphDetail {
  return {
    summary: { enrichmentId: "e", graphVersionId: "g", enrichmentConfigHash: "cfg", judgeModel: "j", difficultyMethod: "m", status: "succeeded", edgeCount: 3, certainEdgeCount: 2, uncertainEdgeCount: 1, conceptCount: 4, studyItemCount: 0, startedAt: "t", completedAt: "t" },
    nodes: ["scope", "ownership", "move", "borrow"].map(node),
    edges: [
      { prerequisiteDerivedNodeId: "scope", dependentDerivedNodeId: "ownership", confidence: 0.9, uncertain: false, judgeModel: "j" },
      { prerequisiteDerivedNodeId: "ownership", dependentDerivedNodeId: "move", confidence: 0.9, uncertain: false, judgeModel: "j" },
      { prerequisiteDerivedNodeId: "borrow", dependentDerivedNodeId: "move", confidence: 0.4, uncertain: true, judgeModel: "j" }
    ],
    originCounts: [],
    rescueDispositions: [],
    mintingDispositions: [],
    merges: []
  };
}

function optionItem(derivedNodeId: string): StudyItem {
  return {
    studyItemId: `os-${derivedNodeId}`,
    graphVersionId: "g",
    enrichmentId: "e",
    derivedNodeId,
    groundingProvenance: "source_cep",
    generatingModel: "deepseek",
    configHash: "cfg",
    itemType: "option_select",
    question: `Q ${derivedNodeId}`,
    options: [
      { optionId: `o-${derivedNodeId}-2`, text: "Two", isCorrect: false, provenance: "generated" },
      { optionId: `o-${derivedNodeId}-1`, text: "One", isCorrect: true, provenance: "source" }
    ]
  };
}

function graded(derivedNodeId: string, outcome: ResponseLogRow["judgedOutcome"], attemptSeq: number): ResponseLogRow {
  return {
    responseId: `r-${derivedNodeId}-${attemptSeq}`,
    learnerStateRef: "L1",
    studyItemId: `os-${derivedNodeId}`,
    derivedNodeId,
    signalType: "graded",
    judgedOutcome: outcome,
    gradedScore: outcome === "correct" ? 1 : outcome === "partial" ? 0.5 : 0,
    responseSource: "synthetic",
    graderIdentity: "kg-independent-judge",
    batchId: null,
    attemptSeq,
    submittedAnswer: "x"
  };
}

function compose(args: { target: string; studyItems?: StudyItem[]; rows?: ResponseLogRow[]; verdicts?: CalibrationVerdict[] }) {
  return composeStudySession({
    enrichmentId: "e",
    learnerStateRef: "L1",
    targetDerivedNodeId: args.target,
    detail: detail(),
    studyItems: args.studyItems ?? [],
    rows: args.rows ?? [],
    verdicts: args.verdicts ?? []
  });
}

test("composeStudySession gates a frontier node with an option-select item to an option_select sheet (options sorted by id)", () => {
  const session = compose({ target: "move", studyItems: [optionItem("scope")] });
  // No verdicts/rows: scope is the only frontier node in move's cone, so it is selected.
  assert.equal(session.classification.selectedFrontierTarget, "scope");
  const sheet = session.sheetByNode.scope;
  assert.equal(sheet.kind, "option_select");
  assert.equal(sheet.kind === "option_select" && sheet.item.options.map((o) => o.optionId).join(","), "o-scope-1,o-scope-2");
});

test("composeStudySession gives a frontier node with no item a cardless sheet", () => {
  const session = compose({ target: "move" });
  assert.equal(session.sheetByNode.scope.kind, "cardless");
});

test("composeStudySession names a locked node's unmet prerequisites and excludes the uncertain edge", () => {
  const session = compose({ target: "move" });
  const move = session.sheetByNode.move;
  assert.equal(move.kind, "locked");
  // move's certain prerequisite is ownership; the uncertain borrow edge is excluded.
  assert.deepEqual(move.kind === "locked" && move.unmetPrerequisiteLabels, ["Ownership"]);
});

test("composeStudySession opens a mastered node as a cardless review carrying its verdict", () => {
  // Mark scope known so its closure (just scope) masters it; target ownership keeps scope visible.
  const session = compose({ target: "ownership", verdicts: [{ learnerStateRef: "L1", derivedNodeId: "scope", verdict: "known" }] });
  const scope = session.sheetByNode.scope;
  assert.equal(scope.kind, "mastered_review");
  assert.equal(scope.kind === "mastered_review" && scope.verdict, "known");
});

test("selectScopedFrontierTarget picks the hardest frontier node within the goal cone, tie-broken by id", () => {
  const classification: AdaptedNodeClassification = {
    stateByNode: { scope: "mastered", ownership: "frontier", move: "locked", borrow: "frontier" },
    selectedFrontierTarget: "ownership"
  };
  const difficulties = ["scope", "ownership", "move", "borrow"].map((id) => ({ derivedNodeId: id, score: difficultyByNode[id] }));
  // Goal = move; scope cone = {scope, ownership, move}. borrow is frontier but OUTSIDE the cone.
  assert.equal(selectScopedFrontierTarget({ targetNodeId: "move", prerequisiteEdges: detail().edges, classification, difficulties }), "ownership");
});

test("selectScopedFrontierTarget returns null when the goal cone has no frontier node", () => {
  const done: AdaptedNodeClassification = { stateByNode: { scope: "mastered", ownership: "mastered", move: "mastered" }, selectedFrontierTarget: null };
  assert.equal(selectScopedFrontierTarget({ targetNodeId: "move", prerequisiteEdges: detail().edges, classification: done, difficulties: [] }), null);
});

test("composeStudySession marks a DAG-root goal as a foundational root", () => {
  assert.equal(compose({ target: "scope" }).isFoundationalRoot, true);
  assert.equal(compose({ target: "move" }).isFoundationalRoot, false);
});

test("composeStudySession prunes the known closure, excludes the goal from the hide list even when known, and is ordering-independent", () => {
  const verdicts: CalibrationVerdict[] = [{ learnerStateRef: "L1", derivedNodeId: "ownership", verdict: "known" }];
  const session = compose({ target: "move", verdicts });
  // Marking ownership known prunes its prerequisite closure (scope); both are hidden, the goal (move) is not.
  assert.deepEqual([...session.adaptedHiddenNodeIds].sort(), ["ownership", "scope"]);
  // When the goal itself is marked known it stays visible.
  const goalKnown = compose({ target: "ownership", verdicts });
  assert.equal(goalKnown.adaptedHiddenNodeIds.includes("ownership"), false);
  assert.equal(goalKnown.adaptedHiddenNodeIds.includes("scope"), true);
});

test("composeStudySession surfaces calibration↔graded coexistence rather than resolving it", () => {
  const session = compose({
    target: "move",
    verdicts: [{ learnerStateRef: "L1", derivedNodeId: "ownership", verdict: "known" }],
    rows: [graded("ownership", "incorrect", 1)]
  });
  assert.equal(session.coexistence.length, 1);
  assert.equal(session.coexistence[0].derivedNodeId, "ownership");
  assert.equal(session.coexistence[0].label, "Ownership");
});

test("unmetPrerequisites returns only direct, non-mastered prerequisites, excluding uncertain edges", () => {
  const classification: AdaptedNodeClassification = {
    stateByNode: { scope: "mastered", ownership: "frontier", move: "locked", borrow: "frontier" },
    selectedFrontierTarget: "ownership"
  };
  assert.deepEqual(unmetPrerequisites("move", detail().edges, classification), ["ownership"]);
  assert.deepEqual(unmetPrerequisites("ownership", detail().edges, classification), []);
});

test("adaptedHiddenNodeIds returns the known closure minus the goal target", () => {
  assert.deepEqual(adaptedHiddenNodeIds(new Set(["scope", "ownership", "move"]), "move"), ["scope", "ownership"]);
  assert.deepEqual(adaptedHiddenNodeIds(new Set(["scope", "ownership"]), "move"), ["scope", "ownership"]);
  assert.deepEqual(adaptedHiddenNodeIds(new Set(), "move"), []);
});

test("the study-item mapper dispatches on item type (KTD4 extensibility seam)", () => {
  const view = studyItemToView(optionItem("scope"));
  assert.equal(view.kind, "option_select");
  assert.equal(studyItemViewToSheet(view).kind, "option_select");
});

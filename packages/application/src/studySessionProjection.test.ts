import assert from "node:assert/strict";
import { test } from "node:test";
import type { CalibrationVerdict, ConceptLesson, LessonAbsentNode, MatchingItem, ResponseLogRow, StudyItem } from "@lrnki/domain-core";
import type { DerivedGraphDetail } from "@lrnki/ports";
import {
  adaptedHiddenNodeIds,
  composeStudySession,
  conceptLessonToView,
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
    explanation: "The correct option follows from the grounded lesson.",
    options: [
      { optionId: `o-${derivedNodeId}-2`, text: "Two", isCorrect: false, provenance: "generated" },
      { optionId: `o-${derivedNodeId}-1`, text: "One", isCorrect: true, provenance: "source" }
    ]
  };
}

function impostorItem(derivedNodeId: string): StudyItem {
  const sourceCitation = { provenance: "source" as const, sourceResourceId: "r", sourceBlockId: "b", evidenceQuote: "q", matchKind: "exact" as const };
  return {
    studyItemId: `imp-${derivedNodeId}`,
    graphVersionId: "g",
    enrichmentId: "e",
    derivedNodeId,
    groundingProvenance: "source_cep",
    generatingModel: "deepseek",
    configHash: "cfg",
    itemType: "impostor",
    question: `Spot the lie about ${derivedNodeId}`,
    statements: [
      { statementId: `s-${derivedNodeId}-2`, ordinal: 0, text: "Truth A", isImpostor: false, provenance: "source", citation: sourceCitation },
      { statementId: `s-${derivedNodeId}-1`, ordinal: 1, text: "Truth B", isImpostor: false, provenance: "source", citation: sourceCitation },
      { statementId: `s-${derivedNodeId}-3`, ordinal: 2, text: "Truth C", isImpostor: false, provenance: "source", citation: sourceCitation },
      {
        statementId: `s-${derivedNodeId}-4`,
        ordinal: 3,
        text: "The planted lie",
        isImpostor: true,
        provenance: "generated",
        reveal: "The fourth statement is false; it is actually true of Borrowing.",
        lieSource: "sibling",
        siblingLabel: "Borrowing"
      }
    ]
  };
}

function matchingItem(derivedNodeId: string): MatchingItem {
  const citation = { provenance: "generated" as const, derivedNodeId, passageText: "Generated grounding for a matching pair." };
  return {
    studyItemId: `match-${derivedNodeId}`,
    graphVersionId: "g",
    enrichmentId: "e",
    derivedNodeId,
    groundingProvenance: "generated",
    generatingModel: "deepseek",
    configHash: "cfg",
    itemType: "matching",
    question: `Match pairs for ${derivedNodeId}`,
    pairs: [
      { pairId: `p-${derivedNodeId}-2`, matchId: `m-${derivedNodeId}-3`, promptText: "Second prompt", matchText: "Third match", citation },
      { pairId: `p-${derivedNodeId}-1`, matchId: `m-${derivedNodeId}-1`, promptText: "First prompt", matchText: "First match", citation },
      { pairId: `p-${derivedNodeId}-3`, matchId: `m-${derivedNodeId}-2`, promptText: "Third prompt", matchText: "Second match", citation }
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

function compose(args: { target: string; studyItems?: StudyItem[]; rows?: ResponseLogRow[]; verdicts?: CalibrationVerdict[]; lessons?: ConceptLesson[]; lessonAbsent?: LessonAbsentNode[] }) {
  return composeStudySession({
    enrichmentId: "e",
    learnerStateRef: "L1",
    targetDerivedNodeId: args.target,
    detail: detail(),
    studyItems: args.studyItems ?? [],
    rows: args.rows ?? [],
    verdicts: args.verdicts ?? [],
    lessons: args.lessons,
    lessonAbsent: args.lessonAbsent
  });
}

function lessonFor(derivedNodeId: string): ConceptLesson {
  return {
    derivedNodeId, graphVersionId: "g", enrichmentId: "e", generatingModel: "deepseek", configHash: "cfg",
    canonicalLabel: labelByNode[derivedNodeId],
    sections: [
      { kind: "gist", text: "A short gist.", groundingProvenance: "generated" },
      { kind: "definition", text: "A grounded definition.", groundingProvenance: "source_cep", citation: { provenance: "source", sourceResourceId: "r", sourceBlockId: "b", evidenceQuote: "A grounded definition.", matchKind: "exact" } },
      { kind: "applications", text: "Connects to neighbors.", groundingProvenance: "generated" }
    ]
  };
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

test("composeStudySession rides down an unpruned statefulPath scoped to the target and trusted ancestors", () => {
  const session = compose({ target: "move", verdicts: [{ learnerStateRef: "L1", derivedNodeId: "scope", verdict: "known" }] });
  assert.deepEqual(session.statefulPath.map((step) => step.derivedNodeId), ["scope", "ownership", "move"]);
  assert.equal(session.statefulPath.find((step) => step.derivedNodeId === "scope")?.state, session.classification.stateByNode.scope);
  assert.equal(session.statefulPath.find((step) => step.derivedNodeId === "move")?.isTarget, true);
  assert.equal(session.statefulPath.some((step) => step.derivedNodeId === "borrow"), false, "uncertain ancestors are excluded from scope");
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

test("composeStudySession exposes the latest graded outcome per study item", () => {
  const session = compose({
    target: "move",
    studyItems: [optionItem("scope"), impostorItem("scope")],
    rows: [
      { ...graded("scope", "correct", 1), studyItemId: "os-scope" },
      { ...graded("scope", "incorrect", 2), studyItemId: "os-scope" },
      { ...graded("scope", "correct", 3), studyItemId: "imp-scope" }
    ]
  });
  assert.deepEqual(session.latestOutcomeByStudyItemId, {
    "imp-scope": "correct",
    "os-scope": "incorrect"
  });
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

test("studyItemToView maps an impostor item to a view exposing statements, reveal, lieSource, siblingLabel", () => {
  const view = studyItemToView(impostorItem("scope"));
  assert.equal(view.kind, "impostor");
  if (view.kind !== "impostor") return;
  assert.equal(view.item.statements.length, 4);
  // statements sorted by id (not always-last impostor): the impostor sorts to its id position.
  assert.deepEqual(view.item.statements.map((s) => s.statementId), ["s-scope-1", "s-scope-2", "s-scope-3", "s-scope-4"]);
  assert.equal(view.item.reveal, "The fourth statement is false; it is actually true of Borrowing.");
  assert.equal(view.item.lieSource, "sibling");
  assert.equal(view.item.siblingLabel, "Borrowing");
  assert.equal(studyItemViewToSheet(view).kind, "impostor");
});

test("studyItemToView maps matching into separate keyless prompt and match columns", () => {
  const view = studyItemToView(matchingItem("scope"));
  assert.equal(view.kind, "matching");
  if (view.kind !== "matching") return;
  assert.deepEqual(view.item.prompts.map((p) => p.promptId), ["p-scope-1", "p-scope-2", "p-scope-3"]);
  assert.deepEqual(view.item.matches.map((m) => m.matchId), ["m-scope-1", "m-scope-2", "m-scope-3"]);
  assert.equal("pairId" in view.item.matches[0], false);
  assert.equal("matchId" in view.item.prompts[0], false);
  assert.equal(studyItemViewToSheet(view).kind, "matching");
});

test("study item views do not serialize keyed answers to the learner client (AE6)", () => {
  const optionView = studyItemToView(optionItem("scope"));
  assert.equal(optionView.kind, "option_select");
  if (optionView.kind === "option_select") {
    assert.equal("isCorrect" in optionView.item.options[0], false);
  }

  const impostorView = studyItemToView(impostorItem("scope"));
  assert.equal(impostorView.kind, "impostor");
  if (impostorView.kind === "impostor") {
    assert.equal("isImpostor" in impostorView.item.statements[0], false);
  }

  const matchingView = studyItemToView(matchingItem("scope"));
  assert.equal(matchingView.kind, "matching");
  if (matchingView.kind === "matching") {
    assert.equal("pairId" in matchingView.item.matches[0], false);
    assert.equal("matchId" in matchingView.item.prompts[0], false);
  }
});

test("studySegmentsByNode lists a node's segments in canonical order (option_select before matching before impostor)", () => {
  const session = compose({ target: "move", studyItems: [impostorItem("scope"), matchingItem("scope"), optionItem("scope")] });
  assert.deepEqual(session.studySegmentsByNode.scope.map((segment) => segment.kind), ["option_select", "matching", "impostor"]);
  // The node-level sheet content resolves to the FIRST segment (option_select) for the badge.
  assert.equal(session.sheetByNode.scope.kind, "option_select");
});

test("a node with only an impostor lists one segment and gates to an impostor sheet", () => {
  const session = compose({ target: "move", studyItems: [impostorItem("scope")] });
  assert.deepEqual(session.studySegmentsByNode.scope.map((segment) => segment.kind), ["impostor"]);
  assert.equal(session.sheetByNode.scope.kind, "impostor");
});

test("composeStudySession rides each node's lesson down into lessonByNode with honest provenance", () => {
  const session = compose({ target: "ownership", lessons: [lessonFor("scope")] });
  const lesson = session.lessonByNode["scope"];
  assert.ok(lesson);
  assert.equal(lesson.sections.find((s) => s.kind === "definition")?.isSourceCited, true);
  assert.equal(lesson.sections.find((s) => s.kind === "gist")?.isSourceCited, false);
  assert.equal(session.lessonByNode["ownership"], undefined);
});

test("composeStudySession surfaces lesson-absent nodes with their label and reason, sorted", () => {
  const session = compose({ target: "ownership", lessonAbsent: [
    { derivedNodeId: "move", canonicalLabel: "Move semantics", reason: "no usable grounding passages" },
    { derivedNodeId: "scope", canonicalLabel: "Variable scope", reason: "lesson did not meet the minimum" }
  ] });
  assert.deepEqual(session.lessonAbsent.map((a) => a.label), ["Move semantics", "Variable scope"]);
  assert.match(session.lessonAbsent[1].reason, /minimum/);
});

test("conceptLessonToView badges source vs generated sections from authoritative provenance", () => {
  const view = conceptLessonToView(lessonFor("scope"));
  assert.deepEqual(view.sections.map((s) => s.isSourceCited), [false, true, false]);
});

// U7/R10: the Study Session projection renders over an ANCHOR-LESS synthetic layer with no
// new primitive. A synthetic detail carries only enrichment/synthetic_primary nodes and a
// null version; target resolution and locked/frontier gating key on derivedNodeId, so the
// session composes identically to a source-grounded layer.
function syntheticDetail(): DerivedGraphDetail {
  const base = detail();
  return {
    ...base,
    summary: { ...base.summary, graphVersionId: null },
    nodes: base.nodes.map((n) => ({ ...n, nodeKind: "enrichment", groundingOrigin: "llm_grounded", role: "synthetic_primary" }))
  };
}

test("composeStudySession renders over an anchor-less synthetic layer, resolving the target and gating by derivedNodeId (R10)", () => {
  const session = composeStudySession({
    enrichmentId: "e",
    learnerStateRef: "L1",
    targetDerivedNodeId: "move",
    detail: syntheticDetail(),
    studyItems: [optionItem("scope")],
    rows: [],
    verdicts: []
  });
  // The synthetic target resolves and the DAG gates: scope is the frontier, move stays locked
  // behind its certain prerequisite (ownership); the uncertain edge is excluded — identical to
  // the source-grounded projection, with no anchor in the layer.
  assert.equal(session.classification.selectedFrontierTarget, "scope");
  assert.equal(session.sheetByNode.scope.kind, "option_select");
  const move = session.sheetByNode.move;
  assert.equal(move.kind, "locked");
  assert.deepEqual(move.kind === "locked" && move.unmetPrerequisiteLabels, ["Ownership"]);
});

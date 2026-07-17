import assert from "node:assert/strict";
import { test } from "node:test";
import type { CalibrationVerdict, ConceptLesson, LessonAbsentNode, MatchingItem, NeutralResponseLogRow, ResponseLogRow, ScaffoldDetour, StudyItem } from "@lrnki/domain-core";
import type { DerivedGraphDetail, ScaffoldReferenceActivity } from "@lrnki/ports";
import {
  adaptedHiddenNodeIds,
  composeStudySession,
  conceptLessonToView,
  studyItemToView,
  studyItemViewToSheet,
  unmetPrerequisites
} from "./studySessionProjection";
import { type AdaptedNodeClassification } from "./adaptivePathProjection";
import type { RecallScopeStatus } from "./recallChallenge";

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

function optionItem(derivedNodeId: string): Extract<StudyItem, { itemType: "option_select" }> {
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
    explorableTerms: [],
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
    explorableTerms: [],
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
    explorableTerms: [],
    pairs: [
      { pairId: `p-${derivedNodeId}-2`, matchId: `m-${derivedNodeId}-3`, promptText: "Second prompt", matchText: "Third match", citation },
      { pairId: `p-${derivedNodeId}-1`, matchId: `m-${derivedNodeId}-1`, promptText: "First prompt", matchText: "First match", citation },
      { pairId: `p-${derivedNodeId}-3`, matchId: `m-${derivedNodeId}-2`, promptText: "Third prompt", matchText: "Second match", citation }
    ]
  };
}

function graded(derivedNodeId: string, outcome: ResponseLogRow["judgedOutcome"], attemptSeq: number): NeutralResponseLogRow {
  return {
    responseId: `r-${derivedNodeId}-${attemptSeq}`,
    learnerStateRef: "L1",
    scope: "neutral",
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

function compose(args: { detail?: DerivedGraphDetail; studyItems?: StudyItem[]; rows?: ResponseLogRow[]; verdicts?: CalibrationVerdict[]; lessons?: ConceptLesson[]; lessonReads?: string[]; lessonAbsent?: LessonAbsentNode[]; detours?: ScaffoldDetour[]; referenceActivities?: ScaffoldReferenceActivity[]; recallScopes?: RecallScopeStatus[] } = {}) {
  const referenceActivities = args.referenceActivities ?? (args.detours ?? []).flatMap((detour) => detour.steps.flatMap((step): ScaffoldReferenceActivity[] => {
    if (step.kind !== "reference") return [];
    return [{
      scaffoldStepId: step.scaffoldStepId,
      detourId: detour.detourId,
      referencedDerivedNodeId: step.referencedDerivedNodeId,
      lesson: { ...lessonFor(step.referencedDerivedNodeId), conceptLessonId: step.referencedConceptLessonId },
      item: { ...optionItem(step.referencedDerivedNodeId), studyItemId: step.referencedStudyItemId }
    }];
  }));
  return composeStudySession({
    enrichmentId: "e",
    learnerStateRef: "L1",
    detail: args.detail ?? detail(),
    studyItems: args.studyItems ?? [],
    rows: args.rows ?? [],
    verdicts: args.verdicts ?? [],
    lessons: args.lessons,
    lessonReads: args.lessonReads,
    lessonAbsent: args.lessonAbsent,
    detours: args.detours,
    referenceActivities,
    recallScopes: args.recallScopes
  });
}

function lessonFor(derivedNodeId: string): ConceptLesson {
  return {
    conceptLessonId: `lesson-${derivedNodeId}`,
    derivedNodeId, graphVersionId: "g", enrichmentId: "e", generatingModel: "deepseek", configHash: "cfg",
    canonicalLabel: labelByNode[derivedNodeId],
    explorableTerms: [],
    sections: [
      { kind: "gist", text: "A short gist.", groundingProvenance: "generated" },
      { kind: "definition", text: "A grounded definition.", groundingProvenance: "source_cep", citation: { provenance: "source", sourceResourceId: "r", sourceBlockId: "b", evidenceQuote: "A grounded definition.", matchKind: "exact" } },
      { kind: "applications", text: "Connects to neighbors.", items: ["First use.", "Second use."], groundingProvenance: "generated" }
    ]
  };
}

test("composeStudySession gates a frontier node with an option-select item to an option_select sheet (options sorted by id)", () => {
  const session = compose({ studyItems: [optionItem("scope")] });
  // No verdicts/rows: scope and borrow are the ready frontier nodes; the whole-layer ring
  // marks the HARDEST ready node, which is borrow (0.9 > scope 0.2).
  assert.equal(session.classification.selectedFrontierTarget, "borrow");
  assert.equal(session.classification.stateByNode.scope, "frontier");
  const sheet = session.sheetByNode.scope;
  assert.equal(sheet.kind, "option_select");
  assert.equal(sheet.kind === "option_select" && sheet.item.options.map((o) => o.optionId).join(","), "o-scope-1,o-scope-2");
});

test("composeStudySession gives a frontier node with no item a cardless sheet", () => {
  const session = compose();
  assert.equal(session.sheetByNode.scope.kind, "cardless");
});

test("composeStudySession masters itemless lesson nodes only after the lesson read", () => {
  const unread = compose({ lessons: [lessonFor("scope")] });
  assert.equal(unread.classification.stateByNode.scope, "frontier");
  assert.equal(unread.sheetByNode.scope.kind, "cardless");

  const read = compose({ lessons: [lessonFor("scope")], lessonReads: ["scope"] });
  assert.equal(read.classification.stateByNode.scope, "mastered");
});

test("composeStudySession masters explicit no-lesson no-item absences so they do not block", () => {
  const session = compose({ lessonAbsent: [{ derivedNodeId: "scope", canonicalLabel: "Variable scope", reason: "no usable grounding passages" }] });
  assert.equal(session.classification.stateByNode.scope, "mastered");
  assert.equal(session.classification.stateByNode.ownership, "frontier");
});

test("composeStudySession names a locked node's unmet prerequisites and excludes the uncertain edge", () => {
  const session = compose();
  const move = session.sheetByNode.move;
  assert.equal(move.kind, "locked");
  // move's certain prerequisite is ownership; the uncertain borrow edge is excluded.
  assert.deepEqual(move.kind === "locked" && move.unmetPrerequisiteLabels, ["Ownership"]);
});

test("composeStudySession opens a mastered node as a cardless review carrying its verdict", () => {
  // Mark scope known so its closure (just scope) masters it; target ownership keeps scope visible.
  const session = compose({ verdicts: [{ learnerStateRef: "L1", derivedNodeId: "scope", verdict: "known" }] });
  const scope = session.sheetByNode.scope;
  assert.equal(scope.kind, "mastered_review");
  assert.equal(scope.kind === "mastered_review" && scope.verdict, "known");
});

test("composeStudySession treats a learn verdict as cleared calibration, not known closure mastery", () => {
  const session = compose({ verdicts: [{ learnerStateRef: "L1", derivedNodeId: "scope", verdict: "learn" }] });
  assert.equal(session.classification.stateByNode.scope, "frontier");
  assert.deepEqual(session.adaptedHiddenNodeIds, []);
  assert.equal(session.sheetByNode.scope.kind, "cardless");
});

test("composeStudySession rides down a layer-wide sectioned expedition path with the derived summit", () => {
  const session = compose({ verdicts: [{ learnerStateRef: "L1", derivedNodeId: "scope", verdict: "known" }] });
  // The whole floored layer is the trail: move's cone (scope, ownership, move) then borrow's
  // singleton section. Every non-floored node appears exactly once.
  assert.deepEqual(session.expeditionPath.map((step) => step.derivedNodeId).sort(), ["borrow", "move", "ownership", "scope"]);
  assert.equal(session.expeditionPath.find((step) => step.derivedNodeId === "scope")?.state, session.classification.stateByNode.scope);
  // Summit is the last section's milestone — the hardest terminal, borrow.
  assert.equal(session.target.derivedNodeId, "borrow");
  assert.equal(session.expeditionPath.find((step) => step.derivedNodeId === "borrow")?.isSummit, true);
  // Two milestone-anchored sections: move (easier cone) first, borrow second.
  assert.deepEqual(session.sections.map((section) => section.milestoneDerivedNodeId), ["move", "borrow"]);
});

test("composeStudySession prunes the known closure and keeps the derived summit visible even when known", () => {
  // Marking ownership known prunes its prerequisite closure (scope); both are hidden. The
  // derived summit (borrow) is not in the closure, so it is untouched.
  const session = compose({ verdicts: [{ learnerStateRef: "L1", derivedNodeId: "ownership", verdict: "known" }] });
  assert.deepEqual([...session.adaptedHiddenNodeIds].sort(), ["ownership", "scope"]);
  // Marking the derived summit (borrow) known keeps it VISIBLE — the summit is exempt from the
  // hide list so the trail always shows where it ends.
  const summitKnown = compose({ verdicts: [{ learnerStateRef: "L1", derivedNodeId: "borrow", verdict: "known" }] });
  assert.equal(summitKnown.target.derivedNodeId, "borrow");
  assert.equal(summitKnown.adaptedHiddenNodeIds.includes("borrow"), false);
});

test("composeStudySession surfaces calibration↔graded coexistence rather than resolving it", () => {
  const session = compose({
    verdicts: [{ learnerStateRef: "L1", derivedNodeId: "ownership", verdict: "known" }],
    rows: [graded("ownership", "incorrect", 1)]
  });
  assert.equal(session.coexistence.length, 1);
  assert.equal(session.coexistence[0].derivedNodeId, "ownership");
  assert.equal(session.coexistence[0].label, "Ownership");
});

test("composeStudySession exposes the latest graded outcome per study item", () => {
  const session = compose({
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

test("Covers AE1: a lesson read + one of three activities correct leaves the node frontier and its dependents locked", () => {
  const session = compose({
    studyItems: [optionItem("scope"), impostorItem("scope")],
    lessons: [lessonFor("scope")],
    lessonReads: ["scope"],
    // Only the option-select is answered correctly; the impostor stop is untouched.
    rows: [{ ...graded("scope", "correct", 1), studyItemId: "os-scope" }]
  });
  assert.equal(session.classification.stateByNode.scope, "frontier", "one correct activity does not master a multi-segment node");
  assert.equal(session.classification.stateByNode.ownership, "locked", "dependents stay locked");
});

test("Covers AE2: a lesson read + every activity latest-correct masters the node and unlocks dependents", () => {
  const session = compose({
    studyItems: [optionItem("scope"), impostorItem("scope")],
    lessons: [lessonFor("scope")],
    lessonReads: ["scope"],
    rows: [
      { ...graded("scope", "correct", 1), studyItemId: "os-scope" },
      { ...graded("scope", "correct", 2), studyItemId: "imp-scope" }
    ]
  });
  assert.equal(session.classification.stateByNode.scope, "mastered");
  assert.equal(session.classification.stateByNode.ownership, "frontier", "the dependent unlocks");
});

test("all activities correct but the lesson unread does not master the node", () => {
  const session = compose({
    studyItems: [optionItem("scope")],
    lessons: [lessonFor("scope")],
    // lessonReads omitted: the lesson is unread.
    rows: [{ ...graded("scope", "correct", 1), studyItemId: "os-scope" }]
  });
  assert.equal(session.classification.stateByNode.scope, "frontier", "an unread lesson blocks completion even with all activities correct");
});

test("a matching partial outcome does not complete its node", () => {
  const session = compose({
    studyItems: [matchingItem("scope")],
    rows: [{ ...graded("scope", "partial", 1), studyItemId: "match-scope" }]
  });
  assert.equal(session.classification.stateByNode.scope, "frontier", "partial is not latest-correct");
});

test("a latest-incorrect after an earlier correct reopens the stop and demotes completion", () => {
  const mastered = compose({
    studyItems: [optionItem("scope")],
    rows: [{ ...graded("scope", "correct", 1), studyItemId: "os-scope" }]
  });
  assert.equal(mastered.classification.stateByNode.scope, "mastered", "single-activity node with no lesson masters on the correct answer");
  const reopened = compose({
    studyItems: [optionItem("scope")],
    rows: [
      { ...graded("scope", "correct", 1), studyItemId: "os-scope" },
      { ...graded("scope", "incorrect", 2), studyItemId: "os-scope" }
    ]
  });
  assert.equal(reopened.classification.stateByNode.scope, "frontier", "the later incorrect reopens the stop");
});

test("unmetPrerequisites returns only direct, non-mastered prerequisites, excluding uncertain edges", () => {
  const classification: AdaptedNodeClassification = {
    stateByNode: { scope: "mastered", ownership: "frontier", move: "locked", borrow: "frontier" },
    selectedFrontierTarget: "ownership"
  };
  assert.deepEqual(unmetPrerequisites("move", detail().edges, classification), ["ownership"]);
  assert.deepEqual(unmetPrerequisites("ownership", detail().edges, classification), []);
});

test("adaptedHiddenNodeIds returns the known closure minus the derived summit", () => {
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
  const session = compose({ studyItems: [impostorItem("scope"), matchingItem("scope"), optionItem("scope")] });
  assert.deepEqual(session.studySegmentsByNode.scope.map((segment) => segment.kind), ["option_select", "matching", "impostor"]);
  // The node-level sheet content resolves to the FIRST segment (option_select) for the badge.
  assert.equal(session.sheetByNode.scope.kind, "option_select");
});

test("a node with only an impostor lists one segment and gates to an impostor sheet", () => {
  const session = compose({ studyItems: [impostorItem("scope")] });
  assert.deepEqual(session.studySegmentsByNode.scope.map((segment) => segment.kind), ["impostor"]);
  assert.equal(session.sheetByNode.scope.kind, "impostor");
});

test("composeStudySession rides each node's lesson down into lessonByNode with honest provenance", () => {
  const session = compose({ lessons: [lessonFor("scope")] });
  const lesson = session.lessonByNode["scope"];
  assert.ok(lesson);
  assert.equal(lesson.sections.find((s) => s.kind === "definition")?.isSourceCited, true);
  assert.equal(lesson.sections.find((s) => s.kind === "gist")?.isSourceCited, false);
  assert.equal(session.lessonByNode["ownership"], undefined);
});

test("composeStudySession surfaces lesson-absent nodes with their label and reason, sorted", () => {
  const session = compose({ lessonAbsent: [
    { derivedNodeId: "move", canonicalLabel: "Move semantics", reason: "no usable grounding passages" },
    { derivedNodeId: "scope", canonicalLabel: "Variable scope", reason: "lesson did not meet the minimum" }
  ] });
  assert.deepEqual(session.lessonAbsent.map((a) => a.label), ["Move semantics", "Variable scope"]);
  assert.match(session.lessonAbsent[1].reason, /minimum/);
});

test("conceptLessonToView badges source vs generated sections from authoritative provenance", () => {
  const view = conceptLessonToView(lessonFor("scope"));
  assert.deepEqual(view.sections.map((s) => s.isSourceCited), [false, true, false]);
  assert.deepEqual(view.sections.find((section) => section.kind === "applications")?.items, ["First use.", "Second use."]);
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

test("composeStudySession renders over an anchor-less synthetic layer, gating by derivedNodeId (R10)", () => {
  const session = composeStudySession({
    enrichmentId: "e",
    learnerStateRef: "L1",
    detail: syntheticDetail(),
    studyItems: [optionItem("scope")],
    rows: [],
    verdicts: []
  });
  // The synthetic layer sections identically to a source-grounded one: scope is a frontier,
  // move stays locked behind its certain prerequisite (ownership); the uncertain edge is
  // excluded; the whole-layer ring marks the hardest ready node (borrow). No anchor in the layer.
  assert.equal(session.classification.selectedFrontierTarget, "borrow");
  assert.equal(session.sheetByNode.scope.kind, "option_select");
  const move = session.sheetByNode.move;
  assert.equal(move.kind, "locked");
  assert.deepEqual(move.kind === "locked" && move.unmetPrerequisiteLabels, ["Ownership"]);
});

// --- Minimal trail-inclusion difficulty floor (plan 2026-07-05-002 U4, AE4) ---------

// The base fixture with banded confidence on each node: ownership is a CONFIDENT band-1
// node sitting between scope and move on the certain chain.
function bandedDetail(bands: Record<string, { band: number; contested: boolean }>): DerivedGraphDetail {
  const base = detail();
  return {
    ...base,
    nodes: base.nodes.map((node) => ({
      ...node,
      difficultyBand: bands[node.derivedNodeId]?.band ?? null,
      difficultyContested: bands[node.derivedNodeId]?.contested ?? null
    }))
  };
}

const floorBands = {
  scope: { band: 3, contested: false },
  ownership: { band: 1, contested: false },
  move: { band: 4, contested: false },
  borrow: { band: 4, contested: false }
};

test("a confident band-1 node between two stops disappears from the trail and its gating contracts (AE4)", () => {
  const session = composeStudySession({
    enrichmentId: "e",
    learnerStateRef: "L1",
    detail: bandedDetail(floorBands),
    studyItems: [optionItem("ownership"), optionItem("scope")],
    rows: [],
    verdicts: []
  });

  assert.deepEqual(session.flooredNodeIds, ["ownership"]);
  // No trail step and no activity segments for the floored node.
  assert.ok(!session.expeditionPath.some((step) => step.derivedNodeId === "ownership"));
  assert.equal(session.studySegmentsByNode.ownership, undefined);
  assert.equal(session.sheetByNode.ownership, undefined);
  // Gating survives by contraction: move is locked behind scope directly.
  const move = session.sheetByNode.move;
  assert.equal(move.kind, "locked");
  assert.deepEqual(move.kind === "locked" && move.unmetPrerequisiteLabels, ["Variable scope"]);
  // The full detail still rides down for the map render.
  assert.equal(session.detail.nodes.length, 4);
});

test("mastering the contracted prerequisite chain unlocks the dependent past the floored node (AE4)", () => {
  const session = composeStudySession({
    enrichmentId: "e",
    learnerStateRef: "L1",
    detail: bandedDetail(floorBands),
    studyItems: [],
    rows: [],
    verdicts: [{ learnerStateRef: "L1", derivedNodeId: "scope", verdict: "known" }]
  });
  assert.equal(session.classification.stateByNode.move, "frontier");
});

test("a confident band-1 terminal is floored like any other node (no target exemption)", () => {
  // borrow is a band-1 confident TERMINAL. With no learner-chosen target there is no exemption:
  // it is floored and anchors no section — the summit falls to the next-hardest terminal (move).
  const session = composeStudySession({
    enrichmentId: "e",
    learnerStateRef: "L1",
    detail: bandedDetail({ ...floorBands, borrow: { band: 1, contested: false } }),
    studyItems: [optionItem("scope")],
    rows: [],
    verdicts: []
  });
  assert.ok(session.flooredNodeIds.includes("borrow"));
  assert.ok(!session.expeditionPath.some((step) => step.derivedNodeId === "borrow"));
  assert.equal(session.sheetByNode.borrow, undefined);
});

test("contested and band-less nodes are never floored; a band-less detail is a no-op (fail-open)", () => {
  const contested = composeStudySession({
    enrichmentId: "e",
    learnerStateRef: "L1",
    detail: bandedDetail({ ...floorBands, ownership: { band: 1, contested: true } }),
    studyItems: [],
    rows: [],
    verdicts: []
  });
  assert.deepEqual(contested.flooredNodeIds, []);
  assert.ok(contested.expeditionPath.some((step) => step.derivedNodeId === "ownership"));

  const baseline = compose();
  const bandless = composeStudySession({
    enrichmentId: "e",
    learnerStateRef: "L1",
    detail: detail(),
    studyItems: [],
    rows: [],
    verdicts: []
  });
  assert.deepEqual(bandless.flooredNodeIds, []);
  assert.deepEqual(bandless.expeditionPath, baseline.expeditionPath);
  assert.deepEqual(Object.keys(bandless.sheetByNode).sort(), Object.keys(baseline.sheetByNode).sort());
});

// Plan 2026-07-12-002 U4: the projection composes learner-scoped detours from the same neutral
// evidence the trail uses, exposes them on the session, and sets the `generatingDetours` polling
// flag. composeScaffoldDetours owns the per-step/grouping policy (studySessionTrail.test.ts); this
// proves the integration seam and the flag.
function generatingDetour(parent: string, term: string): ScaffoldDetour {
  return { detourId: `d-${term}`, learnerStateRef: "L1", enrichmentId: "e", parentDerivedNodeId: parent, term, normalizedTerm: term.toLowerCase(), status: "generating", latestOperationId: "op", claimToken: "tok", steps: [] };
}

test("composeStudySession — a default session has no detours and does not ask the client to poll", () => {
  const session = compose();
  assert.deepEqual(session.detours, []);
  assert.equal(session.generatingDetours, false);
});

test("composeStudySession — a generating detour rides on the session and raises the polling flag", () => {
  const session = compose({ detours: [generatingDetour("ownership", "Borrow checker")] });
  assert.equal(session.detours.length, 1);
  assert.equal(session.detours[0].status, "generating");
  assert.equal(session.detours[0].parentDerivedNodeId, "ownership");
  assert.equal(session.generatingDetours, true);
});

test("composeStudySession — a ready reference detour completes in lockstep with the referenced node's neutral evidence", () => {
  // A reference step pointing at `scope`, whose lesson is read and option-select is latest-correct,
  // reads complete; the parent (`move`) is not mastered, so it stays an active (expandable) detour.
  const detour: ScaffoldDetour = {
    detourId: "d-ref", learnerStateRef: "L1", enrichmentId: "e", parentDerivedNodeId: "move", term: "Scope", normalizedTerm: "scope",
    status: "ready", latestOperationId: null, claimToken: null,
    steps: [{ scaffoldStepId: "s-1", ordinal: 0, kind: "reference", referencedDerivedNodeId: "scope", referencedConceptLessonId: "lesson-scope", referencedStudyItemId: "os-scope" }]
  };
  const session = compose({
    studyItems: [optionItem("scope")],
    lessons: [lessonFor("scope")],
    lessonReads: ["scope"],
    rows: [graded("scope", "correct", 1)],
    detours: [detour]
  });
  const composed = session.detours[0];
  assert.equal(composed.status, "ready");
  assert.equal(composed.complete, true, "reference step complete from the referenced node's neutral evidence");
  assert.equal(composed.completedStepCount, 1);
  assert.equal(composed.firstIncompleteStepId, null);
  assert.equal(session.generatingDetours, false);
});

// --- Explorable Term support state (plan 2026-07-13-002 U2, KTD1/KTD2; R3, AE3/AE8) ---------

function readyDetour(parent: string, term: string): ScaffoldDetour {
  return {
    detourId: `d-${parent}-${term}`, learnerStateRef: "L1", enrichmentId: "e", parentDerivedNodeId: parent,
    term, normalizedTerm: term.toLowerCase(), status: "ready", latestOperationId: null, claimToken: null,
    steps: [{ scaffoldStepId: `s-${term}`, ordinal: 0, kind: "reference", referencedDerivedNodeId: "scope", referencedConceptLessonId: "lesson-scope", referencedStudyItemId: "os-scope" }]
  };
}

function itemWithTerms(derivedNodeId: string, terms: string[]): StudyItem {
  return { ...optionItem(derivedNodeId), explorableTerms: terms };
}

function lessonWithTerms(derivedNodeId: string, terms: string[]): ConceptLesson {
  const lesson = lessonFor(derivedNodeId);
  return { ...lesson, explorableTerms: terms.map((term) => ({ term, sectionKind: "gist" as const })) };
}

test("AE3 — an active same-parent detour attaches its state to lesson AND item term views after normalization; other parents/terms stay available", () => {
  const session = compose({
    studyItems: [itemWithTerms("ownership", ["Borrow Checker", "heap allocation"]), itemWithTerms("move", ["Borrow Checker"])],
    lessons: [lessonWithTerms("ownership", ["Borrow Checker"])],
    // The detour's stored term differs in case; correlation is on the NORMALIZED term.
    detours: [readyDetour("ownership", "borrow checker")]
  });
  const itemTerms = session.studySegmentsByNode.ownership[0].item.explorableTerms;
  assert.equal(itemTerms[0].term, "Borrow Checker");
  assert.equal(itemTerms[0].sectionKind, null);
  assert.equal(itemTerms[0].support.kind, "ready");
  // A different normalized term under the same parent stays available.
  assert.deepEqual(itemTerms[1].support, { kind: "available" });
  // The SAME normalized term under a DIFFERENT parent stays available.
  assert.deepEqual(session.studySegmentsByNode.move[0].item.explorableTerms[0].support, { kind: "available" });
  // The lesson view carries the same support state, keeping its section anchor.
  const lessonTerms = session.lessonByNode.ownership.explorableTerms;
  assert.equal(lessonTerms[0].sectionKind, "gist");
  assert.equal(lessonTerms[0].support.kind, "ready");
});

test("support state projects each lifecycle state deterministically (generating carries phase; ready carries completeness)", () => {
  const generating: ScaffoldDetour = { ...readyDetour("ownership", "alpha"), status: "generating", steps: [], latestOperationId: "op", claimToken: "tok" };
  const failed: ScaffoldDetour = { ...readyDetour("ownership", "beta"), detourId: "d-beta", status: "failed", steps: [] };
  const session = compose({
    studyItems: [itemWithTerms("ownership", ["alpha", "beta", "gamma"]), optionItem("scope")],
    lessons: [lessonFor("scope")],
    lessonReads: ["scope"],
    rows: [graded("scope", "correct", 1)],
    detours: [failed, generating, readyDetour("ownership", "gamma")]
  });
  const terms = session.studySegmentsByNode.ownership[0].item.explorableTerms;
  assert.deepEqual(terms[0].support, { kind: "generating", detourId: "d-ownership-alpha", phase: "preparing" });
  assert.deepEqual(terms[1].support, { kind: "failed", detourId: "d-beta" });
  // scope's lesson is read and its option-select latest-correct ⇒ reference step complete ⇒ ready+complete.
  assert.deepEqual(terms[2].support, { kind: "ready", detourId: "d-ownership-gamma", complete: true });
});

test("AE4 — a hidden detour is absent from the active read, so its term projects available again", () => {
  // Hidden detours never reach `input.detours` (the store's active read excludes them); the
  // projection therefore falls back to `available`, which the idempotent request restores.
  const session = compose({ studyItems: [itemWithTerms("ownership", ["borrow checker"])], detours: [] });
  assert.deepEqual(session.studySegmentsByNode.ownership[0].item.explorableTerms[0].support, { kind: "available" });
});

// --- Reference-step destination (plan 2026-07-13-002 U2, KTD8; R15, AE7) --------------------

test("a current playable reference projects its concrete first-incomplete checkpoint, then capstone review", () => {
  const detour = readyDetour("move", "scope");
  const destination = (session: ReturnType<typeof compose>) => {
    const step = session.detours[0].steps[0];
    assert.equal(step.kind, "reference");
    return step.kind === "reference" ? step.destination : null;
  };
  assert.deepEqual(
    destination(compose({ studyItems: [optionItem("scope")], lessons: [lessonFor("scope")], detours: [detour] })),
    { kind: "checkpoint", stopId: "scope:theory:main" }
  );
  assert.deepEqual(
    destination(compose({ studyItems: [optionItem("scope")], lessons: [lessonFor("scope")], lessonReads: ["scope"], detours: [detour] })),
    { kind: "checkpoint", stopId: "scope:option_select:os-scope" }
  );
  assert.deepEqual(
    destination(compose({ studyItems: [optionItem("scope")], lessons: [lessonFor("scope")], lessonReads: ["scope"], rows: [graded("scope", "correct", 1)], detours: [detour] })),
    { kind: "checkpoint", stopId: "scope:capstone:main" }
  );
});

function referenceDetour(input: { referencedNodeId: string; lessonId: string; itemId: string; parentNodeId?: string }): ScaffoldDetour {
  return {
    detourId: `d-ref-${input.referencedNodeId}`,
    learnerStateRef: "L1",
    enrichmentId: "e",
    parentDerivedNodeId: input.parentNodeId ?? "move",
    term: labelByNode[input.referencedNodeId],
    normalizedTerm: labelByNode[input.referencedNodeId].toLowerCase(),
    status: "ready",
    latestOperationId: null,
    claimToken: null,
    steps: [{
      scaffoldStepId: `step-ref-${input.referencedNodeId}`,
      ordinal: 0,
      kind: "reference",
      referencedDerivedNodeId: input.referencedNodeId,
      referencedConceptLessonId: input.lessonId,
      referencedStudyItemId: input.itemId
    }]
  };
}

function neutralRow(input: { itemId: string; nodeId: string; outcome: "correct" | "incorrect"; attemptSeq: number }): NeutralResponseLogRow {
  return {
    ...graded(input.nodeId, input.outcome, input.attemptSeq),
    responseId: `r-${input.itemId}-${input.attemptSeq}`,
    studyItemId: input.itemId
  };
}

test("Study Session exposes current neutral reference identities without keys and keeps locked/floored state authoritative", () => {
  const lessons = [lessonFor("scope"), lessonFor("ownership")];
  const items = [optionItem("scope"), optionItem("ownership")];
  const locked = compose({ studyItems: items, lessons });
  assert.deepEqual(locked.neutralReferenceAssetsByNode, {
    scope: { conceptLessonId: "lesson-scope", studyItemId: "os-scope" },
    ownership: { conceptLessonId: "lesson-ownership", studyItemId: "os-ownership" }
  });
  assert.equal(locked.classification.stateByNode.scope, "frontier");
  assert.equal(locked.classification.stateByNode.ownership, "locked");

  const flooredDetail = detail();
  flooredDetail.nodes = flooredDetail.nodes.map((candidate) => candidate.derivedNodeId === "scope"
    ? { ...candidate, difficultyBand: 1, difficultyContested: false }
    : candidate);
  const floored = compose({ detail: flooredDetail, studyItems: items, lessons });
  assert.ok(floored.flooredNodeIds.includes("scope"));
  assert.equal(floored.classification.stateByNode.scope, undefined);
  assert.deepEqual(floored.neutralReferenceAssetsByNode.scope, { conceptLessonId: "lesson-scope", studyItemId: "os-scope" });
  assert.equal(JSON.stringify(locked).includes("isCorrect"), false);
});

test("floored, later-locked, and superseded references project pinned key-free support activities", () => {
  const flooredDetail = detail();
  flooredDetail.nodes = flooredDetail.nodes.map((candidate) => candidate.derivedNodeId === "scope"
    ? { ...candidate, difficultyBand: 1, difficultyContested: false }
    : candidate);
  const scopeRef = referenceDetour({ referencedNodeId: "scope", lessonId: "lesson-scope", itemId: "os-scope" });
  const floored = compose({
    detail: flooredDetail,
    studyItems: [optionItem("scope")],
    lessons: [lessonFor("scope")],
    detours: [scopeRef]
  });
  const flooredStep = floored.detours[0].steps[0];
  assert.equal(flooredStep.kind === "reference" && flooredStep.destination.kind, "support_activity");

  const ownershipRef = referenceDetour({ referencedNodeId: "ownership", lessonId: "lesson-ownership", itemId: "os-ownership" });
  const locked = compose({
    studyItems: [optionItem("ownership")],
    lessons: [lessonFor("ownership")],
    detours: [ownershipRef]
  });
  const lockedStep = locked.detours[0].steps[0];
  assert.equal(lockedStep.kind === "reference" && lockedStep.destination.kind, "support_activity");

  const oldLesson = { ...lessonFor("scope"), conceptLessonId: "lesson-scope-old" };
  const oldItem = { ...optionItem("scope"), studyItemId: "os-scope-old" };
  const supersededRef = referenceDetour({ referencedNodeId: "scope", lessonId: oldLesson.conceptLessonId, itemId: oldItem.studyItemId });
  const superseded = compose({
    studyItems: [optionItem("scope")],
    lessons: [lessonFor("scope")],
    detours: [supersededRef],
    referenceActivities: [{
      scaffoldStepId: supersededRef.steps[0].scaffoldStepId,
      detourId: supersededRef.detourId,
      referencedDerivedNodeId: "scope",
      lesson: oldLesson,
      item: oldItem
    }]
  });
  const supersededStep = superseded.detours[0].steps[0];
  assert.equal(supersededStep.kind === "reference" && supersededStep.destination.kind, "support_activity");
  assert.equal(JSON.stringify(supersededStep).includes("isCorrect"), false);
});

test("pinned reference completion follows only the pinned lesson/node and latest pinned item outcome", () => {
  const oldLesson = { ...lessonFor("scope"), conceptLessonId: "lesson-scope-old" };
  const oldItem = { ...optionItem("scope"), studyItemId: "os-scope-old" };
  const detour = referenceDetour({ referencedNodeId: "scope", lessonId: oldLesson.conceptLessonId, itemId: oldItem.studyItemId });
  const referenceActivities: ScaffoldReferenceActivity[] = [{
    scaffoldStepId: detour.steps[0].scaffoldStepId,
    detourId: detour.detourId,
    referencedDerivedNodeId: "scope",
    lesson: oldLesson,
    item: oldItem
  }];
  const base = {
    studyItems: [{ ...optionItem("scope"), studyItemId: "os-scope-new" }],
    lessons: [{ ...lessonFor("scope"), conceptLessonId: "lesson-scope-new" }],
    lessonReads: ["scope"],
    detours: [detour],
    referenceActivities
  };
  const passed = compose({ ...base, rows: [neutralRow({ itemId: oldItem.studyItemId, nodeId: "scope", outcome: "correct", attemptSeq: 1 })] });
  assert.equal(passed.detours[0].steps[0].complete, true);

  const reopened = compose({ ...base, rows: [
    neutralRow({ itemId: oldItem.studyItemId, nodeId: "scope", outcome: "correct", attemptSeq: 1 }),
    neutralRow({ itemId: oldItem.studyItemId, nodeId: "scope", outcome: "incorrect", attemptSeq: 2 }),
    neutralRow({ itemId: "os-scope-new", nodeId: "scope", outcome: "correct", attemptSeq: 3 })
  ] });
  assert.equal(reopened.detours[0].steps[0].complete, false);
});

test("serialized mixed reference fixture is key-free across current, floored, and superseded destinations", () => {
  const mixedDetail = detail();
  mixedDetail.nodes = mixedDetail.nodes.map((candidate) => candidate.derivedNodeId === "scope"
    ? { ...candidate, difficultyBand: 1, difficultyContested: false }
    : candidate);
  const current = referenceDetour({ referencedNodeId: "borrow", lessonId: "lesson-borrow", itemId: "os-borrow" });
  const floored = referenceDetour({ referencedNodeId: "scope", lessonId: "lesson-scope", itemId: "os-scope" });
  const oldLesson = { ...lessonFor("ownership"), conceptLessonId: "lesson-ownership-old" };
  const oldItem = { ...optionItem("ownership"), studyItemId: "os-ownership-old" };
  const superseded = referenceDetour({ referencedNodeId: "ownership", lessonId: oldLesson.conceptLessonId, itemId: oldItem.studyItemId });
  const referenceActivities: ScaffoldReferenceActivity[] = [
    { scaffoldStepId: current.steps[0].scaffoldStepId, detourId: current.detourId, referencedDerivedNodeId: "borrow", lesson: lessonFor("borrow"), item: optionItem("borrow") },
    { scaffoldStepId: floored.steps[0].scaffoldStepId, detourId: floored.detourId, referencedDerivedNodeId: "scope", lesson: lessonFor("scope"), item: optionItem("scope") },
    { scaffoldStepId: superseded.steps[0].scaffoldStepId, detourId: superseded.detourId, referencedDerivedNodeId: "ownership", lesson: oldLesson, item: oldItem }
  ];
  const session = compose({
    detail: mixedDetail,
    studyItems: [optionItem("borrow"), optionItem("scope"), optionItem("ownership")],
    lessons: [lessonFor("borrow"), lessonFor("scope"), lessonFor("ownership")],
    detours: [current, floored, superseded],
    referenceActivities
  });
  const destinations = Object.fromEntries(session.detours.map((detour) => {
    const step = detour.steps[0];
    if (step.kind !== "reference") throw new Error("expected reference fixture");
    return [step.referencedDerivedNodeId, step.destination.kind];
  }));
  assert.deepEqual(destinations, { borrow: "checkpoint", scope: "support_activity", ownership: "support_activity" });
  const serialized = JSON.stringify(session);
  assert.equal(serialized.includes("isCorrect"), false);
  assert.equal(serialized.includes("o-borrow-1"), true, "safe option ids remain renderable");
  assert.equal(serialized.includes("lesson-ownership-old"), false, "pinned lesson identity stays server-side");
});

// --- Recall Challenge scope threading (plan 2026-07-13-003 U4; KTD3/KTD4) -----

test("composeStudySession attaches finished recall scopes verbatim and defaults to empty", () => {
  const scope: RecallScopeStatus = {
    scopeKind: "section",
    anchorDerivedNodeId: "ownership",
    anchorLabel: "Ownership",
    sectionIndex: 0,
    eligibleItemCount: 2,
    state: "won",
    wonChallengeId: "ch-first"
  };
  assert.deepEqual(compose({ recallScopes: [scope] }).recallScopes, [scope]);
  assert.deepEqual(compose().recallScopes, []);
});

test("the neutral fold is provably unchanged by arbitrary Guardian scope state (KTD3/KTD4)", () => {
  const args = {
    studyItems: [optionItem("scope"), impostorItem("scope"), optionItem("ownership")],
    lessons: [lessonFor("scope")],
    lessonReads: ["scope"],
    rows: [graded("scope", "correct", 1), { ...graded("scope", "correct", 2), studyItemId: "imp-scope" }, graded("ownership", "incorrect", 3)]
  };
  const withoutScopes = compose(args);
  const withScopes = compose({
    ...args,
    recallScopes: [
      { scopeKind: "section", anchorDerivedNodeId: "move", anchorLabel: "Move semantics", sectionIndex: 0, eligibleItemCount: 2, state: "active", activeChallengeId: "ch-live" },
      { scopeKind: "enrichment", anchorDerivedNodeId: "move", anchorLabel: "Move semantics", sectionIndex: null, eligibleItemCount: 2, state: "won", wonChallengeId: "ch-won" }
    ]
  });
  // Everything the neutral mastery fold produces — gating, per-item outcomes, sheets, trail
  // path, mastery counts — is byte-identical; only the attached scope views differ.
  const neutralHalf = (session: ReturnType<typeof compose>) => ({ ...session, recallScopes: [] });
  assert.deepEqual(neutralHalf(withScopes), neutralHalf(withoutScopes));
});

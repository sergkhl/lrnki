import assert from "node:assert/strict";
import test from "node:test";
import type { ResponseLogRow, ScaffoldDetour, ScaffoldStep } from "@lrnki/domain-core";
import { composeScaffoldDetours, type ProjectedScaffoldReference } from "./studySessionTrail";

let seq = 0;
function scaffoldResponse(scaffoldStepId: string, outcome: "correct" | "incorrect"): ResponseLogRow {
  return { scope: "scaffold", scaffoldStepId, responseId: `r${++seq}`, learnerStateRef: "L", signalType: "graded", judgedOutcome: outcome, gradedScore: outcome === "correct" ? 1 : 0, responseSource: "human", graderIdentity: "auto", batchId: null, submittedAnswer: null, attemptSeq: seq };
}

function generatedStep(id: string, ordinal: number, lessonReadAt: string | null): ScaffoldStep {
  return { scaffoldStepId: id, ordinal, kind: "generated", lessonReadAt, payload: { scaffoldNodeId: `sn-${id}`, label: `Concept ${id}`, lesson: [{ kind: "definition", text: "d", groundingProvenance: "generated" }], item: { scaffoldItemId: `it-${id}`, question: "q", explanation: "e", options: [{ optionId: "o1", text: "a", isCorrect: true }] } } };
}

function detour(overrides: Partial<ScaffoldDetour> & { steps: ScaffoldStep[] }): ScaffoldDetour {
  return { detourId: "d-1", learnerStateRef: "L", enrichmentId: "e", parentDerivedNodeId: "parent", term: "borrow checker", normalizedTerm: "borrow checker", status: "ready", latestOperationId: null, claimToken: null, ...overrides };
}

const noReference = (): ProjectedScaffoldReference => ({
  lessonRead: false,
  itemCorrect: false,
  destination: { kind: "checkpoint", stopId: "unused" }
});

test("a generating detour projects a broad phase, no child completion, no resume target", () => {
  const [view] = composeScaffoldDetours({
    detours: [detour({ status: "generating", steps: [] })],
    responses: [],
    projectReference: noReference,
    generatingPhase: () => "building"
  });
  assert.equal(view.status, "generating");
  assert.equal(view.phase, "building");
  assert.equal(view.complete, false);
  assert.equal(view.firstIncompleteStepId, null);
});

test("a failed detour projects its status with no phase and no resume target", () => {
  const [view] = composeScaffoldDetours({ detours: [detour({ status: "failed", steps: [] })], responses: [], projectReference: noReference });
  assert.equal(view.status, "failed");
  assert.equal(view.phase, null);
  assert.equal(view.firstIncompleteStepId, null);
});

test("a generated step completes only when its lesson is read AND its latest response is correct", () => {
  const step = generatedStep("s1", 0, "2026-01-01T00:00:00Z");
  const [view] = composeScaffoldDetours({
    detours: [detour({ steps: [step] })],
    responses: [scaffoldResponse("s1", "correct")],
    projectReference: noReference
  });
  assert.equal(view.steps[0].complete, true);
  assert.equal(view.complete, true);
});

test("latest incorrect after correct reopens the generated step (neutral latest-outcome rule)", () => {
  const step = generatedStep("s1", 0, "2026-01-01T00:00:00Z");
  const [view] = composeScaffoldDetours({
    detours: [detour({ steps: [step] })],
    responses: [scaffoldResponse("s1", "correct"), scaffoldResponse("s1", "incorrect")],
    projectReference: noReference
  });
  assert.equal(view.steps[0].complete, false);
});

test("a reference step's completion is the neutral lesson-read + option-select subset", () => {
  const step: ScaffoldStep = { scaffoldStepId: "ref-1", ordinal: 0, kind: "reference", referencedDerivedNodeId: "n-9", referencedConceptLessonId: "lesson-9", referencedStudyItemId: "item-9" };
  const complete = composeScaffoldDetours({
    detours: [detour({ steps: [step] })],
    responses: [],
    projectReference: (candidate) => candidate.referencedDerivedNodeId === "n-9"
      ? { lessonRead: true, itemCorrect: true, destination: { kind: "checkpoint", stopId: "n-9:capstone:main" } }
      : noReference()
  })[0];
  assert.equal(complete.steps[0].complete, true);
  const incomplete = composeScaffoldDetours({
    detours: [detour({ steps: [step] })],
    responses: [],
    projectReference: () => ({ lessonRead: true, itemCorrect: false, destination: { kind: "checkpoint", stopId: "n-9:option_select:item-9" } })
  })[0];
  assert.equal(incomplete.steps[0].complete, false);
});

// KTD7: no presentation grouping — the view carries counts and the resume target directly.
test("a partial ready detour reports completed/total counts and resumes at the ordinal-first incomplete step (AE6)", () => {
  const done = generatedStep("s1", 0, "2026-01-01T00:00:00Z");
  const open2 = generatedStep("s2", 1, null);
  const open3 = generatedStep("s3", 2, null);
  const [view] = composeScaffoldDetours({
    detours: [detour({ steps: [open3, done, open2] })],
    responses: [scaffoldResponse("s1", "correct")],
    projectReference: noReference
  });
  assert.equal(view.completedStepCount, 1);
  assert.equal(view.totalStepCount, 3);
  assert.equal(view.complete, false);
  // Input order was shuffled; ordinal order decides the resume target (R13).
  assert.equal(view.firstIncompleteStepId, "s2");
});

test("a complete ready detour has no resume step (the overview is the entry)", () => {
  const done = generatedStep("s1", 0, "2026-01-01T00:00:00Z");
  const [view] = composeScaffoldDetours({
    detours: [detour({ steps: [done] })],
    responses: [scaffoldResponse("s1", "correct")],
    projectReference: noReference
  });
  assert.equal(view.complete, true);
  assert.equal(view.completedStepCount, 1);
  assert.equal(view.firstIncompleteStepId, null);
});

// --- Neutral trail composition (moved from the Learner App's former trailView.ts, U4) ---------
// These characterization tests are the projection's sole policy proof for the neutral trail
// (Definition of Done): the Learner App no longer reconstructs mastery maps client-side.

import type { StudySession } from "./studySessionProjection";
import { buildTrailView, resolveStopActivity } from "./studySessionTrail";

function trailSession(opts: { withoutLesson?: boolean; includeLocked?: boolean; latestOutcomeByStudyItemId?: StudySession["latestOutcomeByStudyItemId"]; difficulty?: number } = {}): StudySession {
  const nodes = [{
    derivedNodeId: "n1",
    label: "Ownership",
    aliases: [],
    declaredDomain: "software engineering",
    difficulty: null,
    difficultyRationale: null,
    nodeKind: "enrichment" as const,
    groundingOrigin: "llm_grounded" as const,
    role: "prerequisite" as const,
    hasStudyItem: true,
    grounding: null
  }, ...(opts.includeLocked ? [{
    derivedNodeId: "n2",
    label: "Borrowing",
    aliases: [],
    declaredDomain: "software engineering",
    difficulty: null,
    difficultyRationale: null,
    nodeKind: "enrichment" as const,
    groundingOrigin: "llm_grounded" as const,
    role: "prerequisite" as const,
    hasStudyItem: true,
    grounding: null
  }] : [])];
  return {
    enrichmentId: "e1",
    learnerStateRef: "learner",
    layerPurpose: null,
    target: { derivedNodeId: "n1", label: "Ownership" },
    studyItemCount: 2,
    flooredNodeIds: [],
    neutralReferenceAssetsByNode: {},
    detail: {
      summary: {
        enrichmentId: "e1",
        graphVersionId: null,
        enrichmentConfigHash: "test",
        judgeModel: "test",
        difficultyMethod: "test",
        status: "succeeded",
        edgeCount: 0,
        certainEdgeCount: 0,
        uncertainEdgeCount: 0,
        conceptCount: 1,
        studyItemCount: 2,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z"
      },
      nodes,
      edges: [],
      originCounts: [],
      rescueDispositions: [],
      mintingDispositions: [],
      merges: []
    },
    classification: { stateByNode: { n1: "frontier", ...(opts.includeLocked ? { n2: "locked" as const } : {}) }, selectedFrontierTarget: "n1" },
    adaptedHiddenNodeIds: [],
    responseSourceSummary: { human: 0, synthetic: 0, total: 0 },
    expeditionPath: [
      { position: 0, derivedNodeId: "n1", difficulty: opts.difficulty ?? 0, topologicalDepth: 0, state: "frontier", isSummit: !opts.includeLocked, sectionIndex: 0, sectionPositionIndex: 0, milestoneDerivedNodeId: opts.includeLocked ? "n2" : "n1", milestoneLabel: opts.includeLocked ? "Borrowing" : "Ownership", isMilestone: !opts.includeLocked },
      ...(opts.includeLocked ? [{ position: 1, derivedNodeId: "n2", difficulty: 0, topologicalDepth: 1, state: "locked" as const, isSummit: true, sectionIndex: 0, sectionPositionIndex: 1, milestoneDerivedNodeId: "n2", milestoneLabel: "Borrowing", isMilestone: true }] : [])
    ],
    sections: [{ sectionIndex: 0, milestoneDerivedNodeId: opts.includeLocked ? "n2" : "n1", milestoneLabel: opts.includeLocked ? "Borrowing" : "Ownership", stepDerivedNodeIds: opts.includeLocked ? ["n1", "n2"] : ["n1"], meanDifficulty: opts.difficulty ?? 0, hasStudyItems: true }],
    coexistence: [],
    restorations: [],
    sheetByNode: {},
    verdictByNode: {},
    latestOutcomeByStudyItemId: opts.latestOutcomeByStudyItemId ?? {},
    studySegmentsByNode: {
      n1: [
        { kind: "option_select", item: { studyItemId: "i1", derivedNodeId: "n1", question: "Q?", explanation: "Grounded explanation.", groundingProvenance: "generated", options: [], explorableTerms: [] } },
        { kind: "impostor", item: { studyItemId: "i2", derivedNodeId: "n1", question: "Which is false?", groundingProvenance: "generated", statements: [], reveal: "Reveal", lieSource: "generated", explorableTerms: [] } }
      ]
    },
    lessonByNode: opts.withoutLesson ? {} : { n1: { derivedNodeId: "n1", canonicalLabel: "Ownership", sections: [], explorableTerms: [] } },
    lessonReadByNode: {},
    lessonAbsent: [],
    detours: [],
    generatingDetours: false,
    recallScopes: []
  };
}

test("buildTrailView emits theory before item stops and capstone last", () => {
  const view = buildTrailView(trailSession());
  const stops = view.concepts[0].stops;
  assert.deepEqual(stops.map((stop) => stop.kind), ["theory", "option_select", "impostor", "capstone"]);
});

test("buildTrailView emits item stops only before capstone when a node has no lesson", () => {
  const view = buildTrailView(trailSession({ withoutLesson: true }));
  const stops = view.concepts[0].stops;
  assert.deepEqual(stops.map((stop) => stop.kind), ["option_select", "impostor", "capstone"]);
});

test("buildTrailView marks exactly one next stop across the trail", () => {
  const view = buildTrailView(trailSession());
  assert.equal(view.nextStopId, "n1:theory:main");
  assert.equal(view.concepts.flatMap((concept) => concept.stops).filter((stop) => stop.isNext).length, 1);
});

test("buildTrailView groups concepts under their sections and marks section starts", () => {
  const view = buildTrailView(trailSession({ includeLocked: true }));
  assert.deepEqual(view.concepts.map((concept) => concept.sectionIndex), [0, 0]);
  assert.deepEqual(view.concepts.map((concept) => concept.sectionPositionIndex), [0, 1]);
  assert.deepEqual(view.concepts.map((concept) => concept.isSectionStart), [true, false]);
  assert.equal(view.sections.length, 1);
  assert.equal(view.sections[0].conceptCount, 2);
});

test("buildTrailView: a second disjoint section is playable before the first is touched", () => {
  const base = trailSession();
  const litNode = (id: string, label: string) => ({ ...base.detail.nodes[0], derivedNodeId: id, label });
  const twoSection: StudySession = {
    ...base,
    detail: { ...base.detail, nodes: [litNode("s0", "Section Zero"), litNode("s1", "Section One")] },
    expeditionPath: [
      { position: 0, derivedNodeId: "s0", difficulty: 0, topologicalDepth: 0, state: "locked", isSummit: false, sectionIndex: 0, sectionPositionIndex: 0, milestoneDerivedNodeId: "s0", milestoneLabel: "Section Zero", isMilestone: true },
      { position: 1, derivedNodeId: "s1", difficulty: 0, topologicalDepth: 0, state: "frontier", isSummit: true, sectionIndex: 1, sectionPositionIndex: 0, milestoneDerivedNodeId: "s1", milestoneLabel: "Section One", isMilestone: true }
    ],
    sections: [
      { sectionIndex: 0, milestoneDerivedNodeId: "s0", milestoneLabel: "Section Zero", stepDerivedNodeIds: ["s0"], meanDifficulty: 0, hasStudyItems: true },
      { sectionIndex: 1, milestoneDerivedNodeId: "s1", milestoneLabel: "Section One", stepDerivedNodeIds: ["s1"], meanDifficulty: 0, hasStudyItems: true }
    ],
    studySegmentsByNode: {},
    lessonByNode: {},
    sheetByNode: { s0: { kind: "locked", unmetPrerequisiteLabels: ["Something earlier"] } }
  };
  const view = buildTrailView(twoSection);
  assert.equal(view.sections.length, 2);
  assert.equal(view.sections[1].state, "available");
  assert.equal(view.sections[0].state, "locked");
  assert.deepEqual(view.sections[0].gatingLabels, ["Something earlier"]);
  assert.equal(view.currentSectionIndex, 1);
});

test("buildTrailView fogs locked territory and leaves frontier stops clear", () => {
  const view = buildTrailView(trailSession({ includeLocked: true }));
  const stops = view.concepts.flatMap((concept) => concept.stops);
  assert.equal(stops.find((stop) => stop.derivedNodeId === "n1")?.isFogged, false);
  assert.equal(stops.find((stop) => stop.derivedNodeId === "n2")?.isFogged, true);
});

test("buildTrailView keeps a flat ordered concept list", () => {
  const view = buildTrailView(trailSession({ includeLocked: true }));
  assert.deepEqual(view.concepts.map((concept) => concept.derivedNodeId), ["n1", "n2"]);
});

test("buildTrailView copies the stateful difficulty onto each trail cluster", () => {
  const view = buildTrailView(trailSession({ difficulty: 0.5 }));
  assert.equal(view.concepts[0].difficulty, 0.5);
});

test("buildTrailView fills study item stops only when their latest item outcome is correct", () => {
  const view = buildTrailView(trailSession({ latestOutcomeByStudyItemId: { i1: "correct", i2: "incorrect" } }));
  const stops = view.concepts[0].stops;
  assert.equal(stops.find((stop) => stop.studyItemId === "i1")?.state, "complete");
  assert.equal(stops.find((stop) => stop.studyItemId === "i2")?.state, "available");
});

test("buildTrailView grows the crystal by the fraction of the node's own stops complete", () => {
  const view = buildTrailView(trailSession({ latestOutcomeByStudyItemId: { i1: "correct" } }));
  assert.equal(view.concepts[0].growthFraction, 1 / 3);
});

test("buildTrailView forces full crystal growth on a mastered node even with unread stops", () => {
  const base = trailSession();
  const mastered: StudySession = { ...base, expeditionPath: [{ ...base.expeditionPath[0], state: "mastered" }] };
  assert.equal(buildTrailView(mastered).concepts[0].growthFraction, 1);
});

test("buildTrailView marks known-verdict clusters as skipped but still complete for gating", () => {
  const base = trailSession();
  const skipped: StudySession = { ...base, verdictByNode: { n1: "known" }, expeditionPath: [{ ...base.expeditionPath[0], state: "mastered" }] };
  const view = buildTrailView(skipped);
  assert.equal(view.concepts[0].isKnownSkipped, true);
  assert.equal(view.concepts[0].growthFraction, 1);
  assert.equal(view.masteredCount, 0);
});

test("buildTrailView keeps earned mastered clusters counted as collected", () => {
  const base = trailSession();
  const earned: StudySession = { ...base, expeditionPath: [{ ...base.expeditionPath[0], state: "mastered" }] };
  const view = buildTrailView(earned);
  assert.equal(view.concepts[0].isKnownSkipped, false);
  assert.equal(view.masteredCount, 1);
});

test("buildTrailView gives a stopless unmastered node zero growth", () => {
  const base = trailSession({ withoutLesson: true });
  const stopless: StudySession = { ...base, studySegmentsByNode: {} };
  assert.equal(buildTrailView(stopless).concepts[0].growthFraction, 0);
});

function activitySession(opts: { mastered?: boolean; knownSkipped?: boolean } = {}): StudySession {
  const base = trailSession();
  return {
    ...base,
    classification: { stateByNode: { n1: opts.mastered ? "mastered" : "frontier" }, selectedFrontierTarget: opts.mastered ? null : "n1" },
    expeditionPath: [{ ...base.expeditionPath[0], state: opts.mastered ? "mastered" : "frontier", isSummit: true, milestoneDerivedNodeId: "n1", milestoneLabel: "Ownership", isMilestone: true }],
    verdictByNode: opts.knownSkipped ? { n1: "known" } : {}
  };
}

test("resolveStopActivity maps a theory stop to the node lesson", () => {
  const activity = resolveStopActivity(activitySession(), "n1:theory:main");
  assert.equal(activity.kind, "theory");
  assert.equal(activity.kind === "theory" ? activity.lesson?.canonicalLabel : null, "Ownership");
});

test("resolveStopActivity maps question and impostor stops to exactly one study item", () => {
  const question = resolveStopActivity(activitySession(), "n1:option_select:i1");
  const impostor = resolveStopActivity(activitySession(), "n1:impostor:i2");
  assert.equal(question.kind, "option_select");
  assert.equal(question.kind === "option_select" ? question.item.studyItemId : null, "i1");
  assert.equal(impostor.kind, "impostor");
  assert.equal(impostor.kind === "impostor" ? impostor.item.studyItemId : null, "i2");
});

test("resolveStopActivity maps capstone stops to crystal state with full growth on mastery", () => {
  const activity = resolveStopActivity(activitySession({ mastered: true }), "n1:capstone:main");
  assert.deepEqual(activity, { kind: "capstone", derivedNodeId: "n1", label: "Ownership", mastered: true, difficulty: 0, growthFraction: 1, isKnownSkipped: false });
});

test("resolveStopActivity carries partial crystal growth on an unmastered capstone", () => {
  const activity = resolveStopActivity(activitySession(), "n1:capstone:main");
  assert.equal(activity.kind === "capstone" ? activity.mastered : null, false);
  assert.equal(activity.kind === "capstone" ? activity.growthFraction : null, 0);
});

test("resolveStopActivity marks a known-verdict capstone as skipped", () => {
  const activity = resolveStopActivity(activitySession({ mastered: true, knownSkipped: true }), "n1:capstone:main");
  assert.equal(activity.kind === "capstone" ? activity.isKnownSkipped : null, true);
});

// --- Generated Support Step content projection (U6): the client-renderable, key-free view ------

test("a generated step view carries its micro-lesson and key-free option-select (no isCorrect leak)", () => {
  const step = generatedStep("s1", 0, null);
  const [view] = composeScaffoldDetours({
    detours: [detour({ status: "ready", steps: [step] })],
    responses: [],
    projectReference: noReference
  });
  const stepView = view.steps[0];
  assert.equal(stepView.kind, "generated");
  if (stepView.kind !== "generated") return;
  assert.equal(stepView.label, "Concept s1");
  assert.equal(stepView.lesson[0]?.kind, "definition");
  assert.equal(stepView.item.scaffoldStepId, "s1");
  assert.equal(stepView.item.question, "q");
  assert.deepEqual(stepView.item.options.map((o) => o.optionId), ["o1"]);
  // The correct-answer key must never ship to the client.
  assert.equal(JSON.stringify(stepView).includes("isCorrect"), false);
});

test("generated step option-select options are sorted by id so the answer is not positional", () => {
  const step: ScaffoldStep = {
    scaffoldStepId: "s2", ordinal: 0, kind: "generated", lessonReadAt: null,
    payload: { scaffoldNodeId: "sn", label: "L", lesson: [{ kind: "definition", text: "d", groundingProvenance: "generated" }], item: { scaffoldItemId: "it", question: "q", explanation: "e", options: [
      { optionId: "o3", text: "c", isCorrect: false },
      { optionId: "o1", text: "a", isCorrect: true },
      { optionId: "o2", text: "b", isCorrect: false }
    ] } }
  };
  const [view] = composeScaffoldDetours({ detours: [detour({ status: "ready", steps: [step] })], responses: [], projectReference: noReference });
  const stepView = view.steps[0];
  assert.equal(stepView.kind, "generated");
  if (stepView.kind !== "generated") return;
  assert.deepEqual(stepView.item.options.map((o) => o.optionId), ["o1", "o2", "o3"]);
});

// --- Recall Challenge scope attachment (plan 2026-07-13-003 U4, KTD3) ----------

test("buildTrailView attaches each Leg's recall scope by section index and the summit scope", () => {
  const sectionScope = {
    scopeKind: "section" as const,
    anchorDerivedNodeId: "n1",
    anchorLabel: "Ownership",
    sectionIndex: 0,
    eligibleItemCount: 2,
    state: "won" as const,
    wonChallengeId: "ch-leg"
  };
  const summitScope = {
    scopeKind: "enrichment" as const,
    anchorDerivedNodeId: "n1",
    anchorLabel: "Ownership",
    sectionIndex: null,
    eligibleItemCount: 2,
    state: "available" as const
  };
  const view = buildTrailView({ ...trailSession(), recallScopes: [sectionScope, summitScope] });
  assert.deepEqual(view.sections[0].recallScope, sectionScope);
  assert.deepEqual(view.enrichmentScope, summitScope);
});

test("buildTrailView leaves scope views null when the session composed without a challenge store", () => {
  const view = buildTrailView(trailSession());
  assert.equal(view.sections[0].recallScope, null);
  assert.equal(view.enrichmentScope, null);
});

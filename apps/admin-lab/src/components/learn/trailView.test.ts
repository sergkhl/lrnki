import assert from "node:assert/strict";
import test from "node:test";
import type { StudySession } from "@lrnki/application";
import { buildTrailView } from "./trailView";

test("buildTrailView emits theory before item stops and capstone last", () => {
  const view = buildTrailView(session());
  const stops = view.concepts[0].stops;
  assert.deepEqual(stops.map((stop) => stop.kind), ["theory", "option_select", "impostor", "capstone"]);
});

test("buildTrailView emits item stops only before capstone when a node has no lesson", () => {
  const view = buildTrailView(session({ withoutLesson: true }));
  const stops = view.concepts[0].stops;
  assert.deepEqual(stops.map((stop) => stop.kind), ["option_select", "impostor", "capstone"]);
});

test("buildTrailView marks exactly one next stop across the trail", () => {
  const view = buildTrailView(session());
  assert.equal(view.nextStopId, "n1:theory:main");
  assert.equal(view.fogBoundaryStopId, "n1:theory:main");
  assert.equal(view.concepts.flatMap((concept) => concept.stops).filter((stop) => stop.isNext).length, 1);
});

test("buildTrailView fogs locked territory and leaves frontier stops clear", () => {
  const view = buildTrailView(session({ includeLocked: true }));
  const stops = view.concepts.flatMap((concept) => concept.stops);
  assert.equal(stops.find((stop) => stop.derivedNodeId === "n1")?.isFogged, false);
  assert.equal(stops.find((stop) => stop.derivedNodeId === "n2")?.isFogged, true);
});

test("buildTrailView keeps a flat ordered concept list", () => {
  const view = buildTrailView(session({ includeLocked: true }));
  assert.deepEqual(view.concepts.map((concept) => concept.derivedNodeId), ["n1", "n2"]);
});

test("buildTrailView copies the stateful difficulty onto each trail cluster", () => {
  const view = buildTrailView(session({ difficulty: 0.5 }));
  assert.equal(view.concepts[0].difficulty, 0.5);
});

test("buildTrailView fills study item stops only when their latest item outcome is correct", () => {
  const view = buildTrailView(session({ latestOutcomeByStudyItemId: { i1: "correct", i2: "incorrect" } }));
  const stops = view.concepts[0].stops;
  assert.equal(stops.find((stop) => stop.studyItemId === "i1")?.state, "complete");
  assert.equal(stops.find((stop) => stop.studyItemId === "i2")?.state, "available");
});

function session(opts: { withoutLesson?: boolean; includeLocked?: boolean; latestOutcomeByStudyItemId?: StudySession["latestOutcomeByStudyItemId"]; difficulty?: number } = {}): StudySession {
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
    target: { derivedNodeId: "n1", label: "Ownership" },
    studyItemCount: 2,
    flooredNodeIds: [],
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
    sections: [{ sectionIndex: 0, milestoneDerivedNodeId: opts.includeLocked ? "n2" : "n1", milestoneLabel: opts.includeLocked ? "Borrowing" : "Ownership", stepDerivedNodeIds: opts.includeLocked ? ["n1", "n2"] : ["n1"], meanDifficulty: opts.difficulty ?? 0 }],
    coexistence: [],
    restorations: [],
    sheetByNode: {},
    verdictByNode: {},
    latestOutcomeByStudyItemId: opts.latestOutcomeByStudyItemId ?? {},
    studySegmentsByNode: {
      n1: [
        { kind: "option_select", item: { studyItemId: "i1", derivedNodeId: "n1", question: "Q?", explanation: "Grounded explanation.", groundingProvenance: "generated", options: [] } },
        { kind: "impostor", item: { studyItemId: "i2", derivedNodeId: "n1", question: "Which is false?", groundingProvenance: "generated", statements: [], reveal: "Reveal", lieSource: "generated" } }
      ]
    },
    lessonByNode: opts.withoutLesson ? {} : { n1: { derivedNodeId: "n1", canonicalLabel: "Ownership", sections: [] } },
    lessonReadByNode: {},
    lessonAbsent: []
  };
}

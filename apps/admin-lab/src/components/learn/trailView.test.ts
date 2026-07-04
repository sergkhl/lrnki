import assert from "node:assert/strict";
import test from "node:test";
import type { StudySession } from "@lrnki/application";
import { buildTrailView } from "./trailView";

test("buildTrailView emits theory before item stops and capstone last", () => {
  const view = buildTrailView(session());
  const stops = view.camps[0].clusters[0].stops;
  assert.deepEqual(stops.map((stop) => stop.kind), ["theory", "option_select", "impostor", "capstone"]);
});

test("buildTrailView emits item stops only before capstone when a node has no lesson", () => {
  const view = buildTrailView(session({ withoutLesson: true }));
  const stops = view.camps[0].clusters[0].stops;
  assert.deepEqual(stops.map((stop) => stop.kind), ["option_select", "impostor", "capstone"]);
});

test("buildTrailView marks exactly one next stop across the trail", () => {
  const view = buildTrailView(session());
  assert.equal(view.nextStopId, "n1:theory:main");
  assert.equal(view.fogBoundaryStopId, "n1:theory:main");
  assert.equal(view.camps.flatMap((camp) => camp.clusters).flatMap((cluster) => cluster.stops).filter((stop) => stop.isNext).length, 1);
});

test("buildTrailView fogs locked territory and leaves frontier stops clear", () => {
  const view = buildTrailView(session({ includeLocked: true }));
  const stops = view.camps.flatMap((camp) => camp.clusters).flatMap((cluster) => cluster.stops);
  assert.equal(stops.find((stop) => stop.derivedNodeId === "n1")?.isFogged, false);
  assert.equal(stops.find((stop) => stop.derivedNodeId === "n2")?.isFogged, true);
});

function session(opts: { withoutLesson?: boolean; includeLocked?: boolean } = {}): StudySession {
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
    isFoundationalRoot: true,
    statefulPath: [
      { position: 0, derivedNodeId: "n1", difficulty: 0, topologicalDepth: 0, state: "frontier", isTarget: !opts.includeLocked },
      ...(opts.includeLocked ? [{ position: 1, derivedNodeId: "n2", difficulty: 0, topologicalDepth: 1, state: "locked" as const, isTarget: true }] : [])
    ],
    coexistence: [],
    restorations: [],
    sheetByNode: {},
    verdictByNode: {},
    studySegmentsByNode: {
      n1: [
        { kind: "option_select", item: { studyItemId: "i1", derivedNodeId: "n1", question: "Q?", groundingProvenance: "generated", options: [] } },
        { kind: "impostor", item: { studyItemId: "i2", derivedNodeId: "n1", question: "Which is false?", groundingProvenance: "generated", statements: [], reveal: "Reveal", lieSource: "generated" } }
      ]
    },
    lessonByNode: opts.withoutLesson ? {} : { n1: { derivedNodeId: "n1", canonicalLabel: "Ownership", sections: [] } },
    lessonAbsent: []
  };
}

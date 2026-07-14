import assert from "node:assert/strict";
import { test } from "@jest/globals";
import { buildCrystalFormation, fusedSectionIndexes, hasSummitKeystone, isNameableCrystal, memoryDoorFor, placeFormation } from "./crystalVistaView";
import { buildTrailView } from "@lrnki/application/projection";
import type { StudySession } from "@lrnki/application/projection";

test("buildCrystalFormation maps trail clusters and keeps only on-trail edges", () => {
  const s = session();
  const formation = buildCrystalFormation(s, buildTrailView(s));
  assert.deepEqual(formation.nodes.map((node) => node.derivedNodeId), ["n1", "n2"]);
  assert.equal(formation.nodes[0].state, "mastered");
  assert.equal(formation.nodes[0].growthFraction, 1);
  assert.equal(formation.nodes[0].isKnownSkipped, false);
  assert.equal(formation.nodes[1].state, "frontier");
  assert.deepEqual(formation.edges, [{ source: "n1", target: "n2", uncertain: false }]);
  assert.equal(formation.title, "Borrowing");
});

test("buildCrystalFormation renders skipped known concepts fogged and uncollected", () => {
  const base = session();
  const s: StudySession = {
    ...base,
    verdictByNode: { n1: "known" },
    expeditionPath: [
      { ...base.expeditionPath[0], state: "mastered" },
      base.expeditionPath[1]
    ]
  };
  const formation = buildCrystalFormation(s, buildTrailView(s));
  const skipped = formation.nodes.find((node) => node.derivedNodeId === "n1")!;
  assert.equal(skipped.isKnownSkipped, true);
  assert.equal(skipped.state, "locked");
  assert.equal(skipped.growthFraction, 0);
});

test("placeFormation grows bedrock-up: a prerequisite sits below its dependent", () => {
  const s = session();
  const placed = placeFormation(buildCrystalFormation(s, buildTrailView(s)));
  const root = placed.crystals.find((crystal) => crystal.derivedNodeId === "n1")!;
  const dependent = placed.crystals.find((crystal) => crystal.derivedNodeId === "n2")!;
  assert.ok(root.y > dependent.y, "prerequisite root must anchor lower (larger y) than its dependent");
  assert.ok(placed.viewBox.width > 0 && placed.viewBox.height > 0);
  assert.equal(placed.veins.length, 1);
});

test("fusion derives ONLY from a won section challenge — a fully mastered Leg with no victory stays unfused (KTD3, AE6)", () => {
  const base = session();
  const masteredUnwon: StudySession = {
    ...base,
    classification: { stateByNode: { n1: "mastered", n2: "mastered" }, selectedFrontierTarget: null },
    expeditionPath: base.expeditionPath.map((step) => ({ ...step, state: "mastered" as const }))
  };
  assert.deepEqual(fusedSectionIndexes(buildTrailView(masteredUnwon)), []);
  assert.equal(hasSummitKeystone(buildTrailView(masteredUnwon)), false);

  const won: StudySession = {
    ...masteredUnwon,
    recallScopes: [
      { scopeKind: "section", anchorDerivedNodeId: "n2", anchorLabel: "Borrowing", sectionIndex: 0, eligibleItemCount: 2, state: "won", wonChallengeId: "c-won" }
    ]
  };
  assert.deepEqual(fusedSectionIndexes(buildTrailView(won)), [0]);
  // A won Leg alone never crowns the summit: the keystone needs the ENRICHMENT scope's win.
  assert.equal(hasSummitKeystone(buildTrailView(won)), false);
});

test("the summit keystone derives ONLY from a won enrichment challenge (KTD3, AE8)", () => {
  const base = session();
  const s: StudySession = {
    ...base,
    recallScopes: [
      { scopeKind: "section", anchorDerivedNodeId: "n2", anchorLabel: "Borrowing", sectionIndex: 0, eligibleItemCount: 2, state: "won", wonChallengeId: "c-leg" },
      { scopeKind: "enrichment", anchorDerivedNodeId: "n2", anchorLabel: "Borrowing", sectionIndex: null, eligibleItemCount: 2, state: "won", wonChallengeId: "c-summit" }
    ]
  };
  assert.equal(hasSummitKeystone(buildTrailView(s)), true);
});

function session(): StudySession {
  const node = (derivedNodeId: string, label: string) => ({
    derivedNodeId,
    label,
    aliases: [],
    declaredDomain: "software engineering",
    difficulty: null,
    difficultyRationale: null,
    nodeKind: "enrichment" as const,
    groundingOrigin: "llm_grounded" as const,
    role: "prerequisite" as const,
    hasStudyItem: true,
    grounding: null
  });
  return {
    enrichmentId: "e1",
    learnerStateRef: "learner",
    layerPurpose: null,
    target: { derivedNodeId: "n2", label: "Borrowing" },
    studyItemCount: 0,
    flooredNodeIds: [],
    detail: {
      summary: {
        enrichmentId: "e1",
        graphVersionId: null,
        enrichmentConfigHash: "test",
        judgeModel: "test",
        difficultyMethod: "test",
        status: "succeeded",
        edgeCount: 1,
        certainEdgeCount: 1,
        uncertainEdgeCount: 0,
        conceptCount: 2,
        studyItemCount: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z"
      },
      nodes: [node("n1", "Ownership"), node("n2", "Borrowing")],
      edges: [
        { prerequisiteDerivedNodeId: "n1", dependentDerivedNodeId: "n2", confidence: 0.9, uncertain: false, judgeModel: "test" },
        { prerequisiteDerivedNodeId: "n1", dependentDerivedNodeId: "off-trail", confidence: 0.9, uncertain: false, judgeModel: "test" }
      ],
      originCounts: [],
      rescueDispositions: [],
      mintingDispositions: [],
      merges: []
    },
    classification: { stateByNode: { n1: "mastered", n2: "frontier" }, selectedFrontierTarget: "n2" },
    adaptedHiddenNodeIds: [],
    responseSourceSummary: { human: 0, synthetic: 0, total: 0 },
    expeditionPath: [
      { position: 0, derivedNodeId: "n1", difficulty: 0.2, topologicalDepth: 0, state: "mastered", isSummit: false, sectionIndex: 0, sectionPositionIndex: 0, milestoneDerivedNodeId: "n2", milestoneLabel: "Borrowing", isMilestone: false },
      { position: 1, derivedNodeId: "n2", difficulty: 0.4, topologicalDepth: 1, state: "frontier", isSummit: true, sectionIndex: 0, sectionPositionIndex: 1, milestoneDerivedNodeId: "n2", milestoneLabel: "Borrowing", isMilestone: true }
    ],
    sections: [{ sectionIndex: 0, milestoneDerivedNodeId: "n2", milestoneLabel: "Borrowing", stepDerivedNodeIds: ["n1", "n2"], meanDifficulty: 0.3 }],
    coexistence: [],
    restorations: [],
    sheetByNode: {},
    verdictByNode: {},
    latestOutcomeByStudyItemId: {},
    studySegmentsByNode: {},
    lessonByNode: {},
    lessonReadByNode: {},
    lessonAbsent: [],
    detours: [],
    generatingDetours: false,
    recallScopes: []
  };
}

test("memoryDoorFor reveals mastered and frontier crystals with gist + review navigation", () => {
  const s = session();
  s.lessonByNode = { n1: { derivedNodeId: "n1", canonicalLabel: "Ownership", sections: [{ kind: "gist", text: "Every value has one owner.", groundingProvenance: "generated", isSourceCited: false }], explorableTerms: [] } };
  const formation = buildCrystalFormation(s, buildTrailView(s));
  const mastered = formation.nodes.find((node) => node.derivedNodeId === "n1")!;
  assert.equal(isNameableCrystal(mastered), true);
  assert.deepEqual(memoryDoorFor(formation, "n1"), { kind: "reveal", derivedNodeId: "n1", label: "Ownership", gist: "Every value has one owner." });

  // Frontier crystals are nameable (tiered rule) and open the reveal card.
  const frontier = formation.nodes.find((node) => node.derivedNodeId === "n2")!;
  assert.equal(isNameableCrystal(frontier), true);
  assert.deepEqual(memoryDoorFor(formation, "n2"), { kind: "reveal", derivedNodeId: "n2", label: "Borrowing", gist: null });
  assert.equal(memoryDoorFor(formation, null), null);
});

test("memoryDoorFor keeps ordinary fogged crystals mystery shapes but names fogged announced goals", () => {
  const base = session();
  const s: StudySession = {
    ...base,
    classification: { stateByNode: { n1: "locked", n2: "locked" }, selectedFrontierTarget: null },
    expeditionPath: [
      { ...base.expeditionPath[0], state: "locked" },
      { ...base.expeditionPath[1], state: "locked" }
    ]
  };
  const formation = buildCrystalFormation(s, buildTrailView(s));
  const ordinary = formation.nodes.find((node) => node.derivedNodeId === "n1")!;
  assert.equal(isNameableCrystal(ordinary), false);
  assert.equal(memoryDoorFor(formation, "n1"), null);
  // n2 is the milestone AND summit: fogged yet nameable, guarded variant with no gist.
  assert.deepEqual(memoryDoorFor(formation, "n2"), { kind: "guarded", derivedNodeId: "n2", label: "Borrowing", legNumber: 1 });
});

test("memoryDoorFor reveals a known-ghost crystal", () => {
  const base = session();
  const s: StudySession = {
    ...base,
    verdictByNode: { n1: "known" },
    expeditionPath: [{ ...base.expeditionPath[0], state: "mastered" }, base.expeditionPath[1]]
  };
  const formation = buildCrystalFormation(s, buildTrailView(s));
  const ghost = formation.nodes.find((node) => node.derivedNodeId === "n1")!;
  assert.equal(isNameableCrystal(ghost), true);
  assert.equal(memoryDoorFor(formation, "n1")!.kind, "reveal");
});

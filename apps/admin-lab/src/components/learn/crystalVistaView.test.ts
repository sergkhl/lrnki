import assert from "node:assert/strict";
import test from "node:test";
import { buildCrystalFormation, completeSectionIndexes, isNameableCrystal, labelChipFor, placeFormation, type CrystalFormation } from "./crystalVistaView";
import { buildTrailView } from "./trailView";
import type { StudySession } from "@lrnki/application";

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

test("completeSectionIndexes reports only sections whose every concept is mastered", () => {
  const formation: CrystalFormation = {
    title: "t",
    edges: [],
    nodes: [
      { derivedNodeId: "a", label: "a", domain: "d", difficulty: 0, state: "mastered", growthFraction: 1, sectionIndex: 0, isKnownSkipped: false },
      { derivedNodeId: "b", label: "b", domain: "d", difficulty: 0, state: "mastered", growthFraction: 1, sectionIndex: 0, isKnownSkipped: false },
      { derivedNodeId: "c", label: "c", domain: "d", difficulty: 0, state: "frontier", growthFraction: 0.5, sectionIndex: 1, isKnownSkipped: false }
    ]
  };
  assert.deepEqual(completeSectionIndexes(formation), [0]);
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
    lessonAbsent: []
  };
}

test("labelChipFor names mastered and known-ghost crystals only, anchored above the crystal", () => {
  const s = session();
  const placed = placeFormation(buildCrystalFormation(s, buildTrailView(s)));
  const mastered = placed.crystals.find((crystal) => crystal.derivedNodeId === "n1")!;
  assert.equal(isNameableCrystal(mastered), true);

  const chip = labelChipFor(placed, "n1")!;
  assert.equal(chip.label, mastered.label);
  assert.equal(chip.x, mastered.x);
  assert.ok(chip.y < mastered.y, "chip floats above the crystal");

  // Frontier crystals stay unnamed: no chip even when selected.
  const frontier = placed.crystals.find((crystal) => crystal.derivedNodeId === "n2")!;
  assert.equal(isNameableCrystal(frontier), false);
  assert.equal(labelChipFor(placed, "n2"), null);
  assert.equal(labelChipFor(placed, null), null);
});

test("labelChipFor names a known-ghost crystal", () => {
  const base = session();
  const s: StudySession = {
    ...base,
    verdictByNode: { n1: "known" },
    expeditionPath: [{ ...base.expeditionPath[0], state: "mastered" }, base.expeditionPath[1]]
  };
  const placed = placeFormation(buildCrystalFormation(s, buildTrailView(s)));
  const ghost = placed.crystals.find((crystal) => crystal.derivedNodeId === "n1")!;
  assert.equal(isNameableCrystal(ghost), true);
  assert.equal(labelChipFor(placed, "n1")!.label, ghost.label);
});

import assert from "node:assert/strict";
import test from "node:test";
import { sourceExpeditionAssetSetIdentity } from "./sourceExpeditionAssetIdentity";

const input = {
  qualifiedAssetConfigHash: "source-expedition-learner-assets-v3:test",
  enrichmentId: "enrichment",
  graphVersionId: "graph",
  enrichmentConfigHash: "enrichment-config",
  trailNodeIds: ["node-1", "node-2", "node-3"],
  routePlan: {
    policyIdentity: "source-expedition-route-v1:min3-max5-target4:mixed",
    orderedDerivedNodeIds: ["node-1", "node-2", "node-3"],
    legs: [{
      legIndex: 0,
      anchorDerivedNodeId: "node-3",
      derivedNodeIds: ["node-1", "node-2", "node-3"],
      selectedBonusStudyItemIds: ["matching-1", "impostor-1"]
    }],
    summitDerivedNodeId: "node-3"
  },
  lessons: [
    { conceptLessonId: "lesson-1", derivedNodeId: "node-1", configHash: "config" },
    { conceptLessonId: "lesson-2", derivedNodeId: "node-2", configHash: "config" },
    { conceptLessonId: "lesson-3", derivedNodeId: "node-3", configHash: "config" }
  ],
  studyItems: [
    { studyItemId: "option-1", derivedNodeId: "node-1", itemType: "option_select", configHash: "config" },
    { studyItemId: "matching-1", derivedNodeId: "node-2", itemType: "matching", configHash: "config" },
    { studyItemId: "impostor-1", derivedNodeId: "node-3", itemType: "impostor", configHash: "config" }
  ]
};

test("source asset identity is stable across unordered relational reads", () => {
  const reordered = structuredClone(input);
  reordered.trailNodeIds.reverse();
  reordered.lessons.reverse();
  reordered.studyItems.reverse();
  assert.equal(
    sourceExpeditionAssetSetIdentity(input),
    sourceExpeditionAssetSetIdentity(reordered)
  );
});

test("source asset identity changes with route order, selected bonuses, or selected item identity", () => {
  const baseline = sourceExpeditionAssetSetIdentity(input);
  const mutations = [
    () => {
      const changed = structuredClone(input);
      changed.routePlan.orderedDerivedNodeIds = ["node-2", "node-1", "node-3"];
      changed.routePlan.legs[0]!.derivedNodeIds = ["node-2", "node-1", "node-3"];
      return changed;
    },
    () => {
      const changed = structuredClone(input);
      changed.routePlan.legs[0]!.selectedBonusStudyItemIds[0] = "matching-2";
      return changed;
    },
    () => {
      const changed = structuredClone(input);
      changed.studyItems[0]!.studyItemId = "option-2";
      return changed;
    }
  ];
  for (const mutate of mutations) {
    assert.notEqual(sourceExpeditionAssetSetIdentity(mutate()), baseline);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { selectActivityNodeId, unansweredActivitySegments } from "./activityProgress";

test("selectActivityNodeId keeps a mastered stop active while it still has unanswered activities", () => {
  const nodeId = selectActivityNodeId({
    path: [
      { derivedNodeId: "node-a", state: "mastered" },
      { derivedNodeId: "node-b", state: "frontier" }
    ],
    studySegmentsByNode: {
      "node-a": [{ item: { studyItemId: "answered" } }, { item: { studyItemId: "unanswered" } }],
      "node-b": [{ item: { studyItemId: "next" } }]
    },
    answeredStudyItemIds: new Set(["answered"]),
    selectedFrontierTarget: "node-b",
    fallbackTargetDerivedNodeId: null
  });

  assert.equal(nodeId, "node-a");
});

test("unansweredActivitySegments hides activities already answered by this learner", () => {
  const segments = unansweredActivitySegments(
    [{ item: { studyItemId: "answered" } }, { item: { studyItemId: "unanswered" } }],
    new Set(["answered"])
  );

  assert.deepEqual(segments.map((segment) => segment.item.studyItemId), ["unanswered"]);
});

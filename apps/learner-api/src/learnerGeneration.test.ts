import assert from "node:assert/strict";
import { test } from "node:test";
import { TOPIC_EXPEDITION_MODEL_ROUTING } from "./learnerGeneration";

test("Topic Expedition production composition owns only its learner-asset and ordering aliases", () => {
  assert.deepEqual(TOPIC_EXPEDITION_MODEL_ROUTING, {
    generation: "kg-topic-expedition-generation",
    independentJudge: "kg-topic-expedition-independent-judge",
    prerequisiteOrdering: "kg-topic-expedition-prerequisite-ordering"
  });
});

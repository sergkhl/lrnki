import assert from "node:assert/strict";
import { test } from "node:test";
import { TOPIC_EXPEDITION_MODEL_ROUTING } from "./learnerGeneration";

test("Topic Expedition production composition owns exactly the seven scoped aliases", () => {
  assert.deepEqual(TOPIC_EXPEDITION_MODEL_ROUTING, {
    generation: "kg-topic-expedition-generation",
    independentJudge: "kg-topic-expedition-independent-judge",
    claimVerificationAnswerer: "kg-topic-expedition-claim-verification-answerer",
    claimFactualityJudge: "kg-topic-expedition-claim-factuality-judge",
    claimVerificationPlanner: "kg-topic-expedition-claim-verification-planner",
    claimFactualityChallenger: "kg-topic-expedition-claim-factuality-challenger",
    prerequisiteOrdering: "kg-topic-expedition-prerequisite-ordering"
  });
});

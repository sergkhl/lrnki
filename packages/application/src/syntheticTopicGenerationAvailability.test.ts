import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CURRENT_SYNTHETIC_TOPIC_GENERATION_AVAILABILITY,
  syntheticTopicGenerationIsAvailable,
  type SyntheticTopicGenerationAvailability
} from "./syntheticTopicGenerationAvailability";

test("the current Synthetic Topic Generation policy is explicitly paused", () => {
  assert.equal(CURRENT_SYNTHETIC_TOPIC_GENERATION_AVAILABILITY.status, "paused");
  assert.match(CURRENT_SYNTHETIC_TOPIC_GENERATION_AVAILABILITY.message, /source-backed generation/i);
  assert.equal(syntheticTopicGenerationIsAvailable(CURRENT_SYNTHETIC_TOPIC_GENERATION_AVAILABILITY), false);
});

test("the availability predicate narrows the retained available arm", () => {
  const availability: SyntheticTopicGenerationAvailability = { status: "available" };
  assert.equal(syntheticTopicGenerationIsAvailable(availability), true);
});

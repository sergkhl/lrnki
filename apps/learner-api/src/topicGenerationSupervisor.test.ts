import assert from "node:assert/strict";
import { test } from "node:test";
import {
  runSupervisorOnce,
  startTopicGenerationSupervisor,
  wakeTopicGenerationSupervisor
} from "./topicGenerationSupervisor";

test("the paused topic supervisor never starts, wakes, or claims database work", async () => {
  assert.equal(startTopicGenerationSupervisor(), false);
  assert.equal(wakeTopicGenerationSupervisor(), false);
  await assert.doesNotReject(runSupervisorOnce());
});

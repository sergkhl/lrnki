import assert from "node:assert/strict";
import { test } from "@jest/globals";
import { activeStopFor, type AdvanceMemory } from "./advanceMemory";

test("re-opening a stop after advance + close opens that stop, not the advanced one", () => {
  // Open stop A: no memory yet — A's own activity shows.
  let memory: AdvanceMemory = null;
  assert.equal(activeStopFor(memory, "stop-a"), "stop-a");

  // Continue from A: the sheet advances in place to stop B.
  memory = { sourceStopId: "stop-a", activeStopId: "stop-b" };
  assert.equal(activeStopFor(memory, "stop-a"), "stop-b");

  // Close the sheet: the advance memory is cleared (ActivitySheet resets on close).
  memory = null;

  // Re-open stop A: it must show A's activity again, not stop B's.
  assert.equal(activeStopFor(memory, "stop-a"), "stop-a");
});

test("memory from another source stop never redirects an unrelated stop", () => {
  const memory: AdvanceMemory = { sourceStopId: "stop-a", activeStopId: "stop-b" };
  assert.equal(activeStopFor(memory, "stop-c"), "stop-c");
});

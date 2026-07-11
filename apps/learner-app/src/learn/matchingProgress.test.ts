import assert from "node:assert/strict";
import { test } from "@jest/globals";
import { canTryMatchingPair, matchingProgress } from "./matchingProgress";

test("matchingProgress keeps three of four pairs locked but incomplete", () => {
  const progress = matchingProgress([
    { promptId: "p1", matchId: "m1" },
    { promptId: "p2", matchId: "m2" },
    { promptId: "p3", matchId: "m3" }
  ], 4);
  assert.deepEqual([...progress.lockedPromptIds].sort(), ["p1", "p2", "p3"]);
  assert.deepEqual([...progress.lockedMatchIds].sort(), ["m1", "m2", "m3"]);
  assert.equal(progress.complete, false);
});

test("matchingProgress completes only when every pair is matched", () => {
  assert.equal(matchingProgress([
    { promptId: "p1", matchId: "m1" },
    { promptId: "p2", matchId: "m2" },
    { promptId: "p3", matchId: "m3" },
    { promptId: "p4", matchId: "m4" }
  ], 4).complete, true);
});

test("canTryMatchingPair rejects locked tile interactions", () => {
  const progress = matchingProgress([{ promptId: "p1", matchId: "m1" }], 4);
  assert.equal(canTryMatchingPair({ disabled: false, pending: false, complete: false, lockedPromptIds: progress.lockedPromptIds, lockedMatchIds: progress.lockedMatchIds, promptId: "p1", matchId: "m2" }), false);
  assert.equal(canTryMatchingPair({ disabled: false, pending: false, complete: false, lockedPromptIds: progress.lockedPromptIds, lockedMatchIds: progress.lockedMatchIds, promptId: "p2", matchId: "m1" }), false);
  assert.equal(canTryMatchingPair({ disabled: false, pending: false, complete: false, lockedPromptIds: progress.lockedPromptIds, lockedMatchIds: progress.lockedMatchIds, promptId: "p2", matchId: "m2" }), true);
});

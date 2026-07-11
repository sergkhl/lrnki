import assert from "node:assert/strict";
import { test } from "@jest/globals";
import { chooseSplash, isBoardSplash } from "./splashPriority";

test("duel unlock outranks every board event (AE5)", () => {
  assert.equal(
    chooseSplash({ duelUnlockEligible: true, podiumEarnedForPreviousWeek: true, seam: "new_week" }),
    "duel_unlock"
  );
  assert.equal(
    chooseSplash({ duelUnlockEligible: true, podiumEarnedForPreviousWeek: false, seam: "rank_up" }),
    "duel_unlock"
  );
});

test("podium outranks new-week and rank events; new-week outranks rank", () => {
  assert.equal(
    chooseSplash({ duelUnlockEligible: false, podiumEarnedForPreviousWeek: true, seam: "new_week" }),
    "podium"
  );
  assert.equal(
    chooseSplash({ duelUnlockEligible: false, podiumEarnedForPreviousWeek: false, seam: "new_week" }),
    "new_week"
  );
  assert.equal(
    chooseSplash({ duelUnlockEligible: false, podiumEarnedForPreviousWeek: false, seam: "rank_up" }),
    "rank_change"
  );
  assert.equal(
    chooseSplash({ duelUnlockEligible: false, podiumEarnedForPreviousWeek: false, seam: "rank_down" }),
    "rank_change"
  );
});

test("no eligible event mounts no splash", () => {
  assert.equal(chooseSplash({ duelUnlockEligible: false, podiumEarnedForPreviousWeek: false, seam: "none" }), null);
});

test("only the duel unlock leaves the board snapshot unconsumed", () => {
  assert.equal(isBoardSplash("duel_unlock"), false);
  assert.equal(isBoardSplash("podium"), true);
  assert.equal(isBoardSplash("new_week"), true);
  assert.equal(isBoardSplash("rank_change"), true);
});

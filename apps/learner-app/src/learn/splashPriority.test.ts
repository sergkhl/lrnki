import assert from "node:assert/strict";
import { test } from "@jest/globals";
import { chooseSplash } from "./splashPriority";

test("podium outranks new-week and rank events; new-week outranks rank (AE5)", () => {
  assert.equal(
    chooseSplash({ podiumEarnedForPreviousWeek: true, seam: "new_week" }),
    "podium"
  );
  assert.equal(
    chooseSplash({ podiumEarnedForPreviousWeek: false, seam: "new_week" }),
    "new_week"
  );
  assert.equal(
    chooseSplash({ podiumEarnedForPreviousWeek: false, seam: "rank_up" }),
    "rank_change"
  );
  assert.equal(
    chooseSplash({ podiumEarnedForPreviousWeek: false, seam: "rank_down" }),
    "rank_change"
  );
});

test("no eligible event mounts no splash", () => {
  assert.equal(chooseSplash({ podiumEarnedForPreviousWeek: false, seam: "none" }), null);
});

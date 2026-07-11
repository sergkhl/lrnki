import assert from "node:assert/strict";
import { test } from "@jest/globals";
import { classifySeam } from "./seamClassifier";

test("classifySeam: a new ISO week always shows final standings (R3)", () => {
  assert.equal(classifySeam({ weekKey: "2026-W27", rank: 2, points: 10 }, { weekKey: "2026-W28", rank: 5, points: 0 }), "new_week");
});

test("classifySeam: rank improvement and drop within a week", () => {
  assert.equal(classifySeam({ weekKey: "2026-W28", rank: 5, points: 8 }, { weekKey: "2026-W28", rank: 2, points: 14 }), "rank_up");
  assert.equal(classifySeam({ weekKey: "2026-W28", rank: 2, points: 14 }, { weekKey: "2026-W28", rank: 6, points: 14 }), "rank_down");
  assert.equal(classifySeam({ weekKey: "2026-W28", rank: 3, points: 9 }, { weekKey: "2026-W28", rank: 3, points: 9 }), "none");
});

test("classifySeam: a first visit only celebrates once the learner has scored", () => {
  assert.equal(classifySeam(null, { weekKey: "2026-W28", rank: 7, points: 0 }), "none");
  assert.equal(classifySeam(null, { weekKey: "2026-W28", rank: 4, points: 5 }), "rank_up");
});

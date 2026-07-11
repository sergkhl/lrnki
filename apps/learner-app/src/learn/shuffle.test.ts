import assert from "node:assert/strict";
import { test } from "@jest/globals";
import { shuffleIds } from "./shuffle";

test("shuffleIds returns every id exactly once without mutating the input", () => {
  const ids = ["a", "b", "c", "d"];
  const shuffled = shuffleIds(ids, () => 0.9);
  assert.deepEqual(ids, ["a", "b", "c", "d"]);
  assert.deepEqual([...shuffled].sort(), ids);
  assert.equal(shuffled.length, ids.length);
});

test("shuffleIds changes order when random draws request swaps", () => {
  assert.deepEqual(shuffleIds(["a", "b", "c"], () => 0), ["b", "c", "a"]);
});

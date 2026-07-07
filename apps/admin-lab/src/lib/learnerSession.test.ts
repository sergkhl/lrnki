import assert from "node:assert/strict";
import { test } from "node:test";
import { compactLearnerRef } from "./learnerSession";

test("compactLearnerRef trims and collapses whitespace", () => {
  assert.equal(compactLearnerRef("  New   Explorer  "), "New Explorer");
  assert.equal(compactLearnerRef("\tAda\nLovelace "), "Ada Lovelace");
});

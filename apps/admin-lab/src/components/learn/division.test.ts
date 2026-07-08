import assert from "node:assert/strict";
import test from "node:test";
import { divisionForMasteredCrystals } from "./division";

test("divisionForMasteredCrystals maps lifetime mastered crystals to the themed ladder", () => {
  assert.deepEqual(divisionForMasteredCrystals(0), { name: "Basecamp", threshold: 0, nextThreshold: 10 });
  assert.deepEqual(divisionForMasteredCrystals(9), { name: "Basecamp", threshold: 0, nextThreshold: 10 });
  assert.deepEqual(divisionForMasteredCrystals(10), { name: "Foothills", threshold: 10, nextThreshold: 30 });
  assert.deepEqual(divisionForMasteredCrystals(30), { name: "Ridge", threshold: 30, nextThreshold: 75 });
  assert.deepEqual(divisionForMasteredCrystals(75), { name: "Summit", threshold: 75, nextThreshold: null });
  assert.deepEqual(divisionForMasteredCrystals(-4), { name: "Basecamp", threshold: 0, nextThreshold: 10 });
});

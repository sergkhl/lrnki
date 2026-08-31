import assert from "node:assert/strict";
import { test } from "@jest/globals";
import {
  MINERAL_GROUND_Y,
  clipPolygonBelow,
  growthCutY
} from "./mineralSpecimen";

// Art-independent substrate only: the species half moved to crystalLibrary.test.ts, so this
// suite exercises the clip and the progress derivation against a synthetic silhouette and
// can never be invalidated by an art swap.
const SHAPE = { silhouette: [[20, 95], [20, 60], [50, 20], [80, 60], [80, 95]] as const };

// KTD3/KTD4: the half-plane clip at 0 / fractional / 1 growth.
test("growth clip keeps exactly the region below the cut line", () => {
  // Growth 1: cut at the silhouette top keeps the whole silhouette.
  assert.deepEqual(clipPolygonBelow(SHAPE.silhouette, growthCutY(SHAPE, 1)), [...SHAPE.silhouette]);

  // Growth 0: cut at the ground leaves a degenerate (zero-height) region.
  const flat = clipPolygonBelow(SHAPE.silhouette, growthCutY(SHAPE, 0));
  assert.ok(flat.every(([, y]) => y === MINERAL_GROUND_Y));

  // Fractional: every kept point sits on or below the cut; the cut edge is exact.
  const cut = growthCutY(SHAPE, 0.5);
  const half = clipPolygonBelow(SHAPE.silhouette, cut);
  assert.ok(half.length >= 3);
  assert.ok(half.every(([, y]) => y >= cut));
  assert.ok(half.some(([, y]) => y === cut));

  // A triangle entirely above the cut clips to nothing.
  assert.deepEqual(clipPolygonBelow([[0, 0], [10, 0], [5, 8]], 50), []);

  // Out-of-range growth clamps.
  assert.equal(growthCutY(SHAPE, 1.4), growthCutY(SHAPE, 1));
  assert.equal(growthCutY(SHAPE, -0.2), growthCutY(SHAPE, 0));
});

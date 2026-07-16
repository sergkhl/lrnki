import assert from "node:assert/strict";
import { test } from "@jest/globals";
import { difficultyBand } from "@lrnki/application/projection";
import {
  MINERAL_GROUND_Y,
  clipPolygonBelow,
  formationProgress,
  formationProgressLine,
  growthCutY,
  mineralSpeciesFor,
  mineralSpecimenSpec,
  mineralVariationFor,
  type MineralSpecies
} from "./mineralSpecimen";

// Species = intrinsic difficulty band ONLY (D1): 1–2 quartz, 3–4 amethyst, 5 diamond,
// through the SAME shared banding the weekly score uses.
test("mineralSpeciesFor maps difficulty bands to the three curated species", () => {
  const byBand = new Map<number, MineralSpecies>();
  for (const difficulty of [null, 0, 0.1, 0.3, 0.5, 0.62, 0.75, 0.9, 1]) {
    byBand.set(difficultyBand(difficulty), mineralSpeciesFor(difficulty));
  }
  assert.equal(byBand.get(1), "quartz");
  assert.equal(byBand.get(2), "quartz");
  assert.equal(byBand.get(3), "amethyst");
  assert.equal(byBand.get(4), "amethyst");
  assert.equal(byBand.get(5), "diamond");
  assert.equal(mineralSpeciesFor(null), "quartz");
});

// The curated specs are static, closed, and grounded: no runtime PRNG geometry.
test("every species spec is a grounded closed silhouette with 2-3 facets and a gloss", () => {
  for (const species of ["quartz", "amethyst", "diamond"] as const) {
    const spec = mineralSpecimenSpec(species);
    assert.equal(spec.species, species);
    assert.deepEqual(mineralSpecimenSpec(species), spec);
    assert.ok(spec.silhouette.length >= 5);
    assert.equal(Math.max(...spec.silhouette.map(([, y]) => y)), MINERAL_GROUND_Y);
    assert.ok(spec.facets.length >= 2 && spec.facets.length <= 3);
    assert.ok(spec.gloss.length >= 3);
    assert.ok(spec.glossOpacity > 0 && spec.glossOpacity <= 1);
  }
  // Diamond carries the strongest gloss (D7).
  assert.ok(
    mineralSpecimenSpec("diamond").glossOpacity >
      Math.max(mineralSpecimenSpec("quartz").glossOpacity, mineralSpecimenSpec("amethyst").glossOpacity)
  );
});

test("per-concept variation is deterministic, bounded, and never new geometry", () => {
  const variation = mineralVariationFor("node-a");
  assert.deepEqual(mineralVariationFor("node-a"), variation);
  assert.ok(variation.scale >= 0.9 && variation.scale <= 1);
  const flips = new Set(Array.from({ length: 16 }, (_, index) => mineralVariationFor(`node-${index}`).mirrored));
  assert.equal(flips.size, 2);
});

// KTD1: the half-plane clip at 0 / fractional / 1 growth.
test("growth clip keeps exactly the region below the cut line", () => {
  const spec = mineralSpecimenSpec("quartz");

  // Growth 1: cut at the silhouette top keeps the whole silhouette.
  assert.deepEqual(clipPolygonBelow(spec.silhouette, growthCutY(spec, 1)), [...spec.silhouette]);

  // Growth 0: cut at the ground leaves a degenerate (zero-height) region.
  const flat = clipPolygonBelow(spec.silhouette, growthCutY(spec, 0));
  assert.ok(flat.every(([, y]) => y === MINERAL_GROUND_Y));

  // Fractional: every kept point sits on or below the cut; the cut edge is exact.
  const cut = growthCutY(spec, 0.5);
  const half = clipPolygonBelow(spec.silhouette, cut);
  assert.ok(half.length >= 3);
  assert.ok(half.every(([, y]) => y >= cut));
  assert.ok(half.some(([, y]) => y === cut));

  // A triangle entirely above the cut clips to nothing.
  assert.deepEqual(clipPolygonBelow([[0, 0], [10, 0], [5, 8]], 50), []);

  // Out-of-range growth clamps.
  assert.equal(growthCutY(spec, 1.4), growthCutY(spec, 1));
  assert.equal(growthCutY(spec, -0.2), growthCutY(spec, 0));
});

test("formationProgress separates completed ground, collected crystals, and known ground", () => {
  const progress = formationProgress([
    { state: "mastered", isKnownSkipped: false },
    { state: "mastered", isKnownSkipped: true },
    { state: "frontier", isKnownSkipped: false },
    { state: "locked", isKnownSkipped: false }
  ]);
  assert.deepEqual(progress, {
    totalGround: 4,
    completedGround: 2,
    collectedCrystals: 1,
    knownGround: 1,
    completionFraction: 0.5
  });
  assert.equal(formationProgressLine(progress), "2 of 4 ground complete · 1 crystal · 1 known");
  assert.equal(formationProgress([]).completionFraction, 0);
  assert.equal(
    formationProgressLine(formationProgress([{ state: "frontier", isKnownSkipped: false }])),
    "0 of 1 ground complete · 0 crystals"
  );
});

import assert from "node:assert/strict";
import { test } from "@jest/globals";
import {
  MINERAL_HABITS,
  formationProgress,
  formationProgressLine,
  mineralHabitFor,
  mineralSpecimenSpec,
  visibleMineralFacets
} from "./mineralSpecimen";

test("mineralHabitFor is a balanced cycle: three consecutive section positions yield one of each habit", () => {
  for (const sectionIndex of [0, 1, 2, 7, 13]) {
    const habits = [0, 1, 2].map((sectionPositionIndex) => mineralHabitFor({ sectionIndex, sectionPositionIndex }));
    assert.deepEqual([...habits].sort(), [...MINERAL_HABITS].sort());
  }
});

test("mineralHabitFor depends only on the concept's own section coordinates", () => {
  const a = mineralHabitFor({ sectionIndex: 3, sectionPositionIndex: 1 });
  const b = mineralHabitFor({ sectionIndex: 3, sectionPositionIndex: 1 });
  assert.equal(a, b);
  // The section-stable offset varies which habit OPENS a section.
  const openers = new Set(Array.from({ length: 12 }, (_, sectionIndex) => mineralHabitFor({ sectionIndex, sectionPositionIndex: 0 })));
  assert.ok(openers.size > 1);
});

test("mineralSpecimenSpec is deterministic per habit and node id", () => {
  assert.deepEqual(mineralSpecimenSpec("quartz", "node-a"), mineralSpecimenSpec("quartz", "node-a"));
  assert.notDeepEqual(
    mineralSpecimenSpec("quartz", "node-a").facets.map((facet) => facet.points),
    mineralSpecimenSpec("quartz", "node-b").facets.map((facet) => facet.points)
  );
});

test("the three habits expose shape-distinct facet structures, not color differences", () => {
  const quartz = mineralSpecimenSpec("quartz", "node-a");
  const fluorite = mineralSpecimenSpec("fluorite", "node-a");
  const calcite = mineralSpecimenSpec("calcite", "node-a");
  // Quartz terminates in triangular pyramid facets; fluorite and calcite are all quads.
  assert.ok(quartz.facets.some((facet) => facet.points.length === 3));
  assert.ok(fluorite.facets.every((facet) => facet.points.length === 4));
  assert.ok(calcite.facets.every((facet) => facet.points.length === 4));
  // Fluorite tops are flat (its sealing facet is the level top rhombus); calcite's
  // sealing top rhomb is oblique (its first two points differ in y — the shear).
  const fluoriteTop = fluorite.facets[fluorite.facets.length - 1];
  const calciteFront = calcite.facets[2];
  assert.equal(calciteFront.points[0][0] === calciteFront.points[1][0], false);
  assert.notDeepEqual(fluoriteTop.points, calcite.facets[calcite.facets.length - 1].points);
  // Same shared palette language: hue seeded identically per node id.
  for (const spec of [quartz, fluorite, calcite]) {
    assert.ok(spec.hue >= 152 && spec.hue <= 192);
  }
});

test("all facets stay inside the 0..100 viewBox and stand on the ground line", () => {
  for (const habit of MINERAL_HABITS) {
    for (const id of ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"]) {
      const spec = mineralSpecimenSpec(habit, id);
      const points = spec.facets.flatMap((facet) => facet.points);
      for (const [x, y] of points) {
        assert.ok(x >= 0 && x <= 100, `${habit}/${id} x=${x}`);
        assert.ok(y >= 0 && y <= 100, `${habit}/${id} y=${y}`);
      }
      assert.equal(Math.max(...points.map(([, y]) => y)), 95);
    }
  }
});

test("growth reveals facets in order and reserves the final facet for completion", () => {
  const spec = mineralSpecimenSpec("fluorite", "node-a");
  assert.equal(visibleMineralFacets(spec, 0).length, 0);
  const partial = visibleMineralFacets(spec, 0.99);
  assert.equal(partial.length, spec.facets.length - 1);
  assert.equal(visibleMineralFacets(spec, 1).length, spec.facets.length);
  assert.deepEqual(
    visibleMineralFacets(spec, 1).map((facet) => facet.revealIndex),
    spec.facets.map((_, index) => index)
  );
});

test("formationProgress counts completed ground, crystals, and known ground independently", () => {
  const progress = formationProgress([
    { state: "mastered", isKnownSkipped: false },
    { state: "mastered", isKnownSkipped: false },
    { state: "mastered", isKnownSkipped: true },
    { state: "frontier", isKnownSkipped: false }
  ]);
  assert.deepEqual(progress, {
    totalGround: 4,
    completedGround: 3,
    collectedCrystals: 2,
    knownGround: 1,
    completionFraction: 0.75
  });
  assert.equal(formationProgressLine(progress), "3 of 4 ground complete · 2 crystals · 1 known");
});

test("formationProgress is total for an empty scope and omits a zero known count from copy", () => {
  const empty = formationProgress([]);
  assert.equal(empty.completionFraction, 0);
  const line = formationProgressLine(formationProgress([{ state: "mastered", isKnownSkipped: false }]));
  assert.equal(line, "1 of 1 ground complete · 1 crystal");
});

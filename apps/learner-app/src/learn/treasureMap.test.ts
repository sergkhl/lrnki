import { expect, test } from "@jest/globals";
import {
  buildMapGround,
  buildTreasureRoute,
  doodleExtent,
  marginBands,
  type MapPoint,
  type MapStopAnchor
} from "./treasureMap";

// Anchors shaped like the trail's measured centers: sine x-offsets around a 384px
// column center, ~96px vertical rhythm.
function anchors(count: number): MapPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    x: 192 + Math.round(56 * Math.sin((index * Math.PI) / 4)),
    y: 40 + index * 96
  }));
}

// A 17-Leg-scale fixture shape (crystalFormationLayout's real-shape scale): 3 stops per
// section across 17 sections.
function seventeenLegAnchors(): MapStopAnchor[] {
  return Array.from({ length: 17 * 3 }, (_, index) => ({
    y: 40 + index * 96,
    sectionIndex: Math.floor(index / 3)
  }));
}

test("the same seed reproduces the identical map and route", () => {
  const points = anchors(9);
  const stopAnchors = seventeenLegAnchors();
  const routeA = buildTreasureRoute({ seed: "enrichment-1", points, completedCount: 4 });
  const routeB = buildTreasureRoute({ seed: "enrichment-1", points, completedCount: 4 });
  expect(routeA).toEqual(routeB);
  const groundA = buildMapGround({ seed: "enrichment-1", width: 384, height: 5000, stopAnchors });
  const groundB = buildMapGround({ seed: "enrichment-1", width: 384, height: 5000, stopAnchors });
  expect(groundA).toEqual(groundB);
});

test("different seeds diverge", () => {
  const points = anchors(9);
  const stopAnchors = seventeenLegAnchors();
  expect(buildTreasureRoute({ seed: "enrichment-1", points, completedCount: 4 })).not.toEqual(
    buildTreasureRoute({ seed: "enrichment-2", points, completedCount: 4 })
  );
  expect(buildMapGround({ seed: "enrichment-1", width: 384, height: 5000, stopAnchors })).not.toEqual(
    buildMapGround({ seed: "enrichment-2", width: 384, height: 5000, stopAnchors })
  );
});

test("the route passes through every measured anchor and splits at the first incomplete stop", () => {
  const points = anchors(9);
  const route = buildTreasureRoute({ seed: "enrichment-1", points, completedCount: 4 });
  const rendered = `${route.inkedPath} ${route.unchartedPath}`;
  for (const point of points) {
    expect(rendered).toContain(`${point.x} ${point.y}`);
  }
  // The inked path covers exactly the completed anchors; the uncharted path continues
  // from the LAST inked anchor so the drawn line never breaks.
  expect(route.inkedPath.startsWith(`M ${points[0].x} ${points[0].y}`)).toBe(true);
  expect(route.inkedPath.endsWith(`${points[3].x} ${points[3].y}`)).toBe(true);
  expect(route.unchartedPath.startsWith(`M ${points[3].x} ${points[3].y}`)).toBe(true);
  expect(route.unchartedPath.endsWith(`${points[8].x} ${points[8].y}`)).toBe(true);
  // Nothing complete: everything is uncharted.
  const fresh = buildTreasureRoute({ seed: "enrichment-1", points, completedCount: 0 });
  expect(fresh.inkedPath).toBe("");
  expect(fresh.unchartedPath.startsWith(`M ${points[0].x} ${points[0].y}`)).toBe(true);
});

test("route jitter stays bounded and the dash rhythm is irregular but sane", () => {
  const points = anchors(9);
  const route = buildTreasureRoute({ seed: "enrichment-1", points, completedCount: 9 });
  // Every numeric x in the path stays within jitter reach of the sine column.
  const xs = (route.inkedPath.match(/[C ] ([\d.]+) /g) ?? []).map((chunk) => Number(chunk.trim().split(" ")[1] ?? chunk));
  for (const x of xs.filter((value) => !Number.isNaN(value))) {
    expect(x).toBeGreaterThanOrEqual(192 - 56 - 12);
    expect(x).toBeLessThanOrEqual(192 + 56 + 12);
  }
  const dashes = route.unchartedDash.split(" ").map(Number);
  expect(dashes).toHaveLength(6);
  expect(new Set(dashes).size).toBeGreaterThan(1);
  for (const dash of dashes) {
    expect(dash).toBeGreaterThanOrEqual(3);
    expect(dash).toBeLessThanOrEqual(12);
  }
});

test("every doodle lands inside a margin band, outside the center column", () => {
  const ground = buildMapGround({ seed: "enrichment-1", width: 384, height: 5000, stopAnchors: seventeenLegAnchors() });
  const bands = marginBands(384);
  expect(ground.doodles.length).toBeGreaterThan(0);
  for (const doodle of ground.doodles) {
    const [left, right] = doodleExtent(doodle);
    const inLeft = left >= bands.left[0] && right <= bands.left[1];
    const inRight = left >= bands.right[0] && right <= bands.right[1];
    expect(inLeft || inRight).toBe(true);
  }
});

test("doodle density is capped per section and a compass rose sits near the map top", () => {
  const stopAnchors = seventeenLegAnchors();
  const ground = buildMapGround({ seed: "enrichment-1", width: 384, height: 5000, stopAnchors });
  const compasses = ground.doodles.filter((doodle) => doodle.kind === "compass");
  expect(compasses).toHaveLength(1);
  expect(compasses[0].y).toBeLessThanOrEqual(48);
  // At most 2 non-compass doodles per section band across the 17-Leg shape.
  expect(ground.doodles.length - 1).toBeLessThanOrEqual(17 * 2);
  for (let sectionIndex = 0; sectionIndex < 17; sectionIndex += 1) {
    const band = stopAnchors.filter((anchor) => anchor.sectionIndex === sectionIndex);
    const minY = Math.min(...band.map((anchor) => anchor.y));
    const maxY = Math.max(...band.map((anchor) => anchor.y));
    const inBand = ground.doodles.filter(
      (doodle) => doodle.kind !== "compass" && doodle.y >= minY && doodle.y <= maxY
    );
    expect(inBand.length).toBeLessThanOrEqual(2);
  }
});

test("a narrow container renders no doodles rather than crowding the trail", () => {
  const ground = buildMapGround({ seed: "enrichment-1", width: 240, height: 2000, stopAnchors: seventeenLegAnchors() });
  expect(ground.doodles).toHaveLength(0);
  // Ground treatment survives: grain and edge are still produced.
  expect(ground.grain.marks.length).toBeGreaterThan(0);
  expect(ground.edgePath.length).toBeGreaterThan(0);
});

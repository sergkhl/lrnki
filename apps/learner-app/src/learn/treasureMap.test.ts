import { expect, test } from "@jest/globals";
import {
  buildMapDoodles,
  buildMapGrain,
  buildTreasureRoute,
  doodleBox,
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
  expect(buildMapGrain("enrichment-1")).toEqual(buildMapGrain("enrichment-1"));
  const doodlesA = buildMapDoodles({ seed: "enrichment-1", width: 384, stopAnchors });
  const doodlesB = buildMapDoodles({ seed: "enrichment-1", width: 384, stopAnchors });
  expect(doodlesA).toEqual(doodlesB);
});

test("different seeds diverge", () => {
  const points = anchors(9);
  const stopAnchors = seventeenLegAnchors();
  expect(buildTreasureRoute({ seed: "enrichment-1", points, completedCount: 4 })).not.toEqual(
    buildTreasureRoute({ seed: "enrichment-2", points, completedCount: 4 })
  );
  expect(buildMapGrain("enrichment-1")).not.toEqual(buildMapGrain("enrichment-2"));
  expect(buildMapDoodles({ seed: "enrichment-1", width: 384, stopAnchors })).not.toEqual(
    buildMapDoodles({ seed: "enrichment-2", width: 384, stopAnchors })
  );
});

test("the route passes through every measured anchor and splits at the first incomplete stop", () => {
  const points = anchors(9);
  const route = buildTreasureRoute({ seed: "enrichment-1", points, completedCount: 4 });
  const rendered = route.segments.map((segment) => segment.d).join(" ");
  for (const point of points) {
    expect(rendered).toContain(`${point.x} ${point.y}`);
  }
  // One segment per consecutive pair, and every segment repeats its neighbour's anchor so
  // the drawn line never breaks where the treatment changes.
  expect(route.segments).toHaveLength(points.length - 1);
  for (const [index, segment] of route.segments.entries()) {
    expect(segment.d.startsWith(`M ${points[index].x} ${points[index].y}`)).toBe(true);
    expect(segment.d.endsWith(`${points[index + 1].x} ${points[index + 1].y}`)).toBe(true);
  }
  // The inked run covers exactly the completed anchors; the uncharted rhythm takes over at
  // the segment leaving the last completed stop.
  const states = route.segments.map((segment) => segment.state);
  expect(states.slice(0, 3).every((state) => state === "inked")).toBe(true);
  expect(states.slice(3).every((state) => state === "uncharted")).toBe(true);
  // Nothing complete: everything is uncharted.
  const fresh = buildTreasureRoute({ seed: "enrichment-1", points, completedCount: 0 });
  expect(fresh.segments.every((segment) => segment.state === "uncharted")).toBe(true);
});

test("route jitter stays bounded and the dash rhythm is irregular but sane", () => {
  const points = anchors(9);
  const route = buildTreasureRoute({ seed: "enrichment-1", points, completedCount: 9 });
  // Every numeric x in the path stays within jitter reach of the sine column.
  const rendered = route.segments.map((segment) => segment.d).join(" ");
  const xs = (rendered.match(/[MC] ([\d.]+) /g) ?? []).map((chunk) => Number(chunk.trim().split(" ")[1] ?? chunk));
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

// The crash this split exists to prevent: react-native-svg rasterizes each <Svg> into an
// offscreen ARGB_8888 bitmap the size of the view, and Android's RecordingCanvas throws on
// any bitmap over 100MB. A single canvas over a real expedition (86 concepts measured
// ~36,000px of trail) asked for 383MB. What makes that impossible now is that no drawing
// box grows with the trail — so assert exactly that, against a trail long enough to have
// crashed the shipped screen.
test("no drawing box grows with the trail, however long the expedition gets", () => {
  const short = buildTreasureRoute({ seed: "enrichment-1", points: anchors(9), completedCount: 4 });
  const long = buildTreasureRoute({ seed: "enrichment-1", points: anchors(400), completedCount: 200 });
  const widest = (route: typeof long) => Math.max(...route.segments.map((segment) => segment.box.width));
  const tallest = (route: typeof long) => Math.max(...route.segments.map((segment) => segment.box.height));
  // A 400-stop trail spans ~38,000px, yet its worst segment box is no bigger than a
  // 9-stop trail's: each one spans a single row gap.
  expect(widest(long)).toBeLessThanOrEqual(widest(short));
  expect(tallest(long)).toBeLessThanOrEqual(tallest(short));
  // At a 3x device scale even the worst box is a ~1MB bitmap, four orders of magnitude
  // under the 100MB cap, and well under the ~8192px max texture size.
  for (const segment of long.segments) {
    expect(segment.box.width * 3).toBeLessThan(8192);
    expect(segment.box.height * 3).toBeLessThan(8192);
    expect(segment.box.width * 3 * segment.box.height * 3 * 4).toBeLessThan(4 * 1024 * 1024);
  }
  // Doodles are anchored anywhere down the trail but each draws on its own small canvas.
  const doodles = buildMapDoodles({
    seed: "enrichment-1",
    width: 384,
    stopAnchors: Array.from({ length: 400 }, (_, index) => ({ y: 40 + index * 96, sectionIndex: Math.floor(index / 3) }))
  });
  expect(doodles.length).toBeGreaterThan(0);
  for (const doodle of doodles) {
    const box = doodleBox(doodle);
    expect(box.width).toBeLessThan(48);
    expect(box.height).toBeLessThan(48);
  }
});

test("every doodle's drawing box contains the ink it draws", () => {
  const doodles = buildMapDoodles({ seed: "enrichment-1", width: 384, stopAnchors: seventeenLegAnchors() });
  for (const doodle of doodles) {
    const box = doodleBox(doodle);
    const [left, right] = doodleExtent(doodle);
    expect(box.x).toBeLessThanOrEqual(left);
    expect(box.x + box.width).toBeGreaterThanOrEqual(right);
    // The compass and peak occupy `size` below their y; the contour's waves rise above it.
    expect(box.y).toBeLessThanOrEqual(doodle.y);
    const inkBottom = doodle.kind === "contour" ? doodle.y + 5 : doodle.y + doodle.size;
    expect(box.y + box.height).toBeGreaterThanOrEqual(inkBottom);
  }
});

test("every doodle lands inside a margin band, outside the center column", () => {
  const doodles = buildMapDoodles({ seed: "enrichment-1", width: 384, stopAnchors: seventeenLegAnchors() });
  const bands = marginBands(384);
  expect(doodles.length).toBeGreaterThan(0);
  for (const doodle of doodles) {
    const [left, right] = doodleExtent(doodle);
    const inLeft = left >= bands.left[0] && right <= bands.left[1];
    const inRight = left >= bands.right[0] && right <= bands.right[1];
    expect(inLeft || inRight).toBe(true);
  }
});

test("doodle density is capped per section and a compass rose sits near the map top", () => {
  const stopAnchors = seventeenLegAnchors();
  const doodles = buildMapDoodles({ seed: "enrichment-1", width: 384, stopAnchors });
  const compasses = doodles.filter((doodle) => doodle.kind === "compass");
  expect(compasses).toHaveLength(1);
  expect(compasses[0].y).toBeLessThanOrEqual(48);
  // At most 2 non-compass doodles per section band across the 17-Leg shape.
  expect(doodles.length - 1).toBeLessThanOrEqual(17 * 2);
  for (let sectionIndex = 0; sectionIndex < 17; sectionIndex += 1) {
    const band = stopAnchors.filter((anchor) => anchor.sectionIndex === sectionIndex);
    const minY = Math.min(...band.map((anchor) => anchor.y));
    const maxY = Math.max(...band.map((anchor) => anchor.y));
    const inBand = doodles.filter((doodle) => doodle.kind !== "compass" && doodle.y >= minY && doodle.y <= maxY);
    expect(inBand.length).toBeLessThanOrEqual(2);
  }
});

test("a narrow container renders no doodles rather than crowding the trail", () => {
  expect(buildMapDoodles({ seed: "enrichment-1", width: 240, stopAnchors: seventeenLegAnchors() })).toHaveLength(0);
  // The grain is a repeating texture, so it survives regardless of the measured column.
  expect(buildMapGrain("enrichment-1").marks.length).toBeGreaterThan(0);
});

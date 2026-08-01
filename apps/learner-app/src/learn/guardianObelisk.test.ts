import { expect, test } from "@jest/globals";
import {
  OBELISK_APEX_Y,
  OBELISK_BASE_Y,
  guardianObeliskLayout,
  type GuardianObeliskLayout,
  type GuardianObeliskSegment
} from "./guardianObelisk";
import { type CrystalSpecies } from "./crystalLibrary";

// U1 contract (KTD1–KTD6). Two claims carry the whole redesign and neither is observable in a
// renderer: the frame is a function of `wardTotal` ALONE, and the segments partition that frame
// exactly, base to crown, with shared seams. The production ward counts are 1..5 for a Leg and
// 1..7 for an Expedition — the old three-crystal body was never a game rule.

const LEG: CrystalSpecies = "legWard";
const SUMMIT: CrystalSpecies = "summitWard";

const TOTALS = [1, 2, 5, 7] as const;

function layout(wardTotal: number, wardsRemaining: number, ward: CrystalSpecies = LEG): GuardianObeliskLayout {
  return guardianObeliskLayout({ ward, wardTotal, wardsRemaining });
}

function parse(points: string): [number, number][] {
  return points.split(" ").map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return [x, y];
  });
}

function statesOf(segments: readonly GuardianObeliskSegment[]): string[] {
  return segments.map((segment) => segment.state);
}

function topY(points: string): number {
  return Math.min(...parse(points).map(([, y]) => y));
}

function bottomY(points: string): number {
  return Math.max(...parse(points).map(([, y]) => y));
}

// Even-odd ray cast — used to prove the emblem and every segment sit inside the authored frame.
function contains(polygon: string, [px, py]: [number, number]): boolean {
  const points = parse(polygon);
  let inside = false;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    if (y1 > py !== y2 > py && px < ((x2 - x1) * (py - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

// Segment corners sit exactly ON the frame edge, where a ray cast is undefined. Nudging the
// point a hair toward the body's interior anchor resolves the boundary case: the obelisk is
// star-shaped about its own centre, so an inside point stays inside and an outside point stays
// outside.
const INTERIOR_ANCHOR: [number, number] = [50, 70];

function containedOrOnEdge(polygon: string, [px, py]: [number, number]): boolean {
  const dx = INTERIOR_ANCHOR[0] - px;
  const dy = INTERIOR_ANCHOR[1] - py;
  const length = Math.hypot(dx, dy) || 1;
  return contains(polygon, [px + (dx / length) * 0.05, py + (dy / length) * 0.05]);
}

test("the obelisk renders exactly one segment per real ward, for every production total", () => {
  for (const total of TOTALS) {
    for (let remaining = total; remaining >= 0; remaining -= 1) {
      expect(layout(total, remaining).segments).toHaveLength(total);
    }
  }
});

test("segments partition into resolved below, exactly one current, and queued above", () => {
  for (const total of TOTALS) {
    for (let remaining = total; remaining >= 1; remaining -= 1) {
      const states = statesOf(layout(total, remaining).segments);
      const resolved = total - remaining;
      expect(states).toEqual([
        ...Array(resolved).fill("resolved"),
        "current",
        ...Array(remaining - 1).fill("queued")
      ]);
      // Redundant on purpose: the counts are what the learner reads off the body.
      expect(states.filter((state) => state === "current")).toHaveLength(1);
      expect(states).toHaveLength(total);
    }
  }
});

test("a won Guardian keeps every segment standing as resolved stone", () => {
  for (const total of TOTALS) {
    const { segments } = layout(total, 0);
    expect(statesOf(segments)).toEqual(Array(total).fill("resolved"));
    expect(segments).toHaveLength(total);
  }
});

test("the Final Ward is always the crown", () => {
  for (const total of TOTALS) {
    const { segments } = layout(total, 1);
    const crown = segments[total - 1];
    expect(crown.state).toBe("current");
    expect(topY(crown.points)).toBe(OBELISK_APEX_Y);
    // Everything below it is already stone.
    expect(statesOf(segments.slice(0, -1))).toEqual(Array(total - 1).fill("resolved"));
  }
});

test("segments are ordered base to crown and share exact seams without overlapping", () => {
  for (const total of TOTALS) {
    const { segments } = layout(total, total);
    expect(segments.map((segment) => segment.indexFromBase)).toEqual(
      Array.from({ length: total }, (_, index) => index)
    );
    expect(bottomY(segments[0].points)).toBe(OBELISK_BASE_Y);
    expect(topY(segments[total - 1].points)).toBe(OBELISK_APEX_Y);
    for (let index = 1; index < total; index += 1) {
      // The upper band's bottom edge IS the lower band's top edge — one shared y, so the
      // stack can neither gap nor overlap.
      expect(bottomY(segments[index].points)).toBe(topY(segments[index - 1].points));
    }
  }
});

test("the frame and every segment's geometry depend on ward total alone, never on progress", () => {
  for (const total of TOTALS) {
    const full = layout(total, total);
    for (let remaining = total - 1; remaining >= 0; remaining -= 1) {
      const progressed = layout(total, remaining);
      expect(progressed.framePoints).toBe(full.framePoints);
      expect(progressed.segments.map((segment) => segment.points)).toEqual(
        full.segments.map((segment) => segment.points)
      );
      expect(progressed.segments.map((segment) => segment.highlightPoints)).toEqual(
        full.segments.map((segment) => segment.highlightPoints)
      );
    }
  }
});

test("the frame is identical across ward totals and both scope wards", () => {
  const reference = layout(1, 1).framePoints;
  for (const total of TOTALS) {
    expect(layout(total, total, LEG).framePoints).toBe(reference);
    expect(layout(total, total, SUMMIT).framePoints).toBe(reference);
  }
});

test("every segment and its facet stay inside the authored frame", () => {
  for (const total of TOTALS) {
    const { framePoints, segments } = layout(total, total);
    for (const segment of segments) {
      for (const point of parse(segment.points)) {
        expect(containedOrOnEdge(framePoints, point)).toBe(true);
      }
      if (segment.highlightPoints === null) continue;
      for (const point of parse(segment.highlightPoints)) {
        expect(containedOrOnEdge(framePoints, point)).toBe(true);
      }
    }
  }
});

test("the crown carries the scope ward's own silhouette, contained and shape-distinct", () => {
  const leg = layout(5, 5, LEG);
  const summit = layout(7, 7, SUMMIT);
  // Distinct vertex counts prove the diamond and the trident are still different shapes, and
  // the emblem is the library silhouette rather than a second art source.
  expect(parse(leg.crownWardPoints)).toHaveLength(4);
  expect(parse(summit.crownWardPoints)).toHaveLength(13);
  expect(leg.crownWardPoints).not.toBe(summit.crownWardPoints);
  for (const emblem of [leg.crownWardPoints, summit.crownWardPoints]) {
    for (const point of parse(emblem)) {
      expect(containedOrOnEdge(leg.framePoints, point)).toBe(true);
    }
  }
});

test("a one-ward Guardian is the whole body, not a lone crown", () => {
  const { framePoints, segments } = layout(1, 1);
  expect(segments).toHaveLength(1);
  expect(segments[0].points).toBe(framePoints);
  expect(segments[0].highlightPoints).not.toBeNull();
});

test("every production total keeps a readable facet on each segment", () => {
  for (const total of TOTALS) {
    for (const segment of layout(total, total).segments) {
      expect(segment.highlightPoints).not.toBeNull();
    }
  }
});

test("an out-of-contract projection is clamped for rendering safety, never reinterpreted", () => {
  // Below one segment there is no body to draw; above the total there is no ward to be on.
  expect(layout(0, 0).segments).toHaveLength(1);
  expect(statesOf(layout(3, 9).segments)).toEqual(["current", "queued", "queued"]);
  expect(statesOf(layout(3, -2).segments)).toEqual(["resolved", "resolved", "resolved"]);
  // A count far past the design range still yields a complete, non-overlapping body — the
  // shallow bands simply drop their unreadable facets.
  const wide = layout(24, 24);
  expect(wide.segments).toHaveLength(24);
  expect(wide.segments.slice(0, -1).every((segment) => segment.highlightPoints === null)).toBe(true);
});

test("the layout is deterministic", () => {
  expect(layout(5, 3)).toEqual(layout(5, 3));
  expect(layout(7, 4, SUMMIT)).toEqual(layout(7, 4, SUMMIT));
});

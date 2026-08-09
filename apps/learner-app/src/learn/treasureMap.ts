// The treasure-map field-chart layout (plan 2026-07-18-001 U2): one pure, deterministic
// module in the mineralSpecimen/crystalFormationLayout idiom. Seeded by `enrichmentId`,
// it computes the hand-drawn route geometry, the parchment grain treatment, and sparse
// margin doodles for dumb SVG consumers. Decoration is nonsemantic and bounded (KTD8):
// doodles live only in the side margins, capped per section, and never encode graph
// structure or progress. No SVG filters anywhere (KTD3).
//
// Every shape here carries its OWN drawing box, because react-native-svg draws each <Svg>
// through an offscreen ARGB_8888 bitmap the size of the view and Android's RecordingCanvas
// refuses any bitmap over 100MB. One canvas stretched over a real trail (a 400-stop
// expedition measures ~36,000dp) asks for ~383MB and crashes the screen outright, so this
// module emits per-segment and per-doodle boxes that stay row-scale however long the trail
// grows. Consumers place a box-sized <Svg> and set a matching `viewBox`, which is why every
// path below stays in container coordinates.
import { hashSeed, mulberry32 } from "./mineralSpecimen";

export type MapPoint = Readonly<{ x: number; y: number }>;
export type MapStopAnchor = Readonly<{ y: number; sectionIndex: number }>;
/** A shape's own canvas in container coordinates: position, size, and stroke padding. */
export type MapBox = Readonly<{ x: number; y: number; width: number; height: number }>;

// Route jitter stays well inside the 36px checkpoint-circle half-box so the drawn line
// always reads as passing through every measured circle center (R2).
const ROUTE_JITTER_MAX_PX = 10;
// The trail column's structural center band: sine amplitude (56) + circle half-box (36)
// + breathing room. Doodles never enter it, so they cannot read as route or markers.
const CENTER_EXCLUSION_HALF_WIDTH_PX = 104;
const MARGIN_EDGE_PAD_PX = 6;
const DOODLES_PER_SECTION_MAX = 2;
// Half the route stroke plus its round cap: the ink a segment paints outside the hull of
// its own control points, and so the padding its drawing box needs.
const ROUTE_STROKE_PAD_PX = 4;

/** One anchor-to-anchor stroke of the route, with the canvas it needs. */
export type TreasureRouteSegment = Readonly<{
  box: MapBox;
  // The cubic through this pair's jittered midpoint, in container coordinates.
  d: string;
  // Solid hand-drawn ink behind the learner; faint irregular dashes ahead — a shape
  // distinction, never color alone (KTD5).
  state: "inked" | "uncharted";
}>;

export type TreasureRoute = Readonly<{
  // Ordered first stop to last. Neighbours repeat their shared anchor, so a round cap
  // closes every seam and the split reads as one continuous wandering stroke.
  segments: readonly TreasureRouteSegment[];
  // Irregular dash rhythm (stroke-dasharray value) so the ahead route reads hand-sketched.
  unchartedDash: string;
}>;

/** The route through every measured checkpoint center. `completedCount` is the number of
 * leading complete stops; segments up to the last completed anchor are inked and the rest
 * are uncharted, so the line changes treatment without ever breaking. */
export function buildTreasureRoute(input: Readonly<{ seed: string; points: readonly MapPoint[]; completedCount: number }>): TreasureRoute {
  const { seed, points, completedCount } = input;
  const random = mulberry32(hashSeed(`route:${seed}`));
  // One seeded perpendicular midpoint per consecutive pair: the anchors themselves are
  // untouched, so the curve passes exactly through every measured circle center.
  const segments = points.slice(1).map((point, index): TreasureRouteSegment => {
    const prior = points[index];
    const midX = (prior.x + point.x) / 2;
    const midY = (prior.y + point.y) / 2;
    const dx = point.x - prior.x;
    const dy = point.y - prior.y;
    const length = Math.hypot(dx, dy) || 1;
    const bounded = Math.min(ROUTE_JITTER_MAX_PX, length / 6);
    const offset = (random() * 2 - 1) * bounded;
    const mid = { x: midX + (-dy / length) * offset, y: midY + (dx / length) * offset };
    // Cubic tangents lean vertical (the trail flows downward), bent through the jittered
    // midpoint. A cubic never leaves the convex hull of its control points, so listing
    // them is an exact bound on the ink — and therefore on the bitmap.
    const bendA = (mid.y - prior.y) / 2;
    const bendB = (point.y - mid.y) / 2;
    const hull: MapPoint[] = [
      prior,
      { x: prior.x, y: prior.y + bendA },
      { x: mid.x, y: mid.y - bendA },
      mid,
      { x: mid.x, y: mid.y + bendB },
      { x: point.x, y: point.y - bendB },
      point
    ];
    const d =
      `M ${round(prior.x)} ${round(prior.y)}` +
      ` C ${round(prior.x)} ${round(prior.y + bendA)} ${round(mid.x)} ${round(mid.y - bendA)} ${round(mid.x)} ${round(mid.y)}` +
      ` C ${round(mid.x)} ${round(mid.y + bendB)} ${round(point.x)} ${round(point.y - bendB)} ${round(point.x)} ${round(point.y)}`;
    return { box: strokeBox(hull, ROUTE_STROKE_PAD_PX), d, state: index < completedCount - 1 ? "inked" : "uncharted" };
  });
  const dashRandom = mulberry32(hashSeed(`dash:${seed}`));
  const unchartedDash = Array.from({ length: 6 }, (_, index) =>
    // Alternating draw/gap lengths in 4-12px: irregular enough to read hand-sketched,
    // bounded so the rhythm stays a visible dotted line at any position.
    Math.round(4 + dashRandom() * 8 * (index % 2 === 0 ? 1 : 0.9))
  ).join(" ");
  return { segments, unchartedDash };
}

export type MapDoodle =
  | Readonly<{ kind: "compass"; x: number; y: number; size: number }>
  | Readonly<{ kind: "contour"; x: number; y: number; width: number }>
  | Readonly<{ kind: "peak"; x: number; y: number; size: number }>;

export type MapGrainMark = Readonly<{ x: number; y: number; length: number; angle: number }>;

// One <Pattern> tile (KTD3): short seeded fibre strokes repeated across the parchment.
export type MapGrain = Readonly<{ tileSize: number; marks: readonly MapGrainMark[] }>;

/** The parchment grain tile. It takes no measured size on purpose: grain is a repeating
 * texture, so its consumer tiles ONE viewport-sized canvas that never grows with the
 * trail, instead of a canvas the height of the whole scrolled expedition. */
export function buildMapGrain(seed: string): MapGrain {
  const grainRandom = mulberry32(hashSeed(`grain:${seed}`));
  const tileSize = 72;
  const marks: MapGrainMark[] = Array.from({ length: 8 }, () => ({
    x: round(grainRandom() * tileSize),
    y: round(grainRandom() * tileSize),
    length: round(3 + grainRandom() * 6),
    angle: Math.round(grainRandom() * 180)
  }));
  return { tileSize, marks };
}

/** Margin doodles for a measured trail column: the compass rose sits near the map top and
 * contour/peak glyphs alternate sides, at most two per section, none inside the center
 * column the route and markers occupy. Each one draws on its own `doodleBox` canvas. */
export function buildMapDoodles(input: Readonly<{ seed: string; width: number; stopAnchors: readonly MapStopAnchor[] }>): readonly MapDoodle[] {
  const { seed, width, stopAnchors } = input;
  const doodles: MapDoodle[] = [];
  const marginWidth = width / 2 - CENTER_EXCLUSION_HALF_WIDTH_PX - MARGIN_EDGE_PAD_PX;
  if (marginWidth < 18) return doodles;
  const doodleRandom = mulberry32(hashSeed(`doodle:${seed}`));
  const marginX = (side: 0 | 1, size: number) => {
    const inset = MARGIN_EDGE_PAD_PX + doodleRandom() * Math.max(0, marginWidth - size);
    return round(side === 0 ? inset : width - inset - size);
  };
  const compassSize = Math.min(34, marginWidth);
  doodles.push({ kind: "compass", x: marginX(1, compassSize), y: round(18 + doodleRandom() * 24), size: round(compassSize) });
  const sections = [...new Set(stopAnchors.map((anchor) => anchor.sectionIndex))];
  for (const sectionIndex of sections) {
    const band = stopAnchors.filter((anchor) => anchor.sectionIndex === sectionIndex);
    const minY = Math.min(...band.map((anchor) => anchor.y));
    const maxY = Math.max(...band.map((anchor) => anchor.y));
    const count = 1 + Math.round(doodleRandom() * (DOODLES_PER_SECTION_MAX - 1));
    for (let index = 0; index < count; index += 1) {
      const side = ((sectionIndex + index) % 2) as 0 | 1;
      const y = round(minY + doodleRandom() * Math.max(1, maxY - minY));
      if (doodleRandom() < 0.5) {
        const contourWidth = round(Math.min(30, marginWidth) * (0.6 + doodleRandom() * 0.4));
        doodles.push({ kind: "contour", x: marginX(side, contourWidth), y, width: contourWidth });
      } else {
        const size = round(Math.min(18, marginWidth) * (0.7 + doodleRandom() * 0.3));
        doodles.push({ kind: "peak", x: marginX(side, size), y, size });
      }
    }
  }
  return doodles;
}

/** The horizontal bands doodles may occupy for a given width — exported so tests and
 * consumers share one definition of "margin" (rule 18). */
export function marginBands(width: number): Readonly<{ left: readonly [number, number]; right: readonly [number, number] }> {
  const marginWidth = width / 2 - CENTER_EXCLUSION_HALF_WIDTH_PX - MARGIN_EDGE_PAD_PX;
  return {
    left: [MARGIN_EDGE_PAD_PX, MARGIN_EDGE_PAD_PX + Math.max(0, marginWidth)],
    right: [width - MARGIN_EDGE_PAD_PX - Math.max(0, marginWidth), width - MARGIN_EDGE_PAD_PX]
  };
}

/** The occupied horizontal extent of a doodle, for containment checks. */
export function doodleExtent(doodle: MapDoodle): readonly [number, number] {
  const width = doodle.kind === "contour" ? doodle.width : doodle.size;
  return [doodle.x, doodle.x + width];
}

// A contour's two stacked waves: the second sits 5px under the first, and each quadratic
// bulges about a third of its 3px control reach either way.
const CONTOUR_WAVE_DROP_PX = 5;
const CONTOUR_WAVE_RISE_PX = 3;
const DOODLE_STROKE_PAD_PX = 3;

/** The canvas a doodle draws on, in container coordinates: its ink extent plus stroke
 * padding. Consumers size an <Svg> to this and give it a matching `viewBox`, so a doodle
 * costs a ~40px bitmap however tall the trail behind it is. */
export function doodleBox(doodle: MapDoodle): MapBox {
  const [left, right] = doodleExtent(doodle);
  const isContour = doodle.kind === "contour";
  const top = isContour ? doodle.y - CONTOUR_WAVE_RISE_PX : doodle.y;
  const inkHeight = isContour ? CONTOUR_WAVE_DROP_PX + CONTOUR_WAVE_RISE_PX * 2 : doodle.size;
  return {
    x: round(left - DOODLE_STROKE_PAD_PX),
    y: round(top - DOODLE_STROKE_PAD_PX),
    width: round(right - left + DOODLE_STROKE_PAD_PX * 2),
    height: round(inkHeight + DOODLE_STROKE_PAD_PX * 2)
  };
}

/** The padded bounding box of a set of control points — an exact bound on stroked ink,
 * since a cubic never leaves the convex hull of its controls. */
function strokeBox(controls: readonly MapPoint[], pad: number): MapBox {
  const xs = controls.map((control) => control.x);
  const ys = controls.map((control) => control.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return {
    x: round(x),
    y: round(y),
    width: round(Math.max(...xs) + pad - x),
    height: round(Math.max(...ys) + pad - y)
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

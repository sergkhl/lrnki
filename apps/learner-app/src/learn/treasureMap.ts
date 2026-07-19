// The treasure-map field-chart layout (plan 2026-07-18-001 U2): one pure, deterministic
// module in the mineralSpecimen/crystalFormationLayout idiom. Seeded by `enrichmentId`,
// it computes the hand-drawn route geometry, the parchment grain/edge treatment, and
// sparse margin doodles for dumb SVG consumers. Decoration is nonsemantic and bounded
// (KTD8): doodles live only in the side margins, capped per section, and never encode
// graph structure or progress. No SVG filters anywhere (KTD3).
import { hashSeed, mulberry32 } from "./mineralSpecimen";

export type MapPoint = Readonly<{ x: number; y: number }>;
export type MapStopAnchor = Readonly<{ y: number; sectionIndex: number }>;

// Route jitter stays well inside the 36px checkpoint-circle half-box so the drawn line
// always reads as passing through every measured circle center (R2).
const ROUTE_JITTER_MAX_PX = 10;
// The trail column's structural center band: sine amplitude (56) + circle half-box (36)
// + breathing room. Doodles never enter it, so they cannot read as route or markers.
const CENTER_EXCLUSION_HALF_WIDTH_PX = 104;
const MARGIN_EDGE_PAD_PX = 6;
const DOODLES_PER_SECTION_MAX = 2;

export type TreasureRoute = Readonly<{
  // Solid hand-drawn ink behind the learner: through the last completed stop.
  inkedPath: string;
  // Faint irregular dashes ahead — a shape distinction, never color alone (KTD5).
  unchartedPath: string;
  // Irregular dash rhythm (stroke-dasharray value) so the ahead route reads hand-sketched.
  unchartedDash: string;
}>;

/** The route through every measured checkpoint center. `completedCount` is the number of
 * leading complete stops; the inked path covers exactly those anchors and the uncharted
 * path continues from the last inked anchor so the line never breaks. */
export function buildTreasureRoute(input: Readonly<{ seed: string; points: readonly MapPoint[]; completedCount: number }>): TreasureRoute {
  const { seed, points, completedCount } = input;
  const random = mulberry32(hashSeed(`route:${seed}`));
  // One seeded perpendicular midpoint per consecutive pair: the anchors themselves are
  // untouched, so the curve passes exactly through every measured circle center.
  const jittered: MapPoint[][] = points.slice(1).map((point, index) => {
    const prior = points[index];
    const midX = (prior.x + point.x) / 2;
    const midY = (prior.y + point.y) / 2;
    const dx = point.x - prior.x;
    const dy = point.y - prior.y;
    const length = Math.hypot(dx, dy) || 1;
    const bounded = Math.min(ROUTE_JITTER_MAX_PX, length / 6);
    const offset = (random() * 2 - 1) * bounded;
    return [prior, { x: midX + (-dy / length) * offset, y: midY + (dx / length) * offset }, point];
  });
  const segmentPath = (segments: MapPoint[][]): string => {
    if (segments.length === 0) return "";
    const start = segments[0][0];
    return segments.reduce((d, [prior, mid, point]) => {
      // Cubic tangents lean vertical (the trail flows downward), bent through the
      // jittered midpoint so consecutive segments read as one wandering stroke.
      const bendA = (mid.y - prior.y) / 2;
      const bendB = (point.y - mid.y) / 2;
      return `${d} C ${round(prior.x)} ${round(prior.y + bendA)} ${round(mid.x)} ${round(mid.y - bendA)} ${round(mid.x)} ${round(mid.y)} C ${round(mid.x)} ${round(mid.y + bendB)} ${round(point.x)} ${round(point.y - bendB)} ${round(point.x)} ${round(point.y)}`;
    }, `M ${round(start.x)} ${round(start.y)}`);
  };
  const inkedSegments = jittered.slice(0, Math.max(0, completedCount - 1));
  const unchartedSegments = jittered.slice(Math.max(0, completedCount - 1));
  const dashRandom = mulberry32(hashSeed(`dash:${seed}`));
  const unchartedDash = Array.from({ length: 6 }, (_, index) =>
    // Alternating draw/gap lengths in 4-12px: irregular enough to read hand-sketched,
    // bounded so the rhythm stays a visible dotted line at any position.
    Math.round(4 + dashRandom() * 8 * (index % 2 === 0 ? 1 : 0.9))
  ).join(" ");
  return {
    inkedPath: segmentPath(inkedSegments),
    unchartedPath: segmentPath(unchartedSegments),
    unchartedDash
  };
}

export type MapDoodle =
  | Readonly<{ kind: "compass"; x: number; y: number; size: number }>
  | Readonly<{ kind: "contour"; x: number; y: number; width: number }>
  | Readonly<{ kind: "peak"; x: number; y: number; size: number }>;

export type MapGrainMark = Readonly<{ x: number; y: number; length: number; angle: number }>;

export type MapGroundLayout = Readonly<{
  // One <Pattern> tile (KTD3): short seeded fibre strokes repeated across the ground.
  grain: Readonly<{ tileSize: number; marks: readonly MapGrainMark[] }>;
  // Hand-wobbled closed border path drawn just inside the container edge.
  edgePath: string;
  doodles: readonly MapDoodle[];
}>;

/** The parchment ground for a measured trail container. Doodles are margin-only: the
 * compass rose sits near the map top and contour/peak glyphs alternate sides, at most
 * two per section, none inside the center column the route and markers occupy. */
export function buildMapGround(input: Readonly<{ seed: string; width: number; height: number; stopAnchors: readonly MapStopAnchor[] }>): MapGroundLayout {
  const { seed, width, height, stopAnchors } = input;
  const grainRandom = mulberry32(hashSeed(`grain:${seed}`));
  const tileSize = 72;
  const marks: MapGrainMark[] = Array.from({ length: 8 }, () => ({
    x: round(grainRandom() * tileSize),
    y: round(grainRandom() * tileSize),
    length: round(3 + grainRandom() * 6),
    angle: Math.round(grainRandom() * 180)
  }));

  const edgeRandom = mulberry32(hashSeed(`edge:${seed}`));
  const edgePath = weatheredEdgePath(width, height, edgeRandom);

  const doodles: MapDoodle[] = [];
  const marginWidth = width / 2 - CENTER_EXCLUSION_HALF_WIDTH_PX - MARGIN_EDGE_PAD_PX;
  if (marginWidth >= 18 && height > 0) {
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
  }
  return { grain: { tileSize, marks }, edgePath, doodles };
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

function weatheredEdgePath(width: number, height: number, random: () => number): string {
  if (width <= 0 || height <= 0) return "";
  const inset = 3;
  const step = 56;
  const wobble = () => (random() * 2 - 1) * 2;
  const points: MapPoint[] = [];
  for (let x = inset; x < width - inset; x += step) points.push({ x, y: inset + wobble() });
  for (let y = inset; y < height - inset; y += step) points.push({ x: width - inset + wobble(), y });
  for (let x = width - inset; x > inset; x -= step) points.push({ x, y: height - inset + wobble() });
  for (let y = height - inset; y > inset; y -= step) points.push({ x: inset + wobble(), y });
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${round(point.x)} ${round(point.y)}`)
    .join(" ")
    .concat(" Z");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

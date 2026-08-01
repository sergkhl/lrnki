// The Crystal Guardian's Ward Obelisk (plan 2026-07-31-002 U1, KTD1–KTD6). The Guardian's body
// is ONE fixed silhouette whose ordered segments are the single visual encoding of the
// challenge's real ward count.
//
// The defect this replaces is perceptual-grouping ambiguity: three overlapping ward specimens
// had no stable container, no order, and no relationship to `wardTotal`, while a separate arc
// carried the real count — two competing explanations of one Guardian. The conventional fix is
// a determinate indicator with a persistent track, a stable location, and one slot per unit
// (Apple HIG, progress indicators). The obelisk is that indicator translated into the accepted
// in-world Guardian presentation (ADR-0032).
//
// Two properties this module exists to guarantee, neither of which a renderer can be trusted
// with:
//   * the frame is a function of `wardTotal` ONLY — answering a ward changes segment material,
//     never geometry, so nothing moves, resizes, or disappears mid-fight (KTD1);
//   * segments partition the body exactly, base (index 0) to crown (index total-1), sharing
//     seams by construction: every band edge is the SAME `halfAt(y)` taper evaluated at the
//     SAME y, so adjacent bands cannot overlap or drift apart (KTD2/KTD3).
//
// Geometry only — no colour, no state text, no renderer. The crown carries a normalized outline
// of the scope ward's own library silhouette, so the Leg's orange diamond and the summit's pink
// trident stay shape-distinct without a ninth crystal species or a second art source (KTD6).
// Flat polygons throughout: the crystal library's no-<Defs>/no-id rule binds this module too.

import { CRYSTAL_CAP_Y, crystalSpec, type CrystalSpecies } from "./crystalLibrary";
import { MINERAL_GROUND_Y, type MineralPoint } from "./mineralSpecimen";

export type GuardianObeliskSegmentState = "resolved" | "current" | "queued";

export type GuardianObeliskSegment = {
  indexFromBase: number;
  state: GuardianObeliskSegmentState;
  points: string;
  // The segment's interior facet plane, or null when the band is too shallow to carry a
  // readable one. The renderer uses its presence — not hue — to separate current/queued from
  // resolved (WCAG 2.2 SC 1.4.1).
  highlightPoints: string | null;
};

export type GuardianObeliskLayout = {
  framePoints: string;
  crownWardPoints: string;
  segments: readonly GuardianObeliskSegment[];
};

// The body inside the Guardian's existing circular socket (centre 50,70 radius 36 in the
// 100x134 stage box): the base spans the socket's chord and the crown rises just past its ring.
const CENTER_X = 50;
export const OBELISK_BASE_Y = 100;
export const OBELISK_SHOULDER_Y = 54;
export const OBELISK_APEX_Y = 30;
const CROWN_SHOULDER_Y = 44;
const HALF_BASE = 20;
const HALF_SHOULDER = 15;

// The ward emblem's box, seated on the crown's own base line.
const EMBLEM_BASE_Y = 53.5;
const EMBLEM_HEIGHT = 20;

// The lit facet occupies this fraction of a segment's width from its left edge; the fixed
// upper-left light source is the crystal library's, so the facet never mirrors.
const FACET_WIDTH_FRACTION = 0.38;
// Below this band height a facet plane reads as a stray line rather than a lit face, so the
// segment renders as a plain slot instead. Rendering safety for an out-of-contract ward count.
const MIN_FACET_BAND_HEIGHT = 4;

// The one authored outline: base corners, shaft shoulders, crown shoulders, apex. Every other
// point in this module is derived from it.
const FRAME: readonly MineralPoint[] = [
  [CENTER_X - HALF_BASE, OBELISK_BASE_Y],
  [CENTER_X - HALF_SHOULDER, OBELISK_SHOULDER_Y],
  [CENTER_X - HALF_SHOULDER, CROWN_SHOULDER_Y],
  [CENTER_X, OBELISK_APEX_Y],
  [CENTER_X + HALF_SHOULDER, CROWN_SHOULDER_Y],
  [CENTER_X + HALF_SHOULDER, OBELISK_SHOULDER_Y],
  [CENTER_X + HALF_BASE, OBELISK_BASE_Y]
];

// The crown is the frame's own upper run — taken from FRAME rather than re-authored, so the
// final segment can never disagree with the silhouette it sits in.
const CROWN: readonly MineralPoint[] = FRAME.slice(1, 6);

const CROWN_FACET: readonly MineralPoint[] = [
  [CENTER_X - HALF_SHOULDER, OBELISK_SHOULDER_Y],
  [CENTER_X - HALF_SHOULDER, CROWN_SHOULDER_Y],
  [CENTER_X, OBELISK_APEX_Y],
  [CENTER_X, OBELISK_SHOULDER_Y]
];

// A one-ward Guardian is a single segment: the whole body, lit down its whole left face.
const WHOLE_FACET: readonly MineralPoint[] = [
  [CENTER_X - HALF_BASE, OBELISK_BASE_Y],
  [CENTER_X - HALF_SHOULDER, OBELISK_SHOULDER_Y],
  [CENTER_X - HALF_SHOULDER, CROWN_SHOULDER_Y],
  [CENTER_X, OBELISK_APEX_Y],
  [CENTER_X, OBELISK_BASE_Y]
];

export function guardianObeliskLayout({
  ward,
  wardTotal,
  wardsRemaining
}: Readonly<{ ward: CrystalSpecies; wardTotal: number; wardsRemaining: number }>): GuardianObeliskLayout {
  // Clamp for rendering safety only. A projection that publishes an impossible ward count is a
  // defect to surface elsewhere, not a state to reinterpret here.
  const total = Math.max(1, Math.floor(wardTotal));
  const remaining = Math.min(total, Math.max(0, Math.floor(wardsRemaining)));
  const resolved = total - remaining;

  return {
    framePoints: toPoints(FRAME),
    crownWardPoints: toPoints(emblem(ward)),
    segments: Array.from({ length: total }, (_, indexFromBase) => {
      const isCrown = indexFromBase === total - 1;
      const shape = total === 1 ? FRAME : isCrown ? CROWN : band(indexFromBase, total);
      const facet = total === 1 ? WHOLE_FACET : isCrown ? CROWN_FACET : bandFacet(indexFromBase, total);
      return {
        indexFromBase,
        state: segmentState(indexFromBase, resolved),
        points: toPoints(shape),
        highlightPoints: facet === null ? null : toPoints(facet)
      };
    })
  };
}

// Base-to-crown progression (KTD3): resolved wards accumulate from the base, the lowest
// unresolved segment is current, and the rest queue above it. `remaining === 1` therefore
// always makes the crown the Final Ward, and `remaining === 0` (a won Guardian) leaves the
// whole body standing in stone.
function segmentState(indexFromBase: number, resolved: number): GuardianObeliskSegmentState {
  if (indexFromBase < resolved) return "resolved";
  if (indexFromBase === resolved) return "current";
  return "queued";
}

// The shaft's half-width at a given height — the single taper both edges of every band read.
function halfAt(y: number): number {
  const t = (y - OBELISK_SHOULDER_Y) / (OBELISK_BASE_Y - OBELISK_SHOULDER_Y);
  return HALF_SHOULDER + (HALF_BASE - HALF_SHOULDER) * t;
}

function bandHeight(total: number): number {
  return (OBELISK_BASE_Y - OBELISK_SHOULDER_Y) / (total - 1);
}

// Band `indexFromBase` of the shaft, stacked upward from the base. Its top edge is the next
// band's bottom edge at the same y through the same taper, so the seam is exact.
function band(indexFromBase: number, total: number): readonly MineralPoint[] {
  const height = bandHeight(total);
  const bottom = OBELISK_BASE_Y - indexFromBase * height;
  const top = OBELISK_BASE_Y - (indexFromBase + 1) * height;
  return [
    [CENTER_X - halfAt(bottom), bottom],
    [CENTER_X - halfAt(top), top],
    [CENTER_X + halfAt(top), top],
    [CENTER_X + halfAt(bottom), bottom]
  ];
}

function bandFacet(indexFromBase: number, total: number): readonly MineralPoint[] | null {
  const height = bandHeight(total);
  if (height < MIN_FACET_BAND_HEIGHT) return null;
  const bottom = OBELISK_BASE_Y - indexFromBase * height;
  const top = OBELISK_BASE_Y - (indexFromBase + 1) * height;
  return [
    [CENTER_X - halfAt(bottom), bottom],
    [CENTER_X - halfAt(top), top],
    [facetEdgeX(top), top],
    [facetEdgeX(bottom), bottom]
  ];
}

function facetEdgeX(y: number): number {
  return CENTER_X - halfAt(y) * (1 - 2 * FACET_WIDTH_FRACTION);
}

// The scope ward's own library silhouette, normalized from the shared 100-box (cap to bedrock)
// into the crown's emblem box. Outline only: facets are unreadable at this size, and the shape
// alone is what separates a Leg Guardian from the Expedition Guardian.
function emblem(ward: CrystalSpecies): readonly MineralPoint[] {
  const scale = EMBLEM_HEIGHT / (MINERAL_GROUND_Y - CRYSTAL_CAP_Y);
  return crystalSpec(ward).silhouette.map(([x, y]) => [
    CENTER_X + (x - CENTER_X) * scale,
    EMBLEM_BASE_Y - (MINERAL_GROUND_Y - y) * scale
  ]);
}

function toPoints(points: readonly MineralPoint[]): string {
  return points.map(([x, y]) => `${round2(x)},${round2(y)}`).join(" ");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

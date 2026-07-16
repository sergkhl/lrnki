// Pure Mineral Menagerie geometry (plan 2026-07-15-002 U1, R12-R13). Exactly three
// code-native specimen habits — prismatic quartz, cubic fluorite, rhombohedral calcite —
// identified by SHAPE, sharing one facet/stroke/palette/growth language. Habit is
// cosmetic only: a balanced cycle over a section-stable offset plus the concept's
// neutral position inside its section, with minor facet variation seeded from the
// concept id, so identical projection inputs render identically across reloads and
// input array ordering. Nothing here reads difficulty, mastery, or correctness.

import type { TrailCluster } from "@lrnki/application/projection";

export type MineralHabit = "quartz" | "fluorite" | "calcite";

export const MINERAL_HABITS: readonly MineralHabit[] = ["quartz", "fluorite", "calcite"] as const;

export const MINERAL_VIEWBOX = "0 0 100 100";
export const MINERAL_SATURATION = 52;
// Below this displayed size a specimen's facets cannot be read; compact surfaces must
// use the universal gem/status icon + exact counts instead (R14).
export const MIN_SPECIMEN_PX = 40;

// --journal-gem #2f8f83 in HSL space (theme.css owns the canonical color).
const BASE_HUE = 172;
const HUE_BAND = 20;

export interface MineralFacet {
  // Closed polygon in the 0..100 viewBox; specimens sit on the y=95 ground line.
  points: readonly (readonly [number, number])[];
  // Per-facet lightness (%): adjacent facets differ so the form reads faceted.
  lightness: number;
  // Facets appear in this order as growth advances (body before termination).
  revealIndex: number;
}

export interface MineralSpecimenSpec {
  habit: MineralHabit;
  hue: number;
  facets: MineralFacet[];
}

// FNV-1a over the id string: cheap, dependency-free, and stable across runtimes.
// Exported as the formation modules' one deterministic seed/PRNG language.
export function hashSeed(key: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32: tiny deterministic PRNG, uniform in [0, 1).
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// The balanced habit cycle (R13): a section-stable offset rotates which habit opens the
// section, then consecutive section positions cycle quartz/fluorite/calcite — three
// consecutive concepts always yield one of each, and the mapping depends only on the
// concept's own section coordinates (never on array order).
export function mineralHabitFor(input: { sectionIndex: number; sectionPositionIndex: number }): MineralHabit {
  const offset = hashSeed(`section:${input.sectionIndex}`) % MINERAL_HABITS.length;
  return MINERAL_HABITS[(offset + input.sectionPositionIndex) % MINERAL_HABITS.length];
}

type Point = readonly [number, number];

function polygon(points: readonly Point[]): readonly Point[] {
  return points.map(([x, y]) => [round2(x), round2(y)] as const);
}

export function mineralSpecimenSpec(habit: MineralHabit, derivedNodeId: string): MineralSpecimenSpec {
  const random = mulberry32(hashSeed(`${habit}:${derivedNodeId}`));
  const hue = round2(BASE_HUE + (random() * 2 - 1) * HUE_BAND);
  const facets = habit === "quartz" ? quartzFacets(random) : habit === "fluorite" ? fluoriteFacets(random) : calciteFacets(random);
  return {
    habit,
    hue,
    facets: facets.map((facet, index) => ({ ...facet, points: polygon(facet.points), lightness: round2(facet.lightness), revealIndex: index }))
  };
}

type RawFacet = { points: readonly Point[]; lightness: number };

// Prismatic quartz: a tall main prism with a pyramidal termination plus a shorter
// companion prism — the classic pointed cluster silhouette.
function quartzFacets(random: () => number): RawFacet[] {
  const mainW = 16 + random() * 5;
  const mainH = 46 + random() * 8;
  const capH = 14 + random() * 5;
  const tipX = 50 + (random() * 2 - 1) * 3;
  const side = random() < 0.5 ? -1 : 1;
  const compX = 50 + side * (mainW / 2 + 8 + random() * 4);
  const compW = mainW * 0.62;
  const compH = mainH * (0.5 + random() * 0.15);
  const compCapH = capH * 0.7;
  const base = 95;
  const light = 34 + random() * 8;
  return [
    // Companion prism body + cap grow first: the cluster rises from the flank inward.
    { points: [[compX - compW / 2, base], [compX - compW / 2, base - compH], [compX + compW / 2, base - compH], [compX + compW / 2, base]], lightness: light + 6 },
    { points: [[compX - compW / 2, base - compH], [compX, base - compH - compCapH], [compX + compW / 2, base - compH]], lightness: light + 14 },
    // Main prism split into two vertical body facets so the column reads faceted.
    { points: [[50 - mainW / 2, base], [50 - mainW / 2, base - mainH], [tipX, base - mainH], [tipX, base]], lightness: light },
    { points: [[tipX, base], [tipX, base - mainH], [50 + mainW / 2, base - mainH], [50 + mainW / 2, base]], lightness: light + 9 },
    // Pyramidal termination facets seal the specimen last.
    { points: [[50 - mainW / 2, base - mainH], [tipX, base - mainH - capH], [tipX, base - mainH]], lightness: light + 18 },
    { points: [[tipX, base - mainH], [tipX, base - mainH - capH], [50 + mainW / 2, base - mainH]], lightness: light + 12 }
  ];
}

// Cubic fluorite: an isometric cube (top rhombus + two visible faces) with a smaller
// intergrown companion cube — blocky, flat-topped, unmistakably not pointed.
function fluoriteFacets(random: () => number): RawFacet[] {
  const s = 19 + random() * 4;
  const dy = s * 0.45;
  const h = 30 + random() * 6;
  const base = 95;
  const cx = 50 + (random() * 2 - 1) * 2;
  const ty = base - 2 * dy - h;
  const side = random() < 0.5 ? -1 : 1;
  const cs = s * 0.55;
  const cdy = cs * 0.45;
  const ch = h * 0.55;
  const ccx = cx + side * (s + cs * 0.35);
  const cty = base - 2 * cdy - ch;
  const light = 34 + random() * 8;
  const cube = (x: number, top: number, half: number, halfDy: number, height: number, lift: number): RawFacet[] => [
    { points: [[x - half, top + halfDy], [x, top + 2 * halfDy], [x, top + 2 * halfDy + height], [x - half, top + halfDy + height]], lightness: light + lift },
    { points: [[x, top + 2 * halfDy], [x + half, top + halfDy], [x + half, top + halfDy + height], [x, top + 2 * halfDy + height]], lightness: light + lift + 9 },
    { points: [[x, top], [x + half, top + halfDy], [x, top + 2 * halfDy], [x - half, top + halfDy]], lightness: light + lift + 18 }
  ];
  const companion = cube(ccx, cty, cs, cdy, ch, 6);
  const main = cube(cx, ty, s, dy, h, 0);
  // Companion faces, main left/right faces, then both top facets seal last.
  return [companion[0], companion[1], main[0], main[1], companion[2], main[2]];
}

// Rhombohedral calcite: a leaning sheared block (parallelogram faces meeting at oblique
// angles) plus a low companion rhomb — slanted where quartz is upright and fluorite square.
function calciteFacets(random: () => number): RawFacet[] {
  const w = 30 + random() * 6;
  const h = 32 + random() * 6;
  const shear = 10 + random() * 5;
  const topDx = 8 + random() * 4;
  const topDy = 9 + random() * 3;
  const base = 95;
  const lean = random() < 0.5 ? -1 : 1;
  const x0 = 50 - (w + shear) / 2 + lean * 2;
  const sx = lean * shear;
  const light = 34 + random() * 8;
  const compW = w * 0.55;
  const compH = h * 0.5;
  const compX = lean > 0 ? x0 - compW * 0.7 : x0 + w + compW * 0.05;
  return [
    // Low companion rhomb rises first at the flank.
    { points: [[compX, base], [compX + lean * shear * 0.5, base - compH], [compX + lean * shear * 0.5 + compW, base - compH], [compX + compW, base]], lightness: light + 6 },
    { points: [[compX + lean * shear * 0.5, base - compH], [compX + lean * shear * 0.5 + topDx * 0.6, base - compH - topDy * 0.6], [compX + lean * shear * 0.5 + compW + topDx * 0.6, base - compH - topDy * 0.6], [compX + lean * shear * 0.5 + compW, base - compH]], lightness: light + 16 },
    // Main sheared front face, then its oblique side, then the top rhomb seals last.
    { points: [[x0, base], [x0 + sx, base - h], [x0 + sx + w, base - h], [x0 + w, base]], lightness: light },
    { points: [[x0 + w, base], [x0 + sx + w, base - h], [x0 + sx + w + topDx, base - h - topDy], [x0 + w + topDx, base - topDy]], lightness: light + 9 },
    { points: [[x0 + sx, base - h], [x0 + sx + topDx, base - h - topDy], [x0 + sx + w + topDx, base - h - topDy], [x0 + sx + w, base - h]], lightness: light + 18 }
  ];
}

// The facets grown at a given completion fraction, in reveal order. The final facet is
// reserved for mastery itself, so a specimen never looks finished before the node is.
export function visibleMineralFacets(spec: MineralSpecimenSpec, growthFraction: number): MineralFacet[] {
  const ordered = [...spec.facets].sort((a, b) => a.revealIndex - b.revealIndex);
  if (growthFraction >= 1) return ordered;
  if (growthFraction <= 0) return [];
  const count = Math.min(ordered.length - 1, Math.max(1, Math.round(growthFraction * ordered.length)));
  return ordered.slice(0, count);
}

// --- Honest compact progress (R8/R14, A2) -------------------------------------------
//
// One learner-owned derivation for every compact surface, so known ground can never
// inflate the crystal count: a completion bar communicates completed ground, while
// adjacent text names collected crystals and known ground separately.

export type FormationProgress = {
  totalGround: number;
  completedGround: number;
  collectedCrystals: number;
  knownGround: number;
  // completedGround / totalGround (0 for an empty scope) — the Progress bar fraction.
  completionFraction: number;
};

export function formationProgress(concepts: readonly Pick<TrailCluster, "state" | "isKnownSkipped">[]): FormationProgress {
  const totalGround = concepts.length;
  const completedGround = concepts.filter((concept) => concept.state === "mastered").length;
  const collectedCrystals = concepts.filter((concept) => concept.state === "mastered" && !concept.isKnownSkipped).length;
  const knownGround = concepts.filter((concept) => concept.isKnownSkipped).length;
  return {
    totalGround,
    completedGround,
    collectedCrystals,
    knownGround,
    completionFraction: totalGround === 0 ? 0 : completedGround / totalGround
  };
}

// The shared compact copy: exact counts, crystals and known ground named separately.
export function formationProgressLine(progress: FormationProgress): string {
  const parts = [
    `${progress.completedGround} of ${progress.totalGround} ground complete`,
    `${progress.collectedCrystals} ${progress.collectedCrystals === 1 ? "crystal" : "crystals"}`
  ];
  if (progress.knownGround > 0) parts.push(`${progress.knownGround} known`);
  return parts.join(" · ");
}

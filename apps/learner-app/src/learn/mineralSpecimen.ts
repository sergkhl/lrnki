// Pure curated mineral library (plan 2026-07-16-002 U1, D1/D7/KTD1). Exactly three
// hand-authored real-mineral silhouettes — quartz, amethyst, diamond — as static polygon
// data, identified by SHAPE and tier tint. Species encodes ONE neutral fact: the
// concept's ADR-0024 intrinsic difficulty band via the shared `difficultyBand`
// (1–2 quartz, 3–4 amethyst, 5 diamond). Progression is one visual variable: ghost
// outline → fill rises with `growthFraction` → full color + gloss when collected.
// Nothing here reads mastery, retries, or correctness beyond the caller's honest
// growth/collected inputs, and there is no runtime PRNG geometry — the only per-concept
// variation is a tiny deterministic mirror/scale so repeats don't look stamped.

import { difficultyBand, type TrailCluster } from "@lrnki/application/projection";

export type MineralSpecies = "quartz" | "amethyst" | "diamond";

export const MINERAL_VIEWBOX = "0 0 100 100";
// Below this displayed size a specimen's silhouette cannot be read; compact surfaces
// must use the universal gem/status icon + exact counts instead.
export const MIN_SPECIMEN_PX = 40;
// Specimens sit on this ground line inside the 0..100 viewBox; the growth cut and the
// variation pivot both anchor here so every species grows and scales from its bedrock.
export const MINERAL_GROUND_Y = 95;

// Species = intrinsic difficulty tier (D1). `difficultyBand` already breaks ties low
// upstream, so diamonds stay scarce; this module never re-derives the banding.
export function mineralSpeciesFor(difficulty: number | null): MineralSpecies {
  const band = difficultyBand(difficulty);
  if (band <= 2) return "quartz";
  if (band <= 4) return "amethyst";
  return "diamond";
}

export type MineralPoint = readonly [number, number];

// An interior facet plane over the tinted silhouette. `shade` > 0 lightens (white
// overlay), < 0 darkens (ink overlay) — shading is tint-independent by construction.
export interface MineralFacetPlane {
  points: readonly MineralPoint[];
  shade: number;
}

export interface MineralSpeciesSpec {
  species: MineralSpecies;
  // Closed silhouette polygon in the 0..100 viewBox, resting on MINERAL_GROUND_Y.
  silhouette: readonly MineralPoint[];
  facets: readonly MineralFacetPlane[];
  gloss: readonly MineralPoint[];
  // Diamond carries the strongest gloss (D7).
  glossOpacity: number;
}

// Prismatic quartz: an upright pointed column with a short companion spur — the classic
// pointed silhouette, authored to read at 40–80 px.
const QUARTZ: MineralSpeciesSpec = {
  species: "quartz",
  silhouette: [
    [22, 95], [22, 74], [31, 60], [38, 70], [38, 56], [50, 28], [62, 56], [62, 95]
  ],
  facets: [
    { points: [[38, 95], [38, 56], [50, 28], [50, 95]], shade: -0.08 },
    { points: [[50, 95], [50, 28], [62, 56], [62, 95]], shade: 0.1 },
    { points: [[31, 60], [38, 70], [38, 95], [31, 95]], shade: 0.07 }
  ],
  gloss: [[47, 40], [50, 32], [53, 40], [50, 48]],
  glossOpacity: 0.35
};

// Amethyst: a broad twin-pointed cluster — flatter and wider than quartz, with the
// taller point off-center right.
const AMETHYST: MineralSpeciesSpec = {
  species: "amethyst",
  silhouette: [
    [20, 95], [20, 70], [34, 44], [45, 62], [58, 34], [74, 60], [74, 95]
  ],
  facets: [
    { points: [[20, 95], [20, 70], [34, 44], [34, 95]], shade: -0.08 },
    { points: [[34, 95], [34, 44], [45, 62], [45, 95]], shade: 0.08 },
    { points: [[58, 95], [58, 34], [74, 60], [74, 95]], shade: 0.12 }
  ],
  gloss: [[55, 44], [58, 36], [61, 44], [58, 52]],
  glossOpacity: 0.4
};

// Diamond: a brilliant cut resting pavilion-down — flat table, angled crown band,
// pointed base; unmistakably neither column nor cluster.
const DIAMOND: MineralSpeciesSpec = {
  species: "diamond",
  silhouette: [
    [50, 95], [28, 60], [34, 44], [66, 44], [72, 60]
  ],
  facets: [
    { points: [[28, 60], [34, 44], [66, 44], [72, 60]], shade: 0.14 },
    { points: [[28, 60], [50, 60], [50, 95]], shade: -0.1 }
  ],
  gloss: [[38, 46], [50, 46], [45, 56], [35, 54]],
  glossOpacity: 0.55
};

const SPECS: Record<MineralSpecies, MineralSpeciesSpec> = {
  quartz: QUARTZ,
  amethyst: AMETHYST,
  diamond: DIAMOND
};

export function mineralSpecimenSpec(species: MineralSpecies): MineralSpeciesSpec {
  return SPECS[species];
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

// Tiny deterministic per-concept variation (D1): an optional mirror about the vertical
// axis and a mild scale, both about the bedrock pivot — never new geometry.
export type MineralVariation = { mirrored: boolean; scale: number };

export function mineralVariationFor(derivedNodeId: string): MineralVariation {
  const random = mulberry32(hashSeed(`variation:${derivedNodeId}`));
  return { mirrored: random() < 0.5, scale: round2(0.9 + random() * 0.1) };
}

// --- Growth fill clip (KTD1) ----------------------------------------------------------
//
// Partial growth renders by clipping the silhouette/facet polygons against a horizontal
// cut line in pure code (Sutherland–Hodgman against the single half-plane y >= cutY):
// no <ClipPath> defs, so many specimens can share one canvas without id collisions.

export function growthCutY(spec: MineralSpeciesSpec, growthFraction: number): number {
  const top = Math.min(...spec.silhouette.map(([, y]) => y));
  const fraction = Math.min(1, Math.max(0, growthFraction));
  return round2(MINERAL_GROUND_Y - fraction * (MINERAL_GROUND_Y - top));
}

// The polygon's region on or below the cut line (y >= cutY), closed. Empty when the
// whole polygon sits above the line.
export function clipPolygonBelow(points: readonly MineralPoint[], cutY: number): MineralPoint[] {
  const output: MineralPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const currentIn = current[1] >= cutY;
    const nextIn = next[1] >= cutY;
    if (currentIn) output.push(current);
    if (currentIn !== nextIn) {
      const t = (cutY - current[1]) / (next[1] - current[1]);
      output.push([round2(current[0] + t * (next[0] - current[0])), cutY]);
    }
  }
  return output;
}

// --- Honest compact progress ----------------------------------------------------------
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

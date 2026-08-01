// Shared formation geometry and honest compact progress (plan 2026-07-30-001 U1). The
// curated species half of this module was superseded by the eight-crystal library in
// `crystalLibrary.ts` — what remains is the substrate every crystal surface builds on: the
// 100-box ground line, the readable-size floor, one deterministic seed/PRNG language, the
// growth clip, and the one learner-owned progress derivation.
//
// `crystalLibrary.ts` imports from here (never the reverse), so this module stays free of
// art data and there is exactly one growth clip in the app.

import { type TrailCluster } from "@lrnki/application/projection";

export type MineralPoint = readonly [number, number];

// Below this displayed size a crystal's silhouette cannot be read; compact surfaces must use
// the universal gem/status icon + exact counts instead.
export const MIN_SPECIMEN_PX = 40;
// Crystals sit on this ground line inside the 0..100 viewBox; the growth cut and the cosmetic
// scale both anchor here so every species grows and scales from its bedrock.
export const MINERAL_GROUND_Y = 95;

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

// --- Growth fill clip (KTD3/KTD4) -----------------------------------------------------
//
// Partial growth renders by clipping the silhouette/facet polygons against a horizontal cut
// line in pure code (Sutherland–Hodgman against the single half-plane y >= cutY): no
// <ClipPath> defs, so many crystals share one canvas without document-global id collisions
// and the same concept can render at two growth values on two surfaces at once.

export function growthCutY(
  shape: Readonly<{ silhouette: readonly MineralPoint[] }>,
  growthFraction: number
): number {
  const top = Math.min(...shape.silhouette.map(([, y]) => y));
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

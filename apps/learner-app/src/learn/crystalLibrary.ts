// The eight-crystal library (plan 2026-07-30-001 U1, KTD3–KTD5). ONE art system for every
// crystal the learner ever sees: the Crystal Vista, the Guardian reward, the Activity Sheet
// capstone, the trail checkpoint circle, and the Guardian's own body.
//
// Five concept crystals map 1:1 onto the ADR-0024 intrinsic difficulty bands 1–5 — the single
// learner-neutral fact a specimen encodes. Three shapes are earned-only (the summit keystone
// and the two Guardian wards) and are never a tier tint. Both encoding channels run monotone:
// shape sharpens round → octagon → chamfered square → shard → triangle, and hue walks
// cool → warm; the true warm hues stay reserved for the earned trio.
//
// Four materials — fogged → open → next → collected — form the progression ladder. It is a
// SATURATION ramp, not a luminance one: for dark species the collected body is genuinely
// darker than lifted stone, so a value-only ramp is unachievable (the generator measured
// this). Colour therefore never carries the signal alone (WCAG F73) — consumers must always
// pair it with state text plus the growth fill height.
//
// KTD3 — the rendering constraints this data must satisfy, forever:
//   * polygons only (`clipPolygonBelow` cuts polygons, and growth is a polygon clip),
//   * flat literal fills only — NO <ClipPath>, <Defs>, gradient, pattern, filter, or any SVG
//     id anywhere, because ids are document-global on web and the same concept renders at two
//     growth values on two surfaces simultaneously; ids also head the react-native-svg
//     Android divergence class. Plain fill/stroke opacity is safe and is what gloss and rim
//     use.
//
// ART SWAP CONTRACT — a refined crystal art direction exists and will eventually land here:
//   1. Role ids (`band1`…`band5` / `keystone` / `legWard` / `summitWard`) are the permanent
//      vocabulary. Consumers, tests, testIDs, and choreography speak ONLY role ids, never an
//      appearance name, so new art revises `crystalLibrary.data.ts` and nothing else.
//   2. A swap is a re-authoring pass, not a file drop. Painterly source art carries gradients
//      behind document-global ids, bezier curves, off-ramp sparkle fills, and no shared
//      bedrock. Ingestion runs through a porting script (sibling of the U1 dump): flatten
//      curves to polylines, quantize every fill to its nearest ramp tone and REPORT the
//      residual for the author to accept, merge sparkles into the gloss polygon list,
//      normalize to the shared bedrock and cap, and author any missing role.
//   3. KTD3 binds all future art unconditionally. The flat ramp model is what mechanically
//      derived materials and web/Android parity are bought with; pixel-faithful reproduction
//      of painterly source art is explicitly out of contract.
//   4. Source-specific checks (nearest-tone quantization error) belong in the porting script.
//      The jest suite asserts only invariants any legal art drop must satisfy.

import { CRYSTAL_SPECS } from "./crystalLibrary.data";
import { hashSeed, mulberry32, type MineralPoint } from "./mineralSpecimen";
import { colors } from "@/ui/tokens";

// Role ids — what a crystal MEANS, never what it looks like.
export type CrystalSpecies =
  | "band1"
  | "band2"
  | "band3"
  | "band4"
  | "band5"
  | "keystone"
  | "legWard"
  | "summitWard";

// The progression ladder. `next` is the single study target; `open` is available ground.
export type CrystalMaterial = "fogged" | "open" | "next" | "collected";

// The four-colour authored ramp a species is cut from, and the resolved ramp of one material.
export type CrystalPalette = {
  base: string;
  dark: string;
  light: string;
  contour: string;
};

// An interior facet plane. `tone` names a position on its material's light→base→dark ramp
// (+1 light, 0 base, −1 dark), so a material swap re-derives every literal fill mechanically
// from one authored 4-tuple.
export type CrystalFacet = {
  points: readonly MineralPoint[];
  tone: number;
};

export type CrystalSpec = {
  species: CrystalSpecies;
  // Closed silhouette in the shared 100-box: bedrock at MINERAL_GROUND_Y, cap at CRYSTAL_CAP_Y.
  silhouette: readonly MineralPoint[];
  facets: readonly CrystalFacet[];
  // One or more highlight polygons — refined art carries several.
  gloss: readonly (readonly MineralPoint[])[];
  // Upper-edge light polyline for the fixed upper-left light source. Because the light source
  // is fixed, cosmetic variation may scale a crystal but must never mirror it.
  rimLight: readonly MineralPoint[];
  colors: CrystalPalette;
};

export const CRYSTAL_VIEWBOX = "0 0 100 100";
// Every species shares one cap height, so no crystal can misread as more important.
export const CRYSTAL_CAP_Y = 20;

// The five concept species in band order, and the three earned-only shapes.
export const CONCEPT_SPECIES = ["band1", "band2", "band3", "band4", "band5"] as const;
export const EARNED_SPECIES = ["keystone", "legWard", "summitWard"] as const;

// --- Material constants (ported verbatim from the v4 generator) -------------------------
//
// The cold stone a fogged crystal is cut from. Fogged is species-INDEPENDENT: an unopened
// slot gives away silhouette (difficulty) but never hue.
const STONE: CrystalPalette = { base: "#6b6357", dark: "#3d3830", light: "#8f8779", contour: "#241f19" };

// Occlusion contours resolve toward the app ink, keeping every silhouette legible on the shared
// light crystal ground without maintaining a retired scene-specific ground constant.
const CONTOUR_SINK = 0.45;

// How far an open slot's stone is pulled toward its species hue; `next` goes further so the
// study target is warmer and brighter than its neighbours without any stroke. 0.36 rather
// than 0.30 because the stone is a WARM grey — mixing toward a cool hue passes through
// neutral, and at 0.30 the cool species landed FLATTER than the fogged stone they are meant
// to be a step beyond, erasing the species preview.
const OPEN_MIX = 0.36;
const NEXT_MIX = 0.55;
// Value lift on open/next stone, deliberately small: the stone ramp carries the greyscale
// signal while `collected` separates from `next` by CHROMA. See the header — saturation is
// the honest "earned" channel.
const OPEN_LIFT = 0.08;
const NEXT_LIFT = 0.16;

// Per-material presentation strengths. Facet tone is scaled before ramping, so stone
// materials keep their quiet contrast; gloss and rim are plain-opacity overlays.
export const FACET_STRENGTH: Record<CrystalMaterial, number> = {
  fogged: 0.55,
  open: 0.55,
  next: 0.62,
  collected: 1
};
export const GLOSS_OPACITY: Record<CrystalMaterial, number> = {
  fogged: 0,
  open: 0.12,
  next: 0.2,
  collected: 0.42
};
export const RIM_OPACITY: Record<CrystalMaterial, number> = {
  fogged: 0.5,
  open: 0.42,
  next: 0.51,
  collected: 0.45
};
export const GLOSS_FILL = "#ffffff";

// --- Pure colour algebra ----------------------------------------------------------------

export function mix(from: string, to: string, amount: number): string {
  const a = channels(from);
  const b = channels(to);
  return hex([0, 1, 2].map((index) => a[index] + (b[index] - a[index]) * amount));
}

// Raise a colour toward white — the value half of the material ramp.
export function lift(color: string, amount: number): string {
  return mix(color, "#ffffff", amount);
}

// Pull a contour toward app ink so it reads as an occlusion edge, never a separate palette.
export function sink(color: string): string {
  return mix(color, colors.ink, CONTOUR_SINK);
}

// Stone pulled `mixAmount` toward the species hue and lifted `liftAmount` in value.
export function stoneTint(species: CrystalSpecies, mixAmount: number, liftAmount: number): CrystalPalette {
  const { colors } = crystalSpec(species);
  return {
    base: lift(mix(STONE.base, colors.base, mixAmount), liftAmount),
    dark: lift(mix(STONE.dark, colors.dark, mixAmount), liftAmount * 0.5),
    light: lift(mix(STONE.light, colors.light, mixAmount), liftAmount),
    contour: sink(mix(STONE.contour, colors.contour, 0.35))
  };
}

// The resolved ramp for one species at one material — the ONLY colour input a renderer needs.
export function materialFor(species: CrystalSpecies, material: CrystalMaterial): CrystalPalette {
  if (material === "fogged") return { ...STONE };
  if (material === "open") return stoneTint(species, OPEN_MIX, OPEN_LIFT);
  if (material === "next") return stoneTint(species, NEXT_MIX, NEXT_LIFT);
  const { colors } = crystalSpec(species);
  return { ...colors, contour: sink(colors.contour) };
}

// A position on the resolved light→base→dark ramp.
export function rampAt(palette: CrystalPalette, tone: number): string {
  const clamped = Math.min(1, Math.max(-1, tone));
  return clamped >= 0 ? mix(palette.base, palette.light, clamped) : mix(palette.base, palette.dark, -clamped);
}

// The literal facet hex: the authored tone scaled by the material's presentation strength,
// then ramped. Never a white/ink overlay — that would not follow a material swap.
export function facetFill(palette: CrystalPalette, tone: number, material: CrystalMaterial): string {
  return rampAt(palette, tone * FACET_STRENGTH[material]);
}

// The rim light. Uncollected materials light with their own stone so nothing uncollected can
// out-shine an earned crystal; only `collected` gets a true white edge.
export function rimStroke(palette: CrystalPalette, material: CrystalMaterial): string {
  return material === "collected" ? GLOSS_FILL : palette.light;
}

// --- Role accessors ---------------------------------------------------------------------

export function crystalSpec(species: CrystalSpecies): CrystalSpec {
  return CRYSTAL_SPECS[species];
}

// The concept species for an ADR-0024 intrinsic difficulty band. Callers derive `band` with
// the shared `difficultyBand`, whose tie-break-low contract already defines the
// null-difficulty path; this module never re-derives banding and never returns an
// earned-only shape.
export function crystalForBand(band: number): CrystalSpecies {
  const index = Math.min(CONCEPT_SPECIES.length, Math.max(1, Math.round(band))) - 1;
  return CONCEPT_SPECIES[index];
}

// Scale-only cosmetic variation (KTD12) so repeats within a band don't look stamped. NOT a
// mirror: the light source is fixed upper-left and mirroring inverts every rim light.
export type CrystalVariation = { scale: number };

export function crystalVariationFor(derivedNodeId: string): CrystalVariation {
  const random = mulberry32(hashSeed(`variation:${derivedNodeId}`));
  return { scale: Math.round((0.9 + random() * 0.1) * 100) / 100 };
}

function channels(color: string): readonly [number, number, number] {
  const value = color.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
}

function hex(rgb: readonly number[]): string {
  return `#${rgb.map((channel) => clampByte(channel).toString(16).padStart(2, "0")).join("")}`;
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

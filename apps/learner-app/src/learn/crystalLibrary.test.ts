import assert from "node:assert/strict";
import { test } from "@jest/globals";
import { difficultyBand } from "@lrnki/application/projection";
import {
  CONCEPT_SPECIES,
  CRYSTAL_CAP_Y,
  EARNED_SPECIES,
  FACET_STRENGTH,
  GLOSS_OPACITY,
  RIM_OPACITY,
  crystalForBand,
  crystalSpec,
  crystalVariationFor,
  facetFill,
  materialFor,
  mix,
  rampAt,
  rimStroke,
  sink,
  type CrystalMaterial,
  type CrystalSpecies
} from "./crystalLibrary";
import { MINERAL_GROUND_Y, clipPolygonBelow, growthCutY, type MineralPoint } from "./mineralSpecimen";
import { colors } from "@/ui";

// This suite is the ART SWAP SAFETY NET: it asserts only invariants that ANY legal art drop
// must satisfy, never anything tied to the v4 source (nearest-tone quantization error and
// friends belong in the porting script). If a future re-authoring pass breaks one of these,
// the drop is wrong — not the test.

const ALL_SPECIES: readonly CrystalSpecies[] = [...CONCEPT_SPECIES, ...EARNED_SPECIES];
const ALL_MATERIALS: readonly CrystalMaterial[] = ["fogged", "open", "next", "collected"];

test("every species is a closed polygon resting on the shared bedrock at one cap height", () => {
  for (const species of ALL_SPECIES) {
    const spec = crystalSpec(species);
    assert.equal(spec.species, species, `${species} spec is keyed by its own role id`);
    assert.ok(spec.silhouette.length >= 3, `${species} silhouette is a polygon`);
    const first = spec.silhouette[0];
    const last = spec.silhouette[spec.silhouette.length - 1];
    // Implicitly closed: a repeated final point would double-count an edge in the growth clip.
    assert.ok(first[0] !== last[0] || first[1] !== last[1], `${species} silhouette is implicitly closed`);
    const ys = spec.silhouette.map(([, y]) => y);
    assert.equal(Math.max(...ys), MINERAL_GROUND_Y, `${species} rests on the bedrock line`);
    assert.equal(Math.min(...ys), CRYSTAL_CAP_Y, `${species} reaches the shared cap height`);
  }
});

test("every facet, gloss, and rim polygon stays inside its own silhouette's bounding box", () => {
  for (const species of ALL_SPECIES) {
    const spec = crystalSpec(species);
    const xs = spec.silhouette.map(([x]) => x);
    const ys = spec.silhouette.map(([, y]) => y);
    const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    const inside = (points: readonly MineralPoint[], what: string) => {
      assert.ok(points.length >= 2, `${species} ${what} has geometry`);
      for (const [x, y] of points) {
        assert.ok(x >= box.minX && x <= box.maxX, `${species} ${what} x=${x} inside silhouette`);
        assert.ok(y >= box.minY && y <= box.maxY, `${species} ${what} y=${y} inside silhouette`);
      }
    };
    spec.facets.forEach((facet, index) => {
      assert.ok(facet.tone >= -1 && facet.tone <= 1, `${species} facet ${index} tone is on the ramp`);
      inside(facet.points, `facet ${index}`);
    });
    assert.ok(spec.gloss.length >= 1, `${species} carries at least one gloss polygon`);
    spec.gloss.forEach((polygon, index) => inside(polygon, `gloss ${index}`));
    inside(spec.rimLight, "rim light");
  }
});

test("all four materials resolve to literal hexes for all eight species", () => {
  for (const species of ALL_SPECIES) {
    for (const material of ALL_MATERIALS) {
      const palette = materialFor(species, material);
      for (const [role, value] of Object.entries(palette)) {
        assert.match(value, /^#[0-9a-f]{6}$/, `${species}/${material} ${role} is a literal hex`);
      }
      // Deterministic: the same request always resolves to the same ramp.
      assert.deepEqual(materialFor(species, material), palette);
    }
  }
});

test("specimen contours resolve toward the canonical app ink", () => {
  assert.equal(sink("#ffffff"), mix("#ffffff", colors.ink, 0.45));
});

// The generator's own verify assertion (KTD13): the fogged→open step is a SATURATION step,
// because a luminance-only ladder is unachievable for the dark species.
test("open is more saturated than fogged stone for every species", () => {
  for (const species of ALL_SPECIES) {
    const fogged = saturation(materialFor(species, "fogged").base);
    const open = saturation(materialFor(species, "open").base);
    const next = saturation(materialFor(species, "next").base);
    assert.ok(open > fogged, `${species}: open (${open}) more saturated than fogged (${fogged})`);
    assert.ok(next > open, `${species}: next (${next}) more saturated than open (${open})`);
  }
});

test("fogged is species-independent stone, so an unopened slot gives away no hue", () => {
  const foggedPalettes = ALL_SPECIES.map((species) => materialFor(species, "fogged"));
  for (const palette of foggedPalettes) assert.deepEqual(palette, foggedPalettes[0]);
});

test("the facet ramp is anchored on the material palette and scaled by material strength", () => {
  const palette = materialFor("band5", "collected");
  assert.equal(rampAt(palette, 0), palette.base);
  assert.equal(rampAt(palette, 1), palette.light);
  assert.equal(rampAt(palette, -1), palette.dark);
  // Out-of-range tones clamp rather than extrapolating off the ramp.
  assert.equal(rampAt(palette, 4), palette.light);
  assert.equal(rampAt(palette, -4), palette.dark);
  // A collected facet reads at full authored strength; the stone materials stay quieter.
  assert.equal(facetFill(palette, 0.5, "collected"), mix(palette.base, palette.light, 0.5));
  assert.equal(facetFill(palette, 0.5, "open"), mix(palette.base, palette.light, 0.5 * FACET_STRENGTH.open));
  assert.ok(FACET_STRENGTH.collected > FACET_STRENGTH.next);
  assert.ok(FACET_STRENGTH.next > FACET_STRENGTH.open);
});

// Colour is never the only channel (WCAG F73): the gloss strengthens monotonically along the
// ladder and fogged carries none at all, so the material step survives greyscale.
test("gloss strength rises along the material ladder and only collected takes a white rim", () => {
  assert.equal(GLOSS_OPACITY.fogged, 0);
  assert.ok(GLOSS_OPACITY.collected > GLOSS_OPACITY.next);
  assert.ok(GLOSS_OPACITY.next > GLOSS_OPACITY.open);
  assert.ok(GLOSS_OPACITY.open > GLOSS_OPACITY.fogged);
  for (const material of ALL_MATERIALS) assert.ok(RIM_OPACITY[material] > 0);
  const collected = materialFor("band4", "collected");
  assert.equal(rimStroke(collected, "collected"), "#ffffff");
  for (const material of ["fogged", "open", "next"] as const) {
    const palette = materialFor("band4", material);
    assert.equal(rimStroke(palette, material), palette.light);
  }
});

test("crystalForBand is total over the five bands and never returns an earned-only shape", () => {
  const byBand = new Map<number, CrystalSpecies>();
  for (const difficulty of [null, 0, 0.1, 0.25, 0.3, 0.5, 0.62, 0.75, 0.9, 1]) {
    byBand.set(difficultyBand(difficulty), crystalForBand(difficultyBand(difficulty)));
  }
  assert.deepEqual([...byBand.keys()].sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual([1, 2, 3, 4, 5].map(crystalForBand), [...CONCEPT_SPECIES]);
  // Null difficulty resolves through the SHARED banding's tie-break-low contract.
  assert.equal(crystalForBand(difficultyBand(null)), "band1");
  // Out-of-contract bands clamp into the concept range rather than reaching an earned shape.
  for (const band of [-3, 0, 6, 99]) {
    assert.ok(!(EARNED_SPECIES as readonly string[]).includes(crystalForBand(band)));
  }
});

test("cosmetic variation is deterministic, scale-only, and never mirrors the fixed light source", () => {
  const variation = crystalVariationFor("node-a");
  assert.deepEqual(crystalVariationFor("node-a"), variation);
  assert.deepEqual(Object.keys(variation), ["scale"]);
  for (let index = 0; index < 32; index += 1) {
    const { scale } = crystalVariationFor(`node-${index}`);
    assert.ok(scale >= 0.9 && scale <= 1, `scale ${scale} stays within the subtle band`);
  }
  assert.notDeepEqual(crystalVariationFor("node-a"), crystalVariationFor("node-b"));
});

test("growth clips every species between an empty base and its whole silhouette", () => {
  for (const species of ALL_SPECIES) {
    const spec = crystalSpec(species);
    assert.equal(growthCutY(spec, 0), MINERAL_GROUND_Y);
    assert.equal(growthCutY(spec, 1), CRYSTAL_CAP_Y);
    // Out-of-range growth clamps rather than cutting above the cap or below the bedrock.
    assert.equal(growthCutY(spec, -1), MINERAL_GROUND_Y);
    assert.equal(growthCutY(spec, 4), CRYSTAL_CAP_Y);
    assert.deepEqual(clipPolygonBelow(spec.silhouette, growthCutY(spec, 1)), [...spec.silhouette]);
    const empty = clipPolygonBelow(spec.silhouette, growthCutY(spec, 0));
    assert.ok(
      empty.length < 3 || empty.every(([, y]) => y === MINERAL_GROUND_Y),
      `${species} at zero growth is a degenerate ground sliver, never a body`
    );
    const half = clipPolygonBelow(spec.silhouette, growthCutY(spec, 0.5));
    assert.ok(half.length >= 3, `${species} at half growth has a body`);
    assert.ok(Math.min(...half.map(([, y]) => y)) >= growthCutY(spec, 0.5) - 0.001);
  }
});

// HSV saturation on 0..255 channels — the "earned" channel of the material ladder.
function saturation(color: string): number {
  const value = color.replace("#", "");
  const rgb = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  return max === 0 ? 0 : (max - min) / max;
}

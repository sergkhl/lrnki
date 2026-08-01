import Svg, { G, Polygon, Polyline } from "react-native-svg";
import {
  CRYSTAL_VIEWBOX,
  GLOSS_FILL,
  GLOSS_OPACITY,
  RIM_OPACITY,
  crystalSpec,
  crystalVariationFor,
  facetFill,
  materialFor,
  rimStroke,
  type CrystalMaterial,
  type CrystalPalette,
  type CrystalSpec,
  type CrystalSpecies
} from "@/learn/crystalLibrary";
import { MINERAL_GROUND_Y, clipPolygonBelow, growthCutY, type MineralPoint } from "@/learn/mineralSpecimen";

// One crystal from the eight-crystal library (plan 2026-07-30-001 U2, KTD7). Rendering only —
// species roles, materials, and the growth clip live in `@/learn/crystalLibrary`;
// event-bound motion belongs to the scenes.
//
// Growth is TWO PASSES over ONE geometry: the slot's own material fills the whole silhouette,
// then the full-colour `collected` material is drawn over the region below the growth cut.
// The honest per-concept progress signal therefore survives the material ladder, and because
// the cut is a pure-code half-plane clip there is no <ClipPath>, <Defs>, gradient, or SVG id
// anywhere — ids are document-global on web, so the same concept can render at two growth
// values on two surfaces at once.
//
// The occlusion contour is the species' own sunk contour at a geometry-scaled width, so a
// crystal reads as a lit solid rather than an outlined sticker at every size.
const CONTOUR_WIDTH = 3;
const RIM_WIDTH = 2.5;

export function CrystalSpecimen({
  species,
  derivedNodeId,
  material,
  growthFraction,
  size = 40,
  ariaLabel
}: Readonly<{
  species: CrystalSpecies;
  derivedNodeId: string;
  material: CrystalMaterial;
  growthFraction: number;
  size?: number;
  // `null` marks the crystal decorative: the surface around it (a cavern cell, the summit strip,
  // the junction badge) already carries the accessible name, so announcing both would double up.
  ariaLabel?: string | null;
}>) {
  return (
    <Svg
      accessible={ariaLabel === null ? false : undefined}
      accessibilityRole={ariaLabel === null ? undefined : "image"}
      accessibilityLabel={ariaLabel === null ? undefined : ariaLabel ?? defaultLabel(material)}
      viewBox={CRYSTAL_VIEWBOX}
      width={size}
      height={size}
    >
      <CrystalSpecimenGroup
        species={species}
        derivedNodeId={derivedNodeId}
        material={material}
        growthFraction={growthFraction}
      />
    </Svg>
  );
}

// The crystal as an embeddable <G> (no own <Svg> root), so one scene can place many crystals
// inside ONE canvas — react-native-svg does not nest Svg roots. The deterministic scale
// variation applies here about the bedrock pivot, so the growth cut stays horizontal under
// it; it never mirrors, because the light source is fixed upper-left.
export function CrystalSpecimenGroup({
  species,
  derivedNodeId,
  material,
  growthFraction
}: Readonly<{
  species: CrystalSpecies;
  derivedNodeId: string;
  material: CrystalMaterial;
  growthFraction: number;
}>) {
  const spec = crystalSpec(species);
  const { scale } = crystalVariationFor(derivedNodeId);
  const transform = `translate(50, ${MINERAL_GROUND_Y}) scale(${scale}) translate(-50, -${MINERAL_GROUND_Y})`;

  // A fogged slot sits in unopened ground: it shows silhouette and nothing else, so a Leg the
  // learner has not reached can never display progress it has not made.
  const grown = material === "fogged" ? 0 : material === "collected" ? 1 : clamp01(growthFraction);
  const slotMaterial = material === "collected" ? "open" : material;
  const slot = materialFor(species, slotMaterial);
  const collected = materialFor(species, "collected");
  // Only a fully grown crystal takes the earned white edge and the full-colour contour.
  const capped = grown >= 1;
  const edge = capped ? collected : slot;
  const edgeMaterial: CrystalMaterial = capped ? "collected" : slotMaterial;

  return (
    <G transform={transform}>
      <CrystalPass testID="specimen-body" spec={spec} palette={slot} material={slotMaterial} cutY={null} />
      {grown > 0 ? (
        <CrystalPass
          testID="specimen-fill"
          spec={spec}
          palette={collected}
          material="collected"
          cutY={growthCutY(spec, grown)}
        />
      ) : null}
      <Polygon
        testID="specimen-contour"
        points={toPoints(spec.silhouette)}
        fill="none"
        stroke={edge.contour}
        strokeWidth={CONTOUR_WIDTH}
        strokeLinejoin="round"
      />
      <Polyline
        testID="specimen-rim"
        points={toPoints(spec.rimLight)}
        fill="none"
        stroke={rimStroke(edge, edgeMaterial)}
        strokeWidth={RIM_WIDTH}
        strokeOpacity={RIM_OPACITY[edgeMaterial]}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </G>
  );
}

// One material resolution of the geometry: body, facet planes, and gloss. `cutY === null`
// draws the whole shape; otherwise only the region on or below the cut survives. Every fill
// is a literal hex off the material's own ramp, so a material swap re-derives all of them.
function CrystalPass({
  testID,
  spec,
  palette,
  material,
  cutY
}: Readonly<{
  testID: string;
  spec: CrystalSpec;
  palette: CrystalPalette;
  material: CrystalMaterial;
  cutY: number | null;
}>) {
  const body = cutY === null ? [...spec.silhouette] : clipPolygonBelow(spec.silhouette, cutY);
  // A degenerate region (fewer than 3 points, or a flat ground-line sliver at growth 0)
  // renders nothing rather than a zero-area polygon.
  if (body.length < 3 || body.every(([, y]) => y === body[0][1])) return null;
  const glossOpacity = GLOSS_OPACITY[material];
  return (
    <G>
      <Polygon testID={testID} points={toPoints(body)} fill={palette.base} />
      {spec.facets.map((facet, index) => {
        const clipped = cutY === null ? [...facet.points] : clipPolygonBelow(facet.points, cutY);
        if (clipped.length < 3) return null;
        return (
          <Polygon
            key={index}
            testID={`${testID}-facet`}
            points={toPoints(clipped)}
            fill={facetFill(palette, facet.tone, material)}
          />
        );
      })}
      {glossOpacity > 0
        ? spec.gloss.map((polygon, index) => {
            const clipped = cutY === null ? [...polygon] : clipPolygonBelow(polygon, cutY);
            if (clipped.length < 3) return null;
            return (
              <Polygon
                key={index}
                testID={`${testID}-gloss`}
                points={toPoints(clipped)}
                fill={GLOSS_FILL}
                fillOpacity={glossOpacity}
              />
            );
          })
        : null}
    </G>
  );
}

// Copy is unchanged from the shipped specimen (R11): materials are a presentation ladder, not
// new learner vocabulary.
function defaultLabel(material: CrystalMaterial): string {
  if (material === "collected") return "Collected crystal";
  if (material === "fogged") return "Ghost slot";
  return "Growing crystal";
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toPoints(points: readonly MineralPoint[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

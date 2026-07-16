import Svg, { G, Polygon } from "react-native-svg";
import {
  MINERAL_GROUND_Y,
  MINERAL_VIEWBOX,
  clipPolygonBelow,
  growthCutY,
  mineralSpeciesFor,
  mineralSpecimenSpec,
  mineralVariationFor,
  type MineralPoint,
  type MineralSpecies,
  type MineralSpeciesSpec
} from "@/learn/mineralSpecimen";
import { colors } from "@/ui";

export type SpecimenState = "ghost" | "growing" | "collected";

// One specimen-wide stroke policy (plan 2026-07-16-003 U3, D4): a constant 2 px outline
// matching the lucide icon weight on every state, immune to size props, mound-slot
// scale, and cosmetic variation via non-scaling stroke.
const SPECIMEN_STROKE = 2;
const NON_SCALING = { vectorEffect: "non-scaling-stroke" } as const;

// One mineral specimen (plan 2026-07-16-002 U1, D1): renders the curated species
// geometry at readable sizes (>= 40 px). Rendering only — species mapping, silhouettes,
// and the growth clip live in `@/learn/mineralSpecimen`; event-bound motion belongs to
// the scenes. A ghost stays an outlined slot in every state: it never fills, so known
// ground never reads as a collected crystal.
export function CrystalSpecimen({
  derivedNodeId,
  difficulty,
  growthFraction,
  state,
  size = 40,
  ariaLabel
}: Readonly<{
  derivedNodeId: string;
  difficulty: number | null;
  growthFraction: number;
  state: SpecimenState;
  size?: number;
  ariaLabel?: string;
}>) {
  return (
    <Svg
      accessibilityRole="image"
      accessibilityLabel={ariaLabel ?? defaultLabel(state)}
      viewBox={MINERAL_VIEWBOX}
      width={size}
      height={size}
    >
      <MineralSpecimenGroup
        species={mineralSpeciesFor(difficulty)}
        derivedNodeId={derivedNodeId}
        growthFraction={growthFraction}
        state={state}
      />
    </Svg>
  );
}

// The specimen as an embeddable <G> (no own <Svg> root), so a Leg scene can place many
// specimens inside ONE canvas — react-native-svg does not nest Svg roots. The tiny
// deterministic mirror/scale variation applies here about the bedrock pivot, so the
// growth cut line stays horizontal under it.
export function MineralSpecimenGroup({
  species,
  derivedNodeId,
  growthFraction,
  state
}: Readonly<{
  species: MineralSpecies;
  derivedNodeId: string;
  growthFraction: number;
  state: SpecimenState;
}>) {
  const spec = mineralSpecimenSpec(species);
  const variation = mineralVariationFor(derivedNodeId);
  const sx = variation.mirrored ? -variation.scale : variation.scale;
  const transform = `translate(50, ${MINERAL_GROUND_Y}) scale(${sx}, ${variation.scale}) translate(-50, -${MINERAL_GROUND_Y})`;
  const tint = tintFor(species);

  if (state === "ghost") {
    return (
      <G transform={transform}>
        <Polygon
          testID="specimen-ghost"
          points={toPoints(spec.silhouette)}
          fill="transparent"
          stroke={tint}
          strokeWidth={SPECIMEN_STROKE}
          {...NON_SCALING}
          strokeLinejoin="round"
          opacity={0.55}
        />
      </G>
    );
  }

  if (state === "collected") {
    return (
      <G transform={transform}>
        <FilledBody spec={spec} tint={tint} cutY={growthCutY(spec, 1)} />
        <Polygon testID="specimen-gloss" points={toPoints(spec.gloss)} fill="white" opacity={spec.glossOpacity} />
      </G>
    );
  }

  // Growing: the eventual form teases as a faint outline while the tinted fill rises
  // from the bedrock to the honest growth cut — one visual variable (D1).
  return (
    <G transform={transform}>
      <Polygon
        testID="specimen-outline"
        points={toPoints(spec.silhouette)}
        fill="transparent"
        stroke={tint}
        strokeWidth={SPECIMEN_STROKE}
        {...NON_SCALING}
        strokeLinejoin="round"
        opacity={0.7}
      />
      <FilledBody spec={spec} tint={tint} cutY={growthCutY(spec, growthFraction)} />
    </G>
  );
}

// The silhouette fill plus its facet planes, clipped below the growth cut. Facets shade
// with white/ink overlays so the planes read on any tier tint.
function FilledBody({ spec, tint, cutY }: Readonly<{ spec: MineralSpeciesSpec; tint: string; cutY: number }>) {
  const body = clipPolygonBelow(spec.silhouette, cutY);
  // A degenerate region (fewer than 3 points, or a flat ground-line sliver at growth 0)
  // renders nothing rather than a zero-area polygon.
  if (body.length < 3 || body.every(([, y]) => y === body[0][1])) return null;
  return (
    <G>
      <Polygon
        testID="specimen-fill"
        points={toPoints(body)}
        fill={tint}
        stroke={colors.ink}
        strokeOpacity={0.25}
        strokeWidth={SPECIMEN_STROKE}
        {...NON_SCALING}
        strokeLinejoin="round"
      />
      {spec.facets.map((facet, index) => {
        const clipped = clipPolygonBelow(facet.points, cutY);
        if (clipped.length < 3) return null;
        return (
          <Polygon
            key={index}
            testID="specimen-facet"
            points={toPoints(clipped)}
            fill={facet.shade > 0 ? "white" : colors.ink}
            opacity={Math.abs(facet.shade)}
          />
        );
      })}
    </G>
  );
}

export function tintFor(species: MineralSpecies): string {
  return colors[`mineral-${species}`];
}

function defaultLabel(state: SpecimenState): string {
  if (state === "collected") return "Collected crystal";
  if (state === "ghost") return "Ghost slot";
  return "Growing crystal";
}

function toPoints(points: readonly MineralPoint[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

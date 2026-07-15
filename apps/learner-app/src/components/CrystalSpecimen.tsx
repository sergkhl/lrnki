import Svg, { G, Polygon } from "react-native-svg";
import {
  MINERAL_SATURATION,
  MINERAL_VIEWBOX,
  mineralHabitFor,
  mineralSpecimenSpec,
  visibleMineralFacets,
  type MineralFacet,
  type MineralHabit,
  type MineralSpecimenSpec
} from "@/learn/mineralSpecimen";

export type SpecimenState = "ghost" | "growing" | "collected";

// One mineral specimen (plan 2026-07-15-002 U1, R12/R14): renders the pure Mineral
// Menagerie geometry at readable sizes (>= 40 px). Rendering only — habit assignment,
// facet geometry, and growth policy live in `@/learn/mineralSpecimen`; event-bound
// motion arrives with the shared Leg scene (U3). A ghost stays an outlined slot in
// every state (R8): it never fills, so known ground never reads as a collected crystal.
export function CrystalSpecimen({
  derivedNodeId,
  sectionIndex,
  sectionPositionIndex,
  growthFraction,
  state,
  size = 40,
  ariaLabel
}: Readonly<{
  derivedNodeId: string;
  sectionIndex: number;
  sectionPositionIndex: number;
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
      <MineralFacetsGroup
        habit={mineralHabitFor({ sectionIndex, sectionPositionIndex })}
        derivedNodeId={derivedNodeId}
        growthFraction={growthFraction}
        state={state}
      />
    </Svg>
  );
}

// The facet geometry as an embeddable <G> (no own <Svg> root), so a Leg scene can place
// many specimens inside ONE canvas — react-native-svg does not nest Svg roots.
export function MineralFacetsGroup({
  habit,
  derivedNodeId,
  growthFraction,
  state
}: Readonly<{
  habit: MineralHabit;
  derivedNodeId: string;
  growthFraction: number;
  state: SpecimenState;
}>) {
  const spec = mineralSpecimenSpec(habit, derivedNodeId);
  if (state === "ghost") return <GhostSlot spec={spec} />;
  const grown = state === "collected" ? visibleMineralFacets(spec, 1) : visibleMineralFacets(spec, growthFraction);
  const grownIndexes = new Set(grown.map((facet) => facet.revealIndex));
  return (
    <G>
      {/* The full silhouette always shows faintly behind a growing specimen: the
          eventual form teases what mastery will finish. */}
      {spec.facets.map((facet) =>
        grownIndexes.has(facet.revealIndex) ? null : (
          <Polygon key={facet.revealIndex} testID="facet-pending" points={toPoints(facet)} fill="#8d887c" opacity={0.3} />
        )
      )}
      {grown.map((facet) => (
        <Polygon
          key={facet.revealIndex}
          testID="facet-grown"
          points={toPoints(facet)}
          fill={fillFor(spec, facet, state)}
          stroke={strokeFor(spec, facet)}
          strokeWidth={1}
        />
      ))}
      {state === "collected" ? <Highlight spec={spec} /> : null}
    </G>
  );
}

// A ghost slot: the specimen's full outline with no fill — labeled ground that is
// complete (known) or awaited, never a collected mineral.
function GhostSlot({ spec }: Readonly<{ spec: MineralSpecimenSpec }>) {
  return (
    <G>
      {spec.facets.map((facet) => (
        <Polygon
          key={facet.revealIndex}
          testID="facet-ghost"
          points={toPoints(facet)}
          fill="transparent"
          stroke={`hsl(${spec.hue}, ${MINERAL_SATURATION}%, ${facet.lightness - 4}%)`}
          strokeWidth={2.5}
          opacity={0.65}
        />
      ))}
    </G>
  );
}

// A gradient-free gloss on the sealing facet, shrunk toward its centroid: the shared
// highlight language across all three habits. Plain polygons avoid SVG defs ids.
function Highlight({ spec }: Readonly<{ spec: MineralSpecimenSpec }>) {
  const top = spec.facets[spec.facets.length - 1];
  const cx = top.points.reduce((sum, [x]) => sum + x, 0) / top.points.length;
  const cy = top.points.reduce((sum, [, y]) => sum + y, 0) / top.points.length;
  const points = top.points.map(([x, y]) => `${x + (cx - x) * 0.45},${y + (cy - y) * 0.45}`).join(" ");
  return <Polygon testID="facet-highlight" points={points} fill="white" opacity={0.35} />;
}

function fillFor(spec: MineralSpecimenSpec, facet: MineralFacet, state: SpecimenState): string {
  return `hsl(${spec.hue}, ${MINERAL_SATURATION}%, ${state === "collected" ? facet.lightness + 8 : facet.lightness}%)`;
}

// Same-hue darker hairline: separates facets from the near-white journal paper.
function strokeFor(spec: MineralSpecimenSpec, facet: MineralFacet): string {
  return `hsl(${spec.hue}, ${MINERAL_SATURATION}%, ${Math.max(0, facet.lightness - 18)}%)`;
}

function defaultLabel(state: SpecimenState): string {
  if (state === "collected") return "Collected crystal";
  if (state === "ghost") return "Ghost slot";
  return "Growing crystal";
}

function toPoints(facet: MineralFacet): string {
  return facet.points.map(([x, y]) => `${x},${y}`).join(" ");
}

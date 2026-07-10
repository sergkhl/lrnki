import Svg, { G, Polygon } from "react-native-svg";
import { CRYSTAL_BASE, CRYSTAL_SATURATION, CRYSTAL_VIEWBOX, crystalSpec, visibleShards, type CrystalShard } from "@/learn/crystalGeometry";

export type CrystalGlyphState = "locked" | "frontier" | "mastered";

const FOG = "#8d887c";

// One concept's procedural crystal rendered as static react-native-svg polygons from the
// same pure crystalGeometry the web SPA used, so a concept's crystal stays recognizably
// identical across platforms (ADR-0032 game identity). Growth/assembly animation returns
// with Reanimated in the follow-up pass.
export function CrystalGlyph({
  derivedNodeId,
  difficulty,
  growthFraction,
  state,
  size = 24,
  ghost = false,
  ariaLabel
}: Readonly<{
  derivedNodeId: string;
  difficulty: number;
  growthFraction: number;
  state: CrystalGlyphState;
  size?: number;
  ghost?: boolean;
  ariaLabel?: string;
}>) {
  return (
    <Svg
      accessibilityRole="image"
      accessibilityLabel={ariaLabel ?? defaultLabel(state)}
      viewBox={CRYSTAL_VIEWBOX}
      width={size}
      height={size}
    >
      <CrystalShardsGroup derivedNodeId={derivedNodeId} difficulty={difficulty} growthFraction={growthFraction} state={state} ghost={ghost} />
    </Svg>
  );
}

// The shard geometry as an embeddable <G> (no own <Svg> root), so the Crystal Vista can
// place many crystals inside ONE canvas — react-native-svg does not nest Svg roots.
export function CrystalShardsGroup({
  derivedNodeId,
  difficulty,
  growthFraction,
  state,
  ghost = false
}: Readonly<{
  derivedNodeId: string;
  difficulty: number;
  growthFraction: number;
  state: CrystalGlyphState;
  ghost?: boolean;
}>) {
  const spec = crystalSpec(derivedNodeId, difficulty);
  const grown = ghost ? visibleShards(spec, 1) : state === "mastered" ? visibleShards(spec, 1) : state === "locked" ? [] : visibleShards(spec, growthFraction);
  const grownIndexes = new Set(grown.map((shard) => shard.revealIndex));
  const fillFor = (shard: CrystalShard) =>
    `hsl(${spec.hue}, ${CRYSTAL_SATURATION}%, ${state === "mastered" ? shard.lightness + 8 : shard.lightness}%)`;
  // Same-hue darker hairline: separates grown facets from the near-white journal
  // paper without touching the fill palette.
  const strokeFor = (shard: CrystalShard) => `hsl(${spec.hue}, ${CRYSTAL_SATURATION}%, ${Math.max(0, shard.lightness - 18)}%)`;

  return (
    <G>
      {/* The full formation always shows as a silhouette: fogged for locked territory,
          a faint ghost behind a growing frontier crystal — the eventual shape teases
          what mastery will finish. */}
      {spec.shards.map((shard) =>
        grownIndexes.has(shard.revealIndex) ? null : (
          <Polygon
            key={shard.revealIndex}
            points={toPoints(shard)}
            fill={FOG}
            opacity={state === "locked" ? 0.55 : 0.3}
          />
        )
      )}
      {state === "frontier" && grown.length === 0 ? <SeedNub shard={firstShard(spec.shards)} fill={fillFor(firstShard(spec.shards))} /> : null}
      {grown.map((shard) => (
        <Polygon
          key={shard.revealIndex}
          points={toPoints(shard)}
          fill={ghost ? "transparent" : fillFor(shard)}
          stroke={ghost ? `hsl(${spec.hue}, ${CRYSTAL_SATURATION}%, ${shard.lightness - 4}%)` : strokeFor(shard)}
          strokeWidth={ghost ? 2.5 : 1}
          opacity={ghost ? 0.65 : undefined}
        />
      ))}
      {state === "mastered" && !ghost ? <Glint shard={tallestShard(spec.shards)} /> : null}
    </G>
  );
}

function defaultLabel(state: CrystalGlyphState): string {
  if (state === "mastered") return "Collected crystal";
  if (state === "locked") return "Fogged crystal";
  return "Growing crystal";
}

function toPoints(shard: CrystalShard): string {
  return shard.points.map(([x, y]) => `${x},${y}`).join(" ");
}

function firstShard(shards: CrystalShard[]): CrystalShard {
  return shards.find((shard) => shard.revealIndex === 0) ?? shards[0];
}

// The shard whose tip rises highest (smallest y) carries the mastered glint.
function tallestShard(shards: CrystalShard[]): CrystalShard {
  return shards.reduce((tallest, shard) => (shard.points[2][1] < tallest.points[2][1] ? shard : tallest), shards[0]);
}

// An untouched frontier concept shows a small seed at the bedrock: something is already
// alive there, inviting the first stop.
function SeedNub({ shard, fill }: Readonly<{ shard: CrystalShard; fill: string }>) {
  const scale = 0.34;
  return (
    <G transform={`translate(${CRYSTAL_BASE.x * (1 - scale)} ${CRYSTAL_BASE.y * (1 - scale)}) scale(${scale})`}>
      <Polygon points={toPoints(shard)} fill={fill} opacity={0.9} />
    </G>
  );
}

// A gradient-free gloss: the tallest shard's outline shrunk toward its tip reads as a
// specular facet. Plain polygons avoid SVG defs ids, so the same concept's crystal can
// render many times on one screen.
function Glint({ shard }: Readonly<{ shard: CrystalShard }>) {
  const [tipX, tipY] = shard.points[2];
  const points = shard.points
    .map((point) => `${point[0] + (tipX - point[0]) * 0.55},${point[1] + (tipY - point[1]) * 0.55}`)
    .join(" ");
  return <Polygon points={points} fill="white" opacity={0.35} />;
}

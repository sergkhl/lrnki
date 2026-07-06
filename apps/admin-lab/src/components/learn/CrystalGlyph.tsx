"use client";

import { motion } from "motion/react";
import { CRYSTAL_BASE, CRYSTAL_SATURATION, CRYSTAL_VIEWBOX, crystalSpec, visibleShards, type CrystalShard } from "./crystalGeometry";

export type CrystalGlyphState = "locked" | "frontier" | "mastered";

// One concept's procedural crystal. The same component renders every surface (trail
// capstone, concept marker, header tally, vista, capstone reveal) so a concept's
// crystal is recognizably the same formation everywhere. `assemble` plays the one-shot
// facet-assembly entrance on the mastery reveal.
export function CrystalGlyph({
  derivedNodeId,
  difficulty,
  growthFraction,
  state,
  size = 24,
  assemble = false,
  ghost = false,
  className,
  ariaLabel
}: Readonly<{
  derivedNodeId: string;
  difficulty: number;
  growthFraction: number;
  state: CrystalGlyphState;
  size?: number;
  assemble?: boolean;
  ghost?: boolean;
  className?: string;
  ariaLabel?: string;
}>) {
  const spec = crystalSpec(derivedNodeId, difficulty);
  const grown = ghost ? visibleShards(spec, 1) : state === "mastered" ? visibleShards(spec, 1) : state === "locked" ? [] : visibleShards(spec, growthFraction);
  const grownIndexes = new Set(grown.map((shard) => shard.revealIndex));
  const fillFor = (shard: CrystalShard) =>
    `hsl(${spec.hue} ${CRYSTAL_SATURATION}% ${state === "mastered" ? shard.lightness + 8 : shard.lightness}%)`;
  // Same-hue darker hairline: separates grown facets from the near-white journal
  // paper without touching the fill palette (contrast fix, task 6).
  const strokeFor = (shard: CrystalShard) => `hsl(${spec.hue} ${CRYSTAL_SATURATION}% ${Math.max(0, shard.lightness - 18)}%)`;
  // Shards scale up from the bedrock anchor, not the box center.
  const growFromBase = { transformOrigin: `${CRYSTAL_BASE.x}px ${CRYSTAL_BASE.y}px`, transformBox: "view-box" } as const;

  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? defaultLabel(state)}
      viewBox={CRYSTAL_VIEWBOX}
      width={size}
      height={size}
      className={className}
    >
      {/* The full formation always shows as a silhouette: fogged for locked territory,
          a faint ghost behind a growing frontier crystal — the eventual shape teases
          what mastery will finish. */}
      {spec.shards.map((shard) =>
        grownIndexes.has(shard.revealIndex) ? null : (
          <polygon
            key={shard.revealIndex}
            points={toPoints(shard)}
            fill="var(--journal-fog)"
            opacity={state === "locked" ? 0.55 : 0.3}
          />
        )
      )}
      {state === "frontier" && grown.length === 0 ? <SeedNub shard={firstShard(spec.shards)} fill={fillFor(firstShard(spec.shards))} /> : null}
      {grown.map((shard, index) =>
        assemble ? (
          <motion.polygon
            key={shard.revealIndex}
            points={toPoints(shard)}
            fill={fillFor(shard)}
            stroke={strokeFor(shard)}
            strokeWidth={1}
            style={growFromBase}
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.08, duration: 0.4, ease: "backOut" }}
          />
        ) : (
          <polygon
            key={shard.revealIndex}
            points={toPoints(shard)}
            fill={ghost ? "transparent" : fillFor(shard)}
            stroke={ghost ? `hsl(${spec.hue} ${CRYSTAL_SATURATION}% ${shard.lightness - 4}%)` : strokeFor(shard)}
            strokeWidth={ghost ? 2.5 : 1}
            opacity={ghost ? 0.65 : undefined}
          />
        )
      )}
      {state === "mastered" && !ghost ? <Glint shard={tallestShard(spec.shards)} assembleDelay={assemble ? grown.length * 0.08 + 0.15 : null} /> : null}
    </svg>
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
    <g transform={`translate(${CRYSTAL_BASE.x * (1 - scale)} ${CRYSTAL_BASE.y * (1 - scale)}) scale(${scale})`}>
      <polygon points={toPoints(shard)} fill={fill} opacity={0.9} />
    </g>
  );
}

// A gradient-free gloss: the tallest shard's outline shrunk toward its tip reads as a
// specular facet. Plain polygons avoid SVG defs ids, so the same concept's crystal can
// render many times on one page. During assembly it flares once, then settles — the
// shimmer that seals the mastery moment.
function Glint({ shard, assembleDelay }: Readonly<{ shard: CrystalShard; assembleDelay: number | null }>) {
  const [tipX, tipY] = shard.points[2];
  const points = shard.points
    .map((point) => `${point[0] + (tipX - point[0]) * 0.55},${point[1] + (tipY - point[1]) * 0.55}`)
    .join(" ");
  if (assembleDelay === null) return <polygon points={points} fill="white" opacity={0.35} />;
  return (
    <motion.polygon
      points={points}
      fill="white"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.8, 0.35] }}
      transition={{ delay: assembleDelay, duration: 0.7, times: [0, 0.4, 1] }}
    />
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import Svg, { G, Polygon } from "react-native-svg";
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import { CRYSTAL_BASE, CRYSTAL_SATURATION, CRYSTAL_VIEWBOX, crystalSpec, visibleShards, type CrystalShard } from "@/learn/crystalGeometry";
import { MOTION, useReducedMotion } from "@/ui";

export type CrystalGlyphState = "locked" | "frontier" | "mastered";

const FOG = "#8d887c";
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

// One concept's procedural crystal rendered as react-native-svg polygons from the same
// pure crystalGeometry the web SPA used, so a concept's crystal stays recognizably
// identical across platforms (ADR-0032 game identity). `assemble` plays the one-shot
// facet-from-bedrock assembly at the mastery reveal; a growthFraction rise while
// mounted reveals only the newly earned shards once (U5, R14-R15).
export function CrystalGlyph({
  derivedNodeId,
  difficulty,
  growthFraction,
  state,
  size = 24,
  ghost = false,
  assemble = false,
  ariaLabel
}: Readonly<{
  derivedNodeId: string;
  difficulty: number;
  growthFraction: number;
  state: CrystalGlyphState;
  size?: number;
  ghost?: boolean;
  assemble?: boolean;
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
      <CrystalShardsGroup derivedNodeId={derivedNodeId} difficulty={difficulty} growthFraction={growthFraction} state={state} ghost={ghost} assemble={assemble} />
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
  ghost = false,
  assemble = false
}: Readonly<{
  derivedNodeId: string;
  difficulty: number;
  growthFraction: number;
  state: CrystalGlyphState;
  ghost?: boolean;
  assemble?: boolean;
}>) {
  const reduceMotion = useReducedMotion();
  const spec = useMemo(() => crystalSpec(derivedNodeId, difficulty), [derivedNodeId, difficulty]);
  const grown = ghost ? visibleShards(spec, 1) : state === "mastered" ? visibleShards(spec, 1) : state === "locked" ? [] : visibleShards(spec, growthFraction);
  const grownIndexes = new Set(grown.map((shard) => shard.revealIndex));
  // One-shot reveal bookkeeping: `assemble` animates the whole formation on mount; a
  // growthFraction rise while mounted animates only the shards beyond the previous
  // fraction. Reopening an unchanged crystal renders statically (no replay).
  const animate = !ghost && !reduceMotion;
  const [revealFrom, setRevealFrom] = useState<number | null>(animate && assemble && state === "mastered" ? 0 : null);
  const prevFractionRef = useRef(growthFraction);
  useEffect(() => {
    const previous = prevFractionRef.current;
    prevFractionRef.current = growthFraction;
    if (!animate || state !== "frontier" || growthFraction <= previous) return;
    setRevealFrom(visibleShards(spec, previous).length);
  }, [growthFraction, state, animate, spec]);

  const fillFor = (shard: CrystalShard) =>
    `hsl(${spec.hue}, ${CRYSTAL_SATURATION}%, ${state === "mastered" ? shard.lightness + 8 : shard.lightness}%)`;
  // Same-hue darker hairline: separates grown facets from the near-white journal
  // paper without touching the fill palette.
  const strokeFor = (shard: CrystalShard) => `hsl(${spec.hue}, ${CRYSTAL_SATURATION}%, ${Math.max(0, shard.lightness - 18)}%)`;
  const revealDelay = (shard: CrystalShard) => (revealFrom === null ? null : shard.revealIndex >= revealFrom ? (shard.revealIndex - revealFrom) * 80 : null);
  const assemblingCount = revealFrom === null ? 0 : grown.filter((shard) => shard.revealIndex >= revealFrom).length;

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
      {grown.map((shard) => {
        const delay = revealDelay(shard);
        return delay === null ? (
          <Polygon
            key={shard.revealIndex}
            testID="shard-static"
            points={toPoints(shard)}
            fill={ghost ? "transparent" : fillFor(shard)}
            stroke={ghost ? `hsl(${spec.hue}, ${CRYSTAL_SATURATION}%, ${shard.lightness - 4}%)` : strokeFor(shard)}
            strokeWidth={ghost ? 2.5 : 1}
            opacity={ghost ? 0.65 : undefined}
          />
        ) : (
          <AssemblingShard key={shard.revealIndex} shard={shard} fill={fillFor(shard)} stroke={strokeFor(shard)} delayMs={delay} />
        );
      })}
      {state === "mastered" && !ghost ? (
        <Glint shard={tallestShard(spec.shards)} flareDelayMs={revealFrom !== null && assemblingCount > 0 ? assemblingCount * 80 + 150 : null} />
      ) : null}
    </G>
  );
}

// A shard scaling up from the bedrock anchor once, on mount — the RN re-port of the
// deleted web assembly. State never rides on this: the shard is already earned.
function AssemblingShard({ shard, fill, stroke, delayMs }: Readonly<{ shard: CrystalShard; fill: string; stroke: string; delayMs: number }>) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withDelay(delayMs, withTiming(1, { duration: MOTION.celebration, easing: Easing.out(Easing.back(1.5)) })));
    // Mount-only by design: re-renders must not replay the assembly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animatedProps = useAnimatedProps(() => ({
    opacity: progress.get(),
    scale: 0.2 + 0.8 * progress.get()
  }));
  return (
    <AnimatedG testID="shard-assembling" origin={`${CRYSTAL_BASE.x}, ${CRYSTAL_BASE.y}`} animatedProps={animatedProps}>
      <Polygon points={toPoints(shard)} fill={fill} stroke={stroke} strokeWidth={1} />
    </AnimatedG>
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
// render many times on one screen. During assembly it flares once, then settles — the
// shimmer that seals the mastery moment.
function Glint({ shard, flareDelayMs }: Readonly<{ shard: CrystalShard; flareDelayMs: number | null }>) {
  const [tipX, tipY] = shard.points[2];
  const points = shard.points
    .map((point) => `${point[0] + (tipX - point[0]) * 0.55},${point[1] + (tipY - point[1]) * 0.55}`)
    .join(" ");
  if (flareDelayMs === null) return <Polygon testID="glint-static" points={points} fill="white" opacity={0.35} />;
  return <FlaringGlint points={points} delayMs={flareDelayMs} />;
}

function FlaringGlint({ points, delayMs }: Readonly<{ points: string; delayMs: number }>) {
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.set(
      withDelay(
        delayMs,
        withSequence(withTiming(0.8, { duration: 280 }), withTiming(0.35, { duration: 420 }))
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animatedProps = useAnimatedProps(() => ({ opacity: glow.get() }));
  return <AnimatedPolygon testID="glint-flare" points={points} fill="white" animatedProps={animatedProps} />;
}

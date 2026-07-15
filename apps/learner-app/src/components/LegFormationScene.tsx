import { useEffect, useMemo, useRef, useState } from "react";
import Svg, { G, Polygon, Polyline } from "react-native-svg";
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { MineralFacetsGroup } from "./CrystalSpecimen";
import { SLOT_SIZE, type LegFormationModel, type MineralSlot } from "@/learn/crystalFormationLayout";
import { formationProgressLine } from "@/learn/mineralSpecimen";
import { legStateCopy, learnerTerm } from "@/learn/vocabulary";
import { MOTION, colors, useReducedMotion } from "@/ui";

const AnimatedG = Animated.createAnimatedComponent(G);

export type LegSceneMode = "overview" | "collection" | "binding";

// The single visual boundary for a Leg's geode (plan 2026-07-15-002 U3, R2/R4): layered
// matrix bands, cavity seam, embedded spine branch, optional exact prerequisite veins,
// and one mineral slot per concept. Capstone collection, Guardian reward (U5), and
// Crystal Vista (U4) compose THIS scene in explicit modes — presentation inputs are
// explicit event identities, never inferred from render changes, so rerenders and
// reopened surfaces can never replay a reward.
//
// - `overview` frames the whole Leg.
// - `collection` crops around `focusNodeId`; ONLY the slot named by `enteringNodeId`
//   rises/grows into place — every other specimen stays still (R16).
// - `binding` frames the whole Leg for the Guardian reward stage (event motion in U5).
export function LegFormationScene({
  leg,
  mode,
  focusNodeId = null,
  enteringNodeId = null,
  width,
  bindingEventId = null
}: Readonly<{
  leg: LegFormationModel;
  mode: LegSceneMode;
  focusNodeId?: string | null;
  enteringNodeId?: string | null;
  width: number;
  bindingEventId?: string | null;
}>) {
  const viewBox = useMemo(() => cropFor(leg, mode, focusNodeId), [leg, mode, focusNodeId]);
  const height = (width * viewBox.height) / viewBox.width;
  const stateLine = legStateCopy(leg.structuralState, leg.guardianSubstate);
  const label = `${learnerTerm("section")} ${leg.sectionIndex + 1}: ${leg.milestoneLabel} — ${stateLine}. ${formationProgressLine(leg.progress)}.`;
  const future = leg.structuralState === "future";
  const bound = leg.structuralState === "bound";

  return (
    <Svg
      accessibilityRole="image"
      accessibilityLabel={label}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      width={width}
      height={height}
    >
      {/* Layered geode matrix: outer band, inner band, cavity floor — one irregular
          contour language, never an ellipse or socket (KTD9). A future Leg keeps a
          dashed shell; a bound Leg closes solid. */}
      <Polygon
        testID={`leg-matrix-${leg.structuralState}`}
        points={toPoints(leg.matrix)}
        fill={future ? colors.fog : colors["muted-panel"]}
        stroke={bound ? colors["line-strong"] : colors.line}
        strokeWidth={2}
        strokeDasharray={future ? "6 5" : undefined}
        opacity={future ? 0.6 : 1}
      />
      <Polygon
        points={toPoints(shrinkToward(leg.matrix, 0.09))}
        fill="none"
        stroke={colors.line}
        strokeWidth={1}
        opacity={future ? 0.35 : 0.6}
      />
      <Polygon points={toPoints(shrinkToward(leg.matrix, 0.2))} fill={future ? "transparent" : colors.card} opacity={0.5} />

      {/* The embedded spine branch: the nonsemantic winding route entering at the
          junction and forking toward the cavity floor — visually distinct (wider, warm,
          rounded) from the thin exact veins so it never reads as a prerequisite. */}
      <Polyline
        testID="leg-branch"
        points={branchPoints(leg)}
        fill="none"
        stroke={bound ? colors.gold : colors.trail}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={future ? 0.3 : bound ? 0.9 : 0.45}
      />

      {mode === "binding" && bindingEventId !== null ? (
        <BindingEvent key={bindingEventId} leg={leg} />
      ) : null}

      {/* Exact intra-Leg prerequisite veins (R9/R10): thin, cool hairlines inside the
          matrix. Omitted entirely for a flagged Leg. */}
      {leg.veins.map((vein) => (
        <Polyline
          key={`${vein.source}->${vein.target}`}
          testID="leg-vein"
          points={vein.points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke={colors["line-strong"]}
          strokeWidth={1.5}
          strokeDasharray="1.5 3"
          opacity={0.8}
        />
      ))}

      {/* The cavity seam along the top opening: open while collecting, bright and
          fractured when the Guardian is ready, sealed shut once bound (R7). */}
      <Polyline
        testID={`leg-seam-${bound ? "sealed" : "open"}`}
        points={leg.seam.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke={bound ? colors.gold : leg.structuralState === "guardian_ready" ? colors.frontier : colors.line}
        strokeWidth={bound ? 3.5 : leg.structuralState === "guardian_ready" ? 3 : 2}
        strokeDasharray={bound ? undefined : "7 4"}
        strokeLinecap="round"
      />

      {leg.slots.map((slot) => (
        <SlotSpecimen
          key={slot.derivedNodeId}
          slot={slot}
          future={future}
          entering={mode === "collection" && enteringNodeId !== null && slot.derivedNodeId === enteringNodeId}
        />
      ))}
    </Svg>
  );
}

// First victory traces the already-earned structure only: minerals never regrow. The
// bright seam then branch overlay settles onto the same bound geometry used by Vista.
function BindingEvent({ leg }: Readonly<{ leg: LegFormationModel }>) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withTiming(1, { duration: MOTION.emphasis }));
  }, [progress]);
  const animatedProps = useAnimatedProps(() => ({ opacity: 0.95 - progress.get() * 0.45 }));
  return (
    <AnimatedG testID="leg-binding-event" animatedProps={animatedProps}>
      <Polyline
        points={leg.seam.map((point) => `${point.x},${point.y}`).join(" ")}
        fill="none"
        stroke={colors.gold}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <Polyline
        points={branchPoints(leg)}
        fill="none"
        stroke={colors.gold}
        strokeWidth={6}
        strokeLinecap="round"
      />
    </AnimatedG>
  );
}

// One slot's specimen at its lattice position. `entering` plays the one-shot rise/grow
// at the mastery reveal; the played event identity is remembered so an unchanged
// rerender stays still, and reduced motion renders the settled slot immediately (R20).
function SlotSpecimen({ slot, future, entering }: Readonly<{ slot: MineralSlot; future: boolean; entering: boolean }>) {
  const reduceMotion = useReducedMotion();
  const animate = entering && !reduceMotion && slot.state === "collected";
  const playedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!animate || playedRef.current) return;
    playedRef.current = true;
    setPlaying(true);
  }, [animate]);

  const transform = `translate(${slot.x - SLOT_SIZE / 2}, ${slot.y - SLOT_SIZE / 2}) scale(${SLOT_SIZE / 100})`;
  // A future Leg shows unnamed ghost slots regardless of per-concept state (R7); known
  // ground stays a distinct labeled ghost in every mode (R8).
  const specimenState = future || slot.state === "known" ? "ghost" : slot.state === "collected" ? "collected" : "growing";
  const body = (
    <MineralFacetsGroup
      habit={slot.habit}
      derivedNodeId={slot.derivedNodeId}
      growthFraction={slot.state === "collected" ? 1 : slot.growthFraction}
      state={specimenState}
    />
  );

  if (playing) {
    return (
      <G testID={`leg-slot-${slot.state}`} transform={transform} opacity={slot.state === "known" ? 0.75 : 1}>
        <EnteringGroup>{body}</EnteringGroup>
      </G>
    );
  }
  return (
    <G testID={`leg-slot-${slot.state}`} transform={transform} opacity={slot.state === "known" ? 0.75 : 1}>
      {body}
    </G>
  );
}

// The one-shot entrance: the new specimen rises from the cavity floor and grows to full
// size about its bedrock anchor. Mount-only by design — the played flag upstream owns
// the event identity, so re-renders never replay it.
function EnteringGroup({ children }: Readonly<{ children: React.ReactNode }>) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withDelay(80, withTiming(1, { duration: MOTION.celebration * 2, easing: Easing.out(Easing.back(1.4)) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Pivot decomposition about the specimen bedrock (50, 95): react-native-svg's `origin`
  // helper leaks a raw transform-origin attribute on web.
  const animatedProps = useAnimatedProps(() => {
    const p = progress.get();
    const s = 0.3 + 0.7 * p;
    return {
      opacity: p,
      transform: `translate(0, ${(1 - p) * 14}) translate(50, 95) scale(${s}) translate(-50, -95)`
    };
  });
  return (
    <AnimatedG testID="leg-slot-entering" animatedProps={animatedProps}>
      {children}
    </AnimatedG>
  );
}

type Crop = { x: number; y: number; width: number; height: number };

// Collection crops around the focused slot so the full new specimen AND its local
// cavity stay in frame (R16); every other mode frames the whole Leg.
function cropFor(leg: LegFormationModel, mode: LegSceneMode, focusNodeId: string | null): Crop {
  if (mode !== "collection" || focusNodeId === null) return { x: 0, y: 0, width: leg.width, height: leg.height };
  const slot = leg.slots.find((candidate) => candidate.derivedNodeId === focusNodeId);
  if (!slot) return { x: 0, y: 0, width: leg.width, height: leg.height };
  const radius = SLOT_SIZE * 2.2;
  const x = clamp(slot.x - radius, 0, Math.max(0, leg.width - radius * 2));
  const y = clamp(slot.y - radius, 0, Math.max(0, leg.height - radius * 2));
  return { x, y, width: Math.min(radius * 2, leg.width), height: Math.min(radius * 2, leg.height) };
}

// The branch route: a short embedded fork from the junction into the upper cavity —
// it must stay a quiet entry mark, never a line striking through the specimens.
function branchPoints(leg: LegFormationModel): string {
  const centerX = leg.width / 2;
  return [
    `${leg.junction.x},${leg.junction.y}`,
    `${centerX - leg.width * 0.08},${leg.height * 0.14}`,
    `${centerX + leg.width * 0.05},${leg.height * 0.26}`,
    `${centerX},${leg.height * 0.38}`
  ].join(" ");
}

function shrinkToward(points: { x: number; y: number }[], fraction: number): { x: number; y: number }[] {
  const cx = points.reduce((sum, point) => sum + point.x, 0) / Math.max(1, points.length);
  const cy = points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length);
  return points.map((point) => ({ x: point.x + (cx - point.x) * fraction, y: point.y + (cy - point.y) * fraction }));
}

function toPoints(points: { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

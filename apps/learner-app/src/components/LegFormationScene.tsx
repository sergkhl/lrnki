import { useEffect, useRef, useState } from "react";
import Svg, { Circle, G, Polygon } from "react-native-svg";
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { MineralSpecimenGroup } from "./CrystalSpecimen";
import type { LegFormationModel, MineralSlot } from "@/learn/crystalFormationLayout";
import { MINERAL_GROUND_Y, formationProgressLine, mineralSpeciesFor } from "@/learn/mineralSpecimen";
import { legStateCopy, learnerTerm } from "@/learn/vocabulary";
import { MOTION, colors, useReducedMotion } from "@/ui";

const AnimatedG = Animated.createAnimatedComponent(G);

export type LegSceneMode = "overview" | "collection" | "binding";

// The single visual boundary for a Leg's geode island (plan 2026-07-16-002 U3, D2/D4/D8):
// ONE smooth outline, at most one junction badge, and the compact specimen mound — no
// seam, veins, branch, or nested bands. Capstone collection, Guardian reward, and
// Crystal Vista compose THIS scene in explicit modes — presentation inputs are explicit
// event identities, never inferred from render changes, so rerenders and reopened
// surfaces can never replay a reward.
//
// - `overview` frames the island at rest.
// - `collection` frames the WHOLE island (D8); ONLY the slot named by `enteringNodeId`
//   plays its fill-rise + gloss pop — every other specimen stays still.
// - `binding` frames the whole island; the keyed one-shot seal scale-in + gold rim
//   sweep plays exactly once per `bindingEventId`.
export function LegFormationScene({
  leg,
  mode,
  enteringNodeId = null,
  bindingEventId = null
}: Readonly<{
  leg: LegFormationModel;
  mode: LegSceneMode;
  enteringNodeId?: string | null;
  bindingEventId?: string | null;
}>) {
  const reduceMotion = useReducedMotion();
  const stateLine = legStateCopy(leg.structuralState, leg.guardianSubstate);
  const label = `${learnerTerm("section")} ${leg.sectionIndex + 1}: ${leg.milestoneLabel} — ${stateLine}. ${formationProgressLine(leg.progress)}.`;
  const future = leg.structuralState === "future";
  const bound = leg.structuralState === "bound";

  return (
    <Svg
      accessibilityRole="image"
      accessibilityLabel={label}
      viewBox={`0 0 ${leg.width} ${leg.height}`}
      width={leg.width}
      height={leg.height}
    >
      {/* D4: the state lives on the rim — dashed muted (future), solid neutral
          (collecting), solid accent (guardian_ready), solid gold (bound). */}
      <Polygon
        testID={`island-rim-${leg.structuralState}`}
        points={toPoints(leg.outline)}
        fill={future ? colors.fog : colors["muted-panel"]}
        stroke={rimStroke(leg.structuralState)}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeDasharray={future ? "6 5" : undefined}
        opacity={future ? 0.55 : 1}
      />

      {leg.slots.map((slot) => (
        <SlotSpecimen
          key={slot.derivedNodeId}
          slot={slot}
          future={future}
          entering={mode === "collection" && enteringNodeId !== null && slot.derivedNodeId === enteringNodeId}
        />
      ))}

      {/* The single junction badge (D4): a shape distinction, never color alone —
          guardian glyph when the Guardian is ready, gold seal once bound. */}
      {leg.structuralState === "guardian_ready" ? <JunctionBadge leg={leg} kind="guardian" /> : null}
      {bound ? <JunctionBadge leg={leg} kind="seal" /> : null}

      {/* Reduced motion renders the sealed bound state directly: the binding overlay is
          pure event emphasis, so it is skipped rather than frozen mid-fade. */}
      {mode === "binding" && bindingEventId !== null && !reduceMotion ? (
        <BindingEvent key={bindingEventId} leg={leg} />
      ) : null}
    </Svg>
  );
}

function rimStroke(state: LegFormationModel["structuralState"]): string {
  if (state === "bound") return colors.gold;
  if (state === "guardian_ready") return colors.frontier;
  if (state === "future") return colors["trail-muted"];
  return colors["line-strong"];
}

// The junction badge at the island apex. The seal is a gold roundel with a four-point
// star; the guardian badge is a neutral roundel holding the ward diamond.
function JunctionBadge({ leg, kind }: Readonly<{ leg: LegFormationModel; kind: "guardian" | "seal" }>) {
  const { x, y } = leg.badge;
  const r = 13;
  return (
    <G testID={`island-badge-${kind}`}>
      <Circle
        cx={x}
        cy={y}
        r={r}
        fill={kind === "seal" ? colors.gold : colors.card}
        stroke={kind === "seal" ? colors["line-strong"] : colors.frontier}
        strokeWidth={1.5}
      />
      {kind === "seal" ? (
        <Polygon
          points={`${x},${y - 7} ${x + 2.4},${y - 2.4} ${x + 7},${y} ${x + 2.4},${y + 2.4} ${x},${y + 7} ${x - 2.4},${y + 2.4} ${x - 7},${y} ${x - 2.4},${y - 2.4}`}
          fill={colors["on-accent"]}
          stroke={colors["line-strong"]}
          strokeWidth={0.8}
        />
      ) : (
        <Polygon
          points={`${x},${y - 6} ${x + 5},${y} ${x},${y + 6} ${x - 5},${y}`}
          fill={colors.gem}
          stroke={colors["line-strong"]}
          strokeWidth={0.8}
        />
      )}
    </G>
  );
}

// First victory traces the already-earned structure only: minerals never regrow. One
// gold rim sweep fades onto the same bound geometry Vista shows, while the seal badge
// scales in about the junction (D8).
function BindingEvent({ leg }: Readonly<{ leg: LegFormationModel }>) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withTiming(1, { duration: MOTION.emphasis }));
  }, [progress]);
  const rimProps = useAnimatedProps(() => ({ opacity: 0.95 - progress.get() * 0.55 }));
  const badgeProps = useAnimatedProps(() => {
    const scale = 0.4 + 0.6 * progress.get();
    return {
      opacity: progress.get(),
      transform: `translate(${leg.badge.x}, ${leg.badge.y}) scale(${scale}) translate(${-leg.badge.x}, ${-leg.badge.y})`
    };
  });
  return (
    <G testID="leg-binding-event">
      <AnimatedG animatedProps={rimProps}>
        <Polygon
          points={toPoints(leg.outline)}
          fill="none"
          stroke={colors.gold}
          strokeWidth={5}
          strokeLinejoin="round"
        />
      </AnimatedG>
      <AnimatedG animatedProps={badgeProps}>
        <JunctionBadge leg={leg} kind="seal" />
      </AnimatedG>
    </G>
  );
}

// One slot's specimen at its mound position. `entering` plays the one-shot fill-rise +
// gloss pop at the mastery reveal; the played event identity is remembered so an
// unchanged rerender stays still, and reduced motion renders the settled slot
// immediately.
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

  const transform = `translate(${slot.x - slot.size / 2}, ${slot.y - slot.size / 2}) scale(${slot.size / 100})`;
  // A future Leg shows unnamed ghost slots regardless of per-concept state; known
  // ground stays a distinct labeled ghost in every mode (honest counts).
  const specimenState = future || slot.state === "known" ? "ghost" : slot.state === "collected" ? "collected" : "growing";
  const body = (
    <MineralSpecimenGroup
      species={mineralSpeciesFor(slot.difficulty)}
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

// The one-shot entrance (D8): the finished specimen's color rises from its bedrock —
// opacity and a small grounded rise/settle, never a re-growth of other slots.
// Mount-only by design — the played flag upstream owns the event identity, so
// re-renders never replay it.
function EnteringGroup({ children }: Readonly<{ children: React.ReactNode }>) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withDelay(80, withTiming(1, { duration: MOTION.celebration * 2, easing: Easing.out(Easing.back(1.4)) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Pivot decomposition about the specimen bedrock (50, MINERAL_GROUND_Y):
  // react-native-svg's `origin` helper leaks a raw transform-origin attribute on web.
  const animatedProps = useAnimatedProps(() => {
    const p = progress.get();
    const s = 0.55 + 0.45 * p;
    return {
      opacity: p,
      transform: `translate(0, ${(1 - p) * 10}) translate(50, ${MINERAL_GROUND_Y}) scale(${s}) translate(-50, -${MINERAL_GROUND_Y})`
    };
  });
  return (
    <AnimatedG testID="leg-slot-entering" animatedProps={animatedProps}>
      {children}
    </AnimatedG>
  );
}

function toPoints(points: readonly { x: number; y: number }[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

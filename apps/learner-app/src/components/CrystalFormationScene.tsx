import { useEffect } from "react";
import { View } from "react-native";
import Svg, { Polygon, Polyline } from "react-native-svg";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import {
  isNameableMineral,
  type CrystalFormationLayout,
  type FormationTerminus,
  type PlacedLeg,
  type VistaFocus,
  type VistaRewardKey
} from "@/learn/crystalFormationLayout";
import { AnimatedView, MOTION, PressableSurface, Text, colors, useReducedMotion } from "@/ui";
import { formationProgressLine } from "@/learn/mineralSpecimen";
import { legStateCopy, learnerTerm } from "@/learn/vocabulary";
import { LegFormationScene } from "./LegFormationScene";

// The quiet geode ascent (plan 2026-07-16-002 U3, D5/D6): ONE smooth spine curve drawn
// behind the islands, header bands exactly where the layout allocated them (they can
// never overlap artwork), and the summit peak with its keystone slot. The layout packs
// to the real available width, so everything renders at scale 1 — no fitting, no
// horizontal overflow.
export function CrystalFormationScene({
  layout,
  focus,
  contextualizingRewardKey,
  cropToFocus = false,
  selectedNodeId,
  onSelectNode
}: Readonly<{
  layout: CrystalFormationLayout;
  focus: VistaFocus | null;
  contextualizingRewardKey: VistaRewardKey | null;
  cropToFocus?: boolean;
  selectedNodeId: string | null;
  onSelectNode: (derivedNodeId: string) => void;
}>) {
  const summitNeighbor = layout.legs.at(-1) ?? null;
  const croppedHeight = cropToFocus && focus?.kind === "summit" && summitNeighbor
    ? Math.min(layout.height, summitNeighbor.frame.y + summitNeighbor.height)
    : layout.height;

  const scene = (
    <View style={{ width: layout.width, height: layout.height }}>
      {/* The one nonsemantic spine, behind every island (D5): thin, muted, gold only on
          a bound Leg's own segment. */}
      <Svg
        pointerEvents="none"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={{ position: "absolute", left: 0, top: 0 }}
      >
        {layout.spine.map((segment) => (
          <Polyline
            key={`${segment.fromSectionIndex}:${segment.toSectionIndex ?? "summit"}`}
            testID="formation-spine-segment"
            points={points(segment.points)}
            fill="none"
            stroke={segment.lit ? colors.gold : colors["trail-muted"]}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={segment.lit ? 0.95 : 0.6}
          />
        ))}
      </Svg>

      {layout.legs.map((leg) => {
        const rewardKey = `leg:${leg.sectionIndex}` as const;
        const focused = focus?.kind === "leg" && focus.sectionIndex === leg.sectionIndex;
        return (
          <FormationPiece
            key={rewardKey}
            focused={focused}
            testID={focused ? `formation-focus-leg-${leg.sectionIndex}` : undefined}
            contextualizing={contextualizingRewardKey === rewardKey}
            style={{ left: leg.frame.x, top: leg.frame.y, width: leg.width, height: leg.height }}
          >
            <LegFormationScene leg={leg} mode="overview" />
            <MineralTargets leg={leg} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />
          </FormationPiece>
        );
      })}

      {/* Header bands come straight from the layout (D-headers): by construction they
          are disjoint from every island frame and from one another. */}
      {layout.legs.map((leg) => (
        <View
          key={`header:${leg.sectionIndex}`}
          pointerEvents="none"
          className="absolute justify-end"
          style={{ left: leg.header.x, top: leg.header.y, width: leg.header.width, height: leg.header.height }}
        >
          <Text variant="caption" className="text-center font-semibold" numberOfLines={1}>
            {learnerTerm("section")} {leg.sectionIndex + 1} · {legStateCopy(leg.structuralState, leg.guardianSubstate)}
          </Text>
          <Text variant="caption" color="muted" className="text-center" numberOfLines={1}>
            {formationProgressLine(leg.progress)}
          </Text>
        </View>
      ))}

      {layout.terminus ? (
        <FormationPiece
          focused={focus?.kind === "summit"}
          testID={focus?.kind === "summit" ? "formation-focus-summit" : undefined}
          contextualizing={contextualizingRewardKey === "summit"}
          style={{
            left: layout.terminus.frame.x,
            top: layout.terminus.frame.y,
            width: layout.terminus.width,
            height: layout.terminus.height
          }}
        >
          <TerminusScene terminus={layout.terminus} />
        </FormationPiece>
      ) : null}
    </View>
  );

  return croppedHeight < layout.height ? (
    <View
      testID="formation-focused-viewport"
      className="overflow-hidden"
      style={{ width: layout.width, height: croppedHeight }}
    >
      {scene}
    </View>
  ) : scene;
}

function FormationPiece({
  children,
  contextualizing,
  focused,
  testID,
  style
}: Readonly<{
  children: React.ReactNode;
  contextualizing: boolean;
  focused: boolean;
  testID?: string;
  style: { left: number; top: number; width: number; height: number };
}>) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(contextualizing && !reduceMotion ? 0 : 1);
  useEffect(() => {
    if (contextualizing && !reduceMotion) progress.set(withTiming(1, { duration: MOTION.emphasis }));
  }, [contextualizing, progress, reduceMotion]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.72 + progress.get() * 0.28,
    transform: [{ translateY: (1 - progress.get()) * 18 }]
  }));
  return (
    <AnimatedView
      testID={testID}
      className={focused ? "absolute rounded-card border-2 border-frontier" : "absolute rounded-card"}
      style={style}
      animatedStyle={animatedStyle}
    >
      {children}
    </AnimatedView>
  );
}

function MineralTargets({
  leg,
  selectedNodeId,
  onSelectNode
}: Readonly<{
  leg: PlacedLeg;
  selectedNodeId: string | null;
  onSelectNode: (derivedNodeId: string) => void;
}>) {
  return leg.slots.filter(isNameableMineral).map((slot) => {
    const size = Math.max(44, slot.size);
    return (
      <PressableSurface
        key={`target-${slot.derivedNodeId}`}
        accessibilityLabel={slot.label}
        selected={selectedNodeId === slot.derivedNodeId}
        onPress={() => onSelectNode(slot.derivedNodeId)}
        className="absolute items-center justify-center rounded-control"
        style={{ left: slot.x - size / 2, top: slot.y - size / 2, width: size, height: size }}
      >
        <View />
      </PressableSurface>
    );
  });
}

// The summit peak (D6): a small distinct mountain silhouette whose apex holds the
// keystone slot — a dashed empty diamond until the Expedition Guardian falls, a gold
// faceted keystone after. Gold appears only on the earned reward.
function TerminusScene({ terminus }: Readonly<{ terminus: FormationTerminus }>) {
  const label = terminus.keystoneSeated ? "Summit peak — Keystone seated." : "Summit peak — Keystone awaits.";
  const { x, y } = terminus.keystone;
  return (
    <Svg
      accessibilityRole="image"
      accessibilityLabel={label}
      width={terminus.width}
      height={terminus.height}
      viewBox={`0 0 ${terminus.width} ${terminus.height}`}
    >
      <Polygon
        points={points(terminus.peak)}
        fill={colors["muted-panel"]}
        stroke={colors["line-strong"]}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {terminus.keystoneSeated ? (
        <>
          <Polygon
            testID="formation-summit-keystone"
            points={`${x},${y - 14} ${x + 11},${y} ${x},${y + 14} ${x - 11},${y}`}
            fill={colors.gold}
            stroke={colors["line-strong"]}
            strokeWidth={1.5}
          />
          {/* Two facet strokes keep the keystone faceted, not a flat diamond. */}
          <Polyline points={`${x - 11},${y} ${x},${y - 4} ${x + 11},${y}`} fill="none" stroke={colors["on-accent"]} strokeWidth={1.2} opacity={0.8} />
          <Polyline points={`${x},${y - 4} ${x},${y + 14}`} fill="none" stroke={colors["on-accent"]} strokeWidth={1.2} opacity={0.6} />
        </>
      ) : (
        <Polygon
          testID="formation-summit-keystone-empty"
          points={`${x},${y - 14} ${x + 11},${y} ${x},${y + 14} ${x - 11},${y}`}
          fill="none"
          stroke={colors.trail}
          strokeWidth={2}
          strokeDasharray="4 4"
        />
      )}
    </Svg>
  );
}

function points(value: readonly { x: number; y: number }[]): string {
  return value.map((point) => `${point.x},${point.y}`).join(" ");
}

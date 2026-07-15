import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import Svg, { Polygon, Polyline } from "react-native-svg";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import {
  SLOT_SIZE,
  fitLegWidth,
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

export function CrystalFormationScene({
  layout,
  width,
  focus,
  contextualizingRewardKey,
  selectedNodeId,
  onSelectNode
}: Readonly<{
  layout: CrystalFormationLayout;
  width: number;
  focus: VistaFocus | null;
  contextualizingRewardKey: VistaRewardKey | null;
  selectedNodeId: string | null;
  onSelectNode: (derivedNodeId: string) => void;
}>) {
  const fit = fitLegWidth(layout.width, width);
  const scale = fit.scale;
  const sceneWidth = layout.width * scale;
  const sceneHeight = layout.height * scale;

  const scene = (
    <View style={{ width: sceneWidth, height: sceneHeight }}>
      <Svg
        pointerEvents="none"
        width={sceneWidth}
        height={sceneHeight}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={{ position: "absolute", left: 0, top: 0 }}
      >
        {layout.spine.map((segment) => (
          <Polyline
            key={`${segment.fromSectionIndex}:${segment.toSectionIndex ?? "summit"}`}
            testID="formation-spine-segment"
            points={points(segment.points)}
            fill="none"
            stroke={segment.lit ? colors.gold : colors.trail}
            strokeWidth={segment.lit ? 5 : 4}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={segment.lit ? 0.95 : 0.48}
          />
        ))}
      </Svg>

      {layout.legs.map((leg) => {
        const rewardKey = `leg:${leg.sectionIndex}` as const;
        return (
          <FormationPiece
            key={rewardKey}
            focused={focus?.kind === "leg" && focus.sectionIndex === leg.sectionIndex}
            testID={focus?.kind === "leg" && focus.sectionIndex === leg.sectionIndex ? `formation-focus-leg-${leg.sectionIndex}` : undefined}
            contextualizing={contextualizingRewardKey === rewardKey}
            style={{ left: leg.frame.x * scale, top: leg.frame.y * scale, width: leg.width * scale, height: leg.height * scale }}
          >
            <LegFormationScene leg={leg} mode="overview" width={leg.width * scale} />
            <MineralTargets
              leg={leg}
              scale={scale}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          </FormationPiece>
        );
      })}

      {layout.legs.map((leg) => {
        const labelWidth = Math.min(sceneWidth, Math.max(leg.width * scale, 260));
        const centeredLeft = (leg.frame.x + leg.width / 2) * scale - labelWidth / 2;
        return (
          <View
            key={`label:${leg.sectionIndex}`}
            pointerEvents="none"
            className="absolute rounded-control border border-line bg-card px-2 py-1"
            style={{
              left: clamp(centeredLeft, 0, sceneWidth - labelWidth),
              top: Math.max(0, (leg.frame.y - 50) * scale),
              width: labelWidth
            }}
          >
            <Text variant="caption" className="font-semibold" numberOfLines={1}>
              {learnerTerm("section")} {leg.sectionIndex + 1} · {legStateCopy(leg.structuralState, leg.guardianSubstate)}
            </Text>
            <Text variant="caption" color="muted" numberOfLines={2}>
              {formationProgressLine(leg.progress)}
            </Text>
          </View>
        );
      })}

      {layout.terminus ? (
        <FormationPiece
          focused={focus?.kind === "summit"}
          testID={focus?.kind === "summit" ? "formation-focus-summit" : undefined}
          contextualizing={contextualizingRewardKey === "summit"}
          style={{
            left: layout.terminus.frame.x * scale,
            top: layout.terminus.frame.y * scale,
            width: layout.terminus.width * scale,
            height: layout.terminus.height * scale
          }}
        >
          <TerminusScene terminus={layout.terminus} scale={scale} />
        </FormationPiece>
      ) : null}
    </View>
  );

  return fit.horizontalOverflow ? (
    <ScrollView horizontal contentContainerStyle={{ width: sceneWidth }} showsHorizontalScrollIndicator>
      {scene}
    </ScrollView>
  ) : (
    <View style={{ width: sceneWidth, height: sceneHeight }}>{scene}</View>
  );
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
  scale,
  selectedNodeId,
  onSelectNode
}: Readonly<{
  leg: PlacedLeg;
  scale: number;
  selectedNodeId: string | null;
  onSelectNode: (derivedNodeId: string) => void;
}>) {
  return leg.slots.filter(isNameableMineral).map((slot) => {
    const size = Math.max(44, SLOT_SIZE * scale);
    return (
      <PressableSurface
        key={`target-${slot.derivedNodeId}`}
        accessibilityLabel={slot.label}
        selected={selectedNodeId === slot.derivedNodeId}
        onPress={() => onSelectNode(slot.derivedNodeId)}
        className="absolute items-center justify-center rounded-control"
        style={{ left: slot.x * scale - size / 2, top: slot.y * scale - size / 2, width: size, height: size }}
      >
        <View />
      </PressableSurface>
    );
  });
}

function TerminusScene({ terminus, scale }: Readonly<{ terminus: FormationTerminus; scale: number }>) {
  const label = terminus.crowned ? "Summit terminus — Crown seated." : "Summit terminus — Crown awaits.";
  const cx = terminus.width / 2;
  const crownBase = terminus.height * 0.66;
  return (
    <Svg
      accessibilityRole="image"
      accessibilityLabel={label}
      width={terminus.width * scale}
      height={terminus.height * scale}
      viewBox={`0 0 ${terminus.width} ${terminus.height}`}
    >
      <Polygon points={points(terminus.matrix)} fill={colors["muted-panel"]} stroke={colors.line} strokeWidth={2} />
      <Polygon points={points(inset(terminus.matrix, 0.16))} fill={colors.card} stroke={colors["line-strong"]} strokeWidth={1} opacity={0.72} />
      {terminus.crowned ? (
        <>
          <Polygon
            testID="formation-summit-crown"
            points={`${cx - 34},${crownBase} ${cx - 26},${crownBase - 34} ${cx - 8},${crownBase - 16} ${cx},${crownBase - 42} ${cx + 10},${crownBase - 16} ${cx + 28},${crownBase - 34} ${cx + 34},${crownBase} `}
            fill={colors.gold}
            stroke={colors.frontier}
            strokeWidth={2}
          />
          <Polyline points={`${cx - 34},${crownBase} ${cx + 34},${crownBase}`} stroke={colors["line-strong"]} strokeWidth={4} />
        </>
      ) : (
        <Polyline points={`${cx - 28},${crownBase} ${cx},${crownBase - 18} ${cx + 28},${crownBase}`} fill="none" stroke={colors.trail} strokeWidth={3} strokeDasharray="6 5" />
      )}
    </Svg>
  );
}

function points(value: readonly { x: number; y: number }[]): string {
  return value.map((point) => `${point.x},${point.y}`).join(" ");
}

function inset(value: readonly { x: number; y: number }[], fraction: number): { x: number; y: number }[] {
  const cx = value.reduce((sum, point) => sum + point.x, 0) / Math.max(1, value.length);
  const cy = value.reduce((sum, point) => sum + point.y, 0) / Math.max(1, value.length);
  return value.map((point) => ({ x: point.x + (cx - point.x) * fraction, y: point.y + (cy - point.y) * fraction }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

import { useEffect } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { RecallScopeStatus } from "@lrnki/application/projection";
import {
  GROUND_PAD,
  PIECE_BORDER,
  type CrystalFormationLayout,
  type LegPanelModel,
  type SummitStrip,
  type VistaFocus,
  type VistaRewardKey
} from "@/learn/crystalFormationLayout";
import { AnimatedView, MOTION, Text, colors, radius, useReducedMotion } from "@/ui";
import { formationProgressLine } from "@/learn/mineralSpecimen";
import { legStateCopy, learnerTerm } from "@/learn/vocabulary";
import { CrystalSpecimen } from "./CrystalSpecimen";
import { LegFormationScene } from "./LegFormationScene";

// The formation (plan 2026-07-30-001 U4, KTD6): a warm parchment ground behind Leg panels in
// canonical order, each under its own caption row, closed by the summit strip. The layout packs
// every panel to the real available width, so everything renders at scale 1 — no spine, no
// islands, no peak, no fitting, no crop, and no horizontal overflow.
//
// The vertical stack is flex flow, not layout-allocated geometry: caption and Guardian bands are
// text-sized and must follow the reader's font scale. Panel scroll offsets come from each
// wrapper's own `onLayout`, which is why the deleted header-mask hack has no successor.
export function CrystalFormationScene({
  layout,
  focus,
  contextualizingRewardKey,
  selectedNodeId,
  onSelectNode,
  onEnterGuardian,
  onPanelOffset
}: Readonly<{
  layout: CrystalFormationLayout;
  focus: VistaFocus | null;
  contextualizingRewardKey: VistaRewardKey | null;
  selectedNodeId: string | null;
  onSelectNode: (derivedNodeId: string) => void;
  onEnterGuardian?: (scope: RecallScopeStatus) => Promise<void>;
  // Reported once per panel layout pass so the host can scroll to a focused Leg without the
  // layout inventing a text-sized band it cannot measure.
  onPanelOffset?: (key: VistaRewardKey, y: number) => void;
}>) {
  return (
    <View
      testID="cavern-ground"
      style={{
        width: layout.width,
        gap: 14,
        padding: GROUND_PAD,
        borderRadius: radius.overlay,
        backgroundColor: colors.cavern
      }}
    >
      {layout.panels.map((panel) => {
        const rewardKey: VistaRewardKey = `leg:${panel.sectionIndex}`;
        return (
          <FormationPiece
            key={rewardKey}
            focused={focus?.kind === "leg" && focus.sectionIndex === panel.sectionIndex}
            testID={focus?.kind === "leg" && focus.sectionIndex === panel.sectionIndex ? `formation-focus-leg-${panel.sectionIndex}` : undefined}
            contextualizing={contextualizingRewardKey === rewardKey}
            onLayout={onPanelOffset ? (event: LayoutChangeEvent) => onPanelOffset(rewardKey, event.nativeEvent.layout.y) : undefined}
          >
            <PanelCaption panel={panel} />
            <LegFormationScene
              panel={panel}
              mode="overview"
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              onEnterGuardian={onEnterGuardian}
            />
          </FormationPiece>
        );
      })}

      {layout.summit ? (
        <FormationPiece
          focused={focus?.kind === "summit"}
          testID={focus?.kind === "summit" ? "formation-focus-summit" : undefined}
          contextualizing={contextualizingRewardKey === "summit"}
          onLayout={onPanelOffset ? (event: LayoutChangeEvent) => onPanelOffset("summit", event.nativeEvent.layout.y) : undefined}
        >
          <FormationSummitStrip summit={layout.summit} width={layout.panelWidth} />
        </FormationPiece>
      ) : null}
    </View>
  );
}

// The caption row (KTD6): Leg number + honest state on the left, exact progress on the right.
// Progress is never a bare colour — the numbers are the signal.
function PanelCaption({ panel }: Readonly<{ panel: LegPanelModel }>) {
  const bound = panel.structuralState === "bound";
  return (
    <View
      className={
        panel.captionStacked
          ? "gap-0.5 px-1 pb-1"
          : "flex-row items-end justify-between gap-2 px-1 pb-1"
      }
    >
      <Text variant="caption" color="cavern-ink" numberOfLines={1} className="shrink font-semibold">
        {learnerTerm("section")} {panel.sectionIndex + 1} · {legStateCopy(panel.structuralState, panel.guardianSubstate)}
      </Text>
      {/* A bound Leg's counts use earned gold ink; every other Leg stays formation ink. */}
      <Text
        variant="caption"
        color="cavern-ink"
        numberOfLines={1}
        className={bound ? "text-[10px] font-medium" : "text-[10px] font-medium opacity-70"}
        style={bound ? { color: colors["gold-ink"] } : undefined}
      >
        {formationProgressLine(panel.progress)}
      </Text>
    </View>
  );
}

// The summit strip: the keystone crystal plus its honest state line. Fogged stone until the
// Expedition Guardian falls — the keystone is earned, never previewed as gold. Exported because
// the Guardian reward shows this exact strip when the summit is what was won.
export function FormationSummitStrip({ summit, width }: Readonly<{ summit: SummitStrip; width: number }>) {
  const state = summit.keystoneSeated ? learnerTerm("keystoneSeated") : learnerTerm("keystoneAwaits");
  const body = summit.keystoneSeated ? learnerTerm("vistaKeystoneJoined") : learnerTerm("guardianSummitLocked");
  const sealed = learnerTerm("keystoneLegsSealedTemplate")
    .replace("{sealed}", String(summit.sealedLegCount))
    .replace("{total}", String(summit.legCount));
  return (
    <View
      testID={`cavern-summit-${summit.keystoneSeated ? "seated" : "awaiting"}`}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${learnerTerm("summitPrefix")} — ${state}. ${body} ${sealed}.`}
      style={{
        width,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 10,
        borderRadius: 18,
        borderWidth: 1.5,
        borderStyle: summit.keystoneSeated ? "solid" : "dashed",
        borderColor: summit.keystoneSeated ? colors["gold-ink"] : colors["cavern-edge"],
        backgroundColor: colors["cavern-panel"]
      }}
    >
      <CrystalSpecimen
        species="keystone"
        derivedNodeId="summit-keystone"
        material={summit.keystoneSeated ? "collected" : "fogged"}
        growthFraction={summit.keystoneSeated ? 1 : 0}
        size={summit.crystalSize}
        ariaLabel={null}
      />
      <View className="min-w-0 shrink">
        <Text variant="caption" color="cavern-ink" numberOfLines={1} className="font-semibold">
          {learnerTerm("summitPrefix")} · {state}
        </Text>
        <Text variant="caption" color="cavern-ink" numberOfLines={2} className="text-[10px] opacity-70">
          {body} {sealed}.
        </Text>
      </View>
    </View>
  );
}

// One stack member. The one-time contextualization is a keyed fade-and-rise onto the settled
// scene; reduced motion renders it settled immediately.
function FormationPiece({
  children,
  contextualizing,
  focused,
  testID,
  onLayout
}: Readonly<{
  children: React.ReactNode;
  contextualizing: boolean;
  focused: boolean;
  testID?: string;
  onLayout?: (event: LayoutChangeEvent) => void;
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
      onLayout={onLayout}
      animatedStyle={animatedStyle}
      // The focus ring is always present and only changes colour, so focusing a Leg can never
      // reflow the stack (and the layout's panel width stays exact).
      style={{
        borderRadius: radius.overlay,
        borderWidth: PIECE_BORDER,
        borderColor: focused ? colors.frontier : "transparent"
      }}
    >
      {children}
    </AnimatedView>
  );
}

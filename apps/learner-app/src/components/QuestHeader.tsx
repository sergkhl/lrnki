import { useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { Gem } from "lucide-react-native";
import type { StudySession } from "@lrnki/application/projection";
import { SectionOverview } from "./SectionOverview";
import { isSummitPush, summitLine } from "@/learn/goalCopy";
import type { TrailView } from "@lrnki/application/projection";
import { learnerTerm } from "@/learn/vocabulary";
import { MOTION, PressableSurface, Text, colors, useReducedMotion } from "@/ui";

export function QuestHeader({
  session,
  trail,
  expeditionTitle,
  onJumpToSection,
  onOpenVista
}: Readonly<{ session: StudySession; trail: TrailView; expeditionTitle: string | null; onJumpToSection: (sectionIndex: number) => void; onOpenVista: () => void }>) {
  // The learner's topic titles the expedition; the summit line below merges the derived
  // summit label with the layer purpose (plan 2026-07-10-001 U2) — the advance-visible
  // mid-horizon goal, template fallback when no purpose row exists.
  const title = expeditionTitle ?? session.target.label;
  const collectedCrystals = trail.concepts.filter((concept) => concept.state === "mastered" && !concept.isKnownSkipped).length;
  // Vista-trigger emphasis (U5, R15): when a section completes WHILE the trail is open,
  // pulse the tally door once instead of auto-opening the Vista. Visual only — the
  // fusion haptic fires when the learner actually sees the new fusion inside the Vista.
  const reduceMotion = useReducedMotion();
  const completeSections = trail.sections.filter((section) => section.state === "complete").length;
  const previousCompleteRef = useRef(completeSections);
  const pulse = useSharedValue(0);
  useEffect(() => {
    const previous = previousCompleteRef.current;
    previousCompleteRef.current = completeSections;
    if (reduceMotion || completeSections <= previous) return;
    pulse.set(
      withSequence(
        withTiming(1, { duration: MOTION.emphasis / 2 }),
        withTiming(0, { duration: MOTION.emphasis / 2 })
      )
    );
  }, [completeSections, reduceMotion, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.12 * pulse.get() }] }));
  return (
    <View className="border-b border-line bg-card px-4 py-3">
      <View className="mx-auto w-full max-w-3xl flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text variant="caption" color="muted">{isSummitPush(trail) ? learnerTerm("summitPushEyebrow") : "Expedition"}</Text>
          <Text variant="title" numberOfLines={1}>{title}</Text>
          {session.target.label ? (
            <Text variant="caption" color="muted" numberOfLines={2}>
              {summitLine({
                summitLabel: session.target.label,
                layerPurpose: session.layerPurpose,
                legCount: trail.sections.length,
                crystalCount: trail.totalClusters
              })}
            </Text>
          ) : null}
        </View>
        <View className="shrink-0 flex-row items-center gap-2">
          {/* Non-blocking overview trigger (R5): opens the section map on demand; the guided
              continue flow never needs it. */}
          <SectionOverview
            sections={trail.sections}
            concepts={trail.concepts}
            currentSectionIndex={trail.currentSectionIndex}
            onJump={onJumpToSection}
          />
          {/* The crystal tally IS the vista door (plan 2026-07-10-001 U3): the most
              recently collected crystal plus the running count opens the formation. */}
          <Animated.View style={pulseStyle}>
          <PressableSurface
            accessibilityLabel={learnerTerm("vistaOpen")}
            onPress={onOpenVista}
            className="h-target flex-row items-center gap-1.5 rounded-control border border-line-strong bg-card px-2.5"
            pressedClassName="bg-muted-panel"
          >
            {/* Compact honesty (U1, R14): the door names the exact crystal count with a
                universal gem icon — no specimen is legible at this size. */}
            <Gem size={16} color={collectedCrystals > 0 ? colors.gem : colors.muted} />
            <Text variant="caption" className="font-medium tabular-nums">
              {collectedCrystals}/{trail.concepts.length}
            </Text>
          </PressableSurface>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { CheckCircle2, Compass, Route, TriangleAlert } from "lucide-react-native";
import type { ScaffoldDetourView } from "@lrnki/application/projection";
import { MOTION, PressableSurface, Text, colors, useReducedMotion } from "@/ui";
import { learnerTerm, scaffoldPhaseCopy, supportStepsDoneCopy } from "@/learn/vocabulary";

// One compact, always-visible visual Support Path node per active Scaffold Detour (plan
// 2026-07-13-002 U4, R12, KTD6/KTD7). It branches off the parent Concept Marker's trail with a
// small connector, titles itself with the TERM, and communicates state through icon shape plus
// text — never color alone (AE9-adjacent, WCAG F73). It has no chevron, expansion state, or
// per-step rows; tapping delegates to the root, which opens the progress/recovery dialog for a
// non-ready detour and the full-screen Support Path flow for a ready one (R13).
export function SupportPathNode({
  detour,
  onPress
}: Readonly<{ detour: ScaffoldDetourView; onPress: (detour: ScaffoldDetourView) => void }>) {
  const state = nodeState(detour);
  return (
    <ReadyReveal status={detour.status} announcement={`${learnerTerm("supportReadyTitle")}. ${detour.term}`}>
      <View className="ml-8 flex-row items-center">
        {/* The side-branch connector: a short elbow off the center trail line, drawn in
            faded map ink (plan 2026-07-18-001 U3). */}
        <View className="h-6 w-4 rounded-bl-lg border-b-2 border-l-2 border-map-ink-soft opacity-70" />
        <PressableSurface
          accessibilityLabel={`${learnerTerm("supportPathNode")}: “${detour.term}”. ${state.a11y}`}
          onPress={() => onPress(detour)}
          className={`min-h-target max-w-[240px] flex-row items-center gap-2 rounded-card border ${state.border} bg-card px-3 py-2`}
          pressedClassName="bg-muted-panel"
          testID={`support-path-node-${detour.detourId}`}
        >
          {state.icon}
          <View className="min-w-0 shrink">
            {/* One documented node rule for long terms: wrap up to two lines, then truncate. */}
            <Text variant="label" numberOfLines={2}>{detour.term}</Text>
            <Text variant="caption" color="muted" numberOfLines={1}>{state.subline}</Text>
          </View>
          {detour.status === "ready" ? <StepDots detour={detour} /> : null}
        </PressableSurface>
      </View>
    </ReadyReveal>
  );
}

// State is presented as icon SHAPE + text; the caption carries the human words and the
// accessible name repeats them, so no state depends on color or motion (plan U4 scenarios).
function nodeState(detour: ScaffoldDetourView): { icon: React.ReactNode; border: string; subline: string; a11y: string } {
  if (detour.status === "generating") {
    const phase = scaffoldPhaseCopy(detour.phase);
    return { icon: <Compass size={16} color={colors.ink} />, border: "border-map-ink-soft", subline: phase, a11y: phase };
  }
  if (detour.status === "failed") {
    return {
      icon: <TriangleAlert size={16} color={colors.frontier} />,
      border: "border-frontier",
      subline: learnerTerm("supportFailedTitle"),
      a11y: learnerTerm("supportFailedTitle")
    };
  }
  if (detour.complete) {
    return {
      icon: <CheckCircle2 size={16} color={colors.gem} />,
      border: "border-gem",
      subline: learnerTerm("supportPathComplete"),
      a11y: learnerTerm("supportPathComplete")
    };
  }
  const progress = supportStepsDoneCopy(detour.completedStepCount, detour.totalStepCount);
  return { icon: <Route size={16} color={colors.ink} />, border: "border-map-ink-soft", subline: progress, a11y: progress };
}

// The visible `n/m` progress: one dot per Support Step (filled = done) plus the compact
// fraction, redundant with the caption's spelled-out copy for accessibility.
function StepDots({ detour }: Readonly<{ detour: ScaffoldDetourView }>) {
  return (
    <View className="ml-1 shrink-0 items-center gap-1">
      <View className="flex-row gap-1">
        {detour.steps.map((step, index) => (
          <View
            key={step.scaffoldStepId}
            className={`h-1.5 w-1.5 rounded-full ${index < detour.completedStepCount ? "bg-gem" : "border border-line-strong bg-transparent"}`}
          />
        ))}
      </View>
      <Text variant="caption" color="muted">{`${detour.completedStepCount}/${detour.totalStepCount}`}</Text>
    </View>
  );
}

// The one-shot generating→ready unfold carried over from the retired disclosure row: it plays
// ONCE when this node was observed generating in the previous render, with a polite live
// announcement standing in for the motion. Reload and reduced motion render the settled node.
function ReadyReveal({
  status,
  announcement,
  children
}: Readonly<{ status: ScaffoldDetourView["status"]; announcement: string; children: React.ReactNode }>) {
  const reduceMotion = useReducedMotion();
  const prevStatus = useRef<ScaffoldDetourView["status"] | null>(null);
  const [justRevealed, setJustRevealed] = useState(false);
  const progress = useSharedValue(1);

  useEffect(() => {
    const wasGenerating = prevStatus.current === "generating";
    prevStatus.current = status;
    if (wasGenerating && status === "ready") {
      setJustRevealed(true);
      if (!reduceMotion) {
        progress.set(0);
        progress.set(withTiming(1, { duration: MOTION.standard }));
      }
    }
  }, [status, reduceMotion, progress]);

  const style = useAnimatedStyle(() => ({ opacity: progress.get(), transform: [{ translateY: (1 - progress.get()) * 8 }] }));

  return (
    <Animated.View style={style} accessibilityLiveRegion={justRevealed ? "polite" : "none"} accessibilityLabel={justRevealed ? announcement : undefined}>
      {children}
    </Animated.View>
  );
}

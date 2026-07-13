import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Compass, EyeOff, RefreshCw, TriangleAlert, X } from "lucide-react-native";
import type { ScaffoldDetourView, ScaffoldStepView } from "@lrnki/application/projection";
import { Button, IconButton, PressableSurface, Text, colors } from "@/ui";
import { MOTION, useReducedMotion } from "@/ui";
import { learnerTerm, scaffoldPhaseCopy } from "@/learn/vocabulary";

type GeneratedStep = Extract<ScaffoldStepView, { kind: "generated" }>;

// The indented Scaffold Detour row (plan 2026-07-12-002 U6, R14-R20, KTD8). Rendered UNDER its
// parent Concept Marker (after the ordinary stops, before the capstone) from the finished Study
// Session projection. It renders one of the projection's five presentation groups; the trail never
// reconstructs detour policy. Generating shows a broad phase + progress reopen; failed shows Retry
// + Dismiss; ready groups (active / support_available / support_explored) expand to one-to-three
// tappable Support Steps with a Hide overflow (R18). One detour expands at a time — the parent owns
// that (`expanded`/`onToggleExpand`). The generating→ready transition unfolds once (R17); reload or
// reduced motion renders the final state statically.
export function ScaffoldDetour({
  detour,
  expanded,
  onToggleExpand,
  onOpenGeneratedStep,
  onOpenReferenceStep,
  onRetry,
  onHide,
  onOpenProgress,
  referenceLabelFor
}: Readonly<{
  detour: ScaffoldDetourView;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenGeneratedStep: (step: GeneratedStep) => void;
  onOpenReferenceStep: (referencedDerivedNodeId: string) => void;
  onRetry: (detourId: string) => void;
  onHide: (detourId: string) => void;
  onOpenProgress: (detourId: string) => void;
  referenceLabelFor: (derivedNodeId: string) => string;
}>) {
  if (detour.status === "generating") {
    return (
      <DetourFrame>
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="label" numberOfLines={1}>{`${learnerTerm("exploreTermAction")} “${detour.term}”`}</Text>
          <Text variant="caption" color="muted" numberOfLines={1}>{scaffoldPhaseCopy(detour.phase)}</Text>
        </View>
        <Button variant="outline" size="compact" onPress={() => onOpenProgress(detour.detourId)} label={learnerTerm("supportViewProgress")} />
      </DetourFrame>
    );
  }

  if (detour.status === "failed") {
    return (
      <DetourFrame tone="warning">
        <TriangleAlert size={16} color={colors.frontier} />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="label" numberOfLines={1}>{learnerTerm("supportFailedTitle")}</Text>
          <Text variant="caption" color="muted" numberOfLines={1}>{`“${detour.term}”`}</Text>
        </View>
        <View className="flex-row gap-2">
          <Button variant="outline" size="compact" onPress={() => onRetry(detour.detourId)} icon={<RefreshCw size={14} color={colors.ink} />} label={learnerTerm("supportRetry")} />
          <IconButton variant="bare" icon={<X size={18} color={colors.ink} />} accessibilityLabel={learnerTerm("supportDismiss")} onPress={() => onHide(detour.detourId)} />
        </View>
      </DetourFrame>
    );
  }

  // Ready groups (active / support_available / support_explored): an expandable disclosure.
  const groupLabel =
    detour.group === "support_explored" ? learnerTerm("supportExploredGroup") :
    detour.group === "support_available" ? learnerTerm("supportAvailableGroup") :
    `${learnerTerm("exploreTermAction")} “${detour.term}”`;
  const doneCount = detour.steps.filter((step) => step.complete).length;

  return (
    <ReadyReveal status={detour.status} group={detour.group}>
      <View className="ml-6 rounded-card border border-line bg-card">
        <PressableSurface
          accessibilityLabel={groupLabel}
          accessibilityHint={learnerTerm("supportSectionLabel")}
          expanded={expanded}
          onPress={onToggleExpand}
          className="flex-row items-center gap-2 px-3 py-2.5"
          pressedClassName="bg-muted-panel"
        >
          {expanded ? <ChevronDown size={16} color={colors.ink} /> : <ChevronRight size={16} color={colors.ink} />}
          <Compass size={16} color={colors.ink} />
          <View className="min-w-0 flex-1">
            <Text variant="label" numberOfLines={1}>{groupLabel}</Text>
            {detour.group !== "active" ? <Text variant="caption" color="muted" numberOfLines={1}>{`“${detour.term}”`}</Text> : null}
          </View>
          <Text variant="caption" color="muted">{`${doneCount}/${detour.steps.length}`}</Text>
        </PressableSurface>
        {expanded ? (
          <View className="gap-2 border-t border-line px-3 py-2">
            {detour.steps.map((step) => (
              <StepRow
                key={step.scaffoldStepId}
                step={step}
                label={step.kind === "reference" ? referenceLabelFor(step.referencedDerivedNodeId) : step.label}
                onOpen={() => (step.kind === "reference" ? onOpenReferenceStep(step.referencedDerivedNodeId) : onOpenGeneratedStep(step))}
              />
            ))}
            <View className="flex-row justify-end pt-1">
              <Button variant="outline" size="compact" onPress={() => onHide(detour.detourId)} icon={<EyeOff size={14} color={colors.ink} />} label={learnerTerm("supportHide")} />
            </View>
          </View>
        ) : null}
      </View>
    </ReadyReveal>
  );
}

function StepRow({ step, label, onOpen }: Readonly<{ step: ScaffoldStepView; label: string; onOpen: () => void }>) {
  return (
    <PressableSurface
      accessibilityLabel={label}
      accessibilityHint={step.complete ? learnerTerm("supportStepDone") : undefined}
      onPress={onOpen}
      className="min-h-target flex-row items-center gap-2 rounded-control border border-line px-3 py-2"
      pressedClassName="bg-muted-panel"
      testID={`scaffold-step-${step.scaffoldStepId}`}
    >
      {step.complete ? <CheckCircle2 size={16} color={colors.gem} /> : <Circle size={16} color={colors.line} />}
      <Text variant="label" className="min-w-0 flex-1 font-normal" numberOfLines={2}>{label}</Text>
      <ChevronRight size={16} color={colors.ink} />
    </PressableSurface>
  );
}

function DetourFrame({ children, tone = "default" }: Readonly<{ children: React.ReactNode; tone?: "default" | "warning" }>) {
  const border = tone === "warning" ? "border-frontier" : "border-line";
  return (
    <View className={`ml-6 flex-row items-center gap-2 rounded-card border ${border} bg-card px-3 py-2.5`}>
      {children}
    </View>
  );
}

// The one-shot generating→ready unfold (R17, AE7). It fades/slides the ready steps in ONCE, only
// when this detour was observed generating in the previous render. Reload (first render already
// ready) and reduced motion render the final state immediately, with a polite live announcement
// standing in for the motion.
function ReadyReveal({ status, group, children }: Readonly<{ status: ScaffoldDetourView["status"]; group: ScaffoldDetourView["group"]; children: React.ReactNode }>) {
  const reduceMotion = useReducedMotion();
  const prevStatus = useRef<ScaffoldDetourView["status"] | null>(null);
  const [justRevealed, setJustRevealed] = useState(false);
  const progress = useSharedValue(1);

  useEffect(() => {
    const wasGenerating = prevStatus.current === "generating";
    prevStatus.current = status;
    if (wasGenerating && status === "ready" && !reduceMotion) {
      setJustRevealed(true);
      progress.set(0);
      progress.set(withTiming(1, { duration: MOTION.standard }));
    }
  }, [status, reduceMotion, progress]);

  const style = useAnimatedStyle(() => ({ opacity: progress.get(), transform: [{ translateY: (1 - progress.get()) * 8 }] }));

  return (
    <Animated.View style={style} accessibilityLiveRegion={justRevealed ? "polite" : "none"} accessibilityLabel={justRevealed ? `${learnerTerm("supportReadyTitle")}. ${group}` : undefined}>
      {children}
    </Animated.View>
  );
}

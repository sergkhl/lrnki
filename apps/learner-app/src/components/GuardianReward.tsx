import { useEffect, useRef } from "react";
import { ScrollView, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { RecallChallengeView, RecallScopeStatus, StudySession } from "@lrnki/application/projection";
import { buildTrailView } from "@lrnki/application/projection";
import {
  buildCrystalFormationLayout,
  MIN_ISLAND_WIDTH,
  type CrystalFormationLayout,
  type VistaFocus
} from "@/learn/crystalFormationLayout";
import { learnerTerm } from "@/learn/vocabulary";
import {
  AnimatedView,
  Button,
  Card,
  MOTION,
  Screen,
  Text,
  colors,
  triggerHaptic,
  useReducedMotion
} from "@/ui";
import { CrystalFormationScene } from "./CrystalFormationScene";
import { LegFormationScene } from "./LegFormationScene";

export type WonGuardianView = Extract<RecallChallengeView, { state: "won" }>;

export type GuardianRewardPreview =
  | { status: "loading" }
  | { status: "error" }
  | { status: "inconsistent" }
  | {
      status: "ready";
      rewardKind: "first" | "rematch";
      focus: VistaFocus;
      layout: CrystalFormationLayout;
    };

// The one reward-scene width policy: the card crops nothing, so the preview layout is
// built at exactly the width the scene will render.
export function guardianRewardSceneWidth(windowWidth: number): number {
  return Math.max(MIN_ISLAND_WIDTH, Math.min(420, windowWidth - 56));
}

// Reward classification is a projection read, never local award state. A mismatched
// challenge is a rematch only after a matching scope exposes a durable first-win id.
export function guardianRewardPreview(
  challenge: WonGuardianView,
  session: StudySession,
  availableWidth: number
): GuardianRewardPreview {
  const trail = buildTrailView(session);
  let focus: VistaFocus | null = null;
  let scope: RecallScopeStatus | null = null;
  if (challenge.scopeKind === "enrichment") {
    if (trail.enrichmentScope?.anchorDerivedNodeId === challenge.anchorDerivedNodeId) {
      focus = { kind: "summit" };
      scope = trail.enrichmentScope;
    }
  } else {
    const section = trail.sections.find(
      (candidate) => candidate.recallScope?.anchorDerivedNodeId === challenge.anchorDerivedNodeId
    );
    if (section) {
      focus = { kind: "leg", sectionIndex: section.sectionIndex };
      scope = section.recallScope;
    }
  }
  if (!focus || !scope?.wonChallengeId) return { status: "inconsistent" };
  const layout = buildCrystalFormationLayout(session, trail, availableWidth);
  if (focus.kind === "leg" && !layout.legs.some((leg) => leg.sectionIndex === focus.sectionIndex)) {
    return { status: "inconsistent" };
  }
  return {
    status: "ready",
    rewardKind: scope.wonChallengeId === challenge.challengeId ? "first" : "rematch",
    focus,
    layout
  };
}

export function GuardianReward({
  challenge,
  preview,
  transitionToken,
  onRetry,
  onContinue,
  onExplore
}: Readonly<{
  challenge: WonGuardianView;
  preview: GuardianRewardPreview;
  // Present only for the win edge observed by the mounted fight. Direct won loads pass null.
  transitionToken: string | null;
  onRetry: () => void;
  onContinue: () => void;
  onExplore: (focus: VistaFocus) => void;
}>) {
  const reduceMotion = useReducedMotion();
  const eventKey = preview.status === "ready" && transitionToken
    ? `${transitionToken}:${preview.rewardKind}:${preview.focus.kind}`
    : null;
  const rewardHaptic = preview.status === "ready" && preview.rewardKind === "first"
    ? (preview.focus.kind === "summit" ? "unlock" as const : "fusion" as const)
    : null;
  // The one-shot guard exists only for the first-win haptic; reward actions are never
  // gated on choreography (the sweep and binding stay purely decorative).
  const playedEventRef = useRef<string | null>(null);

  useEffect(() => {
    if (eventKey === null || reduceMotion || rewardHaptic === null) return;
    if (playedEventRef.current === eventKey) return;
    playedEventRef.current = eventKey;
    const hapticTimer = setTimeout(() => triggerHaptic(rewardHaptic), 560);
    return () => clearTimeout(hapticTimer);
  }, [eventKey, reduceMotion, rewardHaptic]);

  const ready = preview.status === "ready" ? preview : null;
  const rewardLegSectionIndex = ready?.focus.kind === "leg" ? ready.focus.sectionIndex : null;
  const rewardLeg = rewardLegSectionIndex === null
    ? null
    : ready?.layout.legs.find((leg) => leg.sectionIndex === rewardLegSectionIndex) ?? null;
  const first = ready?.rewardKind === "first";
  const title = first
    ? challenge.scopeKind === "enrichment"
      ? learnerTerm("guardianRewardFirstSummitTitle")
      : learnerTerm("guardianRewardFirstLegTitle")
    : ready
      ? learnerTerm("guardianRewardRematchTitle")
      : learnerTerm("guardianVictoryCommitted");
  const body = first
    ? challenge.scopeKind === "enrichment"
      ? learnerTerm("guardianRewardFirstSummitBody")
      : learnerTerm("guardianRewardFirstLegBody")
    : ready
      ? learnerTerm("guardianRewardRematchBody")
      : preview.status === "loading"
        ? learnerTerm("guardianRewardLoading")
        : preview.status === "error"
          ? learnerTerm("guardianRewardError")
          : learnerTerm("guardianRewardInconsistent");

  return (
    <Screen>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-lg gap-4 p-4 pb-8">
        <View className="items-center gap-2">
          <View className="flex-row items-center gap-2">
            <Sparkles size={20} color={colors.gold} />
            <Text variant="title">{title}</Text>
          </View>
          <Text variant="label" color="muted" className="text-center font-normal">{body}</Text>
        </View>

        {ready ? (
          <View testID={`guardian-reward-${ready.rewardKind}`}>
            <Card className="relative items-center overflow-hidden p-3">
              {ready.focus.kind === "leg" && rewardLeg ? (
                <LegFormationScene
                  leg={rewardLeg}
                  mode="binding"
                  bindingEventId={first ? eventKey : null}
                />
              ) : (
                <CrystalFormationScene
                  layout={ready.layout}
                  focus={ready.focus}
                  contextualizingRewardKey={first && eventKey ? "summit" : null}
                  cropToFocus
                  selectedNodeId={null}
                  onSelectNode={() => {}}
                />
              )}
              {/* The light sweep is a translation transform — reduced motion drops it and
                  shows the settled scene immediately (R20/AE9). */}
              {eventKey && !reduceMotion ? <RewardSweep eventKey={eventKey} /> : null}
            </Card>
          </View>
        ) : null}

        <View className="gap-2">
          {(preview.status === "error" || preview.status === "inconsistent") ? (
            <Button variant="outline" onPress={onRetry} label={learnerTerm("guardianRewardRetry")} />
          ) : null}
          {ready ? (
            <Button
              variant="secondary"
              onPress={() => onExplore(ready.focus)}
              label={learnerTerm("guardianRewardExplore")}
            />
          ) : null}
          <Button
            variant="primary"
            onPress={onContinue}
            label={learnerTerm("guardianRewardContinue")}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function RewardSweep({ eventKey }: Readonly<{ eventKey: string }>) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withTiming(1, { duration: MOTION.celebration }));
  }, [eventKey, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.32 * (1 - progress.get()),
    transform: [{ translateX: -220 + progress.get() * 520 }, { rotate: "18deg" }]
  }));
  return (
    <AnimatedView
      testID="guardian-reward-sweep"
      pointerEvents="none"
      className="absolute bottom-0 top-0 w-16 bg-gold"
      animatedStyle={style}
    />
  );
}

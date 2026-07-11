import { useState } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { ChevronDown } from "lucide-react-native";
import type { StudySession } from "@lrnki/application/projection";
import { clearLearnerVerdict, refreshLearnerExpedition, setLearnerVerdict } from "@/lib/actions";
import { CrystalGlyph } from "./CrystalGlyph";
import type { TrailCluster } from "@/learn/trailView";
import { learnerTerm } from "@/learn/vocabulary";
import { Button, MOTION, PressableSurface, Text, colors, useReducedMotion } from "@/ui";

// The concept row above its stops, an explicit disclosure (R6/AE2): rotating chevron,
// pressed treatment, announced expanded state, and the existing skip-known / unmark
// verdict actions inside the panel. Mutations are unchanged.
export function ConceptMarker({ concept, session }: Readonly<{ concept: TrailCluster; session: StudySession }>) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const reduceMotion = useReducedMotion();
  const rotation = useSharedValue(0);
  const isMastered = concept.state === "mastered";
  const isKnownVerdict = session.verdictByNode[concept.derivedNodeId] === "known";

  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    rotation.value = reduceMotion ? (next ? 180 : 0) : withTiming(next ? 180 : 0, { duration: MOTION.standard });
  };

  const runVerdict = (action: () => Promise<void>) => {
    if (pending) return;
    setPending(true);
    void (async () => {
      try {
        await action();
        await refreshLearnerExpedition({ enrichmentId: session.enrichmentId });
        setOpen(false);
        rotation.value = 0;
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <View className="rounded-card border border-line bg-card shadow-sm">
      <PressableSurface
        accessibilityLabel={concept.label}
        expanded={open}
        onPress={toggle}
        className="min-h-target w-full flex-row items-center justify-between gap-3 px-3 py-2"
        pressedClassName="bg-muted-panel"
      >
        <Text variant="label" className="min-w-0 flex-1 font-semibold" numberOfLines={1}>{concept.label}</Text>
        <CrystalGlyph
          derivedNodeId={concept.derivedNodeId}
          difficulty={concept.difficulty}
          growthFraction={concept.growthFraction}
          state={concept.state}
          ghost={concept.isKnownSkipped}
          size={26}
          ariaLabel={concept.isKnownSkipped ? learnerTerm("known") : isMastered ? "Collected" : "Not collected"}
        />
        <Animated.View style={chevronStyle}>
          <ChevronDown size={18} color={colors.muted} />
        </Animated.View>
      </PressableSurface>
      {open ? (
        <View className="gap-3 border-t border-line px-3 py-3">
          <Text variant="label" color="muted" className="font-normal">
            {concept.isKnownSkipped ? learnerTerm("known") : stateLabel(concept.state)} · {concept.stops.length} stops · {difficultyDiamonds(concept.difficulty)}
          </Text>
          {isKnownVerdict ? (
            <Button
              variant="outline"
              busy={pending}
              label={learnerTerm("unskipKnown")}
              onPress={() => runVerdict(() => clearLearnerVerdict({ enrichmentId: session.enrichmentId, derivedNodeId: concept.derivedNodeId }))}
            />
          ) : !isMastered ? (
            <Button
              variant="outline"
              busy={pending}
              label={learnerTerm("skipKnown")}
              onPress={() => runVerdict(() => setLearnerVerdict({ enrichmentId: session.enrichmentId, derivedNodeId: concept.derivedNodeId, verdict: "known" }))}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function difficultyDiamonds(difficulty: number): string {
  const rating = Math.min(5, Math.max(1, Math.round(difficulty * 4) + 1));
  return "◆".repeat(rating) + "◇".repeat(5 - rating);
}

function stateLabel(state: TrailCluster["state"]): string {
  if (state === "mastered") return learnerTerm("mastered");
  if (state === "frontier") return learnerTerm("frontier");
  return learnerTerm("locked");
}

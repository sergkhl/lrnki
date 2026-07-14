import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { Check } from "lucide-react-native";
import type { MatchingAttemptTrace, StudyMatchingView } from "@lrnki/application/projection";
import type { LearnerMatchingResult } from "@/lib/api";
import { GroundedBadge } from "./GroundedBadge";
import { canTryMatchingPair, matchingProgress } from "@/learn/matchingProgress";
import { useShuffledLookup } from "@/learn/useShuffledLookup";
import { Card, MOTION, PressableSurface, Text, colors, triggerHaptic, useReducedMotion } from "@/ui";

type SelectedTile = { column: "prompt" | "match"; id: string } | null;

export function MatchingBoard({
  item,
  result,
  disabled,
  supportSlot,
  onAttempt,
  onComplete
}: Readonly<{
  item: StudyMatchingView;
  result: LearnerMatchingResult | null;
  disabled: boolean;
  // The Support Paths panel rendered between the question stem and the answer controls
  // (plan 2026-07-13-002 U3, R7): support is reachable before the learner commits.
  supportSlot?: ReactNode;
  onAttempt: (promptId: string, matchId: string) => Promise<boolean>;
  onComplete: (trace: MatchingAttemptTrace) => Promise<void>;
}>) {
  const { orderedIds: promptIds, byId: promptById } = useShuffledLookup(item.prompts, (prompt) => prompt.promptId);
  const { orderedIds: matchIds, byId: matchById } = useShuffledLookup(item.matches, (match) => match.matchId);
  const [selected, setSelected] = useState<SelectedTile>(null);
  const [matchedPairs, setMatchedPairs] = useState<{ promptId: string; matchId: string }[]>([]);
  const progress = useMemo(() => matchingProgress(matchedPairs, item.prompts.length), [matchedPairs, item.prompts.length]);
  const [wrong, setWrong] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const traceRef = useRef<MatchingAttemptTrace>([]);
  const submittedRef = useRef(false);
  const wrongTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const complete = result?.graded === true || submitted || progress.complete;
  const tryPair = (promptId: string, matchId: string) => {
    if (!canTryMatchingPair({
      disabled,
      pending,
      complete,
      lockedPromptIds: progress.lockedPromptIds,
      lockedMatchIds: progress.lockedMatchIds,
      promptId,
      matchId
    })) return;
    traceRef.current = [...traceRef.current, { promptId, chosenMatchId: matchId }];
    setPending(true);
    void (async () => {
      try {
        const correct = await onAttempt(promptId, matchId);
        if (correct) {
          const nextMatchedPairs = [...matchedPairs, { promptId, matchId }];
          setMatchedPairs(nextMatchedPairs);
          setSelected(null);
          if (matchingProgress(nextMatchedPairs, item.prompts.length).complete && !submittedRef.current) {
            submittedRef.current = true;
            setSubmitted(true);
            // The board completing is the graded success transition — one haptic here,
            // never per locked pair (R7).
            triggerHaptic("success");
            await onComplete(traceRef.current);
          }
          return;
        }
        triggerHaptic("warning");
        setWrong(new Set([promptId, matchId]));
        setSelected(null);
        if (wrongTimeoutRef.current !== null) clearTimeout(wrongTimeoutRef.current);
        wrongTimeoutRef.current = setTimeout(() => setWrong(new Set()), 420);
      } finally {
        setPending(false);
      }
    })();
  };

  const choose = (column: "prompt" | "match", id: string) => {
    if (selected && selected.column !== column) {
      const promptId = column === "prompt" ? id : selected.id;
      const matchId = column === "match" ? id : selected.id;
      tryPair(promptId, matchId);
      return;
    }
    setSelected({ column, id });
  };

  return (
    <Card className="gap-4">
      <View className="flex-row items-start gap-2">
        <Text variant="heading" className="flex-1 leading-7">{item.question}</Text>
        <GroundedBadge provenance={item.groundingProvenance} />
      </View>
      {supportSlot}
      <Text variant="label" color="muted" className="font-normal">
        {matchedPairs.length} of {item.prompts.length} matched. Tap a clue on the left, then its match on the right.
      </Text>
      {/* Two-column tap-pairs (R10): clues left, matches right, each independently shuffled.
          Tapping a tile in either column selects it; tapping one in the other column pairs them. */}
      <View className="flex-row gap-3">
        <View className="flex-1 gap-2">
          <Text variant="caption" color="muted" className="font-semibold uppercase tracking-wide">Clues</Text>
          {promptIds.map((id) => {
            const prompt = promptById.get(id);
            if (!prompt) return null;
            return (
              <TileButton
                key={id}
                text={prompt.text}
                selected={selected?.column === "prompt" && selected.id === id}
                locked={progress.lockedPromptIds.has(id)}
                wrong={wrong.has(id)}
                disabled={disabled || pending || complete}
                onPress={() => choose("prompt", id)}
              />
            );
          })}
        </View>
        <View className="flex-1 gap-2">
          <Text variant="caption" color="muted" className="font-semibold uppercase tracking-wide">Matches</Text>
          {matchIds.map((id) => {
            const match = matchById.get(id);
            if (!match) return null;
            return (
              <TileButton
                key={id}
                text={match.text}
                selected={selected?.column === "match" && selected.id === id}
                locked={progress.lockedMatchIds.has(id)}
                wrong={wrong.has(id)}
                disabled={disabled || pending || complete}
                onPress={() => choose("match", id)}
              />
            );
          })}
        </View>
      </View>
      {result?.graded ? (
        <View className="rounded-card border border-line bg-card p-3">
          <Text variant="label">{result.correct ? "Clean sweep." : "Partly matched."}</Text>
          <Text variant="label" color="muted" className="mt-1 font-normal">
            {result.correctFirstTry} of {result.pairCount} matched on the first try.
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

// A matching tile: selection state is announced, a locked (matched) pair keeps its
// check icon, and a wrong pair shows a destructive boundary — never color alone.
// Exported for the Guardian fight's server-driven matching board (plan 2026-07-13-003 U5),
// so both boards share one tile presentation.
export function TileButton({
  text,
  selected,
  locked,
  wrong,
  disabled,
  onPress
}: Readonly<{ text: string; selected: boolean; locked: boolean; wrong: boolean; disabled: boolean; onPress: () => void }>) {
  const reduceMotion = useReducedMotion();
  const shake = useSharedValue(0);
  // The wrong-pair nudge (U5, R14): one brief horizontal shake when this tile enters the
  // wrong flash, resetting to rest. Reduced motion keeps the destructive boundary only.
  useEffect(() => {
    if (!wrong || reduceMotion) return;
    shake.set(
      withSequence(
        withTiming(-4, { duration: MOTION.nudge }),
        withTiming(4, { duration: MOTION.nudge }),
        withTiming(-2, { duration: MOTION.nudge }),
        withTiming(0, { duration: MOTION.nudge })
      )
    );
  }, [wrong, reduceMotion, shake]);
  const nudgeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));
  const box = locked
    ? "border-gem bg-gem-soft"
    : wrong
      ? "border-destructive bg-card"
      : selected
        ? // Tint, not a frontier box — selection stays announced via accessibilityState.
          "border-line-strong bg-gem-soft"
        : "border-line-strong bg-card";
  return (
    <Animated.View style={nudgeStyle}>
      <PressableSurface
        accessibilityLabel={text}
        disabled={disabled || locked}
        selected={selected}
        haptic="selection"
        onPress={onPress}
        className={`min-h-target flex-row items-start gap-2 rounded-control border px-3 py-2.5 ${box}`}
        pressedClassName="bg-muted-panel"
      >
        {locked ? <Check size={16} color={colors.ink} style={{ marginTop: 2 }} /> : null}
        <Text variant="label" className="flex-1">{text}</Text>
      </PressableSurface>
    </Animated.View>
  );
}

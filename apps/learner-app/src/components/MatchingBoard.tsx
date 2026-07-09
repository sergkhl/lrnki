import { useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import type { MatchingAttemptTrace, StudyMatchingView } from "@lrnki/application/projection";
import type { LearnerMatchingResult } from "@/lib/api";
import { GroundedBadge } from "./GroundedBadge";
import { canTryMatchingPair, matchingProgress } from "@/learn/matchingProgress";
import { useShuffledLookup } from "@/learn/useShuffledLookup";

type SelectedTile = { column: "prompt" | "match"; id: string } | null;

export function MatchingBoard({
  item,
  result,
  disabled,
  onAttempt,
  onComplete
}: Readonly<{
  item: StudyMatchingView;
  result: LearnerMatchingResult | null;
  disabled: boolean;
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
            await onComplete(traceRef.current);
          }
          return;
        }
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
    <View className="gap-4 rounded-xl border border-line bg-card p-4">
      <View className="flex-row items-start gap-2">
        <Text className="flex-1 text-lg font-semibold leading-7 text-ink">{item.question}</Text>
        <GroundedBadge provenance={item.groundingProvenance} />
      </View>
      <Text className="text-sm text-muted">
        {matchedPairs.length} of {item.prompts.length} matched. Tap a clue on the left, then its match on the right.
      </Text>
      {/* Two-column tap-pairs (R10): clues left, matches right, each independently shuffled.
          Tapping a tile in either column selects it; tapping one in the other column pairs them. */}
      <View className="flex-row gap-3">
        <View className="flex-1 gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Clues</Text>
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
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Matches</Text>
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
        <View className="rounded-xl border border-line bg-card p-3">
          <Text className="text-sm font-medium text-ink">{result.correct ? "Clean sweep." : "Partly matched."}</Text>
          <Text className="mt-1 text-sm text-muted">
            {result.correctFirstTry} of {result.pairCount} matched on the first try.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function TileButton({
  text,
  selected,
  locked,
  wrong,
  disabled,
  onPress
}: Readonly<{ text: string; selected: boolean; locked: boolean; wrong: boolean; disabled: boolean; onPress: () => void }>) {
  const box = locked
    ? "border-gem bg-gem-soft"
    : wrong
      ? "border-destructive bg-card"
      : selected
        ? "border-frontier bg-gem-soft"
        : "border-line bg-card";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || locked}
      onPress={onPress}
      className={`min-h-12 flex-row items-start gap-2 rounded-xl border px-3 py-2.5 ${box}`}
    >
      {locked ? <Check size={16} color="#241f18" style={{ marginTop: 2 }} /> : null}
      <Text className="flex-1 text-sm font-medium text-ink">{text}</Text>
    </Pressable>
  );
}

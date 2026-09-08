import { useState } from "react";
import { View } from "react-native";
import { Check, X } from "lucide-react-native";
import type { ExpeditionView } from "@/lib/queries";
import { useLearnerCommand, type AppliedTransition } from "@/lib/useLearnerCommand";
import { Button, PressableSurface, Text, colors, triggerHaptic } from "@/ui";

export type AuthoredActivity = ExpeditionView["expedition"]["legs"][number]["stops"][number]["activities"][number];
type Pair = { leftKey: string; rightKey: string };
export type ActivityGrade = Readonly<{
  activity: AuthoredActivity;
  effect: AppliedTransition["effect"];
  chosenKey: string | null;
  matches: readonly Pair[];
}>;

// Content only: the focused learning surface owns the card, sources and navigation.
export function AuthoredActivityCard({ expeditionKey, stopKey, activity, source, expectedStateVersion,
  result, disabled = false, onGraded, onBusyChange
}: Readonly<{
  expeditionKey: string;
  stopKey: string;
  activity: AuthoredActivity;
  source: { kind: "trail" } | { kind: "support"; supportPathKey: string };
  expectedStateVersion: string;
  result: ActivityGrade | null;
  disabled?: boolean;
  onGraded: (grade: ActivityGrade) => void;
  onBusyChange: (busy: boolean) => void;
}>) {
  const action = useLearnerCommand(expectedStateVersion, onBusyChange);
  const [chosenKey, setChosenKey] = useState<string | null>(result?.chosenKey ?? null);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matches, setMatches] = useState<readonly Pair[]>(result?.matches ?? []);
  const blocked = disabled || action.busy || result !== null;
  const effect = result?.effect;
  const common = { expeditionKey, stopKey, activityKey: activity.key, source };
  const accept = (choice: string | null, pairs: readonly Pair[]) => (transition: AppliedTransition) => {
    onGraded({ activity, effect: transition.effect, chosenKey: choice, matches: pairs });
    triggerHaptic(transition.effect.correct ? (transition.effect.newlyCompletedStop ? "mastery" : "success") : "warning");
  };
  const choose = (key: string) => {
    if (blocked || activity.family === "matching") return;
    setChosenKey(key);
    void action.run(activity.family === "option_select"
      ? { ...common, kind: "answer_option_select", chosenOptionKey: key }
      : { ...common, kind: "answer_impostor", chosenStatementKey: key }, accept(key, []));
  };

  return (
    <View className="gap-4" testID={`activity-${activity.key}`}>
      <Text variant="heading" accessibilityRole="header">{activity.prompt}</Text>
      {activity.family === "matching" ? (
        <>
          <Text variant="caption" color="muted">Choose a clue, then its match. The same number marks your pair.</Text>
          <View className="flex-row gap-3">
            <View className="min-w-0 flex-1 gap-2">
              <Text variant="label">Clues</Text>
              {activity.left.map(entry => {
                const pair = matches.findIndex(candidate => candidate.leftKey === entry.key);
                return <Choice key={entry.key} text={entry.text} pair={pair < 0 ? undefined : pair + 1}
                  selected={selectedLeft === entry.key} disabled={blocked} onPress={() => setSelectedLeft(entry.key)} />;
              })}
            </View>
            <View className="min-w-0 flex-1 gap-2">
              <Text variant="label">Matches</Text>
              {activity.right.map(entry => {
                const pair = matches.findIndex(candidate => candidate.rightKey === entry.key);
                return <Choice key={entry.key} text={entry.text} pair={pair < 0 ? undefined : pair + 1}
                  disabled={blocked || !selectedLeft} onPress={() => {
                    if (!selectedLeft) return;
                    setMatches(current => [...current.filter(candidate => candidate.leftKey !== selectedLeft && candidate.rightKey !== entry.key), { leftKey: selectedLeft, rightKey: entry.key }]);
                    setSelectedLeft(null);
                  }} />;
              })}
            </View>
          </View>
          {!result ? <View className="flex-row gap-2">
            <Button label="Submit matches" className="min-w-0 flex-1" busy={action.busy}
              disabled={blocked || matches.length !== activity.left.length}
              onPress={() => void action.run({ ...common, kind: "answer_matching", matches: [...matches] }, accept(null, matches))} />
            <Button variant="outline" label="Reset" disabled={blocked || matches.length === 0}
              onPress={() => { setMatches([]); setSelectedLeft(null); }} />
          </View> : null}
        </>
      ) : <View className="gap-2">
        {(activity.family === "option_select" ? activity.options : activity.statements).map(entry => (
          <Choice key={entry.key} text={entry.text} selected={(result?.chosenKey ?? chosenKey) === entry.key}
            marked={effect?.revealKey === entry.key ? "correct" : effect?.correct === false && result?.chosenKey === entry.key ? "wrong" : undefined}
            disabled={blocked} onPress={() => choose(entry.key)} />
        ))}
      </View>}
      {effect ? <View accessibilityLiveRegion="polite" testID="answer-feedback"
        className={`gap-2 rounded-card border p-3 ${effect.correct ? "border-gem bg-gem-soft" : "border-destructive"}`}>
        <Text variant="label">{effect.correct ? "Correct." : "Not quite."}</Text>
        {effect.feedback ? <Text>{effect.feedback}</Text> : null}
        {effect.newlyCompletedStop ? <Text variant="label" color="trail">Stop mastered · +{effect.pointsAwarded} weekly points</Text> : null}
      </View> : null}
      {action.error ? <Text accessibilityLiveRegion="polite" color="destructive">{action.error}</Text> : null}
    </View>
  );
}

function Choice({ text, selected = false, marked, pair, disabled, onPress }: Readonly<{
  text: string;
  selected?: boolean;
  marked?: "correct" | "wrong";
  pair?: number;
  disabled: boolean;
  onPress: () => void;
}>) {
  const box = marked === "correct" ? "border-trail bg-gem-soft" : marked === "wrong" ? "border-destructive bg-card"
    : selected ? "border-frontier bg-muted-panel" : "border-line-strong bg-card";
  return <PressableSurface accessibilityLabel={text} accessibilityHint={pair ? `Your pair ${pair}` : undefined}
    selected={selected} disabled={disabled} haptic="selection" onPress={onPress}
    className={`min-h-target flex-row items-start gap-2 rounded-control border px-3 py-2.5 ${box}`}
    pressedClassName="bg-muted-panel" testID="authored-choice">
    {marked === "correct" ? <Check size={16} color={colors.trail} /> : marked === "wrong" ? <X size={16} color={colors.destructive} /> : null}
    {pair ? <Text variant="label" accessibilityLabel={`Pair ${pair}`}>{pair}.</Text> : null}
    <Text variant="label" className="min-w-0 flex-1">{text}</Text>
  </PressableSurface>;
}

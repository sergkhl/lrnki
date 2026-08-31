import { useState } from "react";
import { View } from "react-native";
import { Check, RotateCcw, X } from "lucide-react-native";

import { dispatchLearnerCommand, type LearnerTransitionDto } from "@/lib/actions";
import type { ExpeditionView } from "@/lib/queries";
import {
  Badge,
  Button,
  Card,
  PressableSurface,
  Text,
  colors,
  triggerHaptic
} from "@/ui";

export type AuthoredActivity = ExpeditionView["expedition"]["legs"][number]["stops"][number]["activities"][number];
type AppliedEffect = Extract<LearnerTransitionDto, { status: "applied" }>["effect"];
type AcquisitionSource = { kind: "trail" } | { kind: "support"; supportPathKey: string };

export function AuthoredActivityCard({
  expeditionKey,
  stopKey,
  activity,
  source,
  expectedStateVersion,
  disabled = false,
  onSettled
}: Readonly<{
  expeditionKey: string;
  stopKey: string;
  activity: AuthoredActivity;
  source: AcquisitionSource;
  expectedStateVersion: string;
  disabled?: boolean;
  onSettled: () => Promise<unknown> | unknown;
}>) {
  const [busy, setBusy] = useState(false);
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [effect, setEffect] = useState<AppliedEffect | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matches, setMatches] = useState<Array<{ leftKey: string; rightKey: string }>>([]);

  const submit = async (command: Parameters<typeof dispatchLearnerCommand>[0]["command"]) => {
    setBusy(true);
    setError(null);
    try {
      const result = await dispatchLearnerCommand({ expectedStateVersion, command });
      if (result.status === "applied") {
        setEffect(result.effect);
        triggerHaptic(result.effect.correct ? (result.effect.newlyCompletedStop ? "mastery" : "success") : "warning");
        await onSettled();
        return;
      }
      setError(transitionMessage(result.status, result.status === "refused" ? result.reason : null));
      await onSettled();
    } catch {
      setError("The answer could not be recorded. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitSelection = (key: string) => {
    setChosenKey(key);
    setEffect(null);
    if (activity.family === "option_select") {
      void submit({
        kind: "answer_option_select",
        expeditionKey,
        stopKey,
        activityKey: activity.key,
        chosenOptionKey: key,
        source
      });
    } else if (activity.family === "impostor") {
      void submit({
        kind: "answer_impostor",
        expeditionKey,
        stopKey,
        activityKey: activity.key,
        chosenStatementKey: key,
        source
      });
    }
  };

  const chooseRight = (rightKey: string) => {
    if (!selectedLeft) return;
    setMatches((current) => [
      ...current.filter((pair) => pair.leftKey !== selectedLeft && pair.rightKey !== rightKey),
      { leftKey: selectedLeft, rightKey }
    ]);
    setSelectedLeft(null);
    setEffect(null);
  };

  const completeMatching = activity.family === "matching" && matches.length === activity.left.length;
  const revealKey = effect?.revealKey ?? null;

  return (
    <Card className="gap-4">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <Text variant="heading" className="min-w-0 flex-1">{activity.prompt}</Text>
        <Badge>{familyLabel(activity.family)}</Badge>
      </View>

      {activity.family === "matching" ? (
        <>
          <Text variant="caption" color="muted">
            Choose a clue, then its match. Submit the complete set for private server grading.
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1 gap-2">
              <Text variant="label">Clues</Text>
              {activity.left.map((entry) => {
                const paired = matches.find((pair) => pair.leftKey === entry.key);
                return (
                  <Choice
                    key={entry.key}
                    text={entry.text}
                    selected={selectedLeft === entry.key}
                    marked={paired ? "paired" : null}
                    disabled={disabled || busy}
                    onPress={() => setSelectedLeft(entry.key)}
                  />
                );
              })}
            </View>
            <View className="flex-1 gap-2">
              <Text variant="label">Matches</Text>
              {activity.right.map((entry) => {
                const paired = matches.find((pair) => pair.rightKey === entry.key);
                return (
                  <Choice
                    key={entry.key}
                    text={entry.text}
                    selected={false}
                    marked={paired ? "paired" : revealKey === entry.key ? "correct" : null}
                    disabled={disabled || busy || !selectedLeft}
                    onPress={() => chooseRight(entry.key)}
                  />
                );
              })}
            </View>
          </View>
          <View className="flex-row gap-2">
            <Button
              label="Submit matches"
              className="flex-1"
              busy={busy}
              disabled={disabled || busy || !completeMatching}
              onPress={() => void submit({
                kind: "answer_matching",
                expeditionKey,
                stopKey,
                activityKey: activity.key,
                matches,
                source
              })}
            />
            <Button
              variant="outline"
              label="Reset"
              icon={<RotateCcw size={14} color={colors.ink} />}
              disabled={busy || matches.length === 0}
              onPress={() => {
                setMatches([]);
                setSelectedLeft(null);
                setEffect(null);
              }}
            />
          </View>
        </>
      ) : (
        <View className="gap-2">
          {(activity.family === "option_select" ? activity.options : activity.statements).map((entry) => (
            <Choice
              key={entry.key}
              text={entry.text}
              selected={chosenKey === entry.key}
              marked={
                revealKey === entry.key ? "correct"
                  : effect && chosenKey === entry.key && effect.correct === false ? "wrong"
                    : null
              }
              disabled={disabled || busy}
              onPress={() => submitSelection(entry.key)}
            />
          ))}
        </View>
      )}

      {effect?.correct !== null && effect?.correct !== undefined ? (
        <View
          accessibilityLiveRegion="polite"
          className={`gap-1 rounded-card border p-3 ${effect.correct ? "border-gem bg-gem-soft" : "border-destructive bg-card"}`}
        >
          <Text variant="label">{effect.correct ? "Correct." : "Not quite."}</Text>
          {effect.feedback ? <Text color="muted">{effect.feedback}</Text> : null}
          {effect.newlyCompletedStop ? (
            <Text variant="label" color="trail">Stop mastered · +{effect.pointsAwarded} weekly points</Text>
          ) : null}
        </View>
      ) : null}
      {error ? <Text color="destructive">{error}</Text> : null}
    </Card>
  );
}

function Choice({
  text,
  selected,
  marked,
  disabled,
  onPress
}: Readonly<{
  text: string;
  selected: boolean;
  marked: "correct" | "wrong" | "paired" | null;
  disabled: boolean;
  onPress: () => void;
}>) {
  const box = marked === "correct" || marked === "paired"
    ? "border-trail bg-gem-soft"
    : marked === "wrong"
      ? "border-destructive bg-card"
      : selected
        ? "border-frontier bg-gem-soft"
        : "border-line-strong bg-card";
  return (
    <PressableSurface
      accessibilityLabel={text}
      selected={selected}
      disabled={disabled}
      haptic="selection"
      onPress={onPress}
      className={`min-h-target flex-row items-start gap-2 rounded-control border px-3 py-2.5 ${box}`}
      pressedClassName="bg-muted-panel"
      testID="authored-choice"
    >
      {marked === "correct" || marked === "paired" ? <Check size={16} color={colors.trail} /> : null}
      {marked === "wrong" ? <X size={16} color={colors.destructive} /> : null}
      <Text variant="label" className="flex-1">{text}</Text>
    </PressableSurface>
  );
}

function familyLabel(family: AuthoredActivity["family"]): string {
  if (family === "option_select") return "Choose";
  if (family === "matching") return "Match";
  return "Find the impostor";
}

function transitionMessage(status: string, reason: string | null): string {
  if (status === "stale") return "Progress changed elsewhere. The trail is refreshing; try again.";
  if (status === "content_changed") return "This Expedition changed and needs the guarded development reset.";
  if (reason === "stop_locked") return "Finish the required Stops before answering here.";
  if (reason === "support_activity_mismatch") return "This activity is not part of the open Support Path.";
  return "The learner runtime refused this answer.";
}

import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, RotateCcw, Trophy } from "lucide-react-native";
import { CrystalGuardian } from "@/components/CrystalGuardian";
import { CrystalSpecimen } from "@/components/CrystalSpecimen";
import { SourceCreditsButton } from "@/components/SourceCredits";
import { useLearnerCommand, type AppliedTransition } from "@/lib/useLearnerCommand";
import { guardianQuery, type GuardianView } from "@/lib/queries";
import { Badge, Button, Card, PressableSurface, RouteStatus, Screen, Text, colors, triggerHaptic } from "@/ui";

type ActiveGuardian = Extract<GuardianView, { state: "active" | "recovery" }>;
type GuardianFeedback = { submitted: ActiveGuardian; effect: AppliedTransition["effect"]; resolved: boolean };

export default function GuardianPage() {
  const { expeditionKey, challengeId } = useLocalSearchParams<{ expeditionKey: string; challengeId: string }>();
  return <GuardianSession key={`${expeditionKey}:${challengeId}`} expeditionKey={expeditionKey} challengeId={challengeId} />;
}

function GuardianSession({ expeditionKey, challengeId }: Readonly<{ expeditionKey: string; challengeId: string }>) {
  const router = useRouter();
  const guardian = useQuery(guardianQuery(expeditionKey, challengeId));
  const action = useLearnerCommand(guardian.data?.stateVersion ?? "0");
  const [feedback, setFeedback] = useState<GuardianFeedback | null>(null);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const goTrail = () => router.replace(`/expedition/${expeditionKey}`);
  if (guardian.isPending) return <RouteStatus tone="loading" title="Opening the Guardian…" />;
  if (guardian.isError || !guardian.data) return <RouteStatus tone="error" title="This Guardian cannot be resumed"
    actions={[{ label: "Try again", onPress: () => void guardian.refetch() }, { label: "Return to trail", variant: "outline", onPress: goTrail }]} />;
  const current = guardian.data.view;
  if (current.state === "won" && !feedback) return <GuardianVictory view={current} onContinue={goTrail} />;
  const view = feedback?.submitted ?? current as ActiveGuardian;
  const stats = current.state === "won" ? view : current;
  const activity = view.currentActivity;
  const busy = action.busy;
  const blocked = busy || feedback !== null;
  const answered = (result: AppliedTransition) => {
    const next = result.view as GuardianView;
    setFeedback({ submitted: view, effect: result.effect,
      resolved: next.state === "won" || (next.kind === "guardian" && next.currentActivity.key !== activity.key) });
    triggerHaptic(result.effect.firstGuardianWin ? "fusion" : result.effect.correct ? "success" : "warning");
  };
  const leave = async (kind: "retreat_guardian" | "abandon_guardian") => {
    const result = await action.run({ kind, expeditionKey, challengeId });
    if (result?.status === "applied") goTrail();
  };
  const acknowledge = () => { setFeedback(null); setSelectedLeft(null); };

  return <Screen edges={["top", "bottom"]}>
    <View className="mx-auto min-h-0 w-full max-w-2xl flex-1 gap-3 p-3">
      <View className="flex-row items-center justify-between gap-2">
        <Button variant="outline" size="compact" icon={<ArrowLeft size={14} color={colors.ink} />}
          label="Retreat to trail" disabled={busy} onPress={() => void leave("retreat_guardian")} />
        <Badge>{view.scope.kind === "leg" ? "Leg Guardian" : "Expedition Guardian"}</Badge>
      </View>
      <Card className="flex-row items-center gap-3 bg-cavern py-2" testID="guardian-status">
        <CrystalGuardian size={64} scopeKind={stats.scope.kind} phase={stats.state} wardTotal={stats.wardTotal}
          wardsRemaining={stats.unresolvedWardCount} shieldRemaining={stats.remainingShield} shieldTotal={stats.shieldTotal} />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="title" color="cavern-ink">{stats.state === "recovery" ? "Last Stand" : `${stats.unresolvedWardCount} wards remain`}</Text>
          <Text variant="caption" color="cavern-ink">Shield {stats.remainingShield}/{stats.shieldTotal} · {stats.resolvedWardCount}/{stats.wardTotal} resolved</Text>
        </View>
      </Card>
      {action.error ? <Text color="destructive" accessibilityLiveRegion="polite">{action.error}</Text> : null}
      {view.retreated && !feedback ? <Card className="gap-3">
        <Text variant="heading">Guardian paused</Text>
        <Text>Your challenge is saved. Pick up where you left off.</Text>
        <Button label="Resume" busy={busy} onPress={() => void action.run({ kind: "resume_guardian", expeditionKey, challengeId })} />
        <Button variant="destructive" label="Abandon" disabled={busy} onPress={() => void leave("abandon_guardian")} />
      </Card> : <Card padding="none" className="min-h-0 flex-1" testID={`guardian-activity-${activity.key}`}>
        <View className="min-h-target flex-row items-center justify-between gap-2 border-b border-line px-4 py-2">
          <Text variant="caption">Question {view.resolvedWardCount + 1} of {view.wardTotal}</Text>
          {feedback?.effect.feedbackSourceCreditKeys.length ? <SourceCreditsButton sourceCredits={view.sourceCredits}
            sourceCreditKeys={feedback.effect.feedbackSourceCreditKeys} contextLabel="this Guardian answer’s explanation" /> : null}
        </View>
        <ScrollView key={activity.key} className="min-h-0 flex-1" contentContainerClassName="gap-4 p-4" testID="guardian-question-body">
          <Text variant="heading" accessibilityRole="header">{activity.prompt}</Text>
          {activity.family === "matching" ? <GuardianMatching activity={activity}
            matchedLeftKeys={view.matchingProgress?.matchedLeftKeys ?? []} selectedLeft={selectedLeft} busy={blocked}
            revealKey={feedback?.effect.revealKey ?? null} onSelectLeft={setSelectedLeft}
            onSelectRight={rightKey => {
              if (!selectedLeft || blocked) return;
              const leftKey = selectedLeft;
              void action.run({ kind: "answer_guardian_matching_pair", expeditionKey, challengeId, activityKey: activity.key, leftKey, rightKey }, answered);
            }} /> : <View className="gap-2">
            {(activity.family === "option_select" ? activity.options : activity.statements).map(entry =>
              <GuardianChoice key={entry.key} text={entry.text} correct={feedback?.effect.revealKey === entry.key} disabled={blocked}
                onPress={() => {
                  if (!blocked) void action.run({ kind: "answer_guardian_selection", expeditionKey, challengeId, activityKey: activity.key, chosenKey: entry.key }, answered);
                }} />)}
          </View>}
          {feedback ? <View accessibilityLiveRegion="polite" testID="guardian-feedback"
            className={`gap-2 rounded-card border p-3 ${feedback.effect.correct ? "border-gem bg-gem-soft" : "border-destructive"}`}>
            <Text variant="label">{feedback.effect.correct ? feedback.resolved ? "Ward resolved." : "Pair matched."
              : activity.family === "matching" && !feedback.resolved ? "That pair does not match."
              : current.state === "recovery" ? "Not quite. Keep going in Last Stand." : "The shield took the hit."}</Text>
            {feedback.effect.feedback ? <Text>{feedback.effect.feedback}</Text> : null}
          </View> : null}
        </ScrollView>
        <View className="shrink-0 border-t border-line p-3">
          <Button label={feedback?.effect.correct === false ? "Try again" : "Continue"} disabled={busy || !feedback} onPress={acknowledge} />
        </View>
      </Card>}
    </View>
  </Screen>;
}

function GuardianMatching({
  activity,
  matchedLeftKeys,
  selectedLeft,
  busy,
  revealKey,
  onSelectLeft,
  onSelectRight
}: Readonly<{
  activity: Extract<GuardianView, { state: "active" | "recovery" }>["currentActivity"] & { family: "matching" };
  matchedLeftKeys: readonly string[];
  selectedLeft: string | null;
  busy: boolean;
  revealKey: string | null;
  onSelectLeft: (key: string | null) => void;
  onSelectRight: (key: string) => void;
}>) {
  return (
    <>
      <Text variant="caption" color="muted">Resolve one pair at a time. A mistake can cost shield when the round ends.</Text>
      <View className="flex-row gap-3">
        <View className="flex-1 gap-2">
          <Text variant="label">Clues</Text>
          {activity.left.map((entry) => (
            <GuardianChoice
              key={entry.key}
              text={entry.text}
              correct={matchedLeftKeys.includes(entry.key)}
              selected={selectedLeft === entry.key}
              disabled={busy || matchedLeftKeys.includes(entry.key)}
              onPress={() => onSelectLeft(entry.key)}
            />
          ))}
        </View>
        <View className="flex-1 gap-2">
          <Text variant="label">Matches</Text>
          {activity.right.map((entry) => (
            <GuardianChoice
              key={entry.key}
              text={entry.text}
              correct={revealKey === entry.key}
              disabled={busy || selectedLeft === null}
              onPress={() => onSelectRight(entry.key)}
            />
          ))}
        </View>
      </View>
      <Button
        variant="outline"
        label="Clear selection"
        icon={<RotateCcw size={14} color={colors.ink} />}
        disabled={!selectedLeft || busy}
        onPress={() => onSelectLeft(null)}
      />
    </>
  );
}

function GuardianChoice({
  text,
  correct = false,
  selected = false,
  disabled,
  onPress
}: Readonly<{
  text: string;
  correct?: boolean;
  selected?: boolean;
  disabled: boolean;
  onPress: () => void;
}>) {
  return (
    <PressableSurface
      accessibilityLabel={text}
      selected={selected}
      disabled={disabled}
      haptic="selection"
      onPress={onPress}
      className={`min-h-target flex-row items-start gap-2 rounded-control border px-3 py-2.5 ${correct ? "border-trail bg-gem-soft" : selected ? "border-frontier bg-gem-soft" : "border-line-strong bg-card"}`}
      pressedClassName="bg-muted-panel"
      testID="guardian-choice"
    >
      {correct ? <Check size={16} color={colors.trail} /> : null}
      <Text variant="label" className="flex-1">{text}</Text>
    </PressableSurface>
  );
}

function GuardianVictory({ view, onContinue }: Readonly<{
  view: Extract<GuardianView, { state: "won" }>;
  onContinue: () => void;
}>) {
  const summit = view.scope.kind === "expedition";
  return (
    <Screen className="items-center justify-center p-4">
      <Card className="w-full max-w-lg items-center gap-4 border-trail bg-gem-soft py-8">
        <Trophy size={36} color={colors.award} />
        <CrystalSpecimen
          species={summit ? "keystone" : "legWard"}
          identityKey={view.challengeId}
          material="collected"
          growthFraction={1}
          size={96}
          ariaLabel={summit ? "Expedition keystone" : "Bound Leg crystal"}
        />
        <Text variant="display" className="text-center">Guardian won</Text>
        <Text className="text-center" color="muted">
          {view.firstWin
            ? summit
              ? "The summit keystone is yours. You’ve completed this expedition’s final challenge."
              : "This Leg’s crystal is yours. Your first victory is saved."
            : "Rematch complete. Your mastery and weekly points stay the same."}
        </Text>
        <Button label="Return to trail" onPress={onContinue} />
      </Card>
    </Screen>
  );
}

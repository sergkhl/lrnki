import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, RotateCcw, Trophy } from "lucide-react-native";

import { CrystalGuardian } from "@/components/CrystalGuardian";
import { CrystalSpecimen } from "@/components/CrystalSpecimen";
import { SourceCreditsExpander } from "@/components/SourceCredits";
import { dispatchLearnerCommand, type LearnerTransitionDto } from "@/lib/actions";
import { guardianQuery, type GuardianView } from "@/lib/queries";
import {
  Badge,
  Button,
  Card,
  PressableSurface,
  RouteStatus,
  Screen,
  Text,
  buttonIconColor,
  colors,
  triggerHaptic
} from "@/ui";

type Effect = Extract<LearnerTransitionDto, { status: "applied" }>["effect"];

export default function GuardianPage() {
  const router = useRouter();
  const { expeditionKey, challengeId } = useLocalSearchParams<{
    expeditionKey: string;
    challengeId: string;
  }>();
  const guardian = useQuery(guardianQuery(expeditionKey, challengeId));
  const [busy, setBusy] = useState(false);
  const [effect, setEffect] = useState<Effect | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);

  const goTrail = () => router.replace(`/expedition/${expeditionKey}`);

  if (guardian.isPending) return <RouteStatus tone="loading" title="Summoning the Guardian…" />;
  if (guardian.isError || !guardian.data) {
    return (
      <RouteStatus
        tone="error"
        title="This Guardian cannot be resumed"
        actions={[
          { label: "Try again", onPress: () => void guardian.refetch() },
          { label: "Return to trail", variant: "outline", onPress: goTrail }
        ]}
      />
    );
  }

  const data = guardian.data;
  const view = data.view;
  const command = async (next: Parameters<typeof dispatchLearnerCommand>[0]["command"]) => {
    setBusy(true);
    setError(null);
    try {
      const result = await dispatchLearnerCommand({
        expectedStateVersion: data.stateVersion,
        command: next
      });
      if (result.status === "applied") {
        setEffect(result.effect);
        triggerHaptic(result.effect.firstGuardianWin ? "fusion" : result.effect.correct === false ? "warning" : "success");
      } else {
        setError(guardianMessage(result.status, result.status === "refused" ? result.reason : null));
      }
      await guardian.refetch();
      return result;
    } catch {
      setError("The Guardian command could not be recorded. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (view.state === "won") {
    return <GuardianVictory view={view} onContinue={goTrail} />;
  }

  const activity = view.currentActivity;
  const scopeKind = view.scope.kind;
  const answeredCorrectly = effect?.kind === "guardian_answered" ? effect.correct : null;

  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl gap-4 p-4 pb-12">
        <View className="flex-row items-center justify-between gap-3">
          <Button
            variant="outline"
            size="compact"
            icon={<ArrowLeft size={14} color={buttonIconColor("outline")} />}
            label="Retreat to trail"
            disabled={busy}
            onPress={() => void command({ kind: "retreat_guardian", expeditionKey, challengeId }).then(goTrail)}
          />
          <Badge>{scopeKind === "leg" ? "Leg Guardian" : "Expedition Guardian"}</Badge>
        </View>

        <Card className="items-center gap-3 bg-cavern">
          <CrystalGuardian
            scopeKind={scopeKind}
            phase={view.state}
            wardTotal={view.wardTotal}
            wardsRemaining={view.unresolvedWardCount}
            shieldRemaining={view.remainingShield}
            shieldTotal={view.shieldTotal}
          />
          <Text variant="heading" color="cavern-ink">
            {view.state === "recovery" ? "Last Stand" : `${view.unresolvedWardCount} wards remain`}
          </Text>
          <Text color="cavern-ink">
            Shield {view.remainingShield}/{view.shieldTotal} · {view.resolvedWardCount}/{view.wardTotal} resolved
          </Text>
        </Card>

        {view.retreated ? (
          <Card className="gap-3">
            <Text variant="heading">Guardian paused</Text>
            <Text color="muted">Resume the same immutable lineup and combat history.</Text>
            <View className="flex-row gap-2">
              <Button
                className="flex-1"
                label="Resume"
                busy={busy}
                onPress={() => void command({ kind: "resume_guardian", expeditionKey, challengeId })}
              />
              <Button
                variant="destructive"
                label="Abandon"
                disabled={busy}
                onPress={() => void command({ kind: "abandon_guardian", expeditionKey, challengeId }).then(goTrail)}
              />
            </View>
          </Card>
        ) : (
          <Card className="gap-4">
            <Text variant="heading">{activity.prompt}</Text>
            {activity.family === "matching" ? (
              <GuardianMatching
                activity={activity}
                matchedLeftKeys={view.matchingProgress?.matchedLeftKeys ?? []}
                selectedLeft={selectedLeft}
                busy={busy}
                revealKey={effect?.revealKey ?? null}
                onSelectLeft={setSelectedLeft}
                onSelectRight={(rightKey) => {
                  if (!selectedLeft) return;
                  const leftKey = selectedLeft;
                  setSelectedLeft(null);
                  setEffect(null);
                  void command({
                    kind: "answer_guardian_matching_pair",
                    expeditionKey,
                    challengeId,
                    activityKey: activity.key,
                    leftKey,
                    rightKey
                  });
                }}
              />
            ) : (
              <View className="gap-2">
                {(activity.family === "option_select" ? activity.options : activity.statements).map((entry) => (
                  <GuardianChoice
                    key={entry.key}
                    text={entry.text}
                    correct={effect?.revealKey === entry.key}
                    disabled={busy}
                    onPress={() => {
                      setEffect(null);
                      void command({
                        kind: "answer_guardian_selection",
                        expeditionKey,
                        challengeId,
                        activityKey: activity.key,
                        chosenKey: entry.key
                      });
                    }}
                  />
                ))}
              </View>
            )}
            {answeredCorrectly !== null ? (
              <View
                accessibilityLiveRegion="polite"
                className={`gap-1 rounded-card border p-3 ${answeredCorrectly ? "border-gem bg-gem-soft" : "border-destructive"}`}
              >
                <Text variant="label">{answeredCorrectly ? "Ward resolved." : "The shield took the hit."}</Text>
                {effect?.feedback ? <Text color="muted">{effect.feedback}</Text> : null}
                {effect?.feedback && effect.feedbackSourceCreditKeys.length > 0 ? (
                  <SourceCreditsExpander
                    sourceCredits={view.sourceCredits}
                    sourceCreditKeys={effect.feedbackSourceCreditKeys}
                    contextLabel="this graded Guardian explanation"
                  />
                ) : null}
              </View>
            ) : null}
          </Card>
        )}

        {error ? <Text color="destructive">{error}</Text> : null}
      </ScrollView>
    </Screen>
  );
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
      <Text variant="caption" color="muted">Resolve one pair at a time. A wrong pair spends shield but does not move the ward.</Text>
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
              ? "The summit keystone is seated. This first-win reward is durable and deduplicated."
              : "This Leg is bound into the formation. The first-win reward is durable and deduplicated."
            : "Rematch complete. Acquisition mastery and weekly points were unchanged."}
        </Text>
        <Button label="Return to trail" onPress={onContinue} />
      </Card>
    </Screen>
  );
}

function guardianMessage(status: string, reason: string | null): string {
  if (status === "stale") return "The Guardian changed elsewhere. The committed fight is refreshing.";
  if (reason === "guardian_out_of_turn") return "That ward is no longer current. The fight is refreshing.";
  if (reason === "guardian_retreated") return "Resume the Guardian before answering.";
  return "The learner runtime refused this Guardian command.";
}

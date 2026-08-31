import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Shield, Sparkles } from "lucide-react-native";

import { AuthoredActivityCard } from "@/components/AuthoredActivityCard";
import {
  AuthoredSupportDialog,
  type AuthoredSupportPath
} from "@/components/AuthoredSupportDialog";
import { CrystalSpecimen } from "@/components/CrystalSpecimen";
import { ExplorableTheoryText } from "@/components/ExplorableTheoryText";
import { dispatchLearnerCommand, type LearnerCommandDto, type LearnerTransitionDto } from "@/lib/actions";
import { expeditionQuery, type ExpeditionView } from "@/lib/queries";
import { crystalForBand } from "@/learn/crystalLibrary";
import {
  Badge,
  Button,
  Card,
  Progress,
  RouteStatus,
  Screen,
  Text,
  buttonIconColor,
  colors
} from "@/ui";

export default function ExpeditionPage() {
  const router = useRouter();
  const { expeditionKey } = useLocalSearchParams<{ expeditionKey: string }>();
  const expedition = useQuery(expeditionQuery(expeditionKey));
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supportKey, setSupportKey] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);

  // This control promises the Journal, so it must not inherit an arbitrary deep-link stack.
  // A Guardian can have another Guardian underneath it after native openLink navigation; using
  // back() here returned the learner to combat instead of home.
  const goHome = () => router.replace("/");

  if (expedition.isPending) return <RouteStatus tone="loading" title="Opening the authored trail…" />;
  if (expedition.isError || !expedition.data) {
    return (
      <RouteStatus
        tone="error"
        title="This expedition is unavailable"
        message="It may have changed or may not belong to this journal."
        actions={[
          { label: "Try again", onPress: () => void expedition.refetch() },
          { label: "Back to journal", variant: "outline", onPress: goHome }
        ]}
      />
    );
  }

  const data = expedition.data;
  const view = data.view;
  const refresh = () => expedition.refetch();
  const run = async (identity: string, command: LearnerCommandDto) => {
    setPending(identity);
    setError(null);
    try {
      const result = await dispatchLearnerCommand({
        expectedStateVersion: data.stateVersion,
        command
      });
      if (result.status !== "applied") setError(commandMessage(result.status, result.status === "refused" ? result.reason : null));
      await refresh();
      return result;
    } catch {
      setError("The learner command could not be recorded. Try again.");
      return null;
    } finally {
      setPending(null);
    }
  };

  const openSupport = async (stopKey: string, path: AuthoredSupportPath) => {
    setSupportKey(path.supportPathKey);
    if (path.status !== "open") {
      const result = await run(`support:${path.supportPathKey}`, {
        kind: "open_support_path",
        expeditionKey,
        stopKey,
        supportPathKey: path.supportPathKey
      });
      if (!result || result.status !== "applied") return;
    }
    setSupportOpen(true);
  };

  const enterGuardian = async (guardian: ExpeditionView["guardians"][number]) => {
    if (guardian.activeChallengeId) {
      router.push(`/guardian/${expeditionKey}/${guardian.activeChallengeId}`);
      return;
    }
    const result = await run(`guardian:${scopeKey(guardian.scope)}`, {
      kind: "create_guardian",
      expeditionKey,
      scope: guardian.scope
    });
    if (result?.status === "applied" && result.effect.challengeId) {
      router.push(`/guardian/${expeditionKey}/${result.effect.challengeId}`);
    }
  };

  const selectedSupport = view.supportPaths.find((path) => path.supportPathKey === supportKey) ?? null;
  const settledStops = view.progress.filter((progress) => progress.state === "mastered" || progress.state === "known").length;

  return (
    <Screen>
      <View className="border-b border-line bg-card px-4 py-2">
        <Button
          variant="outline"
          size="compact"
          onPress={goHome}
          icon={<ArrowLeft size={14} color={buttonIconColor("outline")} />}
          label="Expedition journal"
          className="self-start"
        />
      </View>
      <ScrollView contentContainerClassName="mx-auto w-full max-w-3xl gap-5 p-4 pb-16">
        <View className="gap-2">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text variant="display" className="min-w-0 flex-1">{view.expedition.title}</Text>
            {view.active ? <Badge>Active</Badge> : <Badge>Read only until activated</Badge>}
          </View>
          <Text color="muted">{view.expedition.teaser}</Text>
          <Progress
            fraction={view.progress.length === 0 ? 0 : settledStops / view.progress.length}
            accessibilityLabel={`${settledStops} of ${view.progress.length} Stops settled`}
          />
          <Text variant="caption" color="muted">{settledStops} of {view.progress.length} Stops settled</Text>
        </View>

        {error ? (
          <Card className="border-destructive">
            <Text color="destructive">{error}</Text>
          </Card>
        ) : null}

        {view.expedition.legs.map((leg) => {
          const guardian = view.guardians.find(
            (candidate) => candidate.scope.kind === "leg" && candidate.scope.legKey === leg.key
          );
          return (
            <View key={leg.key} className="gap-3">
              <View className="flex-row items-center gap-2">
                <Sparkles size={20} color={colors.trail} />
                <Text variant="heading" className="flex-1">{leg.title}</Text>
              </View>
              {leg.stops.map((stop) => {
                const progress = view.progress.find((candidate) => candidate.stopKey === stop.key);
                if (!progress) return null;
                return (
                  <StopCard
                    key={stop.key}
                    expeditionKey={expeditionKey}
                    stop={stop}
                    progress={progress}
                    supportPaths={view.supportPaths.filter((path) => path.parentStopKey === stop.key)}
                    stateVersion={data.stateVersion}
                    pending={pending}
                    onRun={run}
                    onRefresh={refresh}
                    onOpenSupport={openSupport}
                  />
                );
              })}
              {guardian ? (
                <GuardianGate
                  guardian={guardian}
                  busy={pending === `guardian:${scopeKey(guardian.scope)}`}
                  onEnter={() => void enterGuardian(guardian)}
                />
              ) : null}
            </View>
          );
        })}

        {view.guardians.find((guardian) => guardian.scope.kind === "expedition") ? (
          <GuardianGate
            summit
            guardian={view.guardians.find((guardian) => guardian.scope.kind === "expedition") as ExpeditionView["guardians"][number]}
            busy={pending === "guardian:expedition"}
            onEnter={() => {
              const summit = view.guardians.find((guardian) => guardian.scope.kind === "expedition");
              if (summit) void enterGuardian(summit);
            }}
          />
        ) : null}
      </ScrollView>

      <AuthoredSupportDialog
        open={supportOpen}
        path={selectedSupport}
        expeditionKey={expeditionKey}
        expectedStateVersion={data.stateVersion}
        onOpenChange={setSupportOpen}
        onSettled={refresh}
        onRefresh={refresh}
      />
    </Screen>
  );
}

type AuthoredStop = ExpeditionView["expedition"]["legs"][number]["stops"][number];
type StopProgress = ExpeditionView["progress"][number];

function StopCard({
  expeditionKey,
  stop,
  progress,
  supportPaths,
  stateVersion,
  pending,
  onRun,
  onRefresh,
  onOpenSupport
}: Readonly<{
  expeditionKey: string;
  stop: AuthoredStop;
  progress: StopProgress;
  supportPaths: ExpeditionView["supportPaths"];
  stateVersion: string;
  pending: string | null;
  onRun: (identity: string, command: LearnerCommandDto) => Promise<LearnerTransitionDto | null>;
  onRefresh: () => Promise<unknown>;
  onOpenSupport: (stopKey: string, path: AuthoredSupportPath) => Promise<void>;
}>) {
  const locked = progress.state === "locked";
  const activitiesReady = progress.lessonReadAt !== null || progress.state === "known" || progress.state === "mastered";
  const settledCount = stop.activities.filter((activity) =>
    progress.latestActivityOutcomes.some((outcome) => outcome.activityKey === activity.key && outcome.correct)
  ).length;
  const termPaths = new Map(supportPaths.map((path) => [path.term, path] as const));

  return (
    <Card className={`gap-4 ${locked ? "opacity-60" : ""}`}>
      <View className="flex-row items-start gap-3">
        <CrystalSpecimen
          species={crystalForBand(stop.difficultyBand)}
          identityKey={stop.key}
          material={progress.state === "mastered" ? "collected" : locked ? "fogged" : progress.state === "known" ? "open" : "next"}
          growthFraction={stop.activities.length === 0 ? 0 : settledCount / stop.activities.length}
          size={52}
          ariaLabel={`${stop.label}: ${progress.state}`}
        />
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text variant="heading" className="min-w-0 flex-1">{stop.label}</Text>
            <Badge>{progress.state}</Badge>
          </View>
          <Text variant="caption" color="muted">Difficulty {stop.difficultyBand} · {settledCount}/{stop.activities.length} current activities correct</Text>
          {progress.restorationStopKeys.length > 0 ? (
            <Text color="destructive">Restore calibrated prerequisites: {progress.restorationStopKeys.join(", ")}</Text>
          ) : null}
        </View>
      </View>

      {locked ? (
        <Text color="muted">Requires: {stop.requires.join(", ") || "an earlier Stop"}</Text>
      ) : (
        <>
          <View className="gap-4">
            {stop.lesson.sections.map((section) => (
              <View key={section.key} className="gap-1">
                <Text variant="title">{section.title}</Text>
                <ExplorableTheoryText
                  text={section.body}
                  terms={section.explorableTerms.map((term) => term.term)}
                  onPressTerm={(term) => {
                    const path = termPaths.get(term);
                    if (path) void onOpenSupport(stop.key, path);
                  }}
                />
                {section.explorableTerms.map((term) => {
                  const path = supportPaths.find((candidate) => candidate.supportPathKey === term.supportPathKey);
                  return path ? (
                    <Button
                      key={term.supportPathKey}
                      testID={`support-path-${term.supportPathKey}`}
                      variant="outline"
                      size="compact"
                      label={`${path.status === "hidden" ? "Restore" : path.status === "open" ? "Open" : "Explore"} “${term.term}” Support Path`}
                      disabled={pending !== null}
                      busy={pending === `support:${path.supportPathKey}`}
                      onPress={() => void onOpenSupport(stop.key, path)}
                    />
                  ) : null;
                })}
              </View>
            ))}
          </View>
          <View className="flex-row flex-wrap gap-2">
            {progress.lessonReadAt ? (
              <Badge>Lesson read</Badge>
            ) : (
              <Button
                label="Mark lesson read"
                busy={pending === `read:${stop.key}`}
                disabled={pending !== null}
                onPress={() => void onRun(`read:${stop.key}`, {
                  kind: "record_lesson_read",
                  expeditionKey,
                  stopKey: stop.key
                })}
              />
            )}
            {progress.state === "known" ? (
              <Button
                variant="outline"
                label="Clear known"
                busy={pending === `calibrate:${stop.key}`}
                disabled={pending !== null}
                onPress={() => void onRun(`calibrate:${stop.key}`, {
                  kind: "clear_calibration_known",
                  expeditionKey,
                  stopKey: stop.key
                })}
              />
            ) : progress.state !== "mastered" ? (
              <Button
                variant="outline"
                label="I already know this"
                busy={pending === `calibrate:${stop.key}`}
                disabled={pending !== null}
                onPress={() => void onRun(`calibrate:${stop.key}`, {
                  kind: "set_calibration_known",
                  expeditionKey,
                  stopKey: stop.key
                })}
              />
            ) : null}
          </View>
          {activitiesReady ? (
            <View className="gap-3">
              {stop.activities.map((activity) => (
                <AuthoredActivityCard
                  key={activity.key}
                  expeditionKey={expeditionKey}
                  stopKey={stop.key}
                  activity={activity}
                  source={{ kind: "trail" }}
                  expectedStateVersion={stateVersion}
                  disabled={pending !== null}
                  onSettled={onRefresh}
                />
              ))}
            </View>
          ) : (
            <Text variant="caption" color="muted">Mark the lesson read before attempting acquisition activities.</Text>
          )}
        </>
      )}
    </Card>
  );
}

function GuardianGate({
  guardian,
  summit = false,
  busy,
  onEnter
}: Readonly<{
  guardian: ExpeditionView["guardians"][number];
  summit?: boolean;
  busy: boolean;
  onEnter: () => void;
}>) {
  const label = guardian.state === "active" ? "Resume Guardian"
    : guardian.state === "won" ? "Rematch Guardian"
      : guardian.state === "available" ? "Challenge Guardian"
        : guardian.state === "unavailable" ? "Guardian unavailable"
          : "Guardian locked";
  const canEnter = guardian.state === "active" || guardian.state === "won" || guardian.state === "available";
  return (
    <Card className={`gap-3 ${summit ? "border-trail bg-gem-soft" : ""}`}>
      <View className="flex-row items-center gap-3">
        <Shield size={28} color={colors.trail} />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="heading">{summit ? "Expedition Guardian" : "Leg Guardian"}</Text>
          <Text variant="caption" color="muted">
            {guardian.eligibleActivityCount} eligible wards · {guardian.state}
          </Text>
        </View>
      </View>
      <Button label={label} busy={busy} disabled={!canEnter || busy} onPress={onEnter} />
    </Card>
  );
}

function scopeKey(scope: ExpeditionView["guardians"][number]["scope"]): string {
  return scope.kind === "leg" ? `leg:${scope.legKey}` : "expedition";
}

function commandMessage(status: string, reason: string | null): string {
  if (status === "stale") return "Progress changed elsewhere. The trail has refreshed; try again.";
  if (status === "content_changed") return "This content revision needs the guarded development reset.";
  if (reason === "guardian_locked") return "Complete this scope before challenging its Guardian.";
  if (reason === "guardian_unavailable") return "No eligible acquisition evidence exists for this Guardian yet.";
  return "The learner runtime refused this command.";
}

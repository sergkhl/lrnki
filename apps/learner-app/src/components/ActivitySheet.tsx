import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, X } from "lucide-react-native";
import type { StudySession } from "@lrnki/application/projection";
import type { LearnerGradingResult, LearnerMatchingResult } from "@/lib/api";
import { markLearnerLessonRead, refreshLearnerExpedition, submitLearnerImpostor, submitLearnerMatching, submitLearnerOptionSelect, validateLearnerMatchingAttempt } from "@/lib/actions";
import { Btn } from "./ui";
import { ImpostorBody, OptionSelectBody } from "./ActivityCards";
import { CrystalGlyph } from "./CrystalGlyph";
import { LessonSections } from "./LessonSections";
import { MatchingBoard } from "./MatchingBoard";
import { activeStopFor, type AdvanceMemory } from "@/learn/advanceMemory";
import { resolveStopActivity } from "@/learn/activityProgress";
import { buildTrailView } from "@/learn/trailView";
import { learnerTerm } from "@/learn/vocabulary";

type Activity = ReturnType<typeof resolveStopActivity>;
type ActivityResult = LearnerGradingResult | LearnerMatchingResult | null;

// The activity surface: the web's full-screen Sheet becomes a full-screen Modal, same
// in-sheet advance memory so "Continue" walks stop to stop without touching the trail.
export function ActivitySheet({
  session,
  stopId,
  open,
  onOpenChange
}: Readonly<{
  session: StudySession;
  stopId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const insets = useSafeAreaInsets();
  const [localStop, setLocalStop] = useState<AdvanceMemory>(null);
  const activeStopId = activeStopFor(localStop, stopId);
  const activity = activeStopId ? resolveStopActivity(session, activeStopId) : null;
  const title = activity && activity.kind !== "missing" ? activity.label : "Trail stop";
  const close = () => {
    // Closing drops the in-sheet advance memory, so re-opening an earlier stop
    // opens that stop's own activity instead of the one it advanced to.
    setLocalStop(null);
    onOpenChange(false);
  };
  return (
    <Modal visible={open} animationType="slide" onRequestClose={close}>
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="flex-row items-start justify-between gap-3 border-b border-line bg-card px-4 py-3">
          <View className="min-w-0 flex-1">
            <Text className="text-base font-semibold text-ink" numberOfLines={2}>{title}</Text>
            <Text className="text-sm text-muted">{activity ? descriptionFor(activity.kind) : learnerTerm("nextStop")}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} className="p-1">
            <X size={20} color="#6d6152" />
          </Pressable>
        </View>
        {activity ? (
          <ActivityController
            key={activeStopId}
            session={session}
            activity={activity}
            stopId={activeStopId}
            justAdvanced={localStop?.sourceStopId === stopId && activeStopId !== stopId}
            onAdvance={(nextStopId) => setLocalStop({ sourceStopId: stopId, activeStopId: nextStopId })}
            onDone={close}
          />
        ) : null}
      </View>
    </Modal>
  );
}

function ActivityController({
  session,
  activity,
  stopId,
  justAdvanced,
  onAdvance,
  onDone
}: Readonly<{ session: StudySession; activity: Activity; stopId: string | null; justAdvanced: boolean; onAdvance: (stopId: string) => void; onDone: () => void }>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<ActivityResult>(null);
  const [pending, setPending] = useState(false);
  const graded = result?.graded === true;

  const run = (work: () => Promise<void>) => {
    setPending(true);
    void work().finally(() => setPending(false));
  };

  const nextStopId = () => {
    if (!stopId) return null;
    const stops = buildTrailView(session).concepts.flatMap((concept) => concept.stops);
    const currentIndex = stops.findIndex((stop) => stop.stopId === stopId);
    if (currentIndex < 0) return null;
    return stops.slice(currentIndex + 1).find((stop) => stop.state !== "locked")?.stopId ?? null;
  };

  const continueAfterRefresh = () => {
    run(async () => {
      if (activity.kind === "theory") {
        await markLearnerLessonRead({
          enrichmentId: session.enrichmentId,
          derivedNodeId: activity.derivedNodeId
        });
      }
      await refreshLearnerExpedition({ enrichmentId: session.enrichmentId });
      const next = nextStopId();
      if (!next) onDone();
      else onAdvance(next);
    });
  };

  const submitSelection = (id: string) => {
    if (pending || graded) return;
    setSelectedId(id);
    run(async () => {
      if (activity.kind === "option_select") {
        setResult(await submitLearnerOptionSelect({
          enrichmentId: session.enrichmentId,
          studyItemId: activity.item.studyItemId,
          chosenOptionId: id
        }));
      }
      if (activity.kind === "impostor") {
        setResult(await submitLearnerImpostor({
          enrichmentId: session.enrichmentId,
          studyItemId: activity.item.studyItemId,
          chosenStatementId: id
        }));
      }
    });
  };

  const validateMatching = async (promptId: string, matchId: string) => {
    if (activity.kind !== "matching") return false;
    const checked = await validateLearnerMatchingAttempt({
      enrichmentId: session.enrichmentId,
      studyItemId: activity.item.studyItemId,
      promptId,
      matchId
    });
    return checked.checked && checked.correct;
  };

  const submitMatching = async (trace: { promptId: string; chosenMatchId: string }[]) => {
    if (activity.kind !== "matching") return;
    setResult(await submitLearnerMatching({
      enrichmentId: session.enrichmentId,
      studyItemId: activity.item.studyItemId,
      trace
    }));
  };

  return (
    <>
      <ScrollView className="flex-1">
        <View className="mx-auto w-full max-w-3xl gap-4 p-4">
          <CompletedIndicator session={session} activity={activity} result={result} />
          <ActivityBody activity={activity} selectedId={selectedId} result={result} pending={pending} justAdvanced={justAdvanced} onSelect={submitSelection} onMatchingAttempt={validateMatching} onMatchingComplete={submitMatching} />
          {result && !result.graded ? <Text className="text-sm text-destructive">{result.message}</Text> : null}
        </View>
      </ScrollView>
      <View className="border-t border-line bg-card p-4">
        <View className="mx-auto w-full max-w-3xl flex-row justify-end">
          <FooterButton
            activity={activity}
            pending={pending}
            graded={graded}
            onContinue={continueAfterRefresh}
            onDone={onDone}
          />
        </View>
      </View>
    </>
  );
}

function ActivityBody({
  activity,
  selectedId,
  result,
  pending,
  justAdvanced,
  onSelect,
  onMatchingAttempt,
  onMatchingComplete
}: Readonly<{
  activity: Activity;
  selectedId: string | null;
  result: ActivityResult;
  pending: boolean;
  justAdvanced: boolean;
  onSelect: (id: string) => void;
  onMatchingAttempt: (promptId: string, matchId: string) => Promise<boolean>;
  onMatchingComplete: (trace: { promptId: string; chosenMatchId: string }[]) => Promise<void>;
}>) {
  if (activity.kind === "missing") return <Text className="text-sm text-muted">{activity.message}</Text>;
  if (activity.kind === "option_select") return <OptionSelectBody item={activity.item} selectedId={selectedId} result={isSelectionResult(result) ? result : null} disabled={pending} onSelect={onSelect} />;
  if (activity.kind === "matching") return <MatchingBoard item={activity.item} result={isMatchingResult(result) ? result : null} disabled={pending} onAttempt={onMatchingAttempt} onComplete={onMatchingComplete} />;
  if (activity.kind === "impostor") return <ImpostorBody item={activity.item} selectedId={selectedId} result={isSelectionResult(result) ? result : null} disabled={pending} onSelect={onSelect} />;
  if (activity.kind === "capstone") {
    // The mastery reveal, static for v1: the finished crystal shows immediately
    // (facet-by-facet assembly returns with Reanimated in the follow-up pass).
    return (
      <View className="gap-3 rounded-xl border border-line bg-card p-4">
        <View className="flex-row items-center gap-3">
          <CrystalGlyph
            derivedNodeId={activity.derivedNodeId}
            difficulty={activity.difficulty}
            growthFraction={activity.growthFraction}
            state={activity.mastered ? "mastered" : "frontier"}
            ghost={activity.isKnownSkipped}
            size={72}
          />
          <View className="min-w-0 flex-1">
            <Text className="text-lg font-semibold text-ink">{activity.isKnownSkipped ? learnerTerm("known") : activity.mastered ? learnerTerm("summit") : learnerTerm("capstone")}</Text>
            <Text className="text-sm text-muted">
              {activity.isKnownSkipped
                ? "Known ground is complete, but no crystal is collected."
                : activity.mastered
                  ? "This crystal is collected."
                  : "Complete the earlier stops to finish growing this crystal."}
            </Text>
          </View>
        </View>
      </View>
    );
  }
  if (activity.lesson?.sections.length) return <LessonSections lesson={activity.lesson} />;
  return (
    <View className="rounded-xl border border-line bg-card p-4">
      <Text className="text-sm text-muted">No field notes are available for this stop.</Text>
    </View>
  );
}

function FooterButton({
  activity,
  pending,
  graded,
  onContinue,
  onDone
}: Readonly<{
  activity: Activity;
  pending: boolean;
  graded: boolean;
  onContinue: () => void;
  onDone: () => void;
}>) {
  if (activity.kind === "option_select" || activity.kind === "impostor" || activity.kind === "matching") {
    if (graded) {
      return <Btn disabled={pending} onPress={onContinue} label={learnerTerm("continueAction")} />;
    }
    return null;
  }
  if (activity.kind === "capstone") {
    return (
      <Btn
        disabled={pending}
        onPress={activity.mastered ? onContinue : onDone}
        label={activity.mastered ? learnerTerm("continueAction") : learnerTerm("returnToTrail")}
      />
    );
  }
  return (
    <Btn
      disabled={pending}
      onPress={activity.kind === "missing" ? onDone : onContinue}
      label={learnerTerm("continueAction")}
    />
  );
}

function CompletedIndicator({
  session,
  activity,
  result
}: Readonly<{ session: StudySession; activity: Activity; result: ActivityResult }>) {
  const complete =
    activity.kind === "theory" ? session.lessonReadByNode[activity.derivedNodeId] :
    activity.kind === "option_select" || activity.kind === "matching" || activity.kind === "impostor"
      ? session.latestOutcomeByStudyItemId[activity.item.studyItemId] === "correct" || (result?.graded === true && result.correct)
      : activity.kind === "capstone" ? activity.mastered
      : false;
  if (!complete) return null;
  return (
    <View className="flex-row items-center gap-2 self-start rounded-xl border border-line bg-gem-soft px-3 py-2">
      <CheckCircle2 size={16} color="#241f18" />
      <Text className="text-sm font-medium text-ink">
        {activity.kind === "capstone" && activity.isKnownSkipped ? learnerTerm("known") : learnerTerm("mastered")}
      </Text>
    </View>
  );
}

function descriptionFor(kind: Activity["kind"]): string {
  if (kind === "theory") return learnerTerm("theoryStop");
  if (kind === "option_select") return learnerTerm("question");
  if (kind === "matching") return learnerTerm("matching");
  if (kind === "impostor") return learnerTerm("spotTheFake");
  if (kind === "capstone") return learnerTerm("capstone");
  return learnerTerm("nextStop");
}

function isSelectionResult(result: ActivityResult): result is LearnerGradingResult | null {
  return result === null || result.kind === "selection";
}

function isMatchingResult(result: ActivityResult): result is LearnerMatchingResult | null {
  return result === null || result.kind === "matching";
}

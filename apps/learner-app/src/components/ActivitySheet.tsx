import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookOpen, CheckCircle2, HelpCircle, MapPin, Rows3, Search } from "lucide-react-native";
import type { StudySession } from "@lrnki/application/projection";
import type { LearnerGradingResult, LearnerMatchingResult } from "@/lib/api";
import { markLearnerLessonRead, refreshLearnerExpedition, submitLearnerImpostor, submitLearnerMatching, submitLearnerOptionSelect, validateLearnerMatchingAttempt } from "@/lib/actions";
import { Button, FullScreenDialog, OverlayHeader, Text, colors, triggerHaptic } from "@/ui";
import { ImpostorBody, OptionSelectBody } from "./ActivityCards";
import { CrystalGlyph } from "./CrystalGlyph";
import { LessonSections } from "./LessonSections";
import { MatchingBoard } from "./MatchingBoard";
import { activeStopFor, type AdvanceMemory } from "@/learn/advanceMemory";
import { resolveStopActivity } from "@/learn/activityProgress";
import { checkpointPresentation, type CheckpointIcon } from "@/learn/checkpointPresentation";
import { buildTrailView } from "@/learn/trailView";
import { learnerTerm } from "@/learn/vocabulary";

type Activity = ReturnType<typeof resolveStopActivity>;
type ActivityResult = LearnerGradingResult | LearnerMatchingResult | null;

// The activity surface (R9): a full-screen dialog with the SAME circular icon the
// opening checkpoint used (AE3), in-sheet advance memory so "Continue" walks stop to
// stop without touching the trail, and dismissal blocked while grading is pending (AE4).
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
  const [mutationPending, setMutationPending] = useState(false);
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
    <FullScreenDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      dismissBlocked={mutationPending}
    >
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <OverlayHeader
          icon={activity ? <ActivityHeaderIcon session={session} activity={activity} /> : <HelpCircle size={20} color={colors.ink} />}
          title={title}
          description={activity ? descriptionFor(activity.kind) : learnerTerm("nextStop")}
          onClose={close}
          closeDisabled={mutationPending}
          closeLabel="Close"
        />
        {activity ? (
          <ActivityController
            key={activeStopId}
            session={session}
            activity={activity}
            stopId={activeStopId}
            justAdvanced={localStop?.sourceStopId === stopId && activeStopId !== stopId}
            onAdvance={(nextStopId) => setLocalStop({ sourceStopId: stopId, activeStopId: nextStopId })}
            onDone={close}
            onPendingChange={setMutationPending}
          />
        ) : null}
      </View>
    </FullScreenDialog>
  );
}

// The header circle mirrors the checkpoint that opened the activity: same icon set,
// same crystal for a capstone (KTD4 single mapping via checkpointPresentation).
function ActivityHeaderIcon({ session, activity }: Readonly<{ session: StudySession; activity: Activity }>) {
  if (activity.kind === "missing") return <HelpCircle size={20} color={colors.ink} />;
  if (activity.kind === "capstone") {
    return (
      <CrystalGlyph
        derivedNodeId={activity.derivedNodeId}
        difficulty={activity.difficulty}
        growthFraction={activity.growthFraction}
        state={activity.mastered ? "mastered" : "frontier"}
        ghost={activity.isKnownSkipped}
        size={28}
      />
    );
  }
  const icon = checkpointPresentation({ kind: activity.kind, state: "available" }).icon;
  const Icon = HEADER_ICONS[icon as Exclude<CheckpointIcon, "crystal">] ?? HelpCircle;
  return <Icon size={20} color={colors.ink} />;
}

const HEADER_ICONS: Record<Exclude<CheckpointIcon, "crystal">, typeof BookOpen> = {
  lock: HelpCircle,
  book: BookOpen,
  "map-pin": MapPin,
  rows: Rows3,
  search: Search
};

function ActivityController({
  session,
  activity,
  stopId,
  justAdvanced,
  onAdvance,
  onDone,
  onPendingChange
}: Readonly<{
  session: StudySession;
  activity: Activity;
  stopId: string | null;
  justAdvanced: boolean;
  onAdvance: (stopId: string) => void;
  onDone: () => void;
  onPendingChange: (pending: boolean) => void;
}>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<ActivityResult>(null);
  const [pending, setPending] = useState(false);
  const graded = result?.graded === true;

  const run = (work: () => Promise<void>) => {
    setPending(true);
    onPendingChange(true);
    void work().finally(() => {
      setPending(false);
      onPendingChange(false);
    });
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
      let graded: ActivityResult = null;
      if (activity.kind === "option_select") {
        graded = await submitLearnerOptionSelect({
          enrichmentId: session.enrichmentId,
          studyItemId: activity.item.studyItemId,
          chosenOptionId: id
        });
      }
      if (activity.kind === "impostor") {
        graded = await submitLearnerImpostor({
          enrichmentId: session.enrichmentId,
          studyItemId: activity.item.studyItemId,
          chosenStatementId: id
        });
      }
      if (graded === null) return;
      setResult(graded);
      // The grading outcome is the semantic transition (R7): one haptic per fresh
      // grade — never on re-render or a cached correct result.
      if (graded.graded) triggerHaptic(graded.correct ? "success" : "warning");
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
          {result && !result.graded ? <Text variant="label" color="destructive" className="font-normal">{result.message}</Text> : null}
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
  if (activity.kind === "missing") return <Text variant="label" color="muted" className="font-normal">{activity.message}</Text>;
  if (activity.kind === "option_select") return <OptionSelectBody item={activity.item} selectedId={selectedId} result={isSelectionResult(result) ? result : null} disabled={pending} onSelect={onSelect} />;
  if (activity.kind === "matching") return <MatchingBoard item={activity.item} result={isMatchingResult(result) ? result : null} disabled={pending} onAttempt={onMatchingAttempt} onComplete={onMatchingComplete} />;
  if (activity.kind === "impostor") return <ImpostorBody item={activity.item} selectedId={selectedId} result={isSelectionResult(result) ? result : null} disabled={pending} onSelect={onSelect} />;
  if (activity.kind === "capstone") {
    return <CapstoneReveal activity={activity} justAdvanced={justAdvanced} />;
  }
  if (activity.lesson?.sections.length) return <LessonSections lesson={activity.lesson} />;
  return (
    <View className="rounded-card border border-line bg-card p-4">
      <Text variant="label" color="muted" className="font-normal">No field notes are available for this stop.</Text>
    </View>
  );
}

// The mastery reveal (U5, R14-R15): a capstone reached by advancing IN this sheet
// assembles its crystal facet-by-facet once, with one mastery haptic at that same
// transition. Reopening a mastered capstone — and any known-skipped capstone — renders
// the complete crystal statically with no haptic (AE7).
function CapstoneReveal({
  activity,
  justAdvanced
}: Readonly<{ activity: Extract<Activity, { kind: "capstone" }>; justAdvanced: boolean }>) {
  const assemble = justAdvanced && activity.mastered && !activity.isKnownSkipped;
  useEffect(() => {
    if (assemble) triggerHaptic("mastery");
    // The haptic belongs to the one just-mastered reveal; deps stay mount-scoped so a
    // re-render can never repeat it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View className="gap-3 rounded-card border border-line bg-card p-4">
      <View className="flex-row items-center gap-3">
        <CrystalGlyph
          derivedNodeId={activity.derivedNodeId}
          difficulty={activity.difficulty}
          growthFraction={activity.growthFraction}
          state={activity.mastered ? "mastered" : "frontier"}
          ghost={activity.isKnownSkipped}
          assemble={assemble}
          size={72}
        />
        <View className="min-w-0 flex-1">
          <Text variant="title" className="text-lg">{activity.isKnownSkipped ? learnerTerm("known") : activity.mastered ? learnerTerm("summit") : learnerTerm("capstone")}</Text>
          <Text variant="label" color="muted" className="font-normal">
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
      return <Button busy={pending} onPress={onContinue} label={learnerTerm("continueAction")} />;
    }
    return null;
  }
  if (activity.kind === "capstone") {
    return (
      <Button
        busy={pending}
        onPress={activity.mastered ? onContinue : onDone}
        label={activity.mastered ? learnerTerm("continueAction") : learnerTerm("returnToTrail")}
      />
    );
  }
  return (
    <Button
      busy={pending}
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
    <View className="flex-row items-center gap-2 self-start rounded-card border border-line bg-gem-soft px-3 py-2">
      <CheckCircle2 size={16} color={colors.ink} />
      <Text variant="label">
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

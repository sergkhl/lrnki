import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { BookOpen, CheckCircle2, Gem, HelpCircle, MapPin, Rows3, Search } from "lucide-react-native";
import type { ExplorableTermView, StudySession } from "@lrnki/application/projection";
import type { LearnerGradingResult, LearnerMatchingResult } from "@/lib/api";
import { hideScaffoldDetour, markLearnerLessonRead, refreshLearnerExpedition, requestScaffoldDetour, retryScaffoldDetour, submitLearnerImpostor, submitLearnerMatching, submitLearnerOptionSelect, validateLearnerMatchingAttempt } from "@/lib/actions";
import { Button, FullScreenDialog, OverlayHeader, Text, colors, triggerHaptic } from "@/ui";
import { ImpostorBody, OptionSelectBody } from "./ActivityCards";
import { LegFormationScene } from "./LegFormationScene";
import { LessonSections } from "./LessonSections";
import { MatchingBoard } from "./MatchingBoard";
import { SupportPathDialog, type SupportPathDialogState } from "./SupportPathDialog";
import { SupportPathsPanel } from "./SupportPathsPanel";
import type { ScaffoldTermSource } from "@/lib/actions";
import { activeStopFor, type AdvanceMemory } from "@/learn/advanceMemory";
import { buildLegPanel, formationInputFrom } from "@/learn/crystalFormationLayout";
import { resolveStopActivity } from "@lrnki/application/projection";
import { checkpointPresentation, type CheckpointIcon } from "@/learn/checkpointPresentation";
import { buildTrailView } from "@lrnki/application/projection";
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
  onOpenChange,
  onScaffoldRequested,
  onOpenDetour
}: Readonly<{
  session: StudySession;
  stopId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // A successful Explorable Term request (KTD5, F1): the sheet and its nested dialog close
  // first, then the parent opens root-owned progress/ready state for the returned detour id.
  onScaffoldRequested?: (detourId: string) => void;
  // `Open support path` on an already-ready term (R13): the sheet closes and the parent
  // opens the detour's own surface on the trail.
  onOpenDetour?: (detourId: string) => void;
}>) {
  const [localStop, setLocalStop] = useState<AdvanceMemory>(null);
  const [mutationPending, setMutationPending] = useState(false);
  // The nested state-aware Support Path dialog (KTD4/KTD5): one dialog for taps from BOTH
  // inline theory terms and the panel. It sits above this Activity Sheet only for contextual
  // inspection and cancellation; request acceptance stages the root handoff.
  const [dialogTerm, setDialogTerm] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const activeStopId = activeStopFor(localStop, stopId);
  const activity = activeStopId ? resolveStopActivity(session, activeStopId) : null;
  const title = activity && activity.kind !== "missing" ? activity.label : "Trail stop";
  const close = () => {
    // Closing drops the in-sheet advance memory, so re-opening an earlier stop
    // opens that stop's own activity instead of the one it advanced to.
    setLocalStop(null);
    setDialogTerm(null);
    setRequestError(null);
    onOpenChange(false);
  };

  const termContext = activity ? termContextFor(activity) : null;
  // The dialog derives its state from the LIVE projected support of the tapped term, so
  // polling refreshes (generating → ready) flow into an open dialog with no local machine.
  const dialogTermView = dialogTerm !== null ? termContext?.terms.find((entry) => entry.term === dialogTerm) ?? null : null;
  const openTermDialog = (term: string) => {
    setRequestError(null);
    setDialogTerm(term);
  };
  const requestSupport = () => {
    if (!termContext || dialogTerm === null || requesting) return;
    setRequesting(true);
    setRequestError(null);
    void requestScaffoldDetour({ enrichmentId: session.enrichmentId, source: termContext.source, term: dialogTerm })
      .then((outcome) => {
        if (outcome.created) {
          // Staged handoff (KTD5): close the nested dialog and this activity, THEN the root
          // opens progress or ready state from the returned durable detour.
          setDialogTerm(null);
          close();
          onScaffoldRequested?.(outcome.detourId);
        } else {
          setRequestError(learnerTerm("termRequestFailed"));
        }
      })
      .catch(() => setRequestError(learnerTerm("termRequestFailed")))
      .finally(() => setRequesting(false));
  };

  return (
    <FullScreenDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      dismissBlocked={mutationPending}
    >
      <OverlayHeader
        icon={activity ? <ActivityHeaderIcon activity={activity} /> : <HelpCircle size={20} color={colors.ink} />}
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
          supportSlot={
            termContext ? (
              <SupportPathsPanel
                terms={termContext.terms}
                busyTerm={requesting ? dialogTerm : null}
                onSelect={openTermDialog}
              />
            ) : null
          }
          onPressTerm={openTermDialog}
          onAdvance={(nextStopId) => setLocalStop({ sourceStopId: stopId, activeStopId: nextStopId })}
          onDone={close}
          onPendingChange={setMutationPending}
        />
      ) : null}
      {dialogTerm !== null ? (
        <SupportPathDialog
          open
          onOpenChange={(next) => {
            // Cancel restores reading focus in this sheet (KTD5); the term stays highlighted.
            if (!next && !requesting) setDialogTerm(null);
          }}
          term={dialogTerm}
          state={dialogStateFor(dialogTermView, requesting)}
          error={requestError}
          onRequest={requestSupport}
          onRetry={() => {
            if (dialogTermView?.support.kind === "failed") {
              void retryScaffoldDetour({ enrichmentId: session.enrichmentId, detourId: dialogTermView.support.detourId });
            }
          }}
          onDismiss={() => {
            // Dismissing a failed path hides the preserved detour; its term returns to the
            // panels as available (F4) and the open dialog follows the projection there.
            if (dialogTermView?.support.kind === "failed") {
              void hideScaffoldDetour({ enrichmentId: session.enrichmentId, detourId: dialogTermView.support.detourId });
            }
          }}
          onOpenPath={() => {
            if (dialogTermView?.support.kind === "ready") {
              const detourId = dialogTermView.support.detourId;
              setDialogTerm(null);
              close();
              onOpenDetour?.(detourId);
            }
          }}
        />
      ) : null}
    </FullScreenDialog>
  );
}

// Map a projected term's live support state (plus the in-flight request) onto the dialog's
// presentation state. A term that vanished from the context (activity changed) renders as
// available; the dialog is closed by then anyway.
function dialogStateFor(view: ExplorableTermView | null, requesting: boolean): SupportPathDialogState {
  if (requesting) return { kind: "requesting" };
  const support = view?.support;
  if (!support || support.kind === "available") return { kind: "available" };
  if (support.kind === "generating") return { kind: "generating", phase: support.phase };
  if (support.kind === "failed") return { kind: "failed" };
  return { kind: "ready", complete: support.complete };
}

// The header circle mirrors the checkpoint that opened the activity: same icon set,
// a universal gem status icon for a capstone — a detailed specimen is unreadable at
// this size (U1, R14); the capstone card below carries the real specimen.
function ActivityHeaderIcon({ activity }: Readonly<{ activity: Activity }>) {
  if (activity.kind === "missing") return <HelpCircle size={20} color={colors.ink} />;
  if (activity.kind === "capstone") {
    return <Gem size={20} color={activity.mastered && !activity.isKnownSkipped ? colors.gem : colors.ink} />;
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
  supportSlot,
  onPressTerm,
  onAdvance,
  onDone,
  onPendingChange
}: Readonly<{
  session: StudySession;
  activity: Activity;
  stopId: string | null;
  justAdvanced: boolean;
  supportSlot: ReactNode;
  onPressTerm: (term: string) => void;
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
          <ActivityBody session={session} activity={activity} selectedId={selectedId} result={result} pending={pending} justAdvanced={justAdvanced} supportSlot={supportSlot} onPressTerm={onPressTerm} onSelect={submitSelection} onMatchingAttempt={validateMatching} onMatchingComplete={submitMatching} />
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
  session,
  activity,
  selectedId,
  result,
  pending,
  justAdvanced,
  supportSlot,
  onPressTerm,
  onSelect,
  onMatchingAttempt,
  onMatchingComplete
}: Readonly<{
  session: StudySession;
  activity: Activity;
  selectedId: string | null;
  result: ActivityResult;
  pending: boolean;
  justAdvanced: boolean;
  supportSlot: ReactNode;
  onPressTerm: (term: string) => void;
  onSelect: (id: string) => void;
  onMatchingAttempt: (promptId: string, matchId: string) => Promise<boolean>;
  onMatchingComplete: (trace: { promptId: string; chosenMatchId: string }[]) => Promise<void>;
}>) {
  if (activity.kind === "missing") return <Text variant="label" color="muted" className="font-normal">{activity.message}</Text>;
  // Graded activities place the panel between the question stem and the answer controls
  // (R7): support is discoverable before the learner commits an answer. Question stems get
  // no inline highlighting.
  if (activity.kind === "option_select") return <OptionSelectBody item={activity.item} selectedId={selectedId} result={isSelectionResult(result) ? result : null} disabled={pending} supportSlot={supportSlot} onSelect={onSelect} />;
  if (activity.kind === "matching") return <MatchingBoard item={activity.item} result={isMatchingResult(result) ? result : null} disabled={pending} supportSlot={supportSlot} onAttempt={onMatchingAttempt} onComplete={onMatchingComplete} />;
  if (activity.kind === "impostor") return <ImpostorBody item={activity.item} selectedId={selectedId} result={isSelectionResult(result) ? result : null} disabled={pending} supportSlot={supportSlot} onSelect={onSelect} />;
  if (activity.kind === "capstone") {
    return <CapstoneReveal session={session} activity={activity} justAdvanced={justAdvanced} />;
  }
  // Theory: inline first-occurrence highlights in the prose (R5-R6) with the persistent
  // panel FOLLOWING the content as the large-target inventory (R7).
  if (activity.lesson?.sections.length) {
    return (
      <>
        <LessonSections lesson={activity.lesson} onPressTerm={onPressTerm} />
        {supportSlot}
      </>
    );
  }
  return (
    <View className="rounded-card border border-line bg-card p-4">
      <Text variant="label" color="muted" className="font-normal">No field notes are available for this stop.</Text>
    </View>
  );
}

// The formation panel inset the capstone card hosts: narrow enough to sit inside the sheet card at a
// 320 px phone, wide enough for three charted cells per row.
const CAPSTONE_PANEL_WIDTH = 264;

// The mastery collection reward (plan 2026-07-15-002 U3, R16/KTD5-KTD6): a capstone
// reached by advancing IN this sheet renders a focused crop of the concept's SHARED Leg
// scene — only the new specimen rises into its deterministic slot, existing specimens
// stay still, and one mastery haptic fires at that same in-sheet transition. Reopening a
// mastered capstone — and any known-skipped capstone — renders the settled scene
// statically with no haptic (AE2/AE7). No gem flies between screens.
function CapstoneReveal({
  session,
  activity,
  justAdvanced
}: Readonly<{ session: StudySession; activity: Extract<Activity, { kind: "capstone" }>; justAdvanced: boolean }>) {
  const collected = justAdvanced && activity.mastered && !activity.isKnownSkipped;
  useEffect(() => {
    if (collected) triggerHaptic("mastery");
    // The haptic belongs to the one just-mastered reveal; deps stay mount-scoped so a
    // re-render can never repeat it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const panel = useMemo(() => {
    const input = formationInputFrom(session, buildTrailView(session));
    const sectionIndex = input.concepts.find((concept) => concept.derivedNodeId === activity.derivedNodeId)?.sectionIndex;
    const section = input.sections.find((candidate) => candidate.sectionIndex === sectionIndex);
    if (section === undefined) return null;
    // The capstone frames the concept's WHOLE Leg panel at a fixed card-friendly width.
    return buildLegPanel(
      section,
      input.concepts.filter((concept) => concept.sectionIndex === sectionIndex),
      CAPSTONE_PANEL_WIDTH,
      input.nextDerivedNodeId
    );
  }, [session, activity.derivedNodeId]);
  return (
    <View className="gap-3 rounded-card border border-line bg-card p-4">
      {panel ? (
        // The panel shares the warm formation ground used everywhere (KTD2).
        <View className="items-center rounded-card bg-cavern p-2">
          <LegFormationScene
            panel={panel}
            mode="collection"
            enteringNodeId={collected ? activity.derivedNodeId : null}
          />
        </View>
      ) : null}
      <View className="min-w-0">
        <Text variant="title" className="text-lg">{activity.isKnownSkipped ? learnerTerm("known") : activity.mastered ? learnerTerm("capstoneCollected") : learnerTerm("capstone")}</Text>
        <Text variant="label" color="muted" className="font-normal">
          {activity.isKnownSkipped
            ? "Known ground is complete, but no crystal is collected."
            : activity.mastered
              ? "This crystal now sits in its leg's formation."
              : "Complete the earlier stops to finish growing this crystal."}
        </Text>
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

// The Explorable Term source + advertised term views for the current activity (R1-R4). A
// theory stop's terms are its lesson's anchored term views (keyed by node); a question
// stop's terms are the item's (keyed by the study item). Each view carries its finished
// support state (KTD1), so the panel and the dialog never rebuild detour policy. Capstone,
// missing, and term-less activities expose no support surface (AE8).
function termContextFor(activity: Activity): { source: ScaffoldTermSource; terms: ExplorableTermView[] } | null {
  if (activity.kind === "theory") {
    const terms = activity.lesson?.explorableTerms ?? [];
    return terms.length ? { source: { kind: "lesson", derivedNodeId: activity.derivedNodeId }, terms } : null;
  }
  if (activity.kind === "option_select" || activity.kind === "impostor" || activity.kind === "matching") {
    const terms = activity.item.explorableTerms;
    return terms.length ? { source: { kind: "study_item", studyItemId: activity.item.studyItemId }, terms } : null;
  }
  return null;
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

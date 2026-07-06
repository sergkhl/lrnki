"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon } from "lucide-react";
import type { StudySession } from "@lrnki/application";
import type { LearnerGradingResult, LearnerMatchingResult } from "@/app/learn/actions";
import { markLearnerLessonRead, refreshLearnerExpedition, submitLearnerImpostor, submitLearnerMatching, submitLearnerOptionSelect, validateLearnerMatchingAttempt } from "@/app/learn/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ImpostorBody, OptionSelectBody } from "./ActivityCards";
import { CrystalGlyph } from "./CrystalGlyph";
import { LessonSections } from "./LessonSections";
import { MatchingBoard } from "./MatchingBoard";
import { resolveStopActivity } from "./activityProgress";
import { buildTrailView } from "./trailView";
import { learnerTerm } from "./vocabulary";

type Activity = ReturnType<typeof resolveStopActivity>;
type ActivityResult = LearnerGradingResult | LearnerMatchingResult | null;

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
  const [localStop, setLocalStop] = useState<{ sourceStopId: string | null; activeStopId: string | null } | null>(null);
  const activeStopId = localStop?.sourceStopId === stopId ? localStop.activeStopId : stopId;
  const activity = activeStopId ? resolveStopActivity(session, activeStopId) : null;
  const title = activity && activity.kind !== "missing" ? activity.label : "Trail stop";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!inset-0 !h-dvh !w-dvw !max-w-none gap-0 overflow-hidden border-0 bg-[color:var(--journal-background)] p-0 sm:!max-w-none"
      >
        <SheetHeader className="shrink-0 border-b border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] px-4 py-3 pr-12">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{activity ? descriptionFor(activity.kind) : learnerTerm("nextStop")}</SheetDescription>
        </SheetHeader>
        {activity ? (
          <ActivityController
            key={activeStopId}
            session={session}
            activity={activity}
            stopId={activeStopId}
            justAdvanced={localStop?.sourceStopId === stopId && activeStopId !== stopId}
            onAdvance={(nextStopId) => setLocalStop({ sourceStopId: stopId, activeStopId: nextStopId })}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
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
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<ActivityResult>(null);
  const [pending, startTransition] = useTransition();
  const graded = result?.graded === true;

  const nextStopId = () => {
    if (!stopId) return null;
    const stops = buildTrailView(session).concepts.flatMap((concept) => concept.stops);
    const currentIndex = stops.findIndex((stop) => stop.stopId === stopId);
    if (currentIndex < 0) return null;
    return stops.slice(currentIndex + 1).find((stop) => stop.state !== "locked")?.stopId ?? null;
  };

  const continueAfterRefresh = () => {
    startTransition(async () => {
      if (activity.kind === "theory") {
        await markLearnerLessonRead({
          learnerStateRef: session.learnerStateRef,
          enrichmentId: session.enrichmentId,
          derivedNodeId: activity.derivedNodeId
        });
      }
      await refreshLearnerExpedition({ learnerStateRef: session.learnerStateRef, enrichmentId: session.enrichmentId });
      router.refresh();
      const next = nextStopId();
      if (!next) onDone();
      else onAdvance(next);
    });
  };

  const submitSelection = (id: string) => {
    if (pending || graded) return;
    setSelectedId(id);
    startTransition(async () => {
      if (activity.kind === "option_select") {
        setResult(await submitLearnerOptionSelect({
          learnerStateRef: session.learnerStateRef,
          enrichmentId: session.enrichmentId,
          studyItemId: activity.item.studyItemId,
          chosenOptionId: id
        }));
      }
      if (activity.kind === "impostor") {
        setResult(await submitLearnerImpostor({
          learnerStateRef: session.learnerStateRef,
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
      learnerStateRef: session.learnerStateRef,
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
      learnerStateRef: session.learnerStateRef,
      enrichmentId: session.enrichmentId,
      studyItemId: activity.item.studyItemId,
      trace
    }));
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
          <CompletedIndicator session={session} activity={activity} result={result} />
          <ActivityBody activity={activity} selectedId={selectedId} result={result} pending={pending} justAdvanced={justAdvanced} onSelect={submitSelection} onMatchingAttempt={validateMatching} onMatchingComplete={submitMatching} />
          {result && !result.graded ? <p className="text-sm text-destructive">{result.message}</p> : null}
        </div>
      </div>
      <SheetFooter className="shrink-0 border-t border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-3xl justify-end">
          <FooterButton
            activity={activity}
            pending={pending}
            graded={graded}
            onContinue={continueAfterRefresh}
            onDone={onDone}
          />
        </div>
      </SheetFooter>
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
  if (activity.kind === "missing") return <p className="text-sm text-muted-foreground">{activity.message}</p>;
  if (activity.kind === "option_select") return <OptionSelectBody item={activity.item} selectedId={selectedId} result={isSelectionResult(result) ? result : null} disabled={pending} onSelect={onSelect} />;
  if (activity.kind === "matching") return <MatchingBoard item={activity.item} result={isMatchingResult(result) ? result : null} disabled={pending} onAttempt={onMatchingAttempt} onComplete={onMatchingComplete} />;
  if (activity.kind === "impostor") return <ImpostorBody item={activity.item} selectedId={selectedId} result={isSelectionResult(result) ? result : null} disabled={pending} onSelect={onSelect} />;
  if (activity.kind === "capstone") {
    // The mastery reveal: the concept's crystal assembles facet by facet, then the
    // glint seals it (one-shot, gated on the just-mastered transition).
    return (
      <section className="flex flex-col gap-3 rounded-md border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-4">
        <div className="flex items-center gap-3">
          <CrystalGlyph
            derivedNodeId={activity.derivedNodeId}
            difficulty={activity.difficulty}
            growthFraction={activity.growthFraction}
            state={activity.mastered ? "mastered" : "frontier"}
            ghost={activity.isKnownSkipped}
            size={72}
            assemble={justAdvanced && activity.mastered && !activity.isKnownSkipped}
            className="shrink-0"
          />
          <div>
            <h2 className="text-lg font-semibold">{activity.isKnownSkipped ? learnerTerm("known") : activity.mastered ? learnerTerm("summit") : learnerTerm("capstone")}</h2>
            <p className="text-sm text-muted-foreground">
              {activity.isKnownSkipped
                ? "Known ground is complete, but no crystal is collected."
                : activity.mastered
                  ? "This crystal is collected."
                  : "Complete the earlier stops to finish growing this crystal."}
            </p>
          </div>
        </div>
      </section>
    );
  }
  if (activity.lesson?.sections.length) return <LessonSections lesson={activity.lesson} />;
  return (
    <section className="rounded-md border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-4">
      <p className="text-sm text-muted-foreground">No field notes are available for this stop.</p>
    </section>
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
      return (
        <Button type="button" disabled={pending} onClick={onContinue}>
          {learnerTerm("continueAction")}
        </Button>
      );
    }
    return null;
  }
  if (activity.kind === "capstone") {
    return (
      <Button type="button" disabled={pending} onClick={activity.mastered ? onContinue : onDone}>
        {activity.mastered ? learnerTerm("continueAction") : learnerTerm("returnToTrail")}
      </Button>
    );
  }
  return (
    <Button type="button" disabled={pending} onClick={activity.kind === "missing" ? onDone : onContinue}>
      {learnerTerm("continueAction")}
    </Button>
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
    <div className="flex w-fit items-center gap-2 rounded-md border border-[color:var(--journal-line)] bg-[color:var(--journal-gem-soft)] px-3 py-2 text-sm font-medium text-[color:var(--journal-ink)]">
      <CheckCircle2Icon className="size-4" />
      {activity.kind === "capstone" && activity.isKnownSkipped ? learnerTerm("known") : learnerTerm("mastered")}
    </div>
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

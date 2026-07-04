"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GemIcon } from "lucide-react";
import type { StudySession } from "@lrnki/application";
import type { LearnerGradingResult } from "@/app/learn/[learnerStateRef]/actions";
import { refreshLearnerExpedition, submitLearnerImpostor, submitLearnerOptionSelect } from "@/app/learn/[learnerStateRef]/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ImpostorBody, OptionSelectBody } from "./ActivityCards";
import { LessonSections } from "./LessonSections";
import { resolveStopActivity } from "./activityProgress";
import { learnerTerm } from "./vocabulary";

type Activity = ReturnType<typeof resolveStopActivity>;
type ActivityResult = LearnerGradingResult | null;

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
  const activity = stopId ? resolveStopActivity(session, stopId) : null;
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
            key={stopId}
            session={session}
            activity={activity}
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
  onDone
}: Readonly<{ session: StudySession; activity: Activity; onDone: () => void }>) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<ActivityResult>(null);
  const [pending, startTransition] = useTransition();
  const graded = result?.graded === true;
  const canCheck = (activity.kind === "option_select" || activity.kind === "impostor") && selectedId !== null && !graded && !pending;

  const closeAfterRefresh = () => {
    startTransition(async () => {
      await refreshLearnerExpedition({ learnerStateRef: session.learnerStateRef, enrichmentId: session.enrichmentId });
      router.refresh();
      onDone();
    });
  };

  const check = () => {
    if (!canCheck || !selectedId) return;
    startTransition(async () => {
      if (activity.kind === "option_select") {
        setResult(await submitLearnerOptionSelect({
          learnerStateRef: session.learnerStateRef,
          enrichmentId: session.enrichmentId,
          studyItemId: activity.item.studyItemId,
          chosenOptionId: selectedId
        }));
      }
      if (activity.kind === "impostor") {
        setResult(await submitLearnerImpostor({
          learnerStateRef: session.learnerStateRef,
          enrichmentId: session.enrichmentId,
          studyItemId: activity.item.studyItemId,
          chosenStatementId: selectedId
        }));
      }
    });
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
          <ActivityBody activity={activity} selectedId={selectedId} result={result} onSelect={setSelectedId} />
          {result && !result.graded ? <p className="text-sm text-destructive">{result.message}</p> : null}
        </div>
      </div>
      <SheetFooter className="shrink-0 border-t border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-4">
        <div className="mx-auto flex w-full max-w-3xl justify-end">
          <FooterButton
            activity={activity}
            pending={pending}
            canCheck={canCheck}
            graded={graded}
            onCheck={check}
            onContinue={closeAfterRefresh}
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
  onSelect
}: Readonly<{
  activity: Activity;
  selectedId: string | null;
  result: ActivityResult;
  onSelect: (id: string) => void;
}>) {
  if (activity.kind === "missing") return <p className="text-sm text-muted-foreground">{activity.message}</p>;
  if (activity.kind === "option_select") return <OptionSelectBody item={activity.item} selectedId={selectedId} result={result} onSelect={onSelect} />;
  if (activity.kind === "impostor") return <ImpostorBody item={activity.item} selectedId={selectedId} result={result} onSelect={onSelect} />;
  if (activity.kind === "capstone") {
    return (
      <section className="flex flex-col gap-3 rounded-md border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-4">
        <div className="flex items-center gap-3">
          <GemIcon />
          <div>
            <h2 className="text-lg font-semibold">{activity.mastered ? learnerTerm("summit") : learnerTerm("capstone")}</h2>
            <p className="text-sm text-muted-foreground">
              {activity.mastered ? "This gem is collected." : "Collect the earlier stops to unlock this gem."}
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
  canCheck,
  graded,
  onCheck,
  onContinue,
  onDone
}: Readonly<{
  activity: Activity;
  pending: boolean;
  canCheck: boolean;
  graded: boolean;
  onCheck: () => void;
  onContinue: () => void;
  onDone: () => void;
}>) {
  if (activity.kind === "option_select" || activity.kind === "impostor") {
    if (graded) {
      return (
        <Button type="button" disabled={pending} onClick={onContinue}>
          {learnerTerm("continueAction")}
        </Button>
      );
    }
    return (
      <Button type="button" disabled={!canCheck} onClick={onCheck}>
        {learnerTerm("submitAnswer")}
      </Button>
    );
  }
  if (activity.kind === "capstone") {
    return (
      <Button type="button" onClick={onDone}>
        {learnerTerm("returnToTrail")}
      </Button>
    );
  }
  return (
    <Button type="button" disabled={pending} onClick={activity.kind === "missing" ? onDone : onContinue}>
      {learnerTerm("continueAction")}
    </Button>
  );
}

function descriptionFor(kind: Activity["kind"]): string {
  if (kind === "theory") return learnerTerm("theoryStop");
  if (kind === "option_select") return learnerTerm("question");
  if (kind === "impostor") return learnerTerm("spotTheFake");
  if (kind === "capstone") return learnerTerm("capstone");
  return learnerTerm("nextStop");
}

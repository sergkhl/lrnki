"use client";

import { useTransition } from "react";
import { CheckCircle2Icon, GemIcon } from "lucide-react";
import type { StudySession } from "@lrnki/application";
import { refreshLearnerExpedition, setLearnerVerdict } from "@/app/learn/[learnerStateRef]/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OptionSelectActivity, ImpostorActivity } from "./ActivityCards";
import { resolveStopActivity } from "./activityProgress";
import { learnerTerm } from "./vocabulary";

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
        className="!inset-0 !h-dvh !w-dvw !max-w-none overflow-y-auto border-0 bg-[color:var(--journal-bg)] p-0 sm:!max-w-none"
      >
        <SheetHeader className="border-b border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] px-4 py-3">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{activity ? descriptionFor(activity.kind) : learnerTerm("nextStop")}</SheetDescription>
        </SheetHeader>
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
          {activity ? <ActivityContent session={session} activity={activity} onDone={() => onOpenChange(false)} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ActivityContent({
  session,
  activity,
  onDone
}: Readonly<{ session: StudySession; activity: ReturnType<typeof resolveStopActivity>; onDone: () => void }>) {
  const [pending, startTransition] = useTransition();
  if (activity.kind === "missing") return <p className="text-sm text-muted-foreground">{activity.message}</p>;
  if (activity.kind === "option_select") return <OptionSelectActivity session={session} item={activity.item} />;
  if (activity.kind === "impostor") return <ImpostorActivity session={session} item={activity.item} />;
  if (activity.kind === "capstone") {
    return (
      <section className="flex flex-col gap-3 rounded-md border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-4">
        <div className="flex items-center gap-3">
          <GemIcon />
          <div>
            <h2 className="text-lg font-semibold">{activity.mastered ? learnerTerm("summit") : learnerTerm("capstone")}</h2>
            <p className="text-sm text-muted-foreground">{activity.mastered ? "This gem is collected." : "Collect the earlier stops to unlock this gem."}</p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={onDone}>Return to trail</Button>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3 rounded-md border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{learnerTerm("theoryStop")}</Badge>
        <Badge variant="outline">{activity.lesson?.sections.length ?? 0} notes</Badge>
      </div>
      {activity.lesson?.sections.length ? activity.lesson.sections.map((section, index) => (
        <article key={`${section.kind}:${index}`} className="rounded-md border border-[color:var(--journal-line)] bg-background/60 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline">{section.kind}</Badge>
            <Badge variant={section.isSourceCited ? "secondary" : "outline"}>{section.isSourceCited ? "source" : "generated"}</Badge>
          </div>
          <p className="text-sm leading-6">{section.text}</p>
        </article>
      )) : <p className="text-sm text-muted-foreground">No field notes are available for this stop.</p>}
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            await setLearnerVerdict({
              learnerStateRef: session.learnerStateRef,
              enrichmentId: session.enrichmentId,
              derivedNodeId: activity.derivedNodeId,
              verdict: "known"
            });
            await refreshLearnerExpedition({ learnerStateRef: session.learnerStateRef, enrichmentId: session.enrichmentId });
            onDone();
          });
        }}
      >
        <CheckCircle2Icon data-icon="inline-start" />
        {learnerTerm("skipKnown")}
      </Button>
    </section>
  );
}

function descriptionFor(kind: ReturnType<typeof resolveStopActivity>["kind"]): string {
  if (kind === "theory") return learnerTerm("theoryStop");
  if (kind === "option_select") return "Question";
  if (kind === "impostor") return "Spot the fake";
  if (kind === "capstone") return learnerTerm("capstone");
  return learnerTerm("nextStop");
}

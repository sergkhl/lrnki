import { ArrowRightIcon, CompassIcon, MapIcon, PlusIcon } from "lucide-react";
import type { ExpeditionCandidate, LearnerExpeditionEntry } from "@lrnki/application";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { learnerTerm } from "./vocabulary";
import { chooseCandidateExpedition, setActiveExpedition, startTopicExpedition, switchLearner } from "@/app/learn/actions";
import { ChartingProgress } from "./ChartingProgress";
import { ChartCourseForm } from "./ChartCourseForm";
import { resumeLabel } from "./resumeLabel";

export function ExpeditionEntry({
  learnerStateRef,
  entry
}: Readonly<{ learnerStateRef: string; entry: LearnerExpeditionEntry }>) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Badge variant="outline" className="w-fit border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
          <CompassIcon data-icon="inline-start" />
          {learnerTerm("routeName")}
        </Badge>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-normal">Choose an expedition</h1>
            <p className="truncate text-sm text-muted-foreground">Exploring as {learnerStateRef}</p>
          </div>
          <form action={switchLearner}>
            <Button type="submit" variant="ghost" size="sm">
              Switch explorer
            </Button>
          </form>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {entry.candidates.length === 0 ? <NoCandidates /> : entry.candidates.map((candidate) => (
          <CandidateCard key={candidate.enrichmentId} learnerStateRef={learnerStateRef} candidate={candidate} />
        ))}
      </section>

      <section className="grid gap-4">
        <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Your expeditions</CardTitle>
              <CardDescription>Ready and surveying journals for this explorer.</CardDescription>
            </div>
            <Dialog>
              <DialogTrigger type="button" className={cn(buttonVariants({ size: "sm" }))}>
                <PlusIcon data-icon="inline-start" />
                Plan a new expedition
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Plan a new expedition</DialogTitle>
                  <DialogDescription>Start with a topic. The field is inferred before surveying begins.</DialogDescription>
                </DialogHeader>
                <ChartCourseForm learnerStateRef={learnerStateRef} createExpeditionAction={startTopicExpedition} />
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {entry.learnerExpeditions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expeditions yet.</p>
            ) : entry.learnerExpeditions.map((expedition) => expedition.status === "charting" || expedition.status === "failed" ? (
              <ChartingProgress key={expedition.learnerExpeditionId} expedition={expedition} />
            ) : (
              <form key={expedition.learnerExpeditionId} action={async () => {
                "use server";
                await setActiveExpedition({
                  learnerStateRef,
                  learnerExpeditionId: expedition.learnerExpeditionId,
                  enrichmentId: expedition.enrichmentId
                });
              }} className="flex items-center gap-3 rounded-md border border-[color:var(--journal-line)] bg-[color:var(--journal-panel)] p-3">
                <MapIcon />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{expedition.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{expedition.declaredDomain}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {expedition.status === "ready" && expedition.progress
                      ? `${expedition.progress.itemsPassed} of ${expedition.progress.itemsTotal} collected`
                      : expeditionStatusLabel(expedition.status)}
                    {expedition.active ? " · active" : ""}
                  </p>
                  {expedition.status === "ready" && expedition.progress ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--journal-line)]">
                      <div
                        className="h-full rounded-full bg-[color:var(--journal-gem)]"
                        style={{ width: `${expedition.progress.itemsTotal === 0 ? 0 : Math.round((expedition.progress.itemsPassed / expedition.progress.itemsTotal) * 100)}%` }}
                      />
                    </div>
                  ) : null}
                </div>
                <Button type="submit" size="sm" variant={expedition.active ? "secondary" : "outline"} disabled={expedition.status !== "ready"}>
                  <ArrowRightIcon data-icon="inline-start" />
                  {resumeLabel(expedition.progress)}
                </Button>
              </form>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function expeditionStatusLabel(status: LearnerExpeditionEntry["learnerExpeditions"][number]["status"]): string {
  if (status === "ready") return "Ready";
  if (status === "charting") return "Surveying";
  if (status === "failed") return "Surveying stopped";
  return "Archived";
}

function CandidateCard({ learnerStateRef, candidate }: Readonly<{ learnerStateRef: string; candidate: ExpeditionCandidate }>) {
  return (
    <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
      <CardHeader>
        <Badge variant="secondary" className="w-fit">{titleCase(candidate.declaredDomain)}</Badge>
        <CardTitle className="text-xl">Expedition: {candidate.title}</CardTitle>
        <CardDescription>
          {candidate.totalStopCount} concepts to the summit
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={async () => {
          "use server";
          await chooseCandidateExpedition({
            learnerStateRef,
            enrichmentId: candidate.enrichmentId,
            title: candidate.title,
            declaredDomain: candidate.declaredDomain
          });
        }}>
          <Button type="submit" className="w-full">
            <CompassIcon data-icon="inline-start" />
            Begin
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function NoCandidates() {
  return (
    <Card className="md:col-span-3 border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
      <CardContent className="pt-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No ready expeditions</EmptyTitle>
            <EmptyDescription>Paste course data to create the first trail.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  );
}

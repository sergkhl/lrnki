import { ArrowRightIcon, CompassIcon, MapIcon } from "lucide-react";
import type { ExpeditionCandidate, LearnerExpeditionEntry } from "@lrnki/application";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { learnerTerm } from "./vocabulary";
import { chooseCandidateExpedition, inferExpeditionDomain, setActiveExpedition, startTopicExpedition } from "@/app/learn/[learnerStateRef]/actions";
import { ChartingProgress } from "./ChartingProgress";
import { ChartCourseForm } from "./ChartCourseForm";

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
        <h1 className="text-3xl font-semibold tracking-normal">Choose an expedition</h1>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {entry.candidates.length === 0 ? <NoCandidates /> : entry.candidates.map((candidate) => (
          <CandidateCard key={`${candidate.enrichmentId}:${candidate.target.derivedNodeId}`} learnerStateRef={learnerStateRef} candidate={candidate} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
          <CardHeader>
            <CardTitle>Your expeditions</CardTitle>
            <CardDescription>Ready and charting journals for this explorer.</CardDescription>
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
                  <p className="truncate text-xs text-muted-foreground">{expeditionStatusLabel(expedition.status)}{expedition.active ? " · active" : ""}</p>
                </div>
                <Button type="submit" size="sm" variant={expedition.active ? "secondary" : "outline"} disabled={expedition.status !== "ready"}>
                  <ArrowRightIcon data-icon="inline-start" />
                  Open
                </Button>
              </form>
            ))}
          </CardContent>
        </Card>

        <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
          <CardHeader>
            <CardTitle>Chart a new course</CardTitle>
            <CardDescription>Start with a topic, then confirm the field before charting.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ChartCourseForm
              learnerStateRef={learnerStateRef}
              inferDomainAction={inferExpeditionDomain}
              createExpeditionAction={startTopicExpedition}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function expeditionStatusLabel(status: LearnerExpeditionEntry["learnerExpeditions"][number]["status"]): string {
  if (status === "ready") return "Ready";
  if (status === "charting") return "Charting";
  if (status === "failed") return "Charting stopped";
  return "Archived";
}

function CandidateCard({ learnerStateRef, candidate }: Readonly<{ learnerStateRef: string; candidate: ExpeditionCandidate }>) {
  return (
    <Card className="border-[color:var(--journal-line)] bg-[color:var(--journal-panel)]">
      <CardHeader>
        <Badge variant="secondary" className="w-fit">Rank {candidate.readinessRank}</Badge>
        <CardTitle className="text-xl">{candidate.title}</CardTitle>
        <CardDescription>
          {candidate.target.readyNodeCount}/{candidate.target.questNodeCount} stops ready
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={async () => {
          "use server";
          await chooseCandidateExpedition({
            learnerStateRef,
            enrichmentId: candidate.enrichmentId,
            targetDerivedNodeId: candidate.target.derivedNodeId,
            title: candidate.title,
            declaredDomain: candidate.target.declaredDomain
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

import { ArrowRightIcon, CompassIcon, MapIcon } from "lucide-react";
import type { ExpeditionCandidate, LearnerExpeditionEntry } from "@lrnki/application";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { expeditionStatusLabel, learnerTerm } from "./vocabulary";
import { chooseCandidateExpedition, setActiveExpedition, startTopicExpedition, switchLearner } from "@/app/learn/actions";
import { GenerationProgressCard } from "./GenerationProgressCard";
import { PlanExpeditionDialog } from "./PlanExpeditionDialog";
import { resumeLabel } from "./resumeLabel";

const EXAMPLE_TOPICS = [
  "Game Theory",
  "Rust ownership",
  "Bayesian statistics",
  "Supply chain resilience",
  "Database indexing",
  "Photosynthesis",
  "Contract law basics",
  "Climate feedback loops",
  "Classical conditioning",
  "Cryptographic signatures",
  "Cellular respiration",
  "Linear algebra intuition",
  "Urban transit planning",
  "Macroeconomic inflation",
  "Distributed systems consensus",
  "Renaissance art history"
] as const;

export function ExpeditionEntry({
  learnerStateRef,
  entry
}: Readonly<{ learnerStateRef: string; entry: LearnerExpeditionEntry }>) {
  const exampleTopics = pickExampleTopics(EXAMPLE_TOPICS, 4);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Badge variant="outline" className="w-fit border-border bg-card">
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
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Your expeditions</CardTitle>
              <CardDescription>Ready and scouting journals for this explorer.</CardDescription>
            </div>
            <PlanExpeditionDialog
              learnerStateRef={learnerStateRef}
              exampleTopics={exampleTopics}
              createExpeditionAction={startTopicExpedition}
            />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {entry.learnerExpeditions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expeditions yet.</p>
            ) : entry.learnerExpeditions.map((expedition) => expedition.status === "generating" || expedition.status === "failed" ? (
              <GenerationProgressCard key={expedition.learnerExpeditionId} expedition={expedition} />
            ) : (
              <form key={expedition.learnerExpeditionId} action={async () => {
                "use server";
                await setActiveExpedition({
                  learnerStateRef,
                  learnerExpeditionId: expedition.learnerExpeditionId,
                  enrichmentId: expedition.enrichmentId
                });
              }} className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
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

function CandidateCard({ learnerStateRef, candidate }: Readonly<{ learnerStateRef: string; candidate: ExpeditionCandidate }>) {
  const existingLearnerExpeditionId = candidate.existingLearnerExpeditionId;
  return (
    <Card className="border-border bg-card">
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
          if (existingLearnerExpeditionId) {
            await setActiveExpedition({
              learnerStateRef,
              learnerExpeditionId: existingLearnerExpeditionId,
              enrichmentId: candidate.enrichmentId
            });
            return;
          }
          await chooseCandidateExpedition({
            learnerStateRef,
            enrichmentId: candidate.enrichmentId,
            title: candidate.title,
            declaredDomain: candidate.declaredDomain
          });
        }}>
          <Button type="submit" className="w-full">
            <CompassIcon data-icon="inline-start" />
            {existingLearnerExpeditionId ? learnerTerm("resumeExpedition") : learnerTerm("beginExpedition")}
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
    <Card className="md:col-span-3 border-border bg-card">
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

function pickExampleTopics(topics: readonly string[], count: number): string[] {
  return [...topics]
    .map((topic) => ({ topic, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, count)
    .map((entry) => entry.topic);
}

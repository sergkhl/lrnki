import { useTransition } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRightIcon, CompassIcon, MapIcon } from "lucide-react";
import type { ExpeditionCandidate, LearnerExpeditionEntry } from "@lrnki/application/projection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { expeditionStatusLabel, learnerTerm } from "./vocabulary";
import { chooseCandidateExpedition, setActiveExpedition, startTopicExpedition } from "@/lib/actions";
import type { JournalView } from "@/lib/queries";
import { partitionExpeditionJournal } from "./expeditionJournalView";
import { GenerationProgressCard } from "./GenerationProgressCard";
import { PlanExpeditionDialog } from "./PlanExpeditionDialog";
import { resumeLabel } from "./resumeLabel";

type LearnerExpeditionRowModel = LearnerExpeditionEntry["learnerExpeditions"][number];

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
}: Readonly<{ learnerStateRef: string; entry: JournalView }>) {
  const exampleTopics = pickExampleTopics(EXAMPLE_TOPICS, 4);
  const { started, yours, shared } = partitionExpeditionJournal(entry);
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
        </div>
      </header>

      {started.length > 0 ? (
        <section className="grid gap-4">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Continue</CardTitle>
              <CardDescription>Pick up where you left off.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {started.map((expedition) => (
                <LearnerExpeditionRow key={expedition.learnerExpeditionId} expedition={expedition} timelines={entry.timelinesByOperationId} />
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-4">
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Your expeditions</CardTitle>
              <CardDescription>Ready and scouting journals for this explorer.</CardDescription>
            </div>
            <PlanExpeditionDialog
              exampleTopics={exampleTopics}
              onCreate={(topic) => startTopicExpedition({ topic })}
            />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {yours.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expeditions yet.</p>
            ) : yours.map((expedition) => (
              <LearnerExpeditionRow key={expedition.learnerExpeditionId} expedition={expedition} timelines={entry.timelinesByOperationId} />
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Explore</h2>
          <p className="text-sm text-muted-foreground">Shared expeditions ready to begin.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {shared.length === 0 ? <NoCandidates /> : shared.map((candidate) => (
            <CandidateCard key={candidate.enrichmentId} candidate={candidate} />
          ))}
        </div>
      </section>
    </div>
  );
}

function LearnerExpeditionRow({
  expedition,
  timelines
}: Readonly<{ expedition: LearnerExpeditionRowModel; timelines: JournalView["timelinesByOperationId"] }>) {
  const navigate = useNavigate();
  const [pending, startTransition] = useTransition();
  if (expedition.status === "generating" || expedition.status === "failed") {
    return <GenerationProgressCard expedition={expedition} timeline={expedition.currentOperationId ? timelines[expedition.currentOperationId] : undefined} />;
  }
  const open = () => {
    startTransition(async () => {
      await setActiveExpedition({
        learnerExpeditionId: expedition.learnerExpeditionId,
        enrichmentId: expedition.enrichmentId
      });
      if (expedition.enrichmentId) {
        await navigate({ to: "/expedition/$enrichmentId", params: { enrichmentId: expedition.enrichmentId } });
      }
    });
  };
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
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
      <Button type="button" size="sm" variant={expedition.active ? "secondary" : "outline"} disabled={pending || expedition.status !== "ready"} onClick={open}>
        <ArrowRightIcon data-icon="inline-start" />
        {resumeLabel(expedition.progress)}
      </Button>
    </div>
  );
}

function CandidateCard({ candidate }: Readonly<{ candidate: ExpeditionCandidate }>) {
  const existingLearnerExpeditionId = candidate.existingLearnerExpeditionId;
  const navigate = useNavigate();
  const [pending, startTransition] = useTransition();
  const begin = () => {
    startTransition(async () => {
      if (existingLearnerExpeditionId) {
        await setActiveExpedition({
          learnerExpeditionId: existingLearnerExpeditionId,
          enrichmentId: candidate.enrichmentId
        });
      } else {
        await chooseCandidateExpedition({
          enrichmentId: candidate.enrichmentId,
          title: candidate.title,
          declaredDomain: candidate.declaredDomain
        });
      }
      await navigate({ to: "/expedition/$enrichmentId", params: { enrichmentId: candidate.enrichmentId } });
    });
  };
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
        <Button type="button" className="w-full" disabled={pending} onClick={begin}>
          <CompassIcon data-icon="inline-start" />
          {existingLearnerExpeditionId ? learnerTerm("resumeExpedition") : learnerTerm("beginExpedition")}
        </Button>
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
